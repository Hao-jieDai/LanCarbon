// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { LibraryStore } from "../electron/library";
import { AssetStore } from "../electron/assets";
import { DataLocationManager } from "../electron/data-location";
import { epubFixture, pdfFixture } from "./fixtures/library";
const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-originals-")); roots.push(root);
  const data = path.join(root, "Data"), library = path.join(root, "Library");
  await fs.mkdir(data); await fs.mkdir(path.join(library, "Imports"), { recursive: true }); const assets = new AssetStore(data, path.join(library, "assets"));
  const store = new LibraryStore(data, library, assets);
  const source = async (name: string, bytes = pdfFixture()) => { const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes); return file; };
  return { root, data, library, assets, store, source };
}
afterEach(async () => { for (const root of roots.splice(0)) if (path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith("lancarbon-originals-")) await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); });
it("copies originals, preserving bytes across source removal, restart and rename", async () => {
  const { data, library, assets, store, source } = await fixture();
  const pdf = await source("Report.PDF"), epub = await source("Reading.epub", epubFixture());
  const batch = await store.importFiles([pdf, epub]); expect(batch.failures).toEqual([]); expect(batch.items.map(item => item.status)).toEqual(["imported", "imported"]);
  await fs.unlink(pdf); await fs.unlink(epub);
  const restarted = new LibraryStore(data, library, assets), id = batch.items[0].entry.id;
  expect((await restarted.read(id)).bytes).toEqual(pdfFixture()); expect((await restarted.read(batch.items[1].entry.id)).bytes).toEqual(epubFixture());
  const file = await restarted.filePath(id); const renamed = await restarted.rename(id, "My research.pdf");
  expect(renamed.name).toBe("My research.pdf"); expect(renamed.id).toBe(id); expect(await restarted.filePath(id)).toBe(file);
  expect((await new LibraryStore(data, library, assets).list()).map(item => item.name)).toEqual(["My research.pdf", "Reading.epub"]);
  expect(await fs.stat(path.join(data, "assets.json")).catch(() => null)).toBeNull();
});
it("reuses identical imports and writing attachments without changing their catalog or links", async () => {
  const { data, library, assets, store, source } = await fixture();
  const asset = await assets.importBytes("Already attached.pdf", pdfFixture(), false), catalog = await fs.readFile(path.join(data, "assets.json"));
  const result = await store.importFiles([await source("Same renamed.pdf")]);
  expect(result.items[0]).toMatchObject({ status: "existing", entry: { id: asset.id, source: "existing-resource" } });
  expect(await fs.readdir(path.join(library, "Imports"))).toEqual([]); expect(await fs.readFile(path.join(data, "assets.json"))).toEqual(catalog);
  const first = (await store.importFiles([await source("New.pdf", pdfFixture("Another"))])).items[0];
  expect((await store.importFiles([await source("Other name.pdf", pdfFixture("Another"))])).items[0]).toMatchObject({ status: "existing", entry: { id: first.entry.id, name: "New.pdf" } });
  expect(await fs.readdir(path.join(library, "Imports"))).toHaveLength(1);
});
it("numbers equal names with different contents and rejects unsafe rename operations", async () => {
  const { store, source } = await fixture();
  const batch = await store.importFiles([await source("one/report.pdf", pdfFixture("one")), await source("two/report.pdf", pdfFixture("two"))]);
  expect(batch.items.map(item => item.entry.name)).toEqual(["report.pdf", "report (2).pdf"]);
  expect((await store.read(batch.items[0].entry.id)).bytes).toEqual(pdfFixture("one"));
  for (const invalid of ["../bad.pdf", "CON.pdf", "a.txt", "report (2).pdf", ""]) await expect(store.rename(batch.items[0].entry.id, invalid)).rejects.toThrow();
});
it("repairs missing or damaged imports with the same ID and title", async () => {
  const { store, source } = await fixture(), file = await source("Report.pdf");
  const first = (await store.importFiles([file])).items[0].entry;
  await store.rename(first.id, "Renamed.pdf"); const managed = await store.filePath(first.id); await fs.unlink(managed);
  expect((await store.list())[0].missing).toBe(true);
  expect((await store.importFiles([file])).items[0]).toMatchObject({ status: "repaired", entry: { id: first.id, name: "Renamed.pdf", missing: false } });
  await fs.writeFile(managed, Buffer.alloc(pdfFixture().length, 97)); await expect(store.read(first.id)).rejects.toThrow("changed");
  expect((await store.importFiles([file])).items[0].status).toBe("repaired"); expect((await store.read(first.id)).bytes).toEqual(pdfFixture());
});
it("reports failures per file while retaining successful imports and rejecting oversized batches", async () => {
  const { store, source, library } = await fixture();
  const oversized = await source("Oversized.pdf"); await fs.truncate(oversized, 100 * 1024 * 1024 + 1);
  const result = await store.importFiles([await source("Good.pdf"), await source("Fake.pdf", Buffer.from("text")), await source("Wrong.epub", Buffer.from("PK fake")), await source("Wrong.txt"), oversized]);
  expect(result.items).toHaveLength(1); expect(result.failures).toHaveLength(4); expect(await fs.readdir(path.join(library, "Imports"))).toHaveLength(1);
  await expect(store.importFiles(Array(21).fill(oversized))).rejects.toThrow("20"); await expect(store.importFiles(["relative.pdf"])).rejects.toThrow("local");
});
it("serializes concurrent imports without losing catalog entries", async () => {
  const { store, source } = await fixture();
  await Promise.all(Array.from({ length: 6 }, async (_, index) => store.importFiles([await source(`${index}.pdf`, pdfFixture(String(index)))])));
  expect(await store.list()).toHaveLength(6);
});
it("moves management data with Data and retains originals in Library", async () => {
  const { root, data, library, store, source } = await fixture();
  const id = (await store.importFiles([await source("Report.pdf")])).items[0].entry.id;
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [], books: [] }));
  const target = path.join(root, "MovedData"); await new DataLocationManager(path.join(root, "Config"), data, data).prepareTarget(data, target);
  const moved = new LibraryStore(target, library, new AssetStore(target, path.join(library, "assets")));
  expect((await moved.read(id)).bytes).toEqual(pdfFixture()); expect(await moved.filePath(id)).toBe(await store.filePath(id));
});
it("refuses damaged catalog paths and linked directories while preserving external files", async () => {
  const { root, data, library, store, source } = await fixture();
  const id = (await store.importFiles([await source("Report.pdf")])).items[0].entry.id;
  const file = path.join(data, "Library/documents.json"), bytes = await fs.readFile(file), catalog = JSON.parse(bytes.toString());
  catalog.documents[0].relativePath = "../outside.pdf"; await fs.writeFile(file, JSON.stringify(catalog));
  await expect(store.list()).rejects.toThrow("Invalid Library catalog"); await expect(store.read(id)).rejects.toThrow("Invalid Library catalog");
  await fs.writeFile(file, bytes);
  const outside = await source("outside.pdf", pdfFixture("Protected"));
  await fs.rename(path.join(library, "Imports"), path.join(library, "PreservedImports")); await fs.symlink(root, path.join(library, "Imports"), process.platform === "win32" ? "junction" : "dir");
  await expect(store.filePath(id)).rejects.toThrow("managed location"); expect(await fs.readFile(outside)).toEqual(pdfFixture("Protected"));
  await fs.unlink(path.join(library, "Imports"));
});
