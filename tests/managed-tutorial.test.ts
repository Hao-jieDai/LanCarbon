// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBook, createEmptyWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import { MANAGED_TUTORIAL_BOOK_ID, syncManagedTutorial } from "../src/shared/managedTutorial";
import type { WorkspaceFile } from "../src/shared/types";

const bundled = JSON.parse(readFileSync(path.join(process.cwd(), "resources", "starter-content", "notes.json"), "utf8")) as WorkspaceFile;
const officialBook = bundled.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)!;
const officialNoteIds = new Set(Object.values(officialBook.pages).map(page => page.noteId));

describe("system-managed LanCarbon tutorial", () => {
  it("overwrites edited official content and structure while preserving user Notes and Books", () => {
    const userNote = createNote({ id: "user-note", title: "My research", content: "Never replace this" });
    const user = createBook("My Book");
    const oldBook = structuredClone(officialBook);
    oldBook.settings.title = "Edited system tutorial";
    oldBook.rootPageIds = [oldBook.homePageId];
    const oldNotes = bundled.notes.filter(note => officialNoteIds.has(note.id)).map(note => note.id === "tutorial-note-home" ? { ...note, content: "Personal edit inside system tutorial" } : note);
    const workspace: WorkspaceFile = { version: 2, notes: [userNote, user.homeNote, ...oldNotes], books: [user.book, oldBook] };
    const result = syncManagedTutorial(workspace, bundled);
    expect(result.changed).toBe(true);
    expect(result.workspace.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)).toEqual(officialBook);
    expect(result.workspace.notes.find(note => note.id === "tutorial-note-home")).toEqual(bundled.notes.find(note => note.id === "tutorial-note-home"));
    expect(result.workspace.notes.find(note => note.id === userNote.id)).toEqual(userNote);
    expect(result.workspace.books.find(book => book.id === user.book.id)).toEqual(user.book);
    expect(syncManagedTutorial(result.workspace, bundled)).toEqual({ workspace: result.workspace, changed: false });
  });

  it("restores a deleted system tutorial without changing an ordinary workspace", () => {
    const note = createNote({ id: "ordinary", content: "Keep me" });
    const workspace = createEmptyWorkspace([note]);
    const result = syncManagedTutorial(workspace, bundled);
    expect(result.changed).toBe(true);
    expect(result.workspace.notes.find(item => item.id === note.id)).toEqual(note);
    expect(result.workspace.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)).toEqual(officialBook);
  });

  it("preserves the publishing binding while restoring official tutorial settings and structure", () => {
    const existingBook = structuredClone(officialBook);
    const publishing = {
      repository: "Hao-jieDai/LanCarbon-From-0-to-1",
      repositoryUrl: "https://github.com/Hao-jieDai/LanCarbon-From-0-to-1",
      pagesUrl: "https://hao-jiedai.github.io/LanCarbon-From-0-to-1/",
      branch: "gh-pages",
      visibility: "PUBLIC" as const,
      initializedAt: "2026-09-14T00:00:00.000Z",
      lastPublishedAt: "2026-09-14T01:00:00.000Z",
      lastCommit: "abc123"
    };
    existingBook.settings.title = "Edited system tutorial";
    existingBook.settings.github = "https://github.com/wrong/repository";
    existingBook.settings.publishing = publishing;
    existingBook.rootPageIds = [existingBook.homePageId];
    const workspace: WorkspaceFile = {
      version: 2,
      notes: structuredClone(bundled.notes),
      books: [existingBook]
    };

    const result = syncManagedTutorial(workspace, bundled);
    const synchronized = result.workspace.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)!;
    expect(result.changed).toBe(true);
    expect(synchronized.settings.title).toBe(officialBook.settings.title);
    expect(synchronized.settings.github).toBe(publishing.repositoryUrl);
    expect(synchronized.settings.publishing).toEqual(publishing);
    expect(synchronized.rootPageIds).toEqual(officialBook.rootPageIds);
    expect(synchronized.pages).toEqual(officialBook.pages);
    expect(syncManagedTutorial(result.workspace, bundled)).toEqual({ workspace: result.workspace, changed: false });
  });

  it("starts with the bilingual overwrite warning and contains no LanCarbon release number", () => {
    const home = bundled.notes.find(note => note.id === officialBook.pages[officialBook.homePageId].noteId)!;
    expect(home.content.indexOf("System-managed tutorial — do not edit")).toBeLessThan(100);
    expect(home.content.indexOf("系统管理教程——请勿编辑")).toBeLessThan(500);
    const content = bundled.notes.filter(note => officialNoteIds.has(note.id)).map(note => `${note.title}\n${note.content}`).join("\n");
    expect(content).not.toMatch(/\b1\.1\.1\b/);
    expect(content).not.toMatch(/Version\s+\d+\.\d+\.\d+/i);
  });

  it("links the early required-tools page to the later troubleshooting page", () => {
    const toolsPage = officialBook.pages["tutorial-page-s1-tools"];
    const troubleshootingPage = officialBook.pages["tutorial-page-s4-errors"];
    const toolsNote = bundled.notes.find(note => note.id === toolsPage.noteId)!;
    const link = "../04-publish/troubleshooting.md";
    expect(toolsNote.content).toContain(`[Troubleshooting Common Problems](${link})`);
    expect(toolsNote.content).toContain(`[常见问题处理（Troubleshooting Common Problems）](${link})`);
    expect(toolsNote.content.match(/\[Troubleshooting Common Problems\]\(\.\.\/04-publish\/troubleshooting\.md\)/g)).toHaveLength(1);
    expect(path.posix.normalize(path.posix.join(path.posix.dirname(toolsPage.exportPath), link))).toBe(troubleshootingPage.exportPath);
  });
});
