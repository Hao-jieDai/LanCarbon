import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ASSET_ID } from "../src/shared/assets";

async function inventory(directory: string, prefix = ""): Promise<Array<{ name: string; hash: string; size: number }>> {
  const result = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error("Linked resource folders cannot be migrated automatically");
    const name = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...await inventory(path.join(directory, entry.name), name));
    else if (entry.isFile()) {
      const bytes = await fs.readFile(path.join(directory, entry.name));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (ASSET_ID.test(entry.name) && path.parse(entry.name).name !== hash) throw new Error("A managed resource failed its integrity check. The original folder has been retained.");
      result.push({ name, hash, size: bytes.length });
    } else throw new Error("Unsupported resource file");
  }
  return result;
}

/** Copy and verify the complete old folder before retiring it. Retry is idempotent. */
export async function migrateAssetsToLibrary(data: string, library: string): Promise<void> {
  const source = path.resolve(data, "assets");
  const target = path.resolve(library, "assets");
  if (source === target) return;
  const sourceStat = await fs.lstat(source).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (sourceStat?.isSymbolicLink() || (sourceStat && !sourceStat.isDirectory())) throw new Error("The old resource folder is not a regular directory");
  await fs.mkdir(library, { recursive: true });
  if ((await fs.lstat(library)).isSymbolicLink()) throw new Error("Library must not be a linked folder");
  const targetStat = await fs.lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (targetStat?.isSymbolicLink() || (targetStat && !targetStat.isDirectory())) throw new Error("The Library resource folder is not a regular directory");
  await fs.mkdir(target, { recursive: true });
  if (!sourceStat) return;
  for (const [name, supported] of [["notes.json", [1, 2]], ["assets.json", [1]]] as const) {
    const bytes = await fs.readFile(path.join(data, name), "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (bytes) {
      const value = JSON.parse(bytes);
      if (!Array.isArray(value) && value?.version !== undefined && !(supported as readonly number[]).includes(value.version)) throw new Error("This data format requires a compatible LanCarbon version. Resources have not been migrated.");
    }
  }
  const sources = await inventory(source);
  const targets = new Map((await inventory(target)).map(file => [file.name, file]));
  // Preflight every conflict before adding any files to the target.
  for (const file of sources) if (targets.has(file.name) && targets.get(file.name)!.hash !== file.hash) throw new Error("Library contains a conflicting resource. The original folder has been retained.");
  for (const file of sources) {
    const destination = path.join(target, file.name);
    if (!targets.has(file.name)) {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const temporary = destination + ".migration-" + randomUUID();
      try {
        await fs.copyFile(path.join(source, file.name), temporary);
        const copiedHash = createHash("sha256").update(await fs.readFile(temporary)).digest("hex");
        if (copiedHash !== file.hash) throw new Error("Resource copy failed verification");
        await fs.rename(temporary, destination);
      } finally { await fs.rm(temporary, { force: true }); }
    }
  }
  if (JSON.stringify(await inventory(source)) !== JSON.stringify(sources)) throw new Error("Resources changed during migration. Close other LanCarbon windows and retry.");
  const verified = new Map((await inventory(target)).map(file => [file.name, file]));
  if (sources.some(file => verified.get(file.name)?.hash !== file.hash)) throw new Error("Resource migration failed verification");
  const management = path.join(data, "Library");
  await fs.mkdir(management, { recursive: true });
  const record = path.join(management, "assets-migration.json");
  await fs.writeFile(record + ".tmp", JSON.stringify({ version: 1, migratedAt: new Date().toISOString(), source, target, files: sources }, null, 2));
  await fs.rename(record + ".tmp", record);
  // Both the old and new bytes have been verified. Rename within Data is atomic,
  // including when a custom Data location lives on another drive.
  const retired = path.resolve(data, ".assets-migrated-" + randomUUID());
  if (path.dirname(retired) !== path.resolve(data) || path.dirname(await fs.realpath(source)) !== await fs.realpath(data)) throw new Error("Invalid resource retirement path");
  await fs.rename(source, retired);
  await fs.rm(retired, { recursive: true, force: true }).catch(() => undefined);
}
