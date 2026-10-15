// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { AssetStore } from "../electron/assets";
import { NotesStore } from "../electron/storage";
import { LibraryStore, LibraryNameConflict } from "../electron/library";
import { ExternalEdits } from "../electron/external-edits";
import { createBook } from "../src/shared/books";
import { assetMarkdown } from "../src/shared/assets";
import { exportBookToDirectory } from "../electron/book-exporter";
import { pdfFixture } from "./fixtures/library";
const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-versions-")); roots.push(root);
  const data = path.join(root, "Data"), library = path.join(root, "Library"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(library, "assets")), store = new LibraryStore(data, library, assets), edits = new ExternalEdits(data, library, store);
  const source = async (name: string, bytes = pdfFixture()) => { const filename = path.join(root, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, bytes); return filename; };
  const importPdf = async (name: string, text = "Climate change affects investment.", folderId: string | null = null) => {
    const result = await store.importFiles([await source(name, pdfFixture(text))], folderId); if (result.failures.length) throw Error(result.failures[0].error); return result.items[0].entry;
  };
  return { root, data, library, assets, store, edits, source, importPdf };
}
afterEach(async () => { for (const root of roots.splice(0)) { const target = path.resolve(root); if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("lancarbon-versions-")) await fs.rm(target, { recursive: true, force: true, maxRetries: 5 }); } });
async function saveExternal(filename: string, bytes: Buffer) { await fs.writeFile(filename, bytes); const old = new Date(Date.now() - 2000); await fs.utimes(filename, old, old); }
it("retains a renamed display name when the identical old name or a different name is re-imported", async () => {
  const { store, source, importPdf } = await fixture(), first = await importPdf("a.pdf"); await store.rename(first.id, "b.pdf");
  for (const filename of ["a.pdf", "different.pdf"]) {
    const result = await store.importFiles([await source(filename)]);
    expect(result.items[0]).toMatchObject({ status: "existing", incomingName: filename, entry: { id: first.id, name: "b.pdf" } });
  }
  expect(await store.list()).toHaveLength(1);
});
it("permits equal names in separate physical folders and deduplicates content across them", async () => {
  const { store, source, importPdf, library } = await fixture();
  const left = await store.createFolder("Energy", null), child = await store.createFolder("Demand", left.id), right = await store.createFolder("Finance", null);
  const a = await importPdf("a/report.pdf", "Left", child.id), b = await importPdf("b/report.pdf", "Right", right.id);
  expect(a.name).toBe(b.name); expect(a.location).toBe("Imports/Energy/Demand"); expect(await store.filePath(a.id)).toContain(path.join("Imports", "Energy", "Demand"));
  const duplicate = await store.importFiles([await source("new-name.pdf", pdfFixture("Left"))], right.id);
  expect(duplicate.items[0]).toMatchObject({ status: "existing", targetFolderId: right.id, entry: { id: a.id, name: "report.pdf", folderId: child.id } });
  const numbered = await importPdf("c/report.pdf", "Third", right.id); expect(numbered.name).toBe("report (2).pdf");
  await expect(store.createFolder("finance", null)).rejects.toThrow("already exists"); await expect(store.createFolder("../escape", null)).rejects.toThrow();
  await expect(store.rename(numbered.id, "REPORT.pdf")).rejects.toThrow("already uses");
  expect((await fs.readdir(path.join(library, "Imports/Finance"))).length).toBe(2);
});
it("requires an explicit keep-both choice when moving, preserving IDs and all revisions", async () => {
  const { store, importPdf } = await fixture(), folder = await store.createFolder("Folder", null);
  const a = await importPdf("a/report.pdf", "A"), b = await importPdf("b/report.pdf", "B", folder.id);
  await store.updateVersion(a.id, pdfFixture("A version two"));
  let conflict: unknown; try { await store.move(a.id, folder.id); } catch (error) { conflict = error; }
  expect(conflict).toBeInstanceOf(LibraryNameConflict); expect((conflict as LibraryNameConflict).suggestedName).toBe("report (2).pdf");
  const moved = await store.move(a.id, folder.id, true); expect(moved).toMatchObject({ id: a.id, name: "report (2).pdf", version: 2, folderId: folder.id });
  expect((await store.read(a.id, 1)).bytes).toEqual(pdfFixture("A")); expect((await store.read(a.id)).bytes).toEqual(pdfFixture("A version two")); expect((await store.read(b.id)).bytes).toEqual(pdfFixture("B"));
  expect((await store.versions(a.id)).every(version => version.file.startsWith("Imports/Folder/"))).toBe(true);
});
it("links Attach file to an imported original without copying, and follows rename, move and new versions", async () => {
  const { root, store, assets, importPdf, library, source } = await fixture();
  const original = await importPdf("a.pdf"); await store.rename(original.id, "b.pdf");
  const attached = await assets.importFile(await store.filePath(original.id), false); expect(attached.name).toBe("b.pdf"); expect(attached.documentId).toBe(original.id);
  expect(await fs.stat(path.join(library, "assets")).catch(() => null)).toBeNull();
  expect((await store.list()).find(entry => entry.id === original.id)?.assetId).toBe(attached.id);
  const folder = await store.createFolder("Topic", null); await store.move(original.id, folder.id); await store.rename(original.id, "c.pdf"); await store.updateVersion(original.id, pdfFixture("Updated"));
  expect((await assets.list())[0]).toMatchObject({ id: attached.id, name: "c.pdf", version: 2 }); expect((await assets.read(attached.id)).bytes).toEqual(pdfFixture("Updated"));
  const again = await assets.importFile(await source("old-a.pdf"), false); expect(again.id).toBe(attached.id); expect(again.name).toBe("c.pdf");
  const { book, homeNote } = createBook("Linked originals"); homeNote.content = assetMarkdown(attached); const output = path.join(root, "Export"); await fs.mkdir(output);
  await exportBookToDirectory({ version: 2, books: [book], notes: [homeNote] }, book.id, output, assets);
  expect(await fs.readFile(path.join(output, "assets", attached.id))).toEqual(pdfFixture("Updated"));
  await assets.remove([attached.id], async () => true); expect((await store.read(original.id)).bytes).toEqual(pdfFixture("Updated")); expect(await assets.list()).toEqual([]);
});
it("external PDF saves create revisions while immutable originals, names and IDs remain stable", async () => {
  const { store, edits, library, data, importPdf, assets, source } = await fixture(); const original = await importPdf("a.pdf"); await store.rename(original.id, "b.pdf");
  const immutable = await store.filePath(original.id), working = await edits.prepare(original.id); expect(path.basename(working)).toBe("b.pdf"); expect(working).not.toBe(immutable);
  await saveExternal(working, pdfFixture("Second")); expect((await edits.sync()).changed).toBe(true);
  expect((await store.list())[0]).toMatchObject({ id: original.id, name: "b.pdf", version: 2 }); expect(await fs.readFile(immutable)).toEqual(pdfFixture()); expect((await store.read(original.id)).bytes).toEqual(pdfFixture("Second"));
  await saveExternal(working, pdfFixture("Second")); await edits.sync(); expect((await store.versions(original.id)).length).toBe(2);
  await saveExternal(working, Buffer.from("incomplete")); expect((await edits.sync()).errors[0]).toContain("PDF header"); expect((await store.read(original.id)).bytes).toEqual(pdfFixture("Second"));
  await saveExternal(working, pdfFixture("Third")); expect((await edits.sync()).errors).toEqual([]); expect((await store.versions(original.id)).length).toBe(3);
  const again = await store.importFiles([await source("a.pdf")]); expect(again.items[0]).toMatchObject({ status: "existing", matchedVersion: 1, entry: { name: "b.pdf", version: 3 } });
  const folder = await store.createFolder("Moved", null); await store.move(original.id, folder.id);
  await saveExternal(working, pdfFixture("Saved while LanCarbon was closed"));
  const restarted = new LibraryStore(data, library, assets); await new ExternalEdits(data, library, restarted).sync(); expect((await restarted.read(original.id)).entry.version).toBe(4);
});
it("versions editable text including an empty save, while rejecting executable opening", async () => {
  const { assets, edits, store } = await fixture(); const text = await assets.importBytes("notes.txt", Buffer.from("First"), false), working = await edits.prepare(text.id);
  await saveExternal(working, Buffer.from("Second")); await edits.sync(); expect((await assets.read(text.id)).bytes.toString()).toBe("Second"); expect((await assets.readVersion(text.id, 1)).bytes.toString()).toBe("First");
  await saveExternal(working, Buffer.alloc(0)); await edits.sync(); expect((await store.read(text.id)).bytes).toHaveLength(0); expect(await assets.versions(text.id)).toHaveLength(3);
  const script = await assets.importBytes("run.cmd", Buffer.from("echo fixture"), false); await expect(edits.prepare(script.id)).rejects.toThrow("Programs, scripts");
});
it("reads the previous catalog without rewriting it and migrates only on a directory change", async () => {
  const { data, store, importPdf } = await fixture(); const original = await importPdf("a.pdf");
  const filename = path.join(data, "Library/documents.json"), value = JSON.parse(await fs.readFile(filename, "utf8")), document = value.documents[0]; delete document.folderId; delete document.version; delete document.versions;
  const legacy = JSON.stringify({ version: 1, documents: [document] }); await fs.writeFile(filename, legacy);
  expect((await store.list())[0]).toMatchObject({ id: original.id, version: 1 }); expect(await fs.readFile(filename, "utf8")).toBe(legacy);
  await store.createFolder("Research", null); expect(JSON.parse(await fs.readFile(filename, "utf8")).version).toBe(2); expect((await store.read(original.id)).bytes).toEqual(pdfFixture());
});
it("rejects a linked destination without overwriting outside data", async () => {
  const { store, importPdf, library, root } = await fixture(), original = await importPdf("a.pdf"), folder = await store.createFolder("Safe", null);
  const outside = path.join(root, "Outside"); await fs.mkdir(outside); await fs.writeFile(path.join(outside, "protected.txt"), "Protected");
  await fs.rmdir(path.join(library, "Imports/Safe")); await fs.symlink(outside, path.join(library, "Imports/Safe"), process.platform === "win32" ? "junction" : "dir");
  await expect(store.move(original.id, folder.id)).rejects.toThrow("managed location"); expect((await store.read(original.id)).bytes).toEqual(pdfFixture()); expect(await fs.readFile(path.join(outside, "protected.txt"), "utf8")).toBe("Protected");
  await fs.unlink(path.join(library, "Imports/Safe"));
});

it("serializes tutorial asset synchronization with version writes and supports nested conflict callbacks", async () => {
  const { data, assets, library } = await fixture();
  const notes = new NotesStore(data, path.resolve("resources/starter-content"), path.join(library, "assets"));
  const asset = await assets.importBytes("Personal.txt", Buffer.from("Initial"), false);
  const starter = await notes.loadWorkspace(); await notes.saveWorkspace(starter.workspace);
  const official = (await assets.list()).filter(value => value.id !== asset.id).map(value => value.id);
  for (let round = 1; round <= 3; round++) {
    await Promise.all([assets.updateVersion(asset.id, Buffer.from(`Revision ${round}`)), notes.loadWorkspace()]);
  }
  const replaced = await assets.importBytes("Personal.txt", Buffer.from("Nested replacement"), false, async () => { await notes.loadWorkspace(); return "replace"; });
  expect(replaced.id).toBe(asset.id); expect(await assets.versions(asset.id)).toHaveLength(5);
  expect((await assets.read(asset.id)).bytes.toString()).toBe("Nested replacement");
  expect((await assets.list()).filter(value => value.id !== asset.id).map(value => value.id)).toEqual(official);
});
