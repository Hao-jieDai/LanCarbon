// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { AssetStore } from "../electron/assets";
import { LibraryStore, librarySelection } from "../electron/library";
import { exportLibraryFiles } from "../electron/library-export";
import { ExternalEdits } from "../electron/external-edits";
import { withoutResources } from "../src/shared/removeResourceReferences";
import { createBook } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import { assetMarkdown } from "../src/shared/assets";
import { pdfFixture } from "./fixtures/library";
const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-batch-")); roots.push(root);
  const data = path.join(root, "Data"), library = path.join(root, "Library"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(library, "assets")), store = new LibraryStore(data, library, assets);
  const pdf = async (name: string, text: string, folderId: string | null = null) => {
    const source = path.join(root, name); await fs.mkdir(path.dirname(source), { recursive: true }); await fs.writeFile(source, pdfFixture(text));
    const result = await store.importFiles([source], folderId); if (result.failures.length) throw Error(result.failures[0].error); return result.items[0].entry;
  };
  return { root, data, library, assets, store, pdf };
}
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) { const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-batch-")) throw Error("Unsafe test cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5 }); } });
const accept = async () => true, references = async () => async () => {};

it("deletes linked originals, every revision and all writing references while retaining unrelated prose", async () => {
  const { store, assets, library, pdf } = await fixture(), a = await pdf("a.pdf", "A"), b = await pdf("b.pdf", "B");
  const linked = await assets.importFile(await store.filePath(a.id), false); await store.updateVersion(a.id, pdfFixture("A2"));
  const { book, homeNote } = createBook("Book"), note = createNote({ id: "personal", title: "Personal", content: `Keep this.\n${assetMarkdown(linked)}` }); homeNote.content = assetMarkdown(linked);
  let workspace = { version: 2 as const, notes: [note, homeNote], books: [book] };
  const versions = await store.versions(a.id);
  const result = await store.remove([a.id], async (entries, ids) => { expect(entries[0].version).toBe(2); expect(ids).toEqual([linked.id]); return true; }, async ids => { const previous = workspace; workspace = withoutResources(workspace, ids); return async () => { workspace = previous; }; });
  expect(result).toMatchObject({ removed: true, ids: [a.id], resourceIds: [linked.id] }); expect(await assets.list()).toEqual([]);
  expect(workspace.notes[0].content).toBe("Keep this.\n"); expect(workspace.notes[1].content).toBe("");
  for (const version of versions) expect(await fs.stat(path.join(library, version.file)).catch(() => null)).toBeNull();
  expect((await store.read(b.id)).bytes).toEqual(pdfFixture("B")); await store.synchronize(); expect((await store.list()).map(entry => entry.id)).toEqual([b.id]);
});
it("cancellation leaves originals, catalogs and references untouched", async () => {
  const { store, data, pdf } = await fixture(), a = await pdf("a.pdf", "A"), before = await fs.readFile(path.join(data, "Library/documents.json"));
  const change = vi.fn(references); expect((await store.remove([a.id], async () => false, change)).removed).toBe(false);
  expect(change).not.toHaveBeenCalled(); expect(await fs.readFile(path.join(data, "Library/documents.json"))).toEqual(before); expect((await store.read(a.id)).bytes).toEqual(pdfFixture("A"));
});
it("keeps version files shared by an unselected document", async () => {
  const { store, library, pdf } = await fixture(), a = await pdf("a.pdf", "A"), b = await pdf("b.pdf", "B");
  await store.updateVersion(a.id, pdfFixture("Shared")); await store.updateVersion(b.id, pdfFixture("Shared"));
  const old = (await store.versions(a.id))[0].file; await store.remove([a.id], accept, references);
  expect(await fs.stat(path.join(library, old)).catch(() => null)).toBeNull(); expect((await store.read(b.id)).bytes).toEqual(pdfFixture("Shared")); expect((await store.read(b.id, 1)).bytes).toEqual(pdfFixture("B"));
});
it("rolls back originals, linked assets, Library catalog and writing if the asset catalog cannot commit", async () => {
  const { store, assets, pdf } = await fixture(), a = await pdf("a.pdf", "A"), linked = await assets.importFile(await store.filePath(a.id), false);
  let writing = "original"; vi.spyOn(assets as any, "writeCatalog").mockRejectedValueOnce(Error("Simulated disk failure"));
  await expect(store.remove([a.id], accept, async () => { writing = "changed"; return async () => { writing = "original"; }; })).rejects.toThrow("disk failure");
  expect(writing).toBe("original"); expect((await store.read(a.id)).bytes).toEqual(pdfFixture("A")); expect((await assets.list())[0].id).toBe(linked.id);
});
it("removes already missing files without recreating their directories", async () => {
  const { store, library, pdf } = await fixture(), folder = await store.createFolder("Gone", null), a = await pdf("a.pdf", "A", folder.id);
  await fs.unlink(await store.filePath(a.id)); await fs.rmdir(path.join(library, "Imports/Gone"));
  await store.remove([a.id], accept, references); await store.synchronize(); expect(await store.list()).toEqual([]); expect(await fs.stat(path.join(library, "Imports/Gone")).catch(() => null)).toBeNull();
});
it("protects official resources even in mixed selections and validates stale selections before writing", async () => {
  const { store, data, library, assets, pdf } = await fixture(), official = await assets.importBytes("Official.txt", Buffer.from("Official"), false), a = await pdf("a.pdf", "A");
  const protectedAssets = new AssetStore(data, path.join(library, "assets"), new Set([official.id])), protectedStore = new LibraryStore(data, library, protectedAssets);
  await expect(protectedStore.remove([a.id, official.id], accept, references)).rejects.toThrow("tutorial");
  await expect(protectedAssets.remove([official.id], accept)).rejects.toThrow("tutorial");
  await expect(store.remove([a.id, `import:${"0".repeat(64)}.pdf`], accept, references)).rejects.toThrow("Refresh"); expect((await store.read(a.id)).bytes).toEqual(pdfFixture("A"));
});
it("exports current versions and numbers collisions without changing existing files or originals", async () => {
  const { store, root, library, pdf } = await fixture(), folder = await store.createFolder("Other", null), a = await pdf("a/report.pdf", "A"), b = await pdf("b/report.pdf", "B", folder.id);
  await store.updateVersion(a.id, pdfFixture("A2")); const destination = path.join(root, "Export"); await fs.mkdir(destination); await fs.writeFile(path.join(destination, "report.pdf"), "Keep");
  const result = await exportLibraryFiles(store, library, destination, [a.id, b.id]); expect(result.failures).toEqual([]); expect(result.items.map(item => item.name)).toEqual(["report (2).pdf", "report (3).pdf"]);
  expect(await fs.readFile(path.join(destination, "report.pdf"), "utf8")).toBe("Keep"); expect(await fs.readFile(path.join(destination, "report (2).pdf"))).toEqual(pdfFixture("A2")); expect(await fs.readFile(path.join(destination, "report (3).pdf"))).toEqual(pdfFixture("B")); expect((await store.read(a.id, 1)).bytes).toEqual(pdfFixture("A"));
  await expect(exportLibraryFiles(store, library, path.join(library, "Imports"), [a.id])).rejects.toThrow("outside");
});
it("reports individual export failures and still exports available files", async () => {
  const { store, root, library, pdf } = await fixture(), a = await pdf("a.pdf", "A"), b = await pdf("b.pdf", "B"); await fs.unlink(await store.filePath(a.id));
  const result = await exportLibraryFiles(store, library, root, [a.id, b.id]); expect(result.items).toEqual([{ id: b.id, name: "b (2).pdf" }]); expect(result.failures[0].id).toBe(a.id);
});
it("moves batches with explicit collision handling, stable IDs and all revisions", async () => {
  const { store, pdf } = await fixture(), folder = await store.createFolder("Target", null), a = await pdf("a/report.pdf", "A"), b = await pdf("b/report.pdf", "B", folder.id), c = await pdf("c.pdf", "C"); await store.updateVersion(a.id, pdfFixture("A2"));
  await expect(store.moveMany([c.id, a.id], folder.id, false)).rejects.toThrow("Keep both"); expect((await store.metadata(c.id)).folderId).toBeNull();
  const result = await store.moveMany([a.id, c.id], folder.id, true); expect(result.failures).toEqual([]); expect(result.items[0]).toEqual({ id: a.id, name: "report (2).pdf" }); expect((await store.metadata(c.id)).folderId).toBe(folder.id);
  expect((await store.read(a.id, 1)).bytes).toEqual(pdfFixture("A")); expect((await store.read(a.id)).bytes).toEqual(pdfFixture("A2")); expect((await store.read(b.id)).bytes).toEqual(pdfFixture("B"));
});
it("keeps physical asset versions shared with an unselected resource", async () => {
  const { store, assets } = await fixture(), a = await assets.importBytes("a.txt", Buffer.from("A"), false), b = await assets.importBytes("b.txt", Buffer.from("B"), false);
  await assets.updateVersion(a.id, Buffer.from("Shared")); await assets.updateVersion(b.id, Buffer.from("Shared")); await store.remove([a.id], accept, references);
  expect((await assets.read(b.id)).bytes.toString()).toBe("Shared"); expect((await assets.readVersion(b.id, 1)).bytes.toString()).toBe("B");
});
it("forgets external edit sessions so later saves cannot resurrect a deleted document", async () => {
  const { store, data, library, pdf } = await fixture(), a = await pdf("a.pdf", "A"), edits = new ExternalEdits(data, library, store), working = await edits.prepare(a.id);
  await store.remove([a.id], accept, references); await edits.forget([a.id]); await fs.writeFile(working, pdfFixture("Late external save")); expect(await edits.sync()).toEqual({ changed: false, errors: [] }); await store.synchronize(); expect(await store.list()).toEqual([]);
});
it("validates and deduplicates batch selections", () => { const id = `import:${"a".repeat(64)}.pdf`; expect(librarySelection([id, id])).toEqual([id]); for (const value of [[], null, ["../../Data/notes.json"], [1]]) expect(() => librarySelection(value)).toThrow("Select valid"); });
