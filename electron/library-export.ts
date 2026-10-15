import { promises as fs } from "node:fs";
import path from "node:path";
import { LibraryStore, librarySelection } from "./library";
import { validName } from "./resource-files";
import type { LibraryBatchResult } from "../src/shared/library";

/** Export verified current versions without overwriting any destination file. */
export async function exportLibraryFiles(store: LibraryStore, library: string, destination: string, input: string[]): Promise<LibraryBatchResult> {
  const ids = librarySelection(input), managed = await fs.realpath(library), directory = await fs.realpath(destination);
  const relative = path.relative(managed, directory);
  if (!relative || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw Error("Export files outside the managed Library folder.");
  if (!(await fs.stat(directory)).isDirectory()) throw Error("Choose an export folder.");
  const entries = await store.list(), batch: LibraryBatchResult = { items: [], failures: [] };
  for (const id of ids) {
    const entry = entries.find(entry => entry.id === id);
    try {
      if (!entry) throw Error("This file is no longer in Library.");
      const { bytes } = await store.read(id), name = validName(entry.name), extension = path.extname(name), stem = name.slice(0, name.length - extension.length);
      for (let suffix = 1; ; suffix++) {
        const exported = suffix === 1 ? name : `${stem} (${suffix})${extension}`, file = path.join(directory, exported);
        if (path.dirname(file) !== directory) throw Error("Invalid export path.");
        let handle;
        try { handle = await fs.open(file, "wx"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
        try { await handle.writeFile(bytes); await handle.close(); }
        catch (error) { await handle.close().catch(() => undefined); await fs.unlink(file).catch(() => undefined); throw error; }
        batch.items.push({ id, name: exported }); break;
      }
    } catch (error) { batch.failures.push({ id, name: entry?.name ?? id, error: error instanceof Error ? error.message : "Could not export file." }); }
  }
  return batch;
}
