import { describe, expect, it } from "vitest";
import { addNoteToBook, collectPageIds, createBook, createEmptyWorkspace, isValidExportPath, movePage, normalizeExportPath, removeBookLanguageHeadings, removePageFromBook, validateWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";

describe("Book 与页面树模型", () => {
  it("创建 Book 时生成固定 index.md 首页", () => {
    const { book, homeNote } = createBook("能源研究");
    expect(book.settings.title).toBe("能源研究");
    expect(book.pages[book.homePageId]).toMatchObject({ noteId: homeNote.id, exportPath: "index.md", sourceType: "markdown" });
    expect(book.rootPageIds).toEqual([book.homePageId]);
  });

  it("为中文、保留名和重复标题生成安全稳定路径", () => {
    expect(normalizeExportPath("气候 经济学", "abcdefghi")).toBe("气候-经济学.md");
    expect(normalizeExportPath("CON", "abcdefghi")).toBe("page-abcdefgh.md");
    expect(isValidExportPath("chapter/index.md")).toBe(true);
    expect(isValidExportPath("../secret.md")).toBe(false);
    const { book, homeNote } = createBook(); const first = createNote({ title: "同名" }); const second = createNote({ title: "同名" });
    const withFirst = addNoteToBook(book, first); const withSecond = addNoteToBook(withFirst, second);
    expect(Object.values(withSecond.pages).map(page => page.exportPath)).toEqual(expect.arrayContaining(["同名.md", "同名-2.md"]));
    expect(homeNote.content).toBe("# Home\n");
  });

  it("支持嵌套、移动和移出子树", () => {
    const { book } = createBook(); const chapterNote = createNote({ title: "章节" }); const childNote = createNote({ title: "页面" });
    const withChapter = addNoteToBook(book, chapterNote, { section: true });
    const chapter = Object.values(withChapter.pages).find(page => page.noteId === chapterNote.id)!;
    const nested = addNoteToBook(withChapter, childNote, { parentPageId: chapter.id });
    const child = Object.values(nested.pages).find(page => page.noteId === childNote.id)!;
    expect(chapter.children).toEqual([]);
    expect(nested.pages[chapter.id].children).toEqual([child.id]);
    const moved = movePage(nested, child.id, chapter.id, "before");
    expect(moved.rootPageIds.indexOf(child.id)).toBeLessThan(moved.rootPageIds.indexOf(chapter.id));
    const removed = removePageFromBook(nested, chapter.id);
    expect(removed.removedNoteIds).toEqual(expect.arrayContaining([chapterNote.id, childNote.id]));
    expect(collectPageIds(removed.book)).toEqual([book.homePageId]);
  });

  it("首页不可移出，并检查跨 Book 重复归属", () => {
    const first = createBook("A"); const second = createBook("B");
    expect(() => removePageFromBook(first.book, first.book.homePageId)).toThrow("home page");
    const duplicate = addNoteToBook(second.book, first.homeNote);
    expect(validateWorkspace({ version: 2, notes: [first.homeNote, second.homeNote], books: [first.book, duplicate] })).toContain(`A note cannot belong to multiple Books: ${first.homeNote.id}`);
  });

  it("只删除 Book 页面中的双语分区标题并保持其他标题与普通笔记", () => {
    const created = createBook("Bilingual Book");
    const bookNote = { ...created.homeNote, content: "##English\n\n# Title\n\nText\n\n## 中文\n\n# 标题\n" };
    const looseNote = createNote({ id: "loose", content: "## English\n\nKeep this loose note." });
    const workspace = { version: 2 as const, notes: [bookNote, looseNote], books: [created.book] };
    const cleaned = removeBookLanguageHeadings(workspace);
    expect(cleaned.changed).toBe(true);
    expect(cleaned.workspace.notes[0].content).toBe("# Title\n\nText\n\n# 标题\n");
    expect(cleaned.workspace.notes[1]).toBe(looseNote);
    expect(removeBookLanguageHeadings(cleaned.workspace)).toEqual({ workspace: cleaned.workspace, changed: false });
  });
});
