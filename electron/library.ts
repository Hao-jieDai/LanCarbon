import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AssetStore } from "./assets";
import { MAX_ASSET_BYTES } from "../src/shared/assets";
import { folderLocation, materialEntry, type LibraryEntry, type LibraryFolder, type LibraryImportBatch, type LibraryImportItem, type LibraryImportRecord, type ResourceVersion } from "../src/shared/library";
import { digest, managedDirectory, managedFile, numberedName, validName, writeManaged } from "./resource-files";
interface Catalog { version: 2; folders: LibraryFolder[]; documents: LibraryImportRecord[] }
const IMPORT_ID = /^import:([a-f0-9]{64})\.(pdf|epub)$/;
const mime = (format: "pdf" | "epub") => format === "pdf" ? "application/pdf" : "application/epub+zip";
const history = (record: LibraryImportRecord): ResourceVersion[] => record.versions ?? [{ version: 1, file: record.relativePath, sha256: record.sha256, size: record.size, mime: mime(record.format), createdAt: record.updatedAt ?? record.createdAt }];
function entry(record: LibraryImportRecord, folders: LibraryFolder[], missing = false): LibraryEntry {
  return { id: record.id, name: record.title, size: record.size, mime: mime(record.format), createdAt: record.createdAt, updatedAt: record.updatedAt, source: "import", format: record.format, folderId: record.folderId ?? null, location: folderLocation(folders, record.folderId), sha256: record.sha256, version: record.version ?? 1, versions: history(record), missing };
}
export function validateDocument(bytes: Buffer, format: "pdf" | "epub") {
  if (format === "pdf") { if (!/%PDF-\d\.\d/.test(bytes.toString("latin1", 0, Math.min(1024, bytes.length)))) throw Error("This file does not have a PDF header. Choose an original PDF file."); return; }
  if (bytes.length < 58 || bytes.readUInt32LE(0) !== 0x04034b50 || bytes.readUInt16LE(8) !== 0 || bytes.readUInt16LE(26) !== 8) throw Error("This file is not a supported EPUB container.");
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  if (bytes.toString("utf8", 30, 38) !== "mimetype" || bytes.toString("utf8", start, start + 20) !== "application/epub+zip") throw Error("This file is not an EPUB document.");
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw Error("The EPUB archive is incomplete.");
}
export class LibraryNameConflict extends Error { constructor(public readonly suggestedName: string, location: string) { super(`A file with this name already exists in ${location}. Keep both as ${suggestedName}, or cancel.`); } }

