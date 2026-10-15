import { promises as fs } from "node:fs";
import path from "node:path";
import { ASSET_ID, MAX_ASSET_BYTES, MAX_IMAGE_BYTES, type Asset } from "../src/shared/assets";
import type { ResourceVersion } from "../src/shared/library";
import { withAssetCatalog } from "./asset-catalog-lock";
import { digest, managedDirectory, managedFile, numberedName, validName, writeManaged } from "./resource-files";
export type ResolveConflict = (existing: Asset, incoming: { name: string; size: number; mime: string }) => Promise<"replace" | "keep" | "cancel">;
export interface LibraryAssetBridge {
  find(hash: string, extension: string): Promise<Asset | undefined>;
  metadata(documentId: string): Promise<Asset>;
  read(documentId: string, version?: number): Promise<{ asset: Asset; bytes: Buffer }>;
  filePath(documentId: string): Promise<string>;
  rename(documentId: string, name: string): Promise<Asset>;
}
function imageMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(data.toString("ascii", 0, 6))) return "image/gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}
export function assetVersions(asset: Asset): ResourceVersion[] {
  return asset.versions ?? [{ version: asset.version ?? 1, file: asset.file ?? asset.id, sha256: (asset.file ?? asset.id).split(".")[0], size: asset.size, mime: asset.mime, createdAt: asset.updatedAt ?? asset.createdAt }];
}
const filesOf = (asset: Asset) => asset.documentId ? [] : assetVersions(asset).map(version => version.file);
export class AssetStore {
  private integrity = new Map<string,string>();
  private checked = new Map<string,{signature:string;hash:string}>();

