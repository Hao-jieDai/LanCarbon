import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AssetStore } from "./assets";
import { MAX_ASSET_BYTES } from "../src/shared/assets";
import { materialEntry, type LibraryEntry, type LibraryImportBatch, type LibraryImportItem, type LibraryImportRecord } from "../src/shared/library";

const IMPORT_ID = /^import:([a-f0-9]{64})\.(pdf|epub)$/;
const mime = (format: "pdf" | "epub") => format === "pdf" ? "application/pdf" : "application/epub+zip";
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function entry(record: LibraryImportRecord, missing = false): LibraryEntry {
  return { id: record.id, name: record.title, size: record.size, mime: mime(record.format), createdAt: record.createdAt, updatedAt: record.updatedAt, source: "import", format: record.format, missing };
}
function validateDocument(bytes: Buffer, format: "pdf" | "epub") {
  if (format === "pdf") {
    if (!/%PDF-\d\.\d/.test(bytes.toString("latin1", 0, Math.min(1024, bytes.length)))) throw Error("This file does not have a PDF header. Choose an original PDF file.");
    return;
  }
  // EPUB's OCF container starts with an uncompressed mimetype member. Nothing is extracted or executed.
  if (bytes.length < 58 || bytes.readUInt32LE(0) !== 0x04034b50 || bytes.readUInt16LE(8) !== 0 || bytes.readUInt16LE(26) !== 8) throw Error("This file is not a supported EPUB container.");
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  if (bytes.toString("utf8", 30, 38) !== "mimetype" || bytes.toString("utf8", start, start + 20) !== "application/epub+zip") throw Error("This file is not an EPUB document.");
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw Error("The EPUB archive is incomplete.");
}

