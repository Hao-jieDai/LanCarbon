import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { createNote } from "../../src/shared/notes";
import { pdfFixture } from "../fixtures/library";

test("external folder changes and folder actions preserve documents, writing links and versions", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-folder-sync-"));
  const data = path.join(root, "Data"), library = path.join(root, "Library");
  await fs.mkdir(data); await fs.mkdir(path.join(library, "Imports"), { recursive: true });
  const assets = new AssetStore(data, path.join(library, "assets")), store = new LibraryStore(data, library, assets);
  const folder = await store.createFolder("电子书", null), source = path.join(root, "Reading.pdf");
  await fs.writeFile(source, pdfFixture("Original"));
  const imported = (await store.importFiles([source], folder.id)).items[0].entry;
  await store.updateVersion(imported.id, pdfFixture("Latest"));
  const attached = await assets.importFile(await store.filePath(imported.id), false);
  const note = createNote({ id: "folder-writing", title: "Writing with a reference", content: `[Reading](assets/${attached.id})\n\nKeep this writing.` });
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note], books: [] }));
  // Reproduce a pre-sync catalog and the old reader's empty duplicate, without filesystem identity metadata.
  const catalogPath = path.join(data, "Library/documents.json"), catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  delete catalog.folders[0].diskId; await fs.writeFile(catalogPath, JSON.stringify(catalog));
  await fs.rename(path.join(library, "Imports/电子书"), path.join(library, "Imports/eBook"));
  await fs.mkdir(path.join(library, "Imports/电子书"));
  const launch = () => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    let navigation = page.getByRole("navigation", { name: "Library collections" });
    await navigation.getByRole("button", { name: "eBook", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reading.pdf", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reading.pdf", exact: true }).click();
    await expect(page.getByRole("region", { name: "Selected resource" })).toContainText("Writing with a reference");
    const getFolder = () => page.evaluate(async id => { const result = await window.notesDesktop.library!.list(); if (!result.ok) throw Error(result.error); return { folder: result.folders?.find(folder => folder.id === id), entry: result.entries.find(entry => entry.source === "import") }; }, folder.id);
    expect(await getFolder()).toMatchObject({ folder: { name: "eBook" }, entry: { id: imported.id, folderId: folder.id, version: 2, missing: false } });
    await navigation.getByRole("button", { name: "电子书", exact: true }).click();
    await page.getByRole("button", { name: "Delete folder", exact: true }).click();
    const remove = page.getByRole("dialog", { name: "Delete Library folder" });
    await expect(remove).toContainText("No files will be deleted");
    await remove.getByRole("button", { name: "Delete folder", exact: true }).click();
    await expect(navigation.getByRole("button", { name: "电子书", exact: true })).toHaveCount(0);
    await navigation.getByRole("button", { name: "eBook", exact: true }).click();
    await page.getByRole("button", { name: "Rename folder", exact: true }).click();
    await page.getByLabel("Library folder name", { exact: true }).fill("Books");
    await page.getByRole("button", { name: "Save folder name", exact: true }).click();
    await expect(navigation.getByRole("button", { name: "Books", exact: true })).toHaveAttribute("aria-current", "page");
    // Sync while the app stays open, including an unindexed file that must survive container deletion.
    await fs.rename(path.join(library, "Imports/Books"), path.join(library, "Imports/Research"));
    await fs.writeFile(path.join(library, "Imports/Research/keep.txt"), "Preserve this file");
    await expect(navigation.getByRole("button", { name: "Research", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 10000 });
    expect((await getFolder()).entry).toMatchObject({ id: imported.id, location: "Imports/Research", version: 2 });
    for (const theme of ["Light", "Dark"]) {
      await page.locator(".theme-option").filter({ hasText: theme }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
      const overview = await page.locator(".library-overview").boundingBox(), actions = await page.locator(".library-folder-actions").boundingBox();
      expect(actions!.y).toBeGreaterThanOrEqual(overview!.y + overview!.height);
      await page.screenshot({ path: info.outputPath(`folders-${theme.toLowerCase()}.png`), animations: "disabled" });
    }
    await page.getByRole("button", { name: "Delete folder", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete Library folder" }).getByRole("button", { name: "Delete folder", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Delete Library folder" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reading.pdf", exact: true })).toBeVisible();
    expect(await fs.readFile(path.join(library, "Imports/keep.txt"), "utf8")).toBe("Preserve this file");
    for (const name of ["电子书", "eBook", "Books", "Research"]) expect(await fs.stat(path.join(library, "Imports", name)).catch(() => null)).toBeNull();
    const copies: string[] = [];
    await app.evaluate(({ dialog }, root) => { let index = 0; dialog.showSaveDialog = (async () => ({ canceled: false, filePath: `${root}/saved-${++index}.pdf` })) as typeof dialog.showSaveDialog; }, root);
    for (const version of [1, 2]) { expect((await page.evaluate(async ({ id, version }) => window.notesDesktop.library!.saveCopy(id, version), { id: imported.id, version })).ok).toBe(true); copies.push(await fs.readFile(path.join(root, `saved-${version}.pdf`), "utf8")); }
    expect(copies).toEqual([pdfFixture("Original").toString(), pdfFixture("Latest").toString()]);
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const saved = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8"));
    expect(saved.notes.find((value: any) => value.id === note.id).content).toBe(note.content);
    const result = await page.evaluate(() => window.notesDesktop.library!.list());
    expect(result.ok && result.entries.find(entry => entry.id === imported.id)).toMatchObject({ folderId: null, version: 2, missing: false });
  } finally {
    await app.close().catch(() => undefined);
    const target = path.resolve(root); if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("lancarbon-folder-sync-")) await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
