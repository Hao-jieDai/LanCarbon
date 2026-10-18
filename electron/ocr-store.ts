import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { managedDirectory } from "./resource-files";
import { OCR_MAX_BYTES, validOcrPage, type OcrPage, type OcrStats } from "../src/shared/ocr";
const cacheFile = /^[a-f0-9]{64}-[1-9]\d{0,4}\.json$/;
/** Only derived recognition text/coordinates are stored; page bitmaps and originals are never written here. */
export class OcrStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string) {}
  private serial<T>(action: () => Promise<T>): Promise<T> { const job = this.queue.then(action); this.queue = job.catch(() => undefined); return job; }
  private name(fingerprint: string, page: number) { if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(page) || page < 1 || page > 20000) throw Error("Invalid OCR page."); return `${fingerprint}-${page}.json`; }
  private async files() {
    const directory = await managedDirectory(this.data, "Research/OCR"), names = await fs.readdir(directory);
    const entries = [];
    for (const name of names.filter(name => cacheFile.test(name))) { const file = path.join(directory, name), stat = await fs.lstat(file); if (!stat.isSymbolicLink() && stat.isFile()) entries.push({ file, bytes: stat.size, time: stat.mtimeMs }); }
    return entries;
  }
  async get(fingerprint: string, page: number): Promise<OcrPage | undefined> {
    return this.serial(async () => {
      const file = path.join(await managedDirectory(this.data, "Research/OCR"), this.name(fingerprint, page));
      try { const stat = await fs.lstat(file); if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2000000) return; const value = JSON.parse(await fs.readFile(file, "utf8")); if (validOcrPage(value) && value.page === page) return value; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    });
  }
  async put(fingerprint: string, value: OcrPage) {
    return this.serial(async () => {
      if (!validOcrPage(value)) throw Error("OCR returned invalid text or coordinates.");
      const directory = await managedDirectory(this.data, "Research/OCR"), file = path.join(directory, this.name(fingerprint, value.page)), temporary = path.join(directory, `${randomUUID()}.tmp`), text = JSON.stringify(value);
      if (Buffer.byteLength(text) > 2000000) throw Error("OCR page exceeds the text cache limit.");
      const previous = await fs.lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw Error("OCR cache path is not a regular file.");
      try { await fs.writeFile(temporary, text, { flag: "wx" }); await fs.rename(temporary, file); } finally { await fs.unlink(temporary).catch(() => undefined); }
      const entries = (await this.files()).sort((a, b) => a.time - b.time); let bytes = entries.reduce((n, e) => n + e.bytes, 0);
      while (entries.length > 20000 || bytes > OCR_MAX_BYTES) { const oldest = entries.shift()!; await fs.unlink(oldest.file); bytes -= oldest.bytes; }
    });
  }
  async stats(): Promise<OcrStats> { return this.serial(async () => { const entries = await this.files(); return { pages: entries.length, bytes: entries.reduce((n, e) => n + e.bytes, 0), limitBytes: OCR_MAX_BYTES }; }); }
  async clear() { await this.serial(async () => { for (const entry of await this.files()) await fs.unlink(entry.file); }); }
}