export class LibraryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string, private readonly library: string, private readonly assets: AssetStore) {
    assets.bindLibrary({
      find: async (hash, extension) => { const catalog = await this.catalog(); const record = catalog.documents.find(record => history(record).some(version => version.sha256 === hash && record.format === extension)); return record ? entry(record, catalog.folders) : undefined; },
      metadata: async id => this.metadata(id),
      read: async (id, version) => { const result = await this.read(id, version); return { asset: result.entry, bytes: result.bytes }; },
      filePath: id => this.filePath(id),
      rename: (id, name) => this.rename(id, name)
    });
  }
  private async catalog(): Promise<Catalog> {
    const directory = await managedDirectory(this.data, "Library");
    try {
      const raw = JSON.parse(await fs.readFile(path.join(directory, "documents.json"), "utf8"));
      if (![1, 2].includes(raw.version) || !Array.isArray(raw.documents) || raw.version === 2 && !Array.isArray(raw.folders)) throw Error("Invalid Library catalog. Your original files have been preserved.");
      const folders: LibraryFolder[] = raw.version === 1 ? [] : raw.folders, ids = new Set<string>();
      for (const folder of folders) {
        if (!folder || typeof folder.id !== "string" || !/^folder_[a-f0-9]{32}$/.test(folder.id) || ids.has(folder.id) || folder.parentId !== null && typeof folder.parentId !== "string") throw Error("Invalid Library folders.");
        validName(folder.name, 80); ids.add(folder.id);
      }
      for (const folder of folders) {
        const visited = new Set<string>(); let id: string | null = folder.id;
        while (id) { if (visited.has(id) || visited.size >= 8) throw Error("Invalid Library folder hierarchy."); visited.add(id); const parent = folders.find(folder => folder.id === id); if (!parent) throw Error("Unknown Library folder."); id = parent.parentId; }
        if (folders.some(other => other.id !== folder.id && other.parentId === folder.parentId && other.name.toLocaleLowerCase() === folder.name.toLocaleLowerCase())) throw Error("Duplicate Library folder names.");
      }
      ids.clear();
      const documents: LibraryImportRecord[] = raw.documents.map((record: LibraryImportRecord) => {
        const match = record && typeof record.id === "string" && IMPORT_ID.exec(record.id);
        if (!match || ids.has(record.id) || record.format !== match[2] || record.source !== "import" || typeof record.title !== "string" || path.extname(record.title).toLowerCase() !== `.${record.format}` || !Number.isFinite(Date.parse(record.createdAt))) throw Error("Invalid Library catalog. Your original files have been preserved.");
        const folderId = record.folderId ?? null; if (folderId && !folders.some(folder => folder.id === folderId)) throw Error("Unknown document folder.");
        const versions = history(record), directory = folderLocation(folders, folderId);
        if (!Array.isArray(versions) || !versions.length || versions[0].sha256 !== match[1] || versions.some((version, index) => version.version !== index + 1 || !/^[a-f0-9]{64}$/.test(version.sha256) || version.file !== `${directory}/${version.sha256}.${record.format}` || !Number.isSafeInteger(version.size) || version.size <= 0 || version.size > MAX_ASSET_BYTES || version.mime !== mime(record.format) || !Number.isFinite(Date.parse(version.createdAt)))) throw Error("Invalid Library catalog: versions or paths.");
        const current = versions.at(-1)!;
        if (record.relativePath !== current.file || record.sha256 !== current.sha256 || record.size !== current.size || record.version !== undefined && record.version !== current.version) throw Error("Invalid Library catalog: current version.");
        ids.add(record.id); return { ...record, folderId, version: current.version, versions };
      });
      return { version: 2, folders, documents };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 2, folders: [], documents: [] }; throw error; }
  }
  private async writeCatalog(catalog: Catalog) {
    const directory = await managedDirectory(this.data, "Library"), filename = path.join(directory, "documents.json"), temporary = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(catalog, null, 2), "utf8"); await fs.rename(temporary, filename); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private folderPath(catalog: Catalog, folderId: string | null): string {
    if (folderId !== null && !catalog.folders.some(folder => folder.id === folderId)) throw Error("The destination folder no longer exists.");
    return folderLocation(catalog.folders, folderId);
  }
  async folders(): Promise<LibraryFolder[]> { return (await this.catalog()).folders; }
  async metadata(id: string): Promise<LibraryEntry> {
    const catalog = await this.catalog(), record = catalog.documents.find(record => record.id === id); if (!record) throw Error("The document is no longer in Library."); let missing = false; try { missing = (await fs.stat(await managedFile(this.library, record.relativePath))).size !== record.size; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") missing = true; else throw error; } return entry(record, catalog.folders, missing);
  }
  async list(): Promise<LibraryEntry[]> {
    const [catalog, assets] = await Promise.all([this.catalog(), this.assets.list()]); await managedDirectory(this.library, "Imports");
    const imported = await Promise.all(catalog.documents.map(async record => {
      let missing = false;
      try { const file = await managedFile(this.library, record.relativePath), stat = await fs.stat(file); missing = stat.size !== record.size; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") missing = true; else throw error; }
      return { ...entry(record, catalog.folders, missing), assetId: assets.find(asset => asset.documentId === record.id)?.id };
    }));
    return [...imported, ...assets.filter(asset => !asset.documentId).map(materialEntry)];
  }
  async importFiles(files: string[], folderId: string | null = null): Promise<LibraryImportBatch> {
    if (!Array.isArray(files) || !files.length || files.length > 20 || !files.every(file => typeof file === "string" && path.isAbsolute(file))) throw Error("Choose up to 20 local PDF or EPUB files at a time.");
    const batch: LibraryImportBatch = { items: [], failures: [] };
    for (const file of files) { try { batch.items.push(await this.importFile(file, folderId)); } catch (error) { batch.failures.push({ name: path.basename(file), error: error instanceof Error ? error.message : "Import failed" }); } }
    return batch;
  }
  private importFile(filename: string, folderId: string | null): Promise<LibraryImportItem> {
    const action = this.queue.then(async (): Promise<LibraryImportItem> => {
      const format = path.extname(filename).slice(1).toLowerCase(); if (format !== "pdf" && format !== "epub") throw Error("Choose a PDF or EPUB file.");
      const handle = await fs.open(filename, "r"); let bytes: Buffer;
      try { const stat = await handle.stat(); if (!stat.isFile() || !stat.size || stat.size > MAX_ASSET_BYTES) throw Error("Original documents must be non-empty and 100 MB or smaller."); bytes = await handle.readFile(); if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw Error("Original documents must be non-empty and 100 MB or smaller."); } finally { await handle.close(); }
      validateDocument(bytes, format);
      const catalog = await this.catalog(), directory = this.folderPath(catalog, folderId), hash = digest(bytes), incomingName = path.basename(filename);
      const previous = catalog.documents.find(record => record.format === format && history(record).some(version => version.sha256 === hash));
      if (previous) {
        const version = history(previous).find(version => version.sha256 === hash)!;
        let intact = false; try { const file = await managedFile(this.library, version.file); intact = digest(await fs.readFile(file)) === hash; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (!intact) await writeManaged(this.library, version.file, bytes, true);
        return { entry: entry(previous, catalog.folders), status: intact ? "existing" : "repaired", incomingName, targetFolderId: folderId, matchedVersion: version.version };
      }
      const identical = await this.assets.findContent(hash, format);
      if (identical && !identical.asset.missing) { await this.assets.readVersion(identical.asset.id, identical.version); return { entry: materialEntry(identical.asset), status: "existing", incomingName, targetFolderId: folderId, matchedVersion: identical.version }; }
      let name = incomingName.slice(0, incomingName.length - path.extname(incomingName).length).slice(0, 180) + `.${format}`;
      const originalName = name; name = numberedName(name, catalog.documents.filter(record => (record.folderId ?? null) === folderId).map(record => record.title));
      const relativePath = `${directory}/${hash}.${format}`, now = new Date().toISOString(), version: ResourceVersion = { version: 1, file: relativePath, sha256: hash, size: bytes.length, mime: mime(format), createdAt: now };
      const record: LibraryImportRecord = { id: `import:${hash}.${format}`, relativePath, sha256: hash, title: name, format, source: "import", size: bytes.length, createdAt: now, folderId, version: 1, versions: [version] };
      await writeManaged(this.library, relativePath, bytes, true); await this.writeCatalog({ ...catalog, documents: [...catalog.documents, record] });
      return { entry: entry(record, catalog.folders), status: "imported", incomingName, targetFolderId: folderId, numbered: originalName !== name };
    });
    this.queue = action.catch(() => undefined); return action;
  }
  rename(id: string, name: string): Promise<LibraryEntry> {
    if (!id.startsWith("import:")) return this.assets.rename(id, name).then(materialEntry);
    const action = this.queue.then(async () => {
      const catalog = await this.catalog(), previous = catalog.documents.find(record => record.id === id); if (!previous) throw Error("The document is no longer in Library.");
      name = validName(name); if (path.extname(name).toLowerCase() !== `.${previous.format}`) throw Error("Keep the original file extension.");
      const occupied = catalog.documents.filter(record => record.id !== id && record.folderId === previous.folderId).map(record => record.title);
      if (occupied.some(title => title.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error(`Another file in ${folderLocation(catalog.folders, previous.folderId)} already uses this name. Suggested name: ${numberedName(name, occupied)}`);
      const record = { ...previous, title: name, updatedAt: new Date().toISOString() }; await this.writeCatalog({ ...catalog, documents: catalog.documents.map(item => item.id === id ? record : item) }); return entry(record, catalog.folders);
    }); this.queue = action.catch(() => undefined); return action;
  }
  createFolder(name: string, parentId: string | null): Promise<LibraryFolder> {
    const action = this.queue.then(async () => {
      const catalog = await this.catalog(), parent = this.folderPath(catalog, parentId); name = validName(name, 80);
      if (catalog.folders.some(folder => folder.parentId === parentId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error("A folder with this name already exists here.");
      if (parent.split("/").length >= 8 || path.join(this.library, parent, name).length + 70 > 240) throw Error("Use a shorter folder name or a shallower folder.");
      const folder = { id: `folder_${randomUUID().replace(/-/g, "")}`, name, parentId };
      await managedDirectory(this.library, `${parent}/${name}`); await this.writeCatalog({ ...catalog, folders: [...catalog.folders, folder] }); return folder;
    }); this.queue = action.catch(() => undefined); return action;
  }
  move(id: string, folderId: string | null, keepBoth = false): Promise<LibraryEntry> {
    const action = this.queue.then(async () => {
      const catalog = await this.catalog(), previous = catalog.documents.find(record => record.id === id); if (!previous) throw Error("Only imported originals can be moved into Imports folders.");
      const directory = this.folderPath(catalog, folderId); if (previous.folderId === folderId) return entry(previous, catalog.folders);
      const occupied = catalog.documents.filter(record => record.id !== id && record.folderId === folderId).map(record => record.title), suggested = numberedName(previous.title, occupied);
      if (suggested !== previous.title && !keepBoth) throw new LibraryNameConflict(suggested, directory);
      const versions = history(previous), nextVersions: ResourceVersion[] = [];
      for (const version of versions) { const bytes = (await this.read(id, version.version)).bytes, file = `${directory}/${version.sha256}.${previous.format}`; await writeManaged(this.library, file, bytes); nextVersions.push({ ...version, file }); }
      const record = { ...previous, folderId, title: suggested, relativePath: nextVersions.at(-1)!.file, versions: nextVersions, updatedAt: new Date().toISOString() }, next = { ...catalog, documents: catalog.documents.map(item => item.id === id ? record : item) };
      await this.writeCatalog(next);
      for (const old of new Set(versions.map(version => version.file))) {
        if (!next.documents.some(record => history(record).some(version => version.file === old))) {
          try { await fs.unlink(await managedFile(this.library, old)); } catch { /* The verified destination is committed; leave any unremovable old copy intact. */ }
        }
      }
      return entry(record, catalog.folders);
    }); this.queue = action.catch(() => undefined); return action;
  }
  async versions(id: string): Promise<ResourceVersion[]> { return id.startsWith("import:") ? history((await this.catalog()).documents.find(record => record.id === id) ?? (() => { throw Error("Document is unavailable."); })()) : this.assets.versions(id); }
  async filePath(id: string): Promise<string> {
    if (!id.startsWith("import:")) return this.assets.filePath(id);
    const record = (await this.catalog()).documents.find(record => record.id === id); if (!record) throw Error("The document is no longer in Library."); return managedFile(this.library, record.relativePath);
  }
  async read(id: string, number?: number): Promise<{ entry: LibraryEntry; bytes: Buffer }> {
    if (!id.startsWith("import:")) { const { asset, bytes } = await this.assets.readVersion(id, number); return { entry: materialEntry(asset), bytes }; }
    const catalog = await this.catalog(), record = catalog.documents.find(record => record.id === id); if (!record) throw Error("The document is no longer in Library.");
    const version = number === undefined ? history(record).at(-1)! : history(record).find(version => version.version === number); if (!version) throw Error("This document version is unavailable.");
    const filename = await managedFile(this.library, version.file), stat = await fs.stat(filename); if (stat.size !== version.size || stat.size > MAX_ASSET_BYTES) throw Error("The managed document changed. Re-import the original to repair it.");
    const bytes = await fs.readFile(filename); if (digest(bytes) !== version.sha256) throw Error("The managed document changed. Re-import the original to repair it.");
    return { entry: { ...entry(record, catalog.folders), version: version.version, size: version.size }, bytes };
  }
  updateVersion(id: string, bytes: Buffer): Promise<LibraryEntry> {
    if (!id.startsWith("import:")) return this.assets.updateVersion(id, bytes).then(materialEntry);
    const action = this.queue.then(async () => {
      const catalog = await this.catalog(), previous = catalog.documents.find(record => record.id === id); if (!previous) throw Error("The document is no longer in Library.");
      if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw Error("Original documents must be non-empty and 100 MB or smaller."); validateDocument(bytes, previous.format);
      const hash = digest(bytes); if (hash === previous.sha256) return entry(previous, catalog.folders);
      await this.read(id);
      const directory = this.folderPath(catalog, previous.folderId ?? null), file = `${directory}/${hash}.${previous.format}`, now = new Date().toISOString(), number = (previous.version ?? 1) + 1;
      await writeManaged(this.library, file, bytes);
      const version: ResourceVersion = { version: number, file, sha256: hash, size: bytes.length, mime: mime(previous.format), createdAt: now }, record = { ...previous, relativePath: file, sha256: hash, size: bytes.length, version: number, versions: [...history(previous), version], updatedAt: now };
      await this.writeCatalog({ ...catalog, documents: catalog.documents.map(item => item.id === id ? record : item) }); return entry(record, catalog.folders);
    }); this.queue = action.catch(() => undefined); return action;
  }
}
