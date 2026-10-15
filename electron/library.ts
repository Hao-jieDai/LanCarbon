import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AssetStore } from "./assets";
import { ASSET_ID, MAX_ASSET_BYTES } from "../src/shared/assets";
import { folderLocation, materialEntry, type LibraryBatchResult, type LibraryEntry, type LibraryFolder, type LibraryImportBatch, type LibraryImportItem, type LibraryImportRecord, type ResourceVersion } from "../src/shared/library";
import { digest, diskIdentity, existingDirectory, managedDirectory, managedFile, numberedName, validName, writeManaged } from "./resource-files";
import { importPath, LibraryDiskSync, type LibraryCatalog as Catalog } from "./library-sync";
const IMPORT_ID = /^import:([a-f0-9]{64})\.(pdf|epub)$/;
export function librarySelection(ids: unknown): string[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || !ids.every(id => typeof id === "string" && (IMPORT_ID.test(id) || ASSET_ID.test(id)))) throw Error("Select valid Library files.");
  return [...new Set(ids)];
}
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
  private disk: LibraryDiskSync;
  private state = "";
  private diskErrors = new Map<string,string>();
  constructor(private readonly data: string, private readonly library: string, private readonly assets: AssetStore) {
    this.disk = new LibraryDiskSync(library);
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
        const versions = history(record);
        if (!Array.isArray(versions) || !versions.length || versions[0].sha256 !== match[1] || versions.some((version, index) => version.version !== index + 1 || !/^[a-f0-9]{64}$/.test(version.sha256) || !importPath(version.file) || path.posix.extname(version.file).toLowerCase() !== `.${record.format}` || !Number.isSafeInteger(version.size) || version.size <= 0 || version.size > MAX_ASSET_BYTES || version.mime !== mime(record.format) || !Number.isFinite(Date.parse(version.createdAt)))) throw Error("Invalid Library catalog: versions or paths.");
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
  synchronize(): Promise<{ changed: boolean; errors: string[] }> {
    const action=this.queue.then(async()=>{
      const original=await this.catalog(),result=await this.disk.scan(original,validateDocument);
      if(result.changed)await this.writeCatalog(result.catalog);
      this.diskErrors=result.errors;
      const assets=await this.assets.audit();
      const state=JSON.stringify([result.catalog.folders,result.catalog.documents.map(record=>[record.id,record.relativePath]),result.issues,assets.signature]);
      const changed=result.changed||state!==this.state;this.state=state;
      return {changed,errors:[...result.issues,...assets.errors]};
    });this.queue=action.catch(()=>undefined);return action;
  }
  renameFolder(id: string, value: string): Promise<LibraryFolder> {
    const action=this.queue.then(async()=>{
      const catalog=await this.catalog(),folder=catalog.folders.find(folder=>folder.id===id);if(!folder)throw Error("Folder no longer exists.");
      const name=validName(value,80);if(catalog.folders.some(other=>other.id!==id&&other.parentId===folder.parentId&&other.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error("A folder with this name already exists here.");
      if(name===folder.name)return folder;
      const old=folderLocation(catalog.folders,id),parent=await existingDirectory(this.library,folderLocation(catalog.folders,folder.parentId)),source=await existingDirectory(this.library,old),target=path.join(parent,name);
      if(target.length+70>240)throw Error("Use a shorter folder name.");
      if(source.toLocaleLowerCase()!==target.toLocaleLowerCase()&&await fs.lstat(target).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw Error("A folder or file with this name already exists here.");
      const nextFolder={...folder,name,missing:false},folders=catalog.folders.map(item=>item.id===id?nextFolder:item),destination=folderLocation(folders,id);
      const remap=(file:string)=>file.startsWith(old+"/")?destination+file.slice(old.length):file;
      const documents=catalog.documents.map(record=>({...record,relativePath:remap(record.relativePath),versions:history(record).map(version=>({...version,file:remap(version.file)}))}));
      await fs.rename(source,target);
      try{await this.writeCatalog({...catalog,folders,documents});}catch(error){await fs.rename(target,source);throw error;}
      return nextFolder;
    });this.queue=action.catch(()=>undefined);return action;
  }
  /** Delete the container only. Every child, including files not indexed by LanCarbon, moves to its parent. */
  deleteFolder(id: string): Promise<string|null> {
    const action=this.queue.then(async()=>{
      const catalog=await this.catalog(),folder=catalog.folders.find(folder=>folder.id===id);if(!folder)throw Error("Folder no longer exists.");
      const relative=folderLocation(catalog.folders,id),parentRelative=folderLocation(catalog.folders,folder.parentId),parent=await existingDirectory(this.library,parentRelative);
      const source=await existingDirectory(this.library,relative),occupied=await fs.readdir(parent),moves:Array<{from:string;to:string;source:string;target:string}>=[];
      for(const item of await fs.readdir(source,{withFileTypes:true})){
        if(item.isSymbolicLink()||!item.isFile()&&!item.isDirectory())throw Error("Move linked or special items out of this folder before deleting it.");
        const name=numberedName(item.name,occupied);validName(name,item.isDirectory()?80:200);occupied.push(name);
        const from=`${relative}/${item.name}`,to=`${parentRelative}/${name}`;
        const filename=item.isDirectory()?await existingDirectory(this.library,from):await managedFile(this.library,from);
        moves.push({from,to,source:filename,target:path.join(parent,name)});
      }
      const remap=(file:string)=>{const move=moves.find(move=>file===move.from||file.startsWith(move.from+"/"));return move?move.to+file.slice(move.from.length):file;};
      const folders=catalog.folders.filter(item=>item.id!==id).map(item=>item.parentId===id?{...item,parentId:folder.parentId,name:path.posix.basename(remap(folderLocation(catalog.folders,item.id)))}:item);
      const names=catalog.documents.filter(record=>record.folderId===folder.parentId).map(record=>record.title);
      const documents=catalog.documents.map(record=>{let title=record.title;if(record.folderId===id){title=numberedName(title,names);names.push(title);}return {...record,title,folderId:record.folderId===id?folder.parentId:record.folderId,relativePath:remap(record.relativePath),versions:history(record).map(version=>({...version,file:remap(version.file)}))};});
      const completed:typeof moves=[];let removed=false;
      try{
        for(const move of moves){if(await fs.lstat(move.target).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))throw Error("The destination changed. Refresh Library and try again.");await fs.rename(move.source,move.target);completed.push(move);}
        await fs.rmdir(source);removed=true;await this.writeCatalog({...catalog,folders,documents});
      }catch(error){if(removed)await fs.mkdir(source);for(const move of completed.reverse())await fs.rename(move.target,move.source);throw error;}
      return folder.parentId;
    });this.queue=action.catch(()=>undefined);return action;
  }
  async folders(): Promise<LibraryFolder[]> { return (await this.catalog()).folders; }
  async metadata(id: string): Promise<LibraryEntry> {
    const catalog = await this.catalog(), record = catalog.documents.find(record => record.id === id); if (!record) throw Error("The document is no longer in Library."); let missing = false; try { missing = (await fs.stat(await managedFile(this.library, record.relativePath))).size !== record.size; } catch (error) { missing = true; if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.diskErrors.set(record.id, `${record.title}: ${error instanceof Error ? error.message : String(error)}`); } return { ...entry(record, catalog.folders, missing), syncError: this.diskErrors.get(id) };
  }
  async list(): Promise<LibraryEntry[]> {
    const [catalog, assets] = await Promise.all([this.catalog(), this.assets.list()]); await managedDirectory(this.library, "Imports");
    const imported = await Promise.all(catalog.documents.map(async record => {
      let missing = false;
      try { const file = await managedFile(this.library, record.relativePath), stat = await fs.stat(file); missing = stat.size !== record.size; } catch (error) { missing = true; if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.diskErrors.set(record.id, `${record.title}: ${error instanceof Error ? error.message : String(error)}`); }
      return { ...entry(record, catalog.folders, missing), syncError: this.diskErrors.get(record.id), assetId: assets.find(asset => asset.documentId === record.id)?.id };
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
      const directory = await managedDirectory(this.library, `${parent}/${name}`);
      const folder = { id: `folder_${randomUUID().replace(/-/g, "")}`, name, parentId, diskId: await diskIdentity(directory) };
      await this.writeCatalog({ ...catalog, folders: [...catalog.folders, folder] }); return folder;
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
  async moveMany(input: string[], folderId: string | null, keepBoth: boolean): Promise<LibraryBatchResult> {
    const ids = librarySelection(input), catalog = await this.catalog();
    const records = ids.map(id => catalog.documents.find(record => record.id === id));
    if (records.some(record => !record)) throw Error("Only imported originals can be moved. Refresh the selection.");
    const directory = this.folderPath(catalog, folderId);
    await existingDirectory(this.library, directory);
    if (!keepBoth) {
      const occupied = catalog.documents.filter(record => record.folderId === folderId).map(record => record.title.toLocaleLowerCase());
      for (const record of records) {
        if (record!.folderId === folderId) continue;
        if (occupied.includes(record!.title.toLocaleLowerCase())) throw Error("Some names already exist in the destination. Choose Keep both, or use another folder.");
        occupied.push(record!.title.toLocaleLowerCase());
      }
    }
    const batch: LibraryBatchResult = { items: [], failures: [] };
    for (const record of records) {
      try { const moved = await this.move(record!.id, folderId, keepBoth); batch.items.push({ id: moved.id, name: moved.name }); }
      catch (error) { batch.failures.push({ id: record!.id, name: record!.title, error: error instanceof Error ? error.message : "Could not move file." }); }
    }
    return batch;
  }
  remove(input: string[], confirm: (entries: LibraryEntry[], resourceIds: string[]) => Promise<boolean>, updateReferences: (resourceIds: string[]) => Promise<() => Promise<void>>): Promise<{ removed: boolean; ids: string[]; resourceIds: string[] }> {
    const action = this.queue.then(async () => {
      const ids = librarySelection(input), catalog = await this.catalog(), all = await this.list();
      const selected = ids.map(id => all.find(entry => entry.id === id));
      if (selected.some(entry => !entry)) throw Error("Files changed. Refresh the list before deleting.");
      if (selected.some(entry => entry!.systemManaged)) throw Error("Built-in tutorial resources cannot be deleted.");
      const imported = new Set(selected.filter(entry => entry!.source === "import").map(entry => entry!.id));
      const assets = await this.assets.list();
      const resourceIds = assets.filter(asset => ids.includes(asset.id) || !!asset.documentId && imported.has(asset.documentId)).map(asset => asset.id);
      if (!await confirm(selected as LibraryEntry[], resourceIds)) return { removed: false, ids: [], resourceIds: [] };
      const next = { ...catalog, documents: catalog.documents.filter(record => !imported.has(record.id)) };
      const retained = new Set(next.documents.flatMap(record => history(record).map(version => version.file.toLocaleLowerCase())));
      const files = [...new Set(catalog.documents.filter(record => imported.has(record.id)).flatMap(record => history(record).map(version => version.file)))].filter(file => !retained.has(file.toLocaleLowerCase()));
      const staged: Array<[string, string]> = [];
      const commit = async () => {
        const rollback = await updateReferences(resourceIds);
        try { if (imported.size) await this.writeCatalog(next); }
        catch (error) { await rollback(); throw error; }
        return async () => { if (imported.size) await this.writeCatalog(catalog); await rollback(); };
      };
      try {
        for (const file of files) {
          try {
            const source = await managedFile(this.library, file), temporary = `${source}.${randomUUID()}.deleting`;
            await fs.rename(source, temporary); staged.push([source, temporary]);
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        if (resourceIds.length) await this.assets.remove(resourceIds, async () => true, commit);
        else await commit();
      } catch (error) {
        for (const [source, temporary] of staged.reverse()) await fs.rename(temporary, source);
        throw error;
      }
      // Catalogs and writing are committed. A locked staging file is no longer an indexed original.
      for (const [, temporary] of staged) await fs.unlink(temporary).catch(() => undefined);
      return { removed: true, ids, resourceIds };
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
