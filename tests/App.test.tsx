import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { addNoteToBook, createBook, createEmptyWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import type { NotesDesktopApi } from "../src/shared/types";

const savedNote = createNote({ id: "one", title: "第一篇", content: "已有正文", tags: ["测试"] });
let api: NotesDesktopApi;

beforeEach(() => {
  api = {
    loadWorkspace: vi.fn().mockResolvedValue({ ok: true, workspace: createEmptyWorkspace([savedNote]), isFirstRun: false, migrated: false }),
    saveWorkspace: vi.fn().mockResolvedValue({ ok: true }),
    exportBook: vi.fn().mockResolvedValue({ ok: true, destination: "D:\\export" }),
    validateBook: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    inspectBuildEnvironment: vi.fn().mockResolvedValue({ ok: true, checks: [
      { id: "python", label: "Python", status: "pass", detail: "Python 3.13.0" },
      { id: "jupyter-book", label: "Jupyter Book CLI", status: "pass", detail: "Jupyter Book 2.1.6" }
    ] }),
    buildBook: vi.fn().mockResolvedValue({ ok: true, destination: "D:\\build", htmlPath: "D:\\build\\_build\\html", url: "http://127.0.0.1:32100/", issues: [], log: "", durationMs: 1000 }),
    openBuildFolder: vi.fn().mockResolvedValue({ ok: true }),
    openBookWebsite: vi.fn().mockResolvedValue({ ok: true }),
    getBookWebsite: vi.fn().mockResolvedValue({ ok: true, built: false, running: false }),
    startBookWebsite: vi.fn().mockResolvedValue({ ok: true, built: true, running: true, htmlPath: "D:\\build\\_build\\html", url: "http://127.0.0.1:32100/" }),
    stopBookWebsite: vi.fn().mockResolvedValue({ ok: true, built: true, running: false, htmlPath: "D:\\build\\_build\\html" }),
    inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks: [
      { id: "git", label: "Git", status: "pass", detail: "git version test" },
      { id: "gh", label: "GitHub CLI", status: "pass", detail: "gh version test" },
      { id: "auth", label: "GitHub account", status: "pass", detail: "Signed in as test." },
      { id: "github-api", label: "GitHub API", status: "pass", detail: "GitHub account services are reachable." },
      { id: "build", label: "Successful Book build", status: "warning", detail: "Build this Book." },
      { id: "repository", label: "Repository binding", status: "warning", detail: "Not connected." },
      { id: "git-network", label: "Git HTTPS connection", status: "warning", detail: "Connect a repository." },
      { id: "pages", label: "GitHub Pages", status: "warning", detail: "Not configured." }
    ], account: "test" }),
    setupGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, binding: { repository: "test/book", repositoryUrl: "https://github.com/test/book", pagesUrl: "https://test.github.io/book/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z" } }),
    publishGitHubBook: vi.fn().mockResolvedValue({ ok: false, error: "Not configured in this test" }),
    startGitHubSignIn: vi.fn().mockResolvedValue({ ok: true }),
    openGitHubCliDownload: vi.fn().mockResolvedValue({ ok: true }),
    openGitHubUrl: vi.fn().mockResolvedValue({ ok: true }),
    getDataLocation: vi.fn().mockResolvedValue({ ok: true, path: "D:\\LanCarbon\\Data" }),
    changeDataLocation: vi.fn().mockResolvedValue({ ok: true, path: "D:\\LanCarbon\\Other" }),
    openDataLocation: vi.fn().mockResolvedValue({ ok: true })
  };
  window.notesDesktop = api;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("App", () => {
  it("首次运行只显示 ReadMe 并立即保存 v2 工作区", async () => {
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: createEmptyWorkspace(), isFirstRun: true, migrated: false });
    render(<App />);
    expect(await screen.findByDisplayValue("ReadMe")).toBeInTheDocument();
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ version: 2, books: [], notes: [expect.objectContaining({ title: "ReadMe" })] })));
  });

  it("新建、编辑并自动保存普通笔记", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getAllByRole("button", { name: /New Note/ })[0]);
    const title = screen.getByLabelText("Note title"); await user.clear(title); await user.type(title, "桌面灵感");
    const content = screen.getByLabelText("Note content");
    act(() => EditorView.findFromDOM(content)!.dispatch({ changes: { from: 0, insert: "两行\n文字" } }));
    await user.type(screen.getByLabelText("Tags"), "灵感, 工作");
    expect(screen.getByText("4 chars · 2 lines")).toBeInTheDocument(); expect(screen.getByLabelText("Tags")).toHaveValue("灵感, 工作");
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.arrayContaining([expect.objectContaining({ title: "桌面灵感", content: "两行\n文字", tags: ["灵感", "工作"] })]) })), { timeout: 1500 });
  });

  it("在 Edit 与 MyST Preview 间切换并保留同一编辑器", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    const editor = screen.getByLabelText("Note content");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByLabelText("Rendered preview").querySelector("p")).toHaveTextContent("已有正文");
    expect(editor).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Note content")).toBe(editor);
    expect(editor).toBeVisible();
  });

  it("跨笔记、Book、新页面与删除保持用户选择的预览模式", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(screen.getAllByRole("button", { name: /New Note/ })[0]);
    expect(screen.getByLabelText("Rendered preview")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ }));
    await user.click(screen.getByRole("button", { name: "New Book" }));
    await user.type(screen.getByLabelText("Book Name"), "Mode Book");
    await user.click(screen.getByRole("button", { name: "Create Book" }));
    await user.click(screen.getByRole("button", { name: "＋ Section" }));
    expect(screen.getByLabelText("Rendered preview")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "＋ Child Page" }));
    expect(screen.getByLabelText("Rendered preview")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: /第一篇/ }));
    expect(screen.getByLabelText("Note content")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
  });

  it("保留搜索、标签搜索和置顶筛选", async () => {
    const other = createNote({ id: "two", title: "旅行", content: "相机", tags: ["生活"], pinned: true });
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: createEmptyWorkspace([savedNote, other]), isFirstRun: false, migrated: false });
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("旅行");
    await user.type(screen.getByLabelText("Search notes"), "测试");
    expect(screen.getByRole("button", { name: /第一篇/ })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /旅行/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search notes")); await user.click(screen.getByRole("button", { name: "Pinned" }));
    expect(screen.getByRole("button", { name: /旅行/ })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /第一篇/ })).not.toBeInTheDocument();
  });

  it("支持置顶、删除和清空普通笔记", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: "Pin note" }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.arrayContaining([expect.objectContaining({ id: "one", pinned: true })]) })));
    await user.click(screen.getByRole("button", { name: "Delete note" })); expect(await screen.findByDisplayValue("ReadMe")).toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Note title")); await user.type(screen.getByLabelText("Note title"), "Editable after delete");
    expect(screen.getByLabelText("Note title")).toHaveValue("Editable after delete");
    await user.click(screen.getAllByRole("button", { name: /New Note/ })[0]); await user.click(screen.getByRole("button", { name: "Clear Notes" }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ notes: [] })));
    await user.click(screen.getAllByRole("button", { name: /New Note/ })[0]); await user.type(screen.getByLabelText("Note title"), " after clear");
    expect(screen.getByLabelText("Note title")).toHaveValue("Untitled Note after clear");
  });

  it("删除 Book 时永久删除所有页面并可立即继续编辑", async () => {
    const created = createBook("Disposable Book");
    const sectionNote = createNote({ id: "section-note", title: "Section" });
    let book = addNoteToBook(created.book, sectionNote, { section: true });
    const sectionPage = Object.values(book.pages).find(page => page.noteId === sectionNote.id)!;
    const childNote = createNote({ id: "child-note", title: "Child" });
    book = addNoteToBook(book, childNote, { parentPageId: sectionPage.id });
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: { version: 2, notes: [savedNote, created.homeNote, sectionNote, childNote], books: [book] }, isFirstRun: false, migrated: false });
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ })); await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /第一篇/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /第一篇/ }));
    await user.clear(screen.getByLabelText("Note title")); await user.type(screen.getByLabelText("Note title"), "Still editable");
    expect(screen.getByLabelText("Note title")).toHaveValue("Still editable");
    await waitFor(() => {
      const saved = vi.mocked(api.saveWorkspace).mock.calls.at(-1)?.[0];
      expect(saved?.books).toEqual([]);
      expect(saved?.notes.some(note => [created.homeNote.id, sectionNote.id, childNote.id].includes(note.id))).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ })); await user.click(screen.getByRole("button", { name: "New Book" }));
    await user.type(screen.getByLabelText("Book Name"), "Fresh Book"); await user.click(screen.getByRole("button", { name: "Create Book" }));
    await user.clear(screen.getByLabelText("Note title")); await user.type(screen.getByLabelText("Note title"), "Editable Home");
    expect(screen.getByLabelText("Note title")).toHaveValue("Editable Home");
  });

  it("删除 Book 页面及其子页面无需确认并可继续编辑首页", async () => {
    const created = createBook("Research Book");
    const sectionNote = createNote({ id: "section", title: "Section" });
    let book = addNoteToBook(created.book, sectionNote, { section: true });
    const sectionPage = Object.values(book.pages).find(page => page.noteId === sectionNote.id)!;
    const childNote = createNote({ id: "child", title: "Child" });
    book = addNoteToBook(book, childNote, { parentPageId: sectionPage.id });
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: { version: 2, notes: [created.homeNote, sectionNote, childNote], books: [book] }, isFirstRun: false, migrated: false });
    const user = userEvent.setup(); render(<App />); await screen.findByRole("button", { name: /^Jupyter Book$/ });
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ })); await user.click(screen.getByRole("button", { name: /^Section$/ }));
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toHaveValue("Research Book");
    await user.clear(screen.getByLabelText("Note title")); await user.type(screen.getByLabelText("Note title"), "Edited Home");
    expect(screen.getByLabelText("Note title")).toHaveValue("Edited Home");
    await waitFor(() => {
      const saved = vi.mocked(api.saveWorkspace).mock.calls.at(-1)?.[0];
      expect(saved?.notes.some(note => note.id === sectionNote.id || note.id === childNote.id)).toBe(false);
    });
  });

  it("创建 Book、章节和子页面并保存设置和页面属性", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ })); await user.click(screen.getByRole("button", { name: "New Book" }));
    await user.type(screen.getByLabelText("Book Name"), "测试 Book"); await user.click(screen.getByRole("button", { name: "Create Book" }));
    expect(await screen.findByLabelText("Note title")).toHaveValue("测试 Book");
    await user.click(screen.getByRole("button", { name: "＋ Section" })); expect(screen.getByDisplayValue("New Section")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "＋ Child Page" })); expect(screen.getByDisplayValue("Untitled Page")).toBeInTheDocument();
    const savesBeforeDrag = vi.mocked(api.saveWorkspace).mock.calls.length;
    const sourceRow = screen.getByRole("button", { name: /Untitled Page/ });
    const targetRow = screen.getByRole("button", { name: "测试 Book" });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => targetRow) });
    vi.spyOn(targetRow, "getBoundingClientRect").mockReturnValue({ x: 0, y: 100, top: 100, left: 0, right: 300, bottom: 136, width: 300, height: 36, toJSON: () => ({}) });
    fireEvent.pointerDown(sourceRow, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 134 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 134 });
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledTimes(savesBeforeDrag + 1));
    await user.click(screen.getByRole("button", { name: "Settings" })); await user.clear(screen.getByLabelText("Book title")); await user.type(screen.getByLabelText("Book title"), "能源研究"); await user.click(screen.getByRole("button", { name: "Save Settings" }));
    expect(screen.getByRole("option", { name: "能源研究" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page Properties" })); const path = screen.getByLabelText("Export Path"); await user.clear(path); await user.type(path, "chapter/page.md"); await user.click(screen.getByRole("button", { name: "Save Properties" }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ books: expect.arrayContaining([expect.objectContaining({ settings: expect.objectContaining({ title: "能源研究" }) })]) })));
  }, 15_000); // This scenario types into several dialogs and waits for persisted drag/settings updates.

  it("Authors 输入允许空格与多个逗号分隔姓名，并在保存时解析", async () => {
    const created = createBook("Authors Book");
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: { version: 2, notes: [created.homeNote], books: [created.book] }, isFirstRun: false, migrated: false });
    const user = userEvent.setup(); render(<App />); await screen.findByRole("button", { name: /^Jupyter Book$/ });
    await user.click(screen.getByRole("button", { name: /^Jupyter Book$/ }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Book Authors"), "Haojie Dai, Jane Smith");
    expect(screen.getByLabelText("Book Authors")).toHaveValue("Haojie Dai, Jane Smith");
    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    await waitFor(() => expect(vi.mocked(api.saveWorkspace).mock.calls.at(-1)?.[0].books[0].settings.authors).toEqual([{ name: "Haojie Dai" }, { name: "Jane Smith" }]));
  }, 15_000);

  it("显示并可更改数据位置", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: "Data Location" }));
    expect(await screen.findByLabelText("Current data folder")).toHaveValue("D:\\LanCarbon\\Data");
    await user.click(screen.getByRole("button", { name: "Change Location" }));
    await waitFor(() => expect(api.changeDataLocation).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Data Location" })).not.toBeInTheDocument();
  });

  it("已有笔记可加入并移出一个 Book，导出前强制保存", async () => {
    const { book, homeNote } = createBook("研究 Book");
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: { version: 2, notes: [savedNote, homeNote], books: [book] }, isFirstRun: false, migrated: false });
    const user = userEvent.setup(); const { container } = render(<App />); await screen.findByDisplayValue("第一篇");
    // Scope action queries so the expanded formatting toolbar and note body are not scanned.
    const actions = () => within(container.querySelector<HTMLElement>(".editor-toolbar")!);
    const sidebar = () => within(container.querySelector<HTMLElement>(".sidebar")!);
    await user.click(actions().getByRole("button", { name: "Add to Book" })); expect(await screen.findByDisplayValue("第一篇")).toBeInTheDocument();
    await user.click(sidebar().getByRole("button", { name: "Export" })); await waitFor(() => expect(api.exportBook).toHaveBeenCalledWith(book.id));
    await user.click(actions().getByRole("button", { name: "Remove from Book" })); expect(await sidebar().findByRole("button", { name: /第一篇/ })).toBeInTheDocument();
  });

  it("存在多个 Book 时使用应用内对话框选择目标", async () => {
    const first = createBook("Book A"); const second = createBook("Book B");
    vi.mocked(api.loadWorkspace).mockResolvedValue({ ok: true, workspace: { version: 2, notes: [savedNote, first.homeNote, second.homeNote], books: [first.book, second.book] }, isFirstRun: false, migrated: false });
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: "Add to Book" }));
    await user.selectOptions(screen.getByLabelText("Destination Book"), second.book.id);
    await user.click(within(screen.getByRole("form", { name: "Choose a Book" })).getByRole("button", { name: "Add to Book" }));
    await waitFor(() => {
      const saved = vi.mocked(api.saveWorkspace).mock.calls.at(-1)?.[0];
      const target = saved?.books.find(book => book.id === second.book.id);
      expect(Object.values(target?.pages ?? {}).some(page => page.noteId === savedNote.id)).toBe(true);
    });
    expect(screen.queryByRole("form", { name: "Choose a Book" })).not.toBeInTheDocument();
  });

  it("支持主题和快捷键，并显示保存错误", async () => {
    vi.mocked(api.saveWorkspace).mockResolvedValue({ ok: false, error: "磁盘不可写" });
    const user = userEvent.setup(); render(<App />); await screen.findByDisplayValue("第一篇");
    await user.click(screen.getByRole("button", { name: "☀ Light" })); expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true }); expect(screen.getByLabelText("Search notes")).toHaveFocus();
    fireEvent.keyDown(document, { key: "n", ctrlKey: true }); await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("Untitled Note")); await waitFor(() => expect(screen.getByText(/Save failed/)).toBeInTheDocument());
  });
});