/** Library originals have their own catalog; writing assets and Workspace v2 stay untouched. */
export class LibraryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string, private readonly library: string, private readonly assets: AssetStore) {}
  private async checkedDirectory(directory: string): Promise<string> {
    await fs.mkdir(directory, { recursive: true });
    const real = await fs.realpath(directory);
    if ((await fs.lstat(directory)).isSymbolicLink() || path.dirname(real) !== await fs.realpath(path.dirname(directory))) throw Error("Library folder leaves its managed location.");
    return real;
  }
  private async catalog(): Promise<LibraryImportRecord[]> {
    const directory = await this.checkedDirectory(path.join(this.data, "Library"));
    try {
      const catalog = JSON.parse(await fs.readFile(path.join(directory, "documents.json"), "utf8"));
      if (catalog.version !== 1 || !Array.isArray(catalog.documents)) throw Error("Invalid Library catalog. Your original files have been preserved.");
      const ids = new Set<string>();
      for (const record of catalog.documents) {
        const match = typeof record?.id === "string" && IMPORT_ID.exec(record.id);
        if (!match || ids.has(record.id) || record.sha256 !== match[1] || record.format !== match[2] || record.relativePath !== `Imports/${match[1]}.${match[2]}` || record.source !== "import" || typeof record.title !== "string" || path.extname(record.title).toLowerCase() !== `.${record.format}` || !Number.isSafeInteger(record.size) || record.size <= 0 || record.size > MAX_ASSET_BYTES || !Number.isFinite(Date.parse(record.createdAt))) throw Error("Invalid Library catalog. Your original files have been preserved.");
        ids.add(record.id);
      }
      return catalog.documents;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  private async writeCatalog(documents: LibraryImportRecord[]) {
    const directory = await this.checkedDirectory(path.join(this.data, "Library"));
    const filename = path.join(directory, "documents.json"), temporary = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify({ version: 1, documents }, null, 2), "utf8"); await fs.rename(temporary, filename); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  async list(): Promise<LibraryEntry[]> {
    const [documents, assets] = await Promise.all([this.catalog(), this.assets.list()]);
    const imports = await this.checkedDirectory(path.join(this.library, "Imports"));
    const imported = await Promise.all(documents.map(async record => {
      const stat = await fs.lstat(path.join(imports, path.basename(record.relativePath))).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      return entry(record, !stat?.isFile() || stat.isSymbolicLink() || stat.size !== record.size);
    }));
    return [...imported, ...assets.map(materialEntry)];
  }
  async importFiles(files: string[]): Promise<LibraryImportBatch> {
    if (!Array.isArray(files) || !files.length || files.length > 20 || !files.every(file => typeof file === "string" && path.isAbsolute(file))) throw Error("Choose up to 20 local PDF or EPUB files at a time.");
    const batch: LibraryImportBatch = { items: [], failures: [] };
    for (const file of files) {
      try { batch.items.push(await this.importFile(file)); }
      catch (error) { batch.failures.push({ name: path.basename(file), error: error instanceof Error ? error.message : "Import failed" }); }
    }
    return batch;
  }
  private importFile(filename: string): Promise<LibraryImportItem> {
    const action = this.queue.then(async (): Promise<LibraryImportItem> => {
      const format = path.extname(filename).slice(1).toLowerCase();
      if (format !== "pdf" && format !== "epub") throw Error("Choose a PDF or EPUB file.");
      const file = await fs.open(filename, "r");
      let bytes: Buffer;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || !stat.size || stat.size > MAX_ASSET_BYTES) throw Error("Original documents must be non-empty and 100 MB or smaller.");
        bytes = await file.readFile();
        if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw Error("Original documents must be non-empty and 100 MB or smaller.");
      } finally { await file.close(); }
      validateDocument(bytes, format);
      const hash = sha256(bytes), id = `import:${hash}.${format}`, storedName = `${hash}.${format}`;
      const documents = await this.catalog(), previous = documents.find(document => document.id === id);
      if (!previous) {
        const identical = (await this.assets.list()).find(asset => (asset.file ?? asset.id) === storedName && !asset.missing);
        if (identical) {
          await this.assets.read(identical.id);
          return { entry: materialEntry(identical), status: "existing" };
        }
      }
      const imports = await this.checkedDirectory(path.join(this.library, "Imports")), target = path.join(imports, storedName);
      const stat = await fs.lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (stat?.isSymbolicLink() || stat && !stat.isFile()) throw Error("The managed document path is not a regular file.");
      const intact = stat?.size === bytes.length && sha256(await fs.readFile(target)) === hash;
      if (previous && intact) return { entry: entry(previous), status: "existing" };
      if (!intact) {
        const temporary = path.join(imports, `${storedName}.${randomUUID()}.tmp`);
        try {
          await fs.writeFile(temporary, bytes, { flag: "wx" });
          if (sha256(await fs.readFile(temporary)) !== hash) throw Error("The managed copy failed verification. Import again.");
          await fs.rename(temporary, target);
        } finally { await fs.unlink(temporary).catch(() => undefined); }
      }
      let name = path.basename(filename).slice(0, 190);
      name = name.slice(0, name.length - path.extname(name).length) + `.${format}`;
      const stem = name.slice(0, -format.length - 1); let suffix = 2;
      while (documents.some(document => document.title.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${stem} (${suffix++}).${format}`;
      const record: LibraryImportRecord = previous ?? { id, relativePath: `Imports/${storedName}`, sha256: hash, title: name, format, source: "import", size: bytes.length, createdAt: new Date().toISOString() };
      if (!previous) await this.writeCatalog([...documents, record]);
      return { entry: entry(record), status: previous ? "repaired" : "imported" };
    });
    this.queue = action.catch(() => undefined);
    return action;
  }
  rename(id: string, name: string): Promise<LibraryEntry> {
    if (!id.startsWith("import:")) return this.assets.rename(id, name).then(materialEntry);
    const action = this.queue.then(async () => {
      const documents = await this.catalog(), previous = documents.find(document => document.id === id);
      if (!previous) throw Error("The document is no longer in Library.");
      if (typeof name !== "string") throw Error("Enter a filename.");
      name = name.trim();
      if (!name || name.length > 200 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error("Enter a valid filename of up to 200 characters.");
      if (path.extname(name).toLowerCase() !== `.${previous.format}`) throw Error("Keep the original file extension.");
      if (documents.some(document => document.id !== id && document.title.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error("Another imported document already uses this name.");
      const record = { ...previous, title: name, updatedAt: new Date().toISOString() };
      await this.writeCatalog(documents.map(document => document.id === id ? record : document));
      return entry(record);
    });
    this.queue = action.catch(() => undefined);
    return action;
  }
  async filePath(id: string): Promise<string> {
    if (!id.startsWith("import:")) return this.assets.filePath(id);
    const record = (await this.catalog()).find(document => document.id === id);
    if (!record) throw Error("The document is no longer in Library.");
    const directory = await this.checkedDirectory(path.join(this.library, "Imports"));
    const filename = await fs.realpath(path.join(directory, path.basename(record.relativePath)));
    if (path.dirname(filename) !== directory || !(await fs.stat(filename)).isFile()) throw Error("Document leaves the managed Library folder.");
    return filename;
  }
  async read(id: string): Promise<{ entry: LibraryEntry; bytes: Buffer }> {
    if (!id.startsWith("import:")) { const { asset, bytes } = await this.assets.read(id); return { entry: materialEntry(asset), bytes }; }
    const record = (await this.catalog()).find(document => document.id === id);
    if (!record) throw Error("The document is no longer in Library.");
    const filename = await this.filePath(id), stat = await fs.stat(filename);
    if (stat.size !== record.size || stat.size > MAX_ASSET_BYTES) throw Error("The managed document changed. Re-import the original to repair it.");
    const bytes = await fs.readFile(filename);
    if (sha256(bytes) !== record.sha256) throw Error("The managed document changed. Re-import the original to repair it.");
    return { entry: entry(record), bytes };
  }
}
