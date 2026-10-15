import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export function validName(value: unknown, limit = 200): string {
  if (typeof value !== "string") throw Error("Enter a name.");
  const name = value.trim();
  if (!name || name.length > limit || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === "." || name === "..") throw Error(`Enter a valid name of up to ${limit} characters.`);
  return name;
}
export function relativeParts(relative: string): string[] {
  if (typeof relative !== "string" || relative.includes("\\") || path.isAbsolute(relative) || relative.split("/").some(part => !part || part === "." || part === ".." || /[:\x00-\x1f]/.test(part))) throw Error("Invalid managed file path.");
  return relative.split("/");
}
export async function managedDirectory(root: string, relative?: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  if ((await fs.lstat(root)).isSymbolicLink()) throw Error("Folder leaves its managed location.");
  let current = await fs.realpath(root);
  for (const part of relative ? relativeParts(relative) : []) {
    const next = path.join(current, part);
    await fs.mkdir(next).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await fs.lstat(next);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.dirname(await fs.realpath(next)) !== current) throw Error("Folder leaves its managed location.");
    current = await fs.realpath(next);
  }
  return current;
}
export async function managedFile(root: string, relative: string): Promise<string> {
  const parts = relativeParts(relative), name = parts.pop()!;
  const directory = await managedDirectory(root, parts.length ? parts.join("/") : undefined), filename = path.join(directory, name);
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || path.dirname(await fs.realpath(filename)) !== directory) throw Error("File leaves its managed folder.");
  return fs.realpath(filename);
}
export async function writeManaged(root: string, relative: string, bytes: Buffer, repair = false): Promise<void> {
  const parts = relativeParts(relative), name = parts.pop()!;
  const directory = await managedDirectory(root, parts.length ? parts.join("/") : undefined), filename = path.join(directory, name);
  const stat = await fs.lstat(filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("The managed path is not a regular file.");
    if (stat.size === bytes.length && digest(await fs.readFile(filename)) === digest(bytes)) return;
    if (!repair) throw Error("The managed original was modified directly. Keep the changed file and re-import it.");
  }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, bytes, { flag: "wx" }); if (digest(await fs.readFile(temporary)) !== digest(bytes)) throw Error("The managed copy failed verification."); await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}
export function numberedName(name: string, occupied: string[]): string {
  const extension = path.extname(name), stem = name.slice(0, name.length - extension.length), lower = new Set(occupied.map(item => item.toLocaleLowerCase()));
  let result = name, suffix = 2; while (lower.has(result.toLocaleLowerCase())) result = `${stem} (${suffix++})${extension}`;
  return result;
}
