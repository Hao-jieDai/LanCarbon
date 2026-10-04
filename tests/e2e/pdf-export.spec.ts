import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AssetStore } from "../../electron/assets";
import { createNote } from "../../src/shared/notes";
import { addNoteToBook, createBook } from "../../src/shared/books";
import { assetMarkdown } from "../../src/shared/assets";

test("Notes and individual Book pages export offline PDFs, save edits and preserve output on failure", async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-pdf-e2e-")), store = new AssetStore(directory);
  const image = await store.importBytes("logo.png", await fs.readFile("build/icon.png"), true);
  const attachment = await store.importBytes("attachment.txt", Buffer.from("Not embedded in PDF"), false);
  const rows = Array.from({ length: 65 }, (_, i) => `| ${i + 1} | 第 ${i + 1} 行：生态系统、科研记录与分析 | ${(i / 7).toFixed(3)} |`).join("\n");
  const note = createNote({ title: "PDF 研究记录 α", content: "# PDF 研究记录 α\n\n中文与 English 离线科研笔记。Greek: α β γ Δ Ω.\n\n## Mathematics / 数学公式\n\nInline $E=mc^2$, $\\alpha+\\beta=\\gamma$.\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n$$\n\n$$\n" + Array.from({ length: 12 }, (_, i) => `\\frac{a_{${i}}+b_{${i}}}{c_{${i}}}`).join(" + ") + "\n$$\n\n## Image / 图片\n\n```{figure} assets/" + image.id + "\n:width: 30%\n:align: center\n\nLanCarbon Logo / 图片说明\n```\n\n## Long table / 长表格\n\n| No. | Research record / 研究记录 | Value |\n| --- | --- | ---: |\n" + rows + "\n\n## Code and links / 代码与链接\n\n```python\n" + "result = '.'.join(records) # long selectable source code ".repeat(5) + "\n```\n\n[External link](https://example.com)\n\n" + assetMarkdown(attachment) });
  const { book: initialBook, homeNote } = createBook("PDF Book"); homeNote.content = "HOME_ONLY_SENTINEL\n\nBook 首页内容。";
  const section = createNote({ title: "PDF Section", content: "SECTION_ONLY_SENTINEL\n\nOnly this Section, not children.\n\n[Other page](#pdf-child-label)" }), child = createNote({ title: "PDF Child", content: "CHILD_ONLY_SENTINEL\n\nChild page 公式 $\\theta=\\pi/2$.\n\n" + assetMarkdown(image) });
  let book = addNoteToBook(initialBook, section, { section: true }); const sectionPage = Object.values(book.pages).find(item => item.noteId === section.id)!;
  book = addNoteToBook(book, child, { parentPageId: sectionPage.id }); Object.values(book.pages).find(item => item.noteId === child.id)!.metadata.label = "pdf-child-label";
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote, section, child], books: [book] }));
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])], env: { ...process.env, E2E_USER_DATA_DIR: directory } });
  try {
    const page = await app.firstWindow();
    const saveTo = async (file: string, canceled = false) => app.evaluate(({ dialog }, args) => {
      dialog.showSaveDialog = (async (_parent: unknown, options: unknown) => { (globalThis as unknown as { pdfSaveOptions: unknown }).pdfSaveOptions = options; return { canceled: args.canceled, filePath: args.file }; }) as typeof dialog.showSaveDialog;
    }, { file, canceled });
    const checkPdf = async (file: string, multiple: boolean) => {
      await expect.poll(async () => (await fs.readFile(file).catch(() => Buffer.alloc(0))).subarray(0, 5).toString()).toBe("%PDF-");
      const bytes = await fs.readFile(file), count = bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(1); if (multiple) expect(count).toBeGreaterThan(2); else expect(count).toBe(1);
      await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    };
    await page.getByRole("button", { name: /^PDF 研究记录 α/ }).click();
    await page.getByLabel("Note content").press("Control+End"); await page.keyboard.press("Enter"); await page.keyboard.type("LATEST_EDIT_SENTINEL");
    const notePdf = info.outputPath("note-research.pdf"); await saveTo(notePdf); await page.getByRole("button", { name: "Export PDF", exact: true }).click(); await checkPdf(notePdf, true);
    await expect(page.locator(".pdf-notice")).toContainText("PDF exported");
    const options = await app.evaluate(() => (globalThis as unknown as { pdfSaveOptions: { defaultPath: string; properties: string[] } }).pdfSaveOptions);
    expect(path.basename(options.defaultPath)).toBe("PDF 研究记录 α.pdf"); expect(options.properties).toContain("showOverwriteConfirmation");
    const original = await fs.readFile(notePdf); await saveTo(notePdf, true); await page.getByRole("button", { name: "Export PDF", exact: true }).click(); await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled(); expect(await fs.readFile(notePdf)).toEqual(original);
    await page.getByRole("button", { name: "Books", exact: true }).click(); await page.getByLabel("Select Book").selectOption(book.id);
    const sourceBefore = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    for (const [title, file] of [["PDF Book", "book-home.pdf"], ["PDF Section", "book-section.pdf"], ["PDF Child", "book-child.pdf"]]) {
      await page.getByRole("button", { name: title, exact: true }).click(); await page.getByRole("button", { name: "Preview", exact: true }).click();
      const output = info.outputPath(file); await saveTo(output); await page.getByRole("button", { name: "Export PDF", exact: true }).click(); await checkPdf(output, false);
    }
    await fs.unlink(path.join(directory, "assets", image.id));
    const childPdf = info.outputPath("book-child.pdf"), previous = await fs.readFile(childPdf); await saveTo(childPdf); await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    await expect(page.locator(".pdf-notice")).toContainText("Missing or damaged resource"); expect(await fs.readFile(childPdf)).toEqual(previous);
    const sourceAfter = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    for (const id of [homeNote.id, section.id, child.id]) expect(sourceAfter.notes.find((item: { id: string }) => item.id === id)).toEqual(sourceBefore.notes.find((item: { id: string }) => item.id === id));
    expect(sourceAfter.books.find((item: { id: string }) => item.id === book.id)).toEqual(sourceBefore.books.find((item: { id: string }) => item.id === book.id));
    expect(sourceAfter.notes.find((item: { id: string }) => item.id === note.id).content).toContain("LATEST_EDIT_SENTINEL");
    expect((await fs.readdir(path.dirname(childPdf))).filter(name => name.endsWith(".tmp"))).toEqual([]);
    await page.screenshot({ path: info.outputPath("pdf-export-ui.png") });
  } finally { await app.close().catch(() => undefined); await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
});
