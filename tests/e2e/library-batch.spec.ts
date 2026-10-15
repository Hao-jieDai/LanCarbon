import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { ExternalEdits } from "../../electron/external-edits";
import { createNote } from "../../src/shared/notes";
import { createBook } from "../../src/shared/books";
import { assetMarkdown } from "../../src/shared/assets";
import { pdfFixture } from "../fixtures/library";
const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root } });
async function cleanup(root: string) { const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-batch-ui-")) throw Error("Unsafe cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-batch-ui-")), data = path.join(root, "Data"), library = path.join(root, "Library"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(library, "assets")), store = new LibraryStore(data, library, assets), folder = await store.createFolder("Target", null);
  const importPdf = async (name: string, text: string, folderId: string | null = null) => { const source = path.join(root, name); await fs.mkdir(path.dirname(source), { recursive: true }); await fs.writeFile(source, pdfFixture(text)); const result = await store.importFiles([source], folderId); if (!result.items[0]) throw Error("Fixture import failed"); return result.items[0].entry; };
  const a = await importPdf("a/batch-report.pdf", "Evidence A"), b = await importPdf("b/batch-report.pdf", "Evidence B", folder.id), c = await importPdf("batch-third.pdf", "Evidence C");
  const linked = await assets.importFile(await store.filePath(a.id), false), text = await assets.importBytes("batch-notes.txt", Buffer.from("Delete this attachment"), false), keep = await assets.importBytes("Keep.txt", Buffer.from("Keep this attachment"), false);
  await store.updateVersion(a.id, pdfFixture("Evidence A revision"));
  const note = createNote({ id: "batch-personal", title: "Personal batch writing", content: `Keep my writing.\n${assetMarkdown(linked)}\n${assetMarkdown(text)}\n${assetMarkdown(keep)}` }), { book, homeNote } = createBook("Batch Book"); homeNote.content = `Book writing.\n${assetMarkdown(linked)}`;
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote], books: [book] }));
  return { root, data, library, store, a, b, c, linked, text, keep, folder, note, homeNote };
}
async function destination(app: ElectronApplication, file: string, canceled = false) { await app.evaluate(({ dialog }, options) => { dialog.showOpenDialog = (async () => ({ canceled: options.canceled, filePaths: [options.file] })) as typeof dialog.showOpenDialog; }, { file, canceled }); }

