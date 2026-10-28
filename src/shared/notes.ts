import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.5.2";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

## What's new

This update improves PDF selection and search alignment, adds continuous selection translation, and provides a personal To do note.

- **PDF reading:** text selection and search highlights now use the same page dimensions as the visible PDF at different zoom levels.
- **Continuous translation:** select the first passage, then check **Continuous translation** in the floating panel. In a PDF, **Z** also toggles the mode after selection. Select the continuation on the next page to translate the combined original. **New passage** clears the accumulated text; unchecking restores ordinary selection translation. Switching documents clears the passage and turns continuous mode off. The combined text remains limited to 1,600 characters or 250 words. Each accepted addition requests a translation of the combined text; matching cached results can be reused.
- **Personal To do:** new and existing users receive a pinned **To do** note. Use its checklist to add and check tasks, or edit Markdown task lines such as \`- [ ] Read the paper\`. Renaming, editing or unpinning it is preserved across upgrades. Deleting it allows a fresh default To do to be created on the next start; it does not restore deleted tasks.

Your Notes, Books, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. To do is personal content and is not overwritten by tutorial synchronization. PDF/EPUB annotations, multi-tab writing and the writing-side AI panel are planned separately. Automated paper discovery and collection expansion are not available yet.

---

## 主要更新

本次更新修正 PDF 文字选取与搜索高亮的位置，增加连续选区翻译，并提供个人 To do 待办笔记。

- **PDF 阅读**：文字选区与搜索高亮使用和可见 PDF 相同的页面尺寸，在不同缩放比例下保持对应。
- **连续翻译**：先选第一段原文，再勾选浮窗中的 **Continuous translation**；在 PDF 中选取后也可按 **Z** 切换此模式。选取下一页的后续文字后，合并原文并整体翻译。**New passage** 清空累计内容；取消勾选恢复普通选区翻译。切换文档时清空累计内容并关闭连续模式。合并后仍限 1,600 个字符或 250 个词。每次有效追加都会请求翻译合并原文；命中缓存时可复用已有译文。
- **个人 To do**：新用户和升级用户都会获得一个置顶 **To do** 笔记。可通过清单添加和勾选任务，也可编辑 \`- [ ] 阅读论文\` 等 Markdown 任务行。改名、正文修改和取消置顶会在升级时保留。删除后下次启动会创建新的默认 To do，但不会恢复已删除任务。

升级保留 Notes、Books、模型设置和聊天记录。系统 ReadMe 与教程随软件同步；To do 属于个人内容，不会被教程同步覆盖。PDF／EPUB 批注、多标签写作和写作侧栏 AI 将另行更新；自动文献发现与文献库自拓展尚未开放。`;

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
