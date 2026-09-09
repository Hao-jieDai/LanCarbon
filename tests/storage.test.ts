// @vitest-environment node
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesStore } from "../electron/storage";
import { createBook, createEmptyWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import { MANAGED_TUTORIAL_BOOK_ID } from "../src/shared/managedTutorial";
import type { WorkspaceFile } from "../src/shared/types";

describe("NotesStore 工作区存储", () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-store-")); });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

  it("首次读取返回空 v2 工作区", async () => {
    await expect(new NotesStore(directory).loadWorkspace()).resolves.toEqual({ workspace: { version: 2, notes: [], books: [] }, isFirstRun: true, migrated: false });
  });

  it("全新数据目录导入内置 Book 和受管理资源", async () => {
    const starter = path.join(directory, "starter");
    const data = path.join(directory, "fresh-data");
    const created = createBook("LanCarbon: From 0 to 1");
    await fs.mkdir(path.join(starter, "assets"), { recursive: true });
    await fs.writeFile(path.join(starter, "notes.json"), JSON.stringify({ version: 2, notes: [created.homeNote], books: [created.book] }));
    await fs.writeFile(path.join(starter, "assets.json"), JSON.stringify({ version: 1, assets: [] }));
    const result = await new NotesStore(data, starter).loadWorkspace();
    expect(result).toMatchObject({ isFirstRun: true, migrated: false, workspace: { books: [{ settings: { title: "LanCarbon: From 0 to 1" } }] } });
    expect(JSON.parse(await fs.readFile(path.join(data, "assets.json"), "utf8"))).toEqual({ version: 1, assets: [] });
  });

  it("从旧版本升级时覆盖系统教程并保留用户内容和资源", async () => {
    const starter = path.join(process.cwd(), "resources", "starter-content");
    const bundled = JSON.parse(await fs.readFile(path.join(starter, "notes.json"), "utf8")) as WorkspaceFile;
    const officialBook = bundled.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)!;
    const officialIds = new Set(Object.values(officialBook.pages).map(page => page.noteId));
    const user = createBook("User Book"); const loose = createNote({ id: "user-loose", content: "User text" });
    const editedNotes = bundled.notes.filter(note => officialIds.has(note.id)).map(note => note.id === "tutorial-note-home" ? { ...note, content: "Edited old tutorial" } : note);
    const editedBook = { ...structuredClone(officialBook), settings: { ...officialBook.settings, title: "Edited tutorial" } };
    const workspace: WorkspaceFile = { version: 2, notes: [loose, user.homeNote, ...editedNotes], books: [user.book, editedBook] };
    const data = path.join(directory, "upgrade-data"); await new NotesStore(data).saveWorkspace(workspace);
    const userBytes = Buffer.from("user asset"); const userFile = `${createHash("sha256").update(userBytes).digest("hex")}.txt`;
    await fs.mkdir(path.join(data, "assets"), { recursive: true }); await fs.writeFile(path.join(data, "assets", userFile), userBytes);
    await fs.writeFile(path.join(data, "assets.json"), JSON.stringify({ version: 1, assets: [{ id: userFile, file: userFile, name: "user.txt", size: userBytes.length, mime: "text/plain", createdAt: "2026-09-08T00:00:00.000Z" }] }, null, 2));
    const result = await new NotesStore(data, starter).loadWorkspace();
    expect(result.workspace.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID)).toEqual(officialBook);
    expect(result.workspace.notes.find(note => note.id === "tutorial-note-home")?.content).toContain("System-managed tutorial — do not edit");
    expect(result.workspace.notes.find(note => note.id === loose.id)).toEqual(loose); expect(result.workspace.books.find(book => book.id === user.book.id)).toMatchObject({ id: user.book.id, settings: { title: "User Book" }, homePageId: user.book.homePageId });
    const assets = JSON.parse(await fs.readFile(path.join(data, "assets.json"), "utf8")); expect(assets.assets).toHaveLength(9); expect(assets.assets.some((asset: { id: string }) => asset.id === userFile)).toBe(true);
    const persisted = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8")); expect(persisted.books.find((book: { id: string }) => book.id === MANAGED_TUTORIAL_BOOK_ID).settings.title).toBe("LanCarbon: From 0 to 1");
  });

  it("无损迁移 v1 笔记文件", async () => {
    const note = createNote({ id: "legacy", content: "原始 Markdown" });
    await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 1, notes: [note] }));
    const result = await new NotesStore(directory).loadWorkspace();
    expect(result).toMatchObject({ migrated: true, isFirstRun: false, workspace: { version: 2, books: [], notes: [{ id: "legacy", content: "原始 Markdown" }] } });
  });

  it("原子保存并可重新读取 v2 工作区", async () => {
    const store = new NotesStore(directory); const workspace = createEmptyWorkspace([createNote({ id: "saved", title: "持久化" })]);
    await store.saveWorkspace(workspace);
    await expect(store.loadWorkspace()).resolves.toMatchObject({ migrated: false, workspace: { notes: [{ id: "saved", title: "持久化" }] } });
    expect(JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8")).version).toBe(2);
  });

  it("规范化可恢复的 v2 字段，并仅丢弃结构损坏的 Book", async () => {
    const created = createBook("可恢复 Book");
    const rawBook = structuredClone(created.book) as unknown as Record<string, unknown>;
    (rawBook.settings as Record<string, unknown>).authors = "invalid";
    (rawBook.settings as Record<string, unknown>).publishing = {
      repository: "HaojieDai/guide", repositoryUrl: "https://github.com/HaojieDai/guide",
      pagesUrl: "https://haojiedai.github.io/guide/", branch: "gh-pages", visibility: "PUBLIC",
      initializedAt: "2026-09-06T08:00:00.000Z"
    };
    const home = (rawBook.pages as Record<string, Record<string, unknown>>)[created.book.homePageId];
    delete home.showInToc;
    home.metadata = { shortTitle: 42, keywords: ["valid", 42] };
    await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({
      version: 2,
      notes: [created.homeNote, createNote({ id: "loose", title: 42 as unknown as string })],
      books: [rawBook, { id: "broken", settings: {}, pages: null }]
    }));
    const result = await new NotesStore(directory).loadWorkspace();
    expect(result.workspace.notes.find(note => note.id === "loose")?.title).toBe("Untitled Note");
    expect(result.workspace.books).toHaveLength(1);
    expect(result.workspace.books[0].settings.authors).toEqual([]);
    expect(result.workspace.books[0].settings.publishing).toMatchObject({ repository: "HaojieDai/guide", branch: "gh-pages", visibility: "PUBLIC" });
    expect(result.workspace.books[0].pages[created.book.homePageId]).toMatchObject({ showInToc: true, metadata: { keywords: ["valid"] } });
  });

  it("串行处理并发保存且保留最后一次更改", async () => {
    const store = new NotesStore(directory);
    await Promise.all([store.saveWorkspace(createEmptyWorkspace([createNote({ id: "same", title: "第一次" })])), store.saveWorkspace(createEmptyWorkspace([createNote({ id: "same", title: "第二次" })]))]);
    await expect(store.loadWorkspace()).resolves.toMatchObject({ workspace: { notes: [{ title: "第二次" }] } });
  });

  it("损坏文件回退为空并创建备份", async () => {
    await fs.writeFile(path.join(directory, "notes.json"), "not-json");
    await expect(new NotesStore(directory).loadWorkspace()).resolves.toMatchObject({ workspace: { notes: [], books: [] }, isFirstRun: false });
    expect((await fs.readdir(directory)).some(name => name.startsWith("notes.json.corrupt-"))).toBe(true);
  });

  it("系统教程同步失败时不把用户工作区当作损坏文件移动", async () => {
    const data = path.join(directory, "safe-data"); const starter = path.join(directory, "broken-starter");
    const note = createNote({ id: "safe-note", content: "Must remain" }); await new NotesStore(data).saveWorkspace(createEmptyWorkspace([note]));
    const tutorial = createBook("LanCarbon: From 0 to 1"); tutorial.book.id = MANAGED_TUTORIAL_BOOK_ID;
    await fs.mkdir(starter, { recursive: true }); await fs.writeFile(path.join(starter, "notes.json"), JSON.stringify({ version: 2, notes: [tutorial.homeNote], books: [tutorial.book] }));
    await fs.writeFile(path.join(starter, "assets.json"), "not-json");
    await expect(new NotesStore(data, starter).loadWorkspace()).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8")).notes[0].content).toBe("Must remain");
    expect((await fs.readdir(data)).some(name => name.startsWith("notes.json.corrupt-"))).toBe(false);
  });

  it("拒绝非法数据并传递写入错误", async () => {
    const store = new NotesStore(directory);
    await expect(store.saveWorkspace({ version: 1, notes: [] })).rejects.toThrow("Invalid workspace data version");
    await expect(store.saveWorkspace({ ...createEmptyWorkspace(), notes: [{ ...createNote(), title: 42 }] })).rejects.toThrow("invalid fields");
    await expect(store.saveWorkspace({ ...createEmptyWorkspace(), books: [{ settings: { title: 42 } }] })).rejects.toThrow("Book data");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
    await expect(store.saveWorkspace(createEmptyWorkspace([createNote()]))).rejects.toThrow("disk full");
  });

  it("保存并约束窗口尺寸偏好", async () => {
    const store = new NotesStore(directory); await store.saveWindowPreferences({ width: 500, height: 400, x: 20, y: 30, maximized: true });
    await expect(store.loadWindowPreferences()).resolves.toEqual({ width: 900, height: 600, x: 20, y: 30, maximized: true });
  });
});
