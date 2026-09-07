import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ASSET_ID, MAX_ASSET_BYTES, MAX_IMAGE_BYTES, type Asset } from "../src/shared/assets";
export type ResolveConflict = (existing: Asset, incoming: {name:string;size:number;mime:string}) => Promise<"replace" | "keep" | "cancel">;

function imageMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(data.toString("ascii", 0, 6))) return "image/gif";
  if (data.toString("ascii",0,4) === "RIFF" && data.toString("ascii",8,12) === "WEBP") return "image/webp";
  return undefined;
}
export class AssetStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) {}
  private async manifest(): Promise<Asset[]> {
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.root,"assets.json"),"utf8"));
      if (data.version !== 1 || !Array.isArray(data.assets) || !data.assets.every((a: Asset) => ASSET_ID.test(a.id) && (a.file === undefined || ASSET_ID.test(a.file)) && typeof a.name === "string" && typeof a.mime === "string")) throw new Error("Invalid asset catalog");
      return data.assets;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async list(): Promise<Asset[]> {
    return Promise.all((await this.manifest()).map(async a => ({ ...a, missing: !(await fs.stat(path.join(this.root,"assets",a.file ?? a.id)).catch(() => null))?.isFile() })));
  }
  async read(id: string): Promise<{ asset: Asset; bytes: Buffer }> {
    if (!ASSET_ID.test(id)) throw new Error("Invalid asset ID");
    const asset = (await this.manifest()).find(a => a.id === id);
    if (!asset) throw new Error("This resource is not in the asset catalog");
    const directory = await fs.realpath(path.join(this.root,"assets"));
    const file = await fs.realpath(path.join(directory,asset.file ?? id));
    if (path.dirname(file) !== directory) throw new Error("Asset path leaves the managed folder");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) throw new Error("Invalid asset file size");
    const bytes = await fs.readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== (asset.file ?? id).split(".")[0]) throw new Error("Asset file changed or is damaged");
    return { asset, bytes };
  }
  async importFile(file: string, imageOnly: boolean, resolve?: ResolveConflict): Promise<Asset> {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > (imageOnly ? MAX_IMAGE_BYTES : MAX_ASSET_BYTES)) throw new Error("File too large (images: 20 MB; attachments: 100 MB)");
    return this.importBytes(path.basename(file), await fs.readFile(file), imageOnly, resolve);
  }
  importBytes(name: string, bytes: Buffer, imageOnly: boolean, resolve?: ResolveConflict): Promise<Asset> {
    const action = this.queue.then(async () => {
      if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new Error("Empty file or file exceeds 100 MB");
      const mime = imageMime(bytes);
      if (imageOnly && !mime) throw new Error("Choose a PNG, JPEG, GIF or WebP image");
      if (mime && bytes.length > MAX_IMAGE_BYTES) throw new Error("Images must be 20 MB or smaller");
      const ext = mime ? ({"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp"}[mime])! : path.extname(name).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0,12) || "bin";
      const file = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
      const assets = await this.manifest();
      name = path.basename(name).slice(0,200);
      const conflict = assets.find(a => a.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      const decision = conflict ? await (resolve?.(conflict,{name,size:bytes.length,mime:mime ?? "application/octet-stream"}) ?? Promise.resolve("keep")) : undefined;
      if (decision === "cancel") throw new Error("Import canceled");
      if (decision === "keep") {
        const extension = path.extname(name), stem = name.slice(0,name.length-extension.length); let suffix = 2;
        while (assets.some(a => a.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${stem} (${suffix++})${extension}`;
      }
      const identical = !conflict && assets.find(a => (a.file ?? a.id) === file);
      let id = file;
      if (assets.some(a => a.id === id)) id = `${createHash("sha256").update(file + name + Date.now()).digest("hex")}.${ext}`;
      const asset: Asset = decision === "replace" ? {...conflict!,file,size:bytes.length,mime:mime ?? "application/octet-stream",updatedAt:new Date().toISOString()} : identical || {id,file,name,size:bytes.length,mime:mime ?? "application/octet-stream",createdAt:new Date().toISOString()};
      await fs.mkdir(path.join(this.root,"assets"), {recursive:true});
      const actualRoot = await fs.realpath(this.root), actualAssets = await fs.realpath(path.join(this.root,"assets"));
      if (path.dirname(actualAssets) !== actualRoot) throw new Error("Asset folder leaves the data directory");
      const target = path.join(this.root,"assets",file);
      // Repair a missing managed copy on re-import; identical imports share one file.
      await fs.writeFile(`${target}.tmp`, bytes);
      await fs.rename(`${target}.tmp`,target);
      const next = decision === "replace" ? assets.map(a => a.id === asset.id ? asset : a) : assets.some(a => a.id === asset.id) ? assets : [...assets,asset];
      await this.writeCatalog(next);
      const previousFile = conflict && (conflict.file ?? conflict.id);
      if (decision === "replace" && previousFile !== file && !next.some(a => (a.file ?? a.id) === previousFile)) await fs.unlink(path.join(this.root,"assets",previousFile!)).catch(e => { if (e.code !== "ENOENT") throw e; });
      return asset;
    });
    this.queue = action.catch(() => undefined);
    return action;
  }
  private async writeCatalog(assets: Asset[]) {
    const file = path.join(this.root,"assets.json");
    await fs.writeFile(`${file}.tmp`,JSON.stringify({version:1,assets},null,2),"utf8");
    await fs.rename(`${file}.tmp`,file);
  }
  remove(ids: string[], confirm: (assets: Asset[]) => Promise<boolean>, updateReferences?: () => Promise<() => Promise<void>>): Promise<boolean> {
    const action = this.queue.then(async () => {
      if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && ASSET_ID.test(id))) throw new Error("Invalid resource selection");
      const catalog = await this.manifest(), selected = catalog.filter(a => ids.includes(a.id));
      if (selected.length !== new Set(ids).size) throw new Error("Resources changed. Refresh the list before deleting.");
      if (!await confirm(selected)) return false;
      const remaining = catalog.filter(a => !ids.includes(a.id));
      const files = [...new Set(selected.map(a => a.file ?? a.id))].filter(file => !remaining.some(a => (a.file ?? a.id) === file));
      const directory = path.join(this.root,"assets");
      if (files.length && await fs.stat(directory).catch(()=>null)) {
        if (path.dirname(await fs.realpath(directory)) !== await fs.realpath(this.root)) throw new Error("Asset folder leaves the data directory");
      }
      const staged: Array<[string,string]> = [];
      let rollbackReferences: (() => Promise<void>) | undefined;
      try {
        for (const file of files) {
          const source = path.join(directory,file), temporary = `${source}.deleting`;
          try { await fs.rename(source,temporary); staged.push([source,temporary]); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
        }
        rollbackReferences = await updateReferences?.();
        await this.writeCatalog(remaining);
      } catch (e) { for (const [source,temp] of staged.reverse()) await fs.rename(temp,source); await rollbackReferences?.(); throw e; }
      for (const [,temp] of staged) await fs.unlink(temp);
      return true;
    });
    this.queue = action.catch(()=>undefined);
    return action;
  }
}
