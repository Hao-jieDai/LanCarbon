import { validReaderId } from "./readerTabs";
import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.5.4";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

## What's new

This update adds writing tabs and a shared right sidebar for page chat and reading annotations.

- **Writing tabs:** keep multiple Notes and pages from different Books open, displaying one at a time. Switching retains the current session's cursor, undo history, scroll position and Edit / Preview choice. Closing a tab does not delete its page; open tabs return after restart.
- **AI Chat beside your writing:** open **AI Chat** in a Note or Book page. The default source is the current Note/page; Book pages also offer **Current section** and **Whole Book**. A section includes its top-level page and descendants. Each page has its own conversations and session drafts. Sending saves the latest text first and uses the existing model connections and source-citation workflow; opening or switching tabs does not call a model.
- **One right sidebar:** Notes and Books show AI Chat, while PDF and EPUB show **Annotations**. Opening the right sidebar closes the left workspace list; opening the left list closes the right. Reader Pages / Contents and Annotations also close one another. Annotation controls, local storage and Note exports remain available.

Your personal Notes, Books, annotations, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. Mac/tablet adaptation and automated paper discovery/collection expansion remain deferred.

---

## 主要更新

本次更新增加多标签写作，以及用于随页聊天和阅读批注的统一右侧栏。

- **多标签切换**：可同时保留多个 Notes、不同 Books 的页面，每次显示一个。切换时保留本次使用中的光标、撤销记录、滚动位置及 Edit / Preview 状态。关闭标签不删除内容；重启后恢复已打开的标签。
- **边写边问**：在 Note 或 Book 页面点击 **AI Chat**，默认以当前 Note／页面为资料；Book 页面还可选择 **Current section**（所属顶层章节及其子页面）或 **Whole Book**。每页分别保留聊天记录和本次使用中的输入草稿。发送前保存最新正文，复用已有模型连接及来源引用流程；打开或切换标签不会调用模型。
- **统一右侧栏**：Notes／Books 显示 AI Chat，PDF／EPUB 显示 **Annotations**。打开右侧栏自动收起左侧工作区列表，打开左侧列表自动收起右侧栏；阅读器的 Pages / Contents 与 Annotations 也互斥。批注工具、本地保存和导出 Note 继续可用。

升级保留个人 Notes、Books、批注、模型配置和聊天记录，系统 ReadMe 与教程随软件同步。Mac／平板适配、自动文献发现和文献库自拓展继续暂缓。`;

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: "Untitled Note",
    content: "",
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function normalizeNote(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Partial<Note>;
  const fallback = new Date().toISOString();
  return createNote({
    id: typeof note.id === "string" && note.id ? note.id.slice(0, 200) : makeId(),
    title: typeof note.title === "string"
      ? (note.title === "无标题笔记" ? "Untitled Note" : note.title.slice(0, MAX_TITLE_LENGTH))
      : "Untitled Note",
    content: typeof note.content === "string" ? note.content.slice(0, MAX_CONTENT_LENGTH) : "",
    tags: Array.isArray(note.tags)
      ? [...new Set(note.tags.filter((tag): tag is string => typeof tag === "string").map(tag => tag.slice(0, MAX_TAG_LENGTH)))].slice(0, MAX_TAGS)
      : [],
    pinned: Boolean(note.pinned),
    ...(validReaderId(note.annotationSourceId) ? { annotationSourceId: note.annotationSourceId } : {}),
    createdAt: validDate(note.createdAt) ? note.createdAt : fallback,
    updatedAt: validDate(note.updatedAt) ? note.updatedAt : fallback
  });
}

export function normalizeNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_NOTES).map(normalizeNote).filter((note): note is Note => note !== null);
}

export function sortNotes(notes: Note[], order: WorkspaceSortOrder = "updated"): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || compareWorkspaceItems(a, b, order));
}

export function filterNotes(notes: Note[], query = "", filter: "all" | "pinned" = "all", order: WorkspaceSortOrder = "updated"): Note[] {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  return sortNotes(notes, order).filter(note => {
    if (filter === "pinned" && !note.pinned) return false;
    if (!needle) return true;
    return [note.title, note.content, ...note.tags].join(" ").toLocaleLowerCase("zh-CN").includes(needle);
  });
}

export function getStats(content: string): { chars: number; lines: number } {
  return {
    chars: content.replace(/\s/g, "").length,
    lines: content ? content.split(/\r?\n/).length : 0
  };
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim().replace(/^#/, "").slice(0, MAX_TAG_LENGTH)).filter(Boolean))].slice(0, MAX_TAGS);
}

export function createInitialNotes(): Note[] {
  return [createReleaseReadme()];
}

export function createReleaseReadme(): Note {
  return createNote({
    id: RELEASE_README_ID,
    title: "ReadMe",
    content: RELEASE_README_CONTENT,
    tags: ["Release Notes", `v${RELEASE_VERSION}`, "Welcome"],
    pinned: true
  });
}

export function ensureReleaseReadme(notes: Note[]): { notes: Note[]; changed: boolean } {
  const existingIndex = notes.findIndex(note => note.id === RELEASE_README_ID);
  if (existingIndex < 0) return { notes: [...notes, createReleaseReadme()], changed: true };
  const existing = notes[existingIndex];
  const expectedTags = ["Release Notes", `v${RELEASE_VERSION}`, "Welcome"];
  const current = existing.title === "ReadMe"
    && existing.content === RELEASE_README_CONTENT
    && existing.pinned
    && existing.tags.length === expectedTags.length
    && existing.tags.every((tag, index) => tag === expectedTags[index]);
  if (current) return { notes, changed: false };
  const updated = { ...existing, title: "ReadMe", content: RELEASE_README_CONTENT, tags: expectedTags, pinned: true, updatedAt: new Date().toISOString() };
  return { notes: notes.map((note, index) => index === existingIndex ? updated : note), changed: true };
}
