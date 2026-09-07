import { promises as fs } from "node:fs";
import path from "node:path";
import { generateBookProject } from "../src/shared/jupyter-book";
import type { WorkspaceFile } from "../src/shared/types";
import { mapAssetLinks, assetId } from "../src/shared/assets";
import type { AssetStore } from "./assets";
import { validateBookCitations } from "../src/shared/bibliography";

function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Export path escapes the destination: ${relativePath}`);
  return resolved;
}

export async function exportBookToDirectory(workspace: WorkspaceFile, bookId: string, destination: string, assets?: AssetStore): Promise<void> {
  const root = path.resolve(destination);
  const entries = await fs.readdir(root);
  if (entries.length) throw new Error("The export folder must be empty");
  const project = generateBookProject(workspace, bookId);
  const resources = new Map<string, Buffer>();
  const required = new Set<string>();
  for (const [name, content] of project.files) {
    if (name.endsWith(".md") && name !== "README.md") project.files.set(name, mapAssetLinks(content, id => {
      required.add(id);
      return path.posix.relative(path.posix.dirname(name), `assets/${id}`);
    }));
  }
  const book = workspace.books.find(b => b.id === bookId)!;
  const citationErrors=validateBookCitations(book,workspace.notes);if(citationErrors.length)throw new Error(`Citation validation failed:\n${citationErrors.join("\n")}`);
  for (const url of [book.settings.logo, book.settings.favicon]) { const id = url && assetId(url); if (id) required.add(id); }
  for (const source of book.settings.bibliography ?? []) required.add(source.assetId);
  for (const id of required) {
    if (!assets) throw new Error(`Missing resource: ${id}`);
    try { resources.set(`assets/${id}`, (await assets.read(id)).bytes); }
    catch { throw new Error(`Missing or damaged resource: ${id}. Re-import it before exporting.`); }
  }
  if (resources.size && [...project.files.keys()].some(name => name === "assets" || name.startsWith("assets/"))) throw new Error("The assets folder is reserved for managed resources. Change the page export path.");
  const createdTopLevels = new Set<string>();
  try {
    for (const [relativePath, content] of project.files) {
      const target = resolveInside(root, relativePath);
      const topLevel = relativePath.split("/")[0];
      createdTopLevels.add(topLevel);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
    }
    for (const [relativePath, bytes] of resources) {
      createdTopLevels.add("assets");
      const target = resolveInside(root,relativePath);
      await fs.mkdir(path.dirname(target), {recursive:true});
      await fs.writeFile(target,bytes,{flag:"wx"});
    }
  } catch (error) {
    await Promise.all([...createdTopLevels].map(async entry => {
      const target = resolveInside(root, entry);
      await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
    }));
    throw error;
  }
}
