import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBook } from "../../src/shared/books";
import { createNote } from "../../src/shared/notes";
import type { WorkspaceFile } from "../../src/shared/types";

test("upgrades the system tutorial while preserving user Notes and Books", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-tutorial-upgrade-"));
  const bundled = JSON.parse(await fs.readFile(path.resolve("resources/starter-content/notes.json"), "utf8")) as WorkspaceFile;
  const official = bundled.books.find(book => book.id === "lancarbon-from-zero-to-one")!;
  const officialNoteIds = new Set(Object.values(official.pages).map(page => page.noteId));
  const oldNotes = bundled.notes.filter(note => officialNoteIds.has(note.id)).map(note => note.id === "tutorial-note-home" ? { ...note, content: "User edited obsolete tutorial" } : note);
  const oldBook = structuredClone(official); oldBook.settings.title = "Old tutorial title"; oldBook.rootPageIds = [oldBook.homePageId];
  const userBook = createBook("Personal Book"); const userNote = createNote({ id: "personal-note", title: "Personal Note", content: "Never replace my content" });
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 2, notes: [userNote, userBook.homeNote, ...oldNotes], books: [userBook.book, oldBook] }), "utf8");
  const application = await electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: [
      "--in-process-gpu",
      "--disable-gpu",
      "--no-sandbox",
      ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")]),
    ],
    env: { ...process.env, E2E_USER_DATA_DIR: directory },
  });
  try {
    const page = await application.firstWindow();
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    await page.getByLabel("Select Book").selectOption("lancarbon-from-zero-to-one");
    await expect(page.getByLabel("Note title")).toHaveValue("LanCarbon: From 0 to 1");
    await expect(page.getByLabel("Note content")).toContainText("System-managed tutorial — do not edit");
    await expect(page.getByLabel("Note content")).toContainText("系统管理教程——请勿编辑");
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: /Personal Note/ }).click();
    await expect(page.getByLabel("Note content")).toContainText("Never replace my content");
  } finally { await application.close(); }
  try {
    const saved = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8")) as WorkspaceFile;
    expect(saved.books.find(book => book.id === "lancarbon-from-zero-to-one")?.settings.title).toBe("LanCarbon: From 0 to 1");
    expect(saved.books.find(book => book.id === userBook.book.id)?.settings.title).toBe("Personal Book");
    expect(saved.notes.find(note => note.id === userNote.id)?.content).toBe("Never replace my content");
    expect(saved.notes.find(note => note.id === "tutorial-note-home")?.content).not.toContain("User edited obsolete tutorial");
  } finally { await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
