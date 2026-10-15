import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AssetStore } from "../../electron/assets";
import { createNote } from "../../src/shared/notes";
import { pdfFixture, epubFixture } from "../fixtures/library";

test("Library imports originals, reuses attachments, handles drops and preserves writing across restart", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-imports-"));
  const data = path.join(root, "Data"), sources = path.join(root, "Sources"); await fs.mkdir(data); await fs.mkdir(sources);
  const store = new AssetStore(data, path.join(root, "Library/assets"));
  const attachment = await store.importBytes("Existing.pdf", pdfFixture("Already attached"), false);
  let originalCatalog: Buffer;
  const note = createNote({ id: "import-writing", title: "Writing remains available", content: `[Existing](assets/${attachment.id})\n\nMy personal writing.` });
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note], books: [] }));
  const pdf = path.join(sources, "Research.pdf"), epub = path.join(sources, "Reading.epub"), fake = path.join(sources, "Fake.pdf"), duplicate = path.join(sources, "Renamed original.pdf"), attached = path.join(sources, "Attachment copy.pdf"), dropped = path.join(sources, "Dropped.pdf");
  await fs.writeFile(pdf, pdfFixture()); await fs.writeFile(epub, epubFixture()); await fs.writeFile(fake, "not a PDF"); await fs.writeFile(duplicate, pdfFixture()); await fs.writeFile(attached, pdfFixture("Already attached")); await fs.writeFile(dropped, pdfFixture("Drag and drop"));
  const launch = () => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(note.title); originalCatalog = await fs.readFile(path.join(data, "assets.json"));
    const choose = async (files: string[]) => app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog; }, files);
    await app.evaluate(({ shell }) => {
      shell.openPath = async filename => { (globalThis as any).lastOpened = filename; return ""; };
      shell.showItemInFolder = filename => { (globalThis as any).lastRevealed = filename; };
    });
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const collections = page.getByRole("navigation", { name: "Library collections" });
    await collections.getByRole("button", { name: "Imports", exact: true }).click();
    await expect(page.getByRole("region", { name: "Library files" })).toContainText("Import PDF or EPUB");
    await choose([pdf, epub, fake]); await page.getByRole("button", { name: "Import PDF / EPUB", exact: true }).click();
    await expect(page.getByText("2 imported.", { exact: true })).toBeVisible(); await expect(page.getByRole("alert")).toContainText("Fake.pdf"); await expect(page.locator(".library-resource")).toHaveCount(2);
    await page.getByRole("combobox", { name: "Library file type", exact: true }).click(); await page.getByRole("option", { name: "EPUB", exact: true }).click(); await expect(page.locator(".library-resource")).toHaveCount(1);
    await page.getByRole("combobox", { name: "Library file type", exact: true }).click(); await page.getByRole("option", { name: "All types", exact: true }).click();
    await page.getByRole("button", { name: "Rename Reading.epub", exact: true }).click(); await page.getByLabel("Resource name").fill("Research reading.epub"); await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(page.getByRole("button", { name: "Research reading.epub", exact: true })).toBeVisible();
    await fs.unlink(pdf); await fs.unlink(epub);
    await page.getByRole("button", { name: "Research.pdf", exact: true }).click();
    const catalog = JSON.parse(await fs.readFile(path.join(data, "Library/documents.json"), "utf8")); const record = catalog.documents.find((value: any) => value.title === "Research.pdf");
    const managed = await fs.realpath(path.join(root, "Library", record.relativePath));
    await page.getByRole("button", { name: "Open Research.pdf", exact: true }).click(); await expect.poll(() => app.evaluate(() => (globalThis as any).lastOpened)).toBe(managed);
    await page.getByRole("button", { name: "Open folder for Research.pdf", exact: true }).click(); await expect.poll(() => app.evaluate(() => (globalThis as any).lastRevealed)).toBe(managed);
    await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as typeof dialog.showSaveDialog; }, managed);
    await page.getByRole("button", { name: "Save a copy", exact: true }).click(); await expect(page.locator(".foundation-error")).toContainText("outside the managed Library"); expect(await fs.readFile(managed)).toEqual(pdfFixture());
    const savedCopy = path.join(root, "Saved.pdf"); await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as typeof dialog.showSaveDialog; }, savedCopy);
    await page.getByRole("button", { name: "Save a copy", exact: true }).click(); await expect.poll(() => fs.readFile(savedCopy).then(bytes => bytes.equals(pdfFixture())).catch(() => false)).toBe(true);
    await choose([duplicate]); await page.getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await expect(page.getByText("1 already in Library.", { exact: true })).toBeVisible(); expect((await fs.readdir(path.join(root, "Library/Imports"))).length).toBe(2);
    await choose([attached]); await page.getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await expect(collections.getByRole("button", { name: "Source materials", exact: true })).toHaveAttribute("aria-current", "page"); await expect(page.getByRole("heading", { name: "Existing.pdf", exact: true })).toBeVisible();
    await page.getByRole("region", { name: "Selected resource" }).getByRole("button", { name: /Notes \/ Writing remains available/ }).click(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.evaluate(() => { const input = document.createElement("input"); input.type = "file"; input.id = "drop-fixture"; document.body.append(input); });
    await page.locator("#drop-fixture").setInputFiles(dropped);
    await page.evaluate(() => { const input = document.querySelector<HTMLInputElement>("#drop-fixture")!; const transfer = new DataTransfer(); transfer.items.add(input.files![0]); document.querySelector(".library-workspace")!.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer })); input.remove(); });
    await expect(page.getByRole("button", { name: "Dropped.pdf", exact: true })).toBeVisible(); await expect(page.getByText("1 imported.", { exact: true })).toBeVisible();
    for (const theme of ["Light", "Dark"]) { await page.locator(".theme-option").filter({ hasText: theme }).click(); await page.screenshot({ path: info.outputPath(`library-imports-${theme.toLowerCase()}.png`) }); }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await expect(page.getByRole("button", { name: "Dropped.pdf", exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath("library-imports-small.png") });
    await app.close(); app = await launch(); page = await app.firstWindow(); await expect(page.getByRole("heading", { name: "Dropped.pdf", exact: true })).toBeVisible(); await expect(page.getByRole("navigation", { name: "Library collections" }).getByRole("button", { name: "Imports", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    const saved = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8")); expect(saved.notes.find((value: any) => value.id === note.id)).toEqual(note);
    expect(await fs.readFile(path.join(data, "assets.json"))).toEqual(originalCatalog); expect(await fs.readFile(path.join(root, "Library/assets", attachment.file!))).toEqual(pdfFixture("Already attached"));
  } finally { await app.close().catch(() => undefined); const target = path.resolve(root); if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("lancarbon-imports-")) await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
