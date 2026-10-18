import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { LibraryStore } from "./library";
import { managedDirectory } from "./resource-files";
import { validReadingPosition, type ReadingPosition, type PdfSession } from "../src/shared/pdfReader";
export class PdfReaderStore {
  private grant?: { token: string; bytes: Buffer; fingerprint: string; fileIds: string[] };
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string, private readonly library: LibraryStore) {}
  private async positions(): Promise<Record<string, ReadingPosition>> {
    const directory = await managedDirectory(this.data, "Library"), file = path.join(directory, "reading.json");
    try {
      const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 3_000_000) throw Error("Invalid reading-position data. Existing records have been preserved.");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (value.version !== 1 || !value.positions || typeof value.positions !== "object" || Array.isArray(value.positions) || Object.keys(value.positions).length > 10_000 || Object.entries(value.positions).some(([id, position]) => !/^(?:import:)?[a-f0-9]{64}\.[a-z0-9]{1,12}$/.test(id) || !validReadingPosition(position as ReadingPosition))) throw Error("Unsupported reading-position data.");
      return value.positions;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  }
  async open(id: string): Promise<PdfSession> {
    const action = this.queue.then(async () => {
    const { entry, bytes } = await this.library.read(id);
    if (entry.format !== "pdf") throw Error("Choose a PDF document.");
    const readingId = entry.documentId ?? entry.id, positions = await this.positions(), token = randomUUID();
    this.grant = { token, bytes, fingerprint: createHash("sha256").update(bytes).digest("hex"), fileIds: [entry.id, ...(entry.assetId ? [entry.assetId] : [])] }; // One immutable open-document snapshot; released when the reader closes.
    return { token, readingId, entry, length: bytes.length, initial: Uint8Array.from(bytes.subarray(0, 65536)), position: positions[readingId] };
    }); this.queue = action.catch(() => undefined); return action;
  }
  range(token: string, begin: number, end: number): Uint8Array {
    if (!this.grant || token !== this.grant.token) throw Error("This PDF session has closed. Reopen the document.");
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end <= begin || end > this.grant.bytes.length || end - begin > 2 * 1024 * 1024) throw Error("Invalid PDF page-data request.");
    return Uint8Array.from(this.grant.bytes.subarray(begin, end));
  }
  snapshot(token: string) { if (!this.grant || this.grant.token !== token) throw Error("This PDF session has closed."); return this.grant; }
  release(token?: string): void { if (token === undefined || this.grant?.token === token) this.grant = undefined; }
  savePosition(id: string, input: ReadingPosition): Promise<void> {
    const action = this.queue.then(async () => {
      if (typeof id !== "string" || !/^(?:import:)?[a-f0-9]{64}\.[a-z0-9]{1,12}$/.test(id) || !validReadingPosition(input)) throw Error("Invalid reading position.");
      const positions = await this.positions(); positions[id] = { page: input.page, zoom: input.zoom, x: input.x, y: input.y, updatedAt: new Date().toISOString() };
      const entries = Object.entries(positions).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? "")).slice(0, 10_000);
      const directory = await managedDirectory(this.data, "Library"), file = path.join(directory, "reading.json"), temporary = `${file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify({ version: 1, positions: Object.fromEntries(entries) }, null, 2), { flag: "wx" }); await fs.rename(temporary, file); } finally { await fs.unlink(temporary).catch(() => undefined); }
    }); this.queue = action.catch(() => undefined); return action;
  }
  async flush() { await this.queue; }
}
