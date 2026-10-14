import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AssetStore } from "../../electron/assets";
import { NotesStore } from "../../electron/storage";
import { createBook } from "../../src/shared/books";
import { createNote } from "../../src/shared/notes";
import { parseBibTeX } from "../../src/shared/bibliography";

test("Library migrates resources, pins references, renames safely and navigates to writing and settings", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-library-"));
  const data = path.join(root, "Data");
  await fs.mkdir(data);
  const legacy = new AssetStore(data);
  const bytes = Buffer.from("%PDF-1.7\nOriginal PDF fixture\n");
  const paper = await legacy.importBytes("Original.pdf", bytes, false);
  const image = await legacy.importBytes("Logo.png", await fs.readFile(path.resolve("build/icon.png")), true);
  const bibText = '@article{librarypaper, title={Original paper}, author={Author, A}, year={2025}}';
  const bib = await legacy.importBytes("References.bib", Buffer.from(bibText), false);
  for (let index = 0; index < 75; index++) await legacy.importBytes(`Material ${String(index).padStart(2, "0")}.txt`, Buffer.from(`Material ${index}`), false);
  const note = createNote({ id: "library-writing", title: "Personal writing", content: Array.from({ length: 90 }, (_, index) => `Writing line ${index + 1}`).join("\n") + `\n[Original label](assets/${paper.id})` });
  const { book, homeNote } = createBook("Library Book");
  homeNote.content = Array.from({ length: 70 }, (_, index) => `Book line ${index + 1}`).join("\n") + `\n[Book label](assets/${paper.id})`;
  book.settings.logo = `assets/${image.id}`;
  book.settings.bibliography = [{ assetId: bib.id, name: bib.name, entries: parseBibTeX(bibText) }];
  await new NotesStore(data).saveWorkspace({ version: 2, notes: [note, homeNote], books: [book] });
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])],
    env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    expect(await fs.stat(path.join(data, "assets")).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(root, "Library", "assets", paper.file!))).toEqual(bytes);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Original.pdf", exact: true }).click();
    const details = page.getByRole("region", { name: "Selected resource" });
    const before = (await details.boundingBox())!;
    const list = page.getByRole("region", { name: "Library files" });
    expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect((await details.boundingBox())!.y).toBe(before.y);
    expect(await page.locator(".library-resource").first().evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(48);
    expect(await page.locator(".library-content .foundation-description").evaluate(element => getComputedStyle(element).maxWidth)).toBe("none");
    await page.getByLabel("Find Library resource").fill("Original.pdf");
    await app.evaluate(({ shell }) => { shell.showItemInFolder = (filename => { (globalThis as unknown as { revealed: string }).revealed = filename; }) as typeof shell.showItemInFolder; });
    await page.getByRole("button", { name: "Open folder for Original.pdf", exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { revealed: string }).revealed)).toBe(await fs.realpath(path.join(root, "Library", "assets", paper.file!)));
    await page.getByRole("button", { name: "Rename Original.pdf", exact: true }).click();
    await page.getByLabel("Resource name").fill("Renamed.pdf");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(details.getByRole("heading", { name: "Renamed.pdf", exact: true })).toBeVisible();
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = (async (_window, options) => { (globalThis as unknown as { copyDefault?: string }).copyDefault = options.defaultPath; return { canceled: false, filePath: filename }; }) as typeof dialog.showSaveDialog; }, path.join(root, "Copy.pdf"));
    await details.getByRole("button", { name: "Save a copy", exact: true }).click();
    await expect.poll(() => fs.readFile(path.join(root, "Copy.pdf")).then(value => value.equals(bytes)).catch(() => false)).toBe(true);
    expect(path.basename((await app.evaluate(() => (globalThis as unknown as { copyDefault: string }).copyDefault)))).toBe("Renamed.pdf");
    await page.getByLabel("Find Library resource").fill("");
    for (const theme of ["Light", "Dark"]) {
      await page.locator(".theme-option").filter({ hasText: theme }).click();
      await page.screenshot({ path: info.outputPath(`library-${theme.toLowerCase()}.png`) });
    }
    await details.getByRole("button", { name: /Notes \/ Personal writing · line 91/ }).click();
    await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await expect(page.locator(".cm-activeLine")).toContainText(paper.id);
    expect(await page.locator(".cm-scroller").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Renamed.pdf", exact: true }).click();
    await details.getByRole("button", { name: /Book: Library Book \/ Library Book · line 71/ }).click();
    await expect(page.getByLabel("Note title")).toHaveValue(homeNote.title);
    await expect(page.locator(".cm-activeLine")).toContainText(paper.id);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Logo.png", exact: true }).click();
    await details.getByRole("button", { name: /Book settings \(logo\)/ }).click();
    await expect(page.getByLabel("Book title", { exact: true })).toHaveValue(book.settings.title);
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "References.bib", exact: true }).click();
    await details.getByRole("button", { name: /Bibliography \(References.bib\)/ }).click();
    await expect(page.getByRole("dialog", { name: "Citations", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close citations", exact: true }).click();
    const imported = await page.evaluate(() => window.notesDesktop.assets!.import("Later.txt", btoa("Later original"), false));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(await fs.readFile(path.join(root, "Library", "assets", imported.asset.file!), "utf8")).toBe("Later original");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700));
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Renamed.pdf", exact: true }).click();
    await page.screenshot({ path: info.outputPath("library-narrow.png") });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "Renamed.pdf", exact: true })).toBeVisible();
    const saved = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8"));
    expect(saved.notes.find((item: { id: string }) => item.id === note.id).content).toBe(note.content);
    expect(saved.notes.find((item: { id: string }) => item.id === homeNote.id).content).toBe(homeNote.content);
    const catalog = JSON.parse(await fs.readFile(path.join(data, "assets.json"), "utf8"));
    expect(catalog.assets.find((item: { id: string }) => item.id === paper.id).name).toBe("Renamed.pdf");
    expect(await fs.stat(path.join(data, "assets")).catch(() => null)).toBeNull();
  } finally { await app.close().catch(() => undefined); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