test("selection, batch export and move retain identities, versions and references", async ({}, info) => {
  const f = await setup(); let app = await launch(f.root);
  try {
    let page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(f.note.title); await page.getByRole("button", { name: "Library", exact: true }).click();
    const row = (id: string) => page.locator(`[data-resource-id="${id}"]`);
    await row(f.a.id).getByRole("checkbox").check(); await expect(page.getByRole("group", { name: "Library selection" })).toContainText("1 selected");
    await page.getByLabel("Find Library resource").fill("batch-"); await expect(page.getByRole("group", { name: "Library selection" })).toContainText("0 selected");
    await page.getByRole("checkbox", { name: "Select all visible Library files", exact: true }).check(); await expect(page.getByRole("group", { name: "Library selection" })).toContainText("4 selected"); await expect(page.getByRole("button", { name: "Move selected", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Clear selection", exact: true }).click(); await row(f.a.id).getByRole("checkbox").check(); await row(f.c.id).getByRole("checkbox").check();
    for (const theme of ["Light", "Dark"]) { await page.locator(".theme-option").filter({ hasText: theme }).click(); await page.screenshot({ path: info.outputPath(`library-batch-${theme.toLowerCase()}.png`) }); }
    const exported = path.join(f.root, "Batch export"); await fs.mkdir(exported); await fs.writeFile(path.join(exported, "batch-report.pdf"), "Existing file");
    await destination(app, exported, true); await page.getByRole("button", { name: "Export selected", exact: true }).click(); expect(await fs.readdir(exported)).toEqual(["batch-report.pdf"]);
    await destination(app, exported); await page.getByRole("button", { name: "Export selected", exact: true }).click(); await expect(page.locator(".library-import-notice")).toContainText("2 exported");
    expect(await fs.readFile(path.join(exported, "batch-report.pdf"), "utf8")).toBe("Existing file"); expect(await fs.readFile(path.join(exported, "batch-report (2).pdf"))).toEqual(pdfFixture("Evidence A revision")); expect(await fs.readFile(path.join(exported, "batch-third.pdf"))).toEqual(pdfFixture("Evidence C"));
    await page.getByRole("button", { name: "Move selected", exact: true }).click(); const modal = page.getByRole("dialog", { name: "Move selected Library files" }); await modal.getByRole("combobox", { name: "Batch move destination", exact: true }).click(); await page.getByRole("option", { name: "Imports/Target", exact: true }).click(); await expect(modal.getByRole("checkbox", { name: "Keep both when names match" })).toBeChecked(); await modal.getByRole("button", { name: "Move selected files", exact: true }).click(); await expect(modal).toHaveCount(0); await expect(page.locator(".library-import-notice")).toContainText("2 moved");
    const catalog = JSON.parse(await fs.readFile(path.join(f.data, "Library/documents.json"), "utf8")); expect(catalog.documents.find((item: any) => item.id === f.a.id)).toMatchObject({ title: "batch-report (2).pdf", folderId: f.folder.id, version: 2 });
    expect(catalog.documents.find((item: any) => item.id === f.b.id)).toMatchObject({ title: "batch-report.pdf", version: 1 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("library-batch-small.png") });
    await app.close(); app = await launch(f.root); page = await app.firstWindow(); await expect(page.getByRole("button", { name: "Library", exact: true })).toHaveAttribute("aria-pressed", "true"); const saved = JSON.parse(await fs.readFile(path.join(f.data, "notes.json"), "utf8")); expect(saved.notes.find((item: any) => item.id === f.note.id).content).toContain(f.linked.id); expect(saved.notes.find((item: any) => item.id === f.homeNote.id).content).toContain(f.linked.id);
    const files = await page.evaluate(() => window.notesDesktop.library!.list()); expect(files.ok && files.entries.find(item => item.id === f.a.id)?.name).toBe("batch-report (2).pdf");
  } finally { await app.close().catch(() => undefined); await cleanup(f.root); }
});

test("confirmed deletion cleans writing, tabs, missing entries and external sessions without resurrection", async ({}, info) => {
  const f = await setup(), edits = new ExternalEdits(f.data, f.library, f.store), working = await edits.prepare(f.a.id); let app = await launch(f.root);
  try {
    let page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(f.note.title); await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.locator(`[data-resource-id="${f.a.id}"]`).getByRole("button", { name: "Open batch-report.pdf", exact: true }).click(); await expect(page.getByLabel("PDF page number")).toBeEnabled(); await page.getByRole("tab", { name: "Workspace", exact: true }).click();
    await page.locator(`[data-resource-id="${f.a.id}"]`).getByRole("checkbox").check(); await page.getByRole("checkbox", { name: "Select batch-notes.txt", exact: true }).check();
    await app.evaluate(({ dialog }) => { (globalThis as any).deleteChoice = 1; dialog.showMessageBox = (async (_window, options) => { (globalThis as any).deleteDetail = options.detail; return { response: (globalThis as any).deleteChoice, checkboxChecked: false }; }) as typeof dialog.showMessageBox; });
    await page.getByRole("button", { name: "Delete selected", exact: true }).click(); await expect.poll(() => app.evaluate(() => (globalThis as any).deleteDetail)).toContain("Personal batch writing"); const detail = await app.evaluate(() => (globalThis as any).deleteDetail); expect(detail).toContain("Batch Book"); expect(detail).toContain("All 3 stored versions"); await expect(page.getByRole("group", { name: "Library selection" })).toContainText("2 selected");
    await app.evaluate(() => { (globalThis as any).deleteChoice = 0; }); await page.getByRole("button", { name: "Delete selected", exact: true }).click(); await expect(page.locator(".library-import-notice")).toContainText("2 deleted"); await expect(page.locator(`[data-resource-id="${f.a.id}"]`)).toHaveCount(0); await expect(page.getByRole("tab", { name: "batch-report.pdf", exact: true })).toHaveCount(0);
    let saved = JSON.parse(await fs.readFile(path.join(f.data, "notes.json"), "utf8")); const writing = saved.notes.find((item: any) => item.id === f.note.id).content; expect(writing).toContain("Keep my writing."); expect(writing).toContain(f.keep.id); expect(writing).not.toContain(f.linked.id); expect(writing).not.toContain(f.text.id); expect(saved.notes.find((item: any) => item.id === f.homeNote.id).content).toBe("Book writing.\n");
    await fs.writeFile(working, pdfFixture("Late save")); await page.getByRole("button", { name: "Refresh Library", exact: true }).click(); await expect(page.locator(".library-import-failures")).toHaveCount(0);
    const catalog = JSON.parse(await fs.readFile(path.join(f.data, "Library/documents.json"), "utf8")), b = catalog.documents.find((item: any) => item.id === f.b.id); await fs.unlink(path.join(f.library, b.relativePath)); await page.getByRole("button", { name: "Refresh Library", exact: true }).click(); await expect(page.locator(`[data-resource-id="${f.b.id}"]`)).toContainText("Missing"); await page.locator(`[data-resource-id="${f.b.id}"]`).getByRole("button", { name: "Delete batch-report.pdf", exact: true }).click(); await expect(page.locator(`[data-resource-id="${f.b.id}"]`)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("library-after-delete.png") }); await app.close(); app = await launch(f.root); page = await app.firstWindow(); await expect(page.getByRole("button", { name: "Library", exact: true })).toHaveAttribute("aria-pressed", "true"); const entries = await page.evaluate(() => window.notesDesktop.library!.list()); expect(entries.ok && entries.entries.some(entry => [f.a.id, f.b.id, f.text.id].includes(entry.id))).toBe(false);
    saved = JSON.parse(await fs.readFile(path.join(f.data, "notes.json"), "utf8")); expect(saved.notes.find((item: any) => item.id === f.note.id).content).not.toContain(f.linked.id); expect(await fs.readFile(path.join(f.library, "assets", f.keep.id), "utf8")).toBe("Keep this attachment");
  } finally { await app.close().catch(() => undefined); await cleanup(f.root); }
});
