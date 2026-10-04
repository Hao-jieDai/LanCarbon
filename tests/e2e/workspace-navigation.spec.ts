import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { addNoteToBook, createBook, normalizeBooks } from "../../src/shared/books";
import { createNote } from "../../src/shared/notes";

test("workspace sorting, real Ctrl+Q, folding, navigation and restart persistence", async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-navigation-"));
  const first = createBook("Z navigation Book"); const second = createBook("A navigation Book");
  const section = createNote({ title: "Navigation section" });
  let book = addNoteToBook(first.book, section, { section: true });
  const sectionPage = Object.values(book.pages).find(page => page.noteId === section.id)!;
  const child = createNote({ title: "Navigation child", content: "# Navigation child\n\nSaved child content" });
  book = addNoteToBook(book, child, { parentPageId: sectionPage.id });
  const childPage = Object.values(book.pages).find(page => page.noteId === child.id)!;
  first.homeNote.content = `# Z navigation Book\n\n[Open navigation child](${childPage.exportPath})`;
  const beta = createNote({ id: "navigation-beta", title: "B workspace note", content: "Untouched writing", createdAt: "2026-01-01", updatedAt: "2026-03-01" });
  const alpha = createNote({ id: "navigation-alpha", title: "A workspace note", createdAt: "2026-03-01", updatedAt: "2026-01-01" });
  const initial = { version: 2, notes: [beta, alpha, first.homeNote, second.homeNote, section, child], books: [book, second.book] };
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify(initial));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: directory }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: /^B workspace note/ }).click();
    await page.getByLabel("Note content").click();
    await page.keyboard.press("Control+End"); await page.keyboard.type(" saved across switching");
    // Exercise a native menu conflict, not merely a synthetic DOM key event.
    await app.evaluate(({ Menu }) => Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "File", submenu: [{ role: "quit", accelerator: "Ctrl+Q" }] }
    ])));
    await page.keyboard.press("Control+q");
    await expect(page.getByRole("button", { name: "Books", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(page.getByLabel("Select Book")).toHaveValue(book.id);
    await page.getByLabel("Sort Books").selectOption("title");
    const bookTitles = await page.getByLabel("Select Book").locator("option").allTextContents();
    expect(bookTitles.indexOf("A navigation Book")).toBeLessThan(bookTitles.indexOf("Z navigation Book"));
    await expect(page.getByLabel("Select Book")).toHaveValue(book.id);
    await page.getByRole("button", { name: "Collapse Navigation section", exact: true }).click();
    await expect(page.getByRole("button", { name: "Navigation child", exact: true })).toHaveCount(0);
    await page.getByLabel("Select Book").selectOption(second.book.id);
    await page.getByLabel("Select Book").selectOption(book.id);
    await expect(page.getByRole("button", { name: "Expand Navigation section", exact: true })).toBeVisible();
    await page.keyboard.press("Control+q");
    await expect(page.getByLabel("Note title")).toHaveValue("B workspace note");
    await expect(page.getByLabel("Note content")).toContainText("Untouched writing saved across switching");
    await page.getByLabel("Sort Notes").selectOption("created");
    const noteTitles = await page.locator(".note-card h3").allTextContents();
    expect(noteTitles[0]).toBe("ReadMe");
    expect(noteTitles.indexOf("A workspace note")).toBeLessThan(noteTitles.indexOf("B workspace note"));
    await page.keyboard.press("Control+q");
    await page.getByLabel("New Book").click();
    await page.getByLabel("Book Name").press("Control+q");
    await expect(page.getByRole("button", { name: "Books", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Close New Book" }).click();
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8")).notes.find((note: { id: string }) => note.id === beta.id)?.content).toBe("Untouched writing saved across switching");
    const saved = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    expect(saved.books.find((item: { id: string }) => item.id === book.id)).toEqual(JSON.parse(JSON.stringify(normalizeBooks([book], initial.notes)[0])));
    expect(saved.notes.filter((note: { id: string }) => [beta.id, alpha.id].includes(note.id)).map((note: { id: string }) => note.id)).toEqual([beta.id, alpha.id]);
    await page.screenshot({ path: testInfo.outputPath("books-folded.png") });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByLabel("Sort Notes")).toHaveValue("created");
    await page.keyboard.press("Control+q");
    await expect(page.getByLabel("Sort Books")).toHaveValue("title");
    await expect(page.getByLabel("Select Book")).toHaveValue(book.id);
    await expect(page.getByRole("button", { name: "Expand Navigation section", exact: true })).toBeVisible();
    await page.keyboard.press("Control+e");
    await page.getByRole("link", { name: "Open navigation child", exact: true }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Navigation child");
    await expect(page.getByRole("button", { name: "Collapse Navigation section", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Navigation section", exact: true }).click();
    await page.getByRole("button", { name: "Collapse Navigation section", exact: true }).click();
    await page.getByRole("button", { name: "＋ Child Page", exact: true }).click();
    await expect(page.getByRole("button", { name: "Untitled Page", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse Navigation section", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("books-expanded.png") });
    await page.keyboard.press("Control+q");
    await page.screenshot({ path: testInfo.outputPath("notes-sorted.png") });
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