  private library?: LibraryAssetBridge;
  constructor(private readonly root: string, private readonly filesDirectory = path.join(root, "assets"), private readonly systemIds: ReadonlySet<string> = new Set()) {}
  bindLibrary(bridge: LibraryAssetBridge) { this.library = bridge; }
  private async manifest(): Promise<Asset[]> {
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.root, "assets.json"), "utf8"));
      if (data.version !== 1 || !Array.isArray(data.assets) || !data.assets.every((a: Asset) => ASSET_ID.test(a.id) && (a.file === undefined || ASSET_ID.test(a.file)) && typeof a.name === "string" && typeof a.mime === "string" && (!a.documentId || /^import:[a-f0-9]{64}\.(pdf|epub)$/.test(a.documentId)) && (!a.versions || Array.isArray(a.versions) && a.versions.every(version => ASSET_ID.test(version.file) && version.sha256 === version.file.split(".")[0] && Number.isSafeInteger(version.version) && version.version > 0 && Number.isSafeInteger(version.size) && version.size >= 0)))) throw Error("Invalid asset catalog");
      return data.assets;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  private async resolved(asset: Asset): Promise<Asset> {
    if (!asset.documentId) return asset;
    if (!this.library) throw Error("The linked Library document is unavailable.");
    const current = await this.library.metadata(asset.documentId);
    return { ...asset, name: current.name, size: current.size, mime: current.mime, version: current.version, updatedAt: current.updatedAt, missing: current.missing, syncError: current.syncError };
  }
  async list(): Promise<Asset[]> {
    return Promise.all((await this.manifest()).map(async asset => {
      if (asset.documentId) { try { return await this.resolved(asset); } catch { return { ...asset, missing: true }; } }
      const stat = await fs.lstat(path.join(this.filesDirectory, asset.file ?? asset.id)).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      return { ...asset, syncError: this.integrity.get(asset.id), ...(this.systemIds.has(asset.id) ? { systemManaged: true } : {}), version: asset.version ?? 1, missing: !stat?.isFile() || stat.isSymbolicLink() };
    }));
  }
  async audit(): Promise<{ signature: string; errors: string[] }> {
    const issues=new Map<string,string>(),signatures:string[]=[];
    for(const asset of (await this.manifest()).filter(asset=>!asset.documentId)){
      try{
        const version=assetVersions(asset).at(-1)!,file=await managedFile(this.filesDirectory,version.file),stat=await fs.stat(file);
        const signature=`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;signatures.push(`${asset.id}:${signature}`);
        if(stat.size>MAX_ASSET_BYTES)throw Error("File exceeds 100 MB.");
        let hash=this.checked.get(file)?.signature===signature?this.checked.get(file)!.hash:undefined;
        if(!hash){const bytes=await fs.readFile(file);hash=digest(bytes);this.checked.set(file,{signature,hash});}
        if(hash!==version.sha256)throw Error("Changed outside LanCarbon. The file is preserved. Use Open externally for versioned edits.");
      }catch(error){const reason=(error as NodeJS.ErrnoException).code==="ENOENT"?"File is missing or was renamed/moved outside LanCarbon.":error instanceof Error?error.message:String(error);issues.set(asset.id,`${asset.name}: ${reason}`);}
    }
    this.integrity=issues;return{signature:JSON.stringify([signatures,[...issues]]),errors:[...issues.values()]};
  }
  async findContent(hash: string, extension: string): Promise<{ asset: Asset; version: number } | undefined> {
    const found = (await this.manifest()).filter(asset => !asset.documentId).map(asset => ({ asset, found: assetVersions(asset).find(version => version.file === `${hash}.${extension}`) })).find(value => value.found);
    return found ? { asset: (await this.list()).find(asset => asset.id === found.asset.id)!, version: found.found!.version } : undefined;
  }
  async read(id: string): Promise<{ asset: Asset; bytes: Buffer }> { return this.readVersion(id); }
  async readVersion(id: string, number?: number): Promise<{ asset: Asset; bytes: Buffer }> {
    if (!ASSET_ID.test(id)) throw Error("Invalid asset ID");
    const asset = (await this.manifest()).find(item => item.id === id);
    if (!asset) throw Error("This resource is not in the asset catalog");
    if (asset.documentId) {
      if (!this.library) throw Error("The linked Library document is unavailable.");
      const value = await this.library.read(asset.documentId, number);
      return { asset: { ...value.asset, id: asset.id, documentId: asset.documentId }, bytes: value.bytes };
    }
    const version = number === undefined ? assetVersions(asset).at(-1)! : assetVersions(asset).find(version => version.version === number);
    if (!version) throw Error("This resource version is unavailable.");
    const filename = await managedFile(this.filesDirectory, version.file), stat = await fs.stat(filename);
    if (stat.size > MAX_ASSET_BYTES) throw Error("Invalid asset file size");
    const bytes = await fs.readFile(filename);
    if (bytes.length !== version.size || digest(bytes) !== version.sha256) throw Error("Asset file changed or is damaged");
    return { asset: { ...asset, size: version.size, mime: version.mime, version: version.version, ...(this.systemIds.has(id) ? { systemManaged: true } : {}) }, bytes };
  }
  async versions(id: string): Promise<ResourceVersion[]> {
    const asset = (await this.manifest()).find(item => item.id === id); if (!asset) throw Error("Resource is no longer available");
    if (asset.documentId && this.library) return (await this.library.metadata(asset.documentId)).versions ?? [];
    return assetVersions(asset);
  }
  async importFile(file: string, imageOnly: boolean, resolve?: ResolveConflict): Promise<Asset> {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > (imageOnly ? MAX_IMAGE_BYTES : MAX_ASSET_BYTES)) throw Error("File too large (images: 20 MB; attachments: 100 MB)");
    return this.importBytes(path.basename(file), await fs.readFile(file), imageOnly, resolve);
  }
  importBytes(name: string, bytes: Buffer, imageOnly: boolean, resolve?: ResolveConflict): Promise<Asset> {
    const action = withAssetCatalog(this.root, async () => {
      if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw Error("Empty file or file exceeds 100 MB");
      const mime = imageMime(bytes);
      if (imageOnly && !mime) throw Error("Choose a PNG, JPEG, GIF or WebP image");
      if (mime && bytes.length > MAX_IMAGE_BYTES) throw Error("Images must be 20 MB or smaller");
      const extension = mime ? ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mime])! : path.extname(name).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
      const file = `${digest(bytes)}.${extension}`, assets = await this.manifest();
      const identical = assets.find(asset => !asset.documentId && assetVersions(asset).some(version => version.file === file));
      if (identical) {
        await writeManaged(this.filesDirectory, file, bytes, true);
        return this.resolved(identical);
      }
      const imported = await this.library?.find(digest(bytes), extension);
      if (imported) {
        const existing = assets.find(asset => asset.documentId === imported.id);
        if (existing) return this.resolved(existing);
        const asset: Asset = { id: `${digest(Buffer.from(`library:${imported.id}`))}.${extension}`, documentId: imported.id, name: imported.name, size: imported.size, mime: imported.mime, createdAt: new Date().toISOString() };
        await this.writeCatalog([...assets, asset]); return this.resolved(asset);
      }
      name = path.basename(name).slice(0, 200);
      const conflict = assets.find(asset => !asset.documentId && asset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      const decision = conflict ? await (resolve?.(conflict, { name, size: bytes.length, mime: mime ?? "application/octet-stream" }) ?? Promise.resolve("keep")) : undefined;
      if (decision === "cancel") throw Error("Import canceled");
      if (decision === "replace") {
        if (this.systemIds.has(conflict!.id)) throw Error("Built-in tutorial resources cannot be replaced. Keep both instead.");
        return this.commitVersion(assets, conflict!, bytes, mime ?? conflict!.mime, extension);
      }
      if (decision === "keep") name = numberedName(name, assets.filter(asset => !asset.documentId).map(asset => asset.name));
      let id = file; if (assets.some(asset => asset.id === id)) id = `${digest(Buffer.from(file + name + Date.now()))}.${extension}`;
      const now = new Date().toISOString(), version: ResourceVersion = { version: 1, file, sha256: digest(bytes), size: bytes.length, mime: mime ?? "application/octet-stream", createdAt: now };
      const asset: Asset = { id, file, name, size: bytes.length, mime: version.mime, createdAt: now, version: 1, versions: [version] };
      await writeManaged(this.filesDirectory, file, bytes, true); await this.writeCatalog([...assets, asset]); return asset;
    });
    return action;
  }
  private async commitVersion(assets: Asset[], previous: Asset, bytes: Buffer, mime: string, extension: string): Promise<Asset> {
    const versions = assetVersions(previous), hash = digest(bytes);
    if (versions.at(-1)!.sha256 === hash) return previous;
    const file = `${hash}.${extension}`, now = new Date().toISOString(), number = (previous.version ?? versions.at(-1)!.version) + 1;
    await this.read(previous.id);
    await writeManaged(this.filesDirectory, file, bytes);
    const asset: Asset = { ...previous, file, size: bytes.length, mime, updatedAt: now, version: number, versions: [...versions, { version: number, file, sha256: hash, size: bytes.length, mime, createdAt: now }] };
    await this.writeCatalog(assets.map(item => item.id === previous.id ? asset : item)); return asset;
  }
  updateVersion(id: string, bytes: Buffer): Promise<Asset> {
    const action = withAssetCatalog(this.root, async () => {
      const assets = await this.manifest(), previous = assets.find(asset => asset.id === id);
      if (!previous || previous.documentId) throw Error("This resource cannot be updated here.");
      if (this.systemIds.has(id)) throw Error("Built-in tutorial resources are managed by LanCarbon; external edits are not imported.");
      if (bytes.length > MAX_ASSET_BYTES) throw Error("Files must be 100 MB or smaller.");
      const detected = imageMime(bytes);
      if (previous.mime.startsWith("image/") && (!detected || bytes.length > MAX_IMAGE_BYTES)) throw Error("The saved image is incomplete or exceeds 20 MB. Save a valid image again.");
      return this.commitVersion(assets, previous, bytes, detected ?? previous.mime, path.extname(previous.file ?? previous.id).slice(1));
    });
    return action;
  }
  private async writeCatalog(assets: Asset[]) {
    await fs.mkdir(this.root, { recursive: true }); const file = path.join(this.root, "assets.json");
    await fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, assets }, null, 2), "utf8"); await fs.rename(`${file}.tmp`, file);
  }
  async filePath(id: string): Promise<string> {
    if (!ASSET_ID.test(id)) throw Error("Invalid asset ID");
    const asset = (await this.manifest()).find(item => item.id === id); if (!asset) throw Error("Resource is no longer available");
    if (asset.documentId) { if (!this.library) throw Error("The linked Library document is unavailable."); return this.library.filePath(asset.documentId); }
    return managedFile(this.filesDirectory, asset.file ?? id);
  }
  rename(id: string, name: string): Promise<Asset> {
    const action = withAssetCatalog(this.root, async () => {
      if (!ASSET_ID.test(id)) throw Error("Invalid asset ID");
      if (this.systemIds.has(id)) throw Error("Built-in tutorial resources are managed by LanCarbon and cannot be renamed.");
      const assets = await this.manifest(), previous = assets.find(asset => asset.id === id); if (!previous) throw Error("Resource is no longer available");
      if (previous.documentId && this.library) { const renamed = await this.library.rename(previous.documentId, name); return { ...renamed, id, documentId: previous.documentId }; }
      name = validName(name);
      if (path.extname(name).toLowerCase() !== path.extname(previous.name).toLowerCase()) throw Error("Keep the original file extension");
      if (assets.some(asset => !asset.documentId && asset.id !== id && asset.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error("Another resource already uses this name");
      const asset = { ...previous, name, updatedAt: new Date().toISOString() }; await this.writeCatalog(assets.map(item => item.id === id ? asset : item)); return asset;
    });
    return action;
  }
  remove(ids: string[], confirm: (assets: Asset[]) => Promise<boolean>, updateReferences?: () => Promise<() => Promise<void>>): Promise<boolean> {
    const action = withAssetCatalog(this.root, async () => {
      if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && ASSET_ID.test(id))) throw Error("Invalid resource selection");
      const catalog = await this.manifest(), selected = catalog.filter(asset => ids.includes(asset.id));
      if (selected.length !== new Set(ids).size) throw Error("Resources changed. Refresh the list before deleting.");
      if (selected.some(asset => this.systemIds.has(asset.id))) throw Error("Built-in tutorial resources are managed by LanCarbon and cannot be deleted.");
      if (!await confirm(await Promise.all(selected.map(asset => this.resolved(asset))))) return false;
      const remaining = catalog.filter(asset => !ids.includes(asset.id));
      const files = [...new Set(selected.flatMap(filesOf))].filter(file => !remaining.some(asset => filesOf(asset).includes(file)));
      const staged: Array<[string, string]> = []; let rollbackReferences: (() => Promise<void>) | undefined;
      try {
        for (const file of files) {
          const source = path.join(this.filesDirectory, file), temporary = `${source}.deleting`;
          try { await managedFile(this.filesDirectory, file); await fs.rename(source, temporary); staged.push([source, temporary]); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        rollbackReferences = await updateReferences?.(); await this.writeCatalog(remaining);
      } catch (error) { for (const [source, temporary] of staged.reverse()) await fs.rename(temporary, source); await rollbackReferences?.(); throw error; }
      for (const [, temporary] of staged) await fs.unlink(temporary).catch(() => undefined);
      return true;
    });
    return action;
  }
}
