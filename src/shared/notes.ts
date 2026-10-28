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
export const RELEASE_VERSION = "2.5.3";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

## What's new

This update adds local PDF and EPUB annotations and reading-note exports.

- **Annotate while reading:** select text and choose **Highlight**, **Underline** or **Comment** in the fixed reading toolbar beside OCR (or the EPUB display controls). **Annotations** sits beside **Pages / Contents**. Choose a color, add an optional comment, and save. Click a mark or use **Annotations** to edit or delete it. The compact list follows document order, with **Edit** beside each item’s style and color; deletion is available inside Edit.
- **Reliable local storage:** annotations are saved separately under **Data/Library/Annotations**, leaving original files unchanged. PDF locations use file pages and page-relative positions; EPUB locations use chapters and text anchors. Renaming or moving a document within Library preserves its annotations. A changed original keeps earlier annotations with a version warning instead of applying old locations to new text.
- **Export to Note:** export all or selected annotations into a new editable Note containing original excerpts, comments, locations and **Return to original** links. PDF locations use actual file page numbers, which may differ from printed page labels. Return links work inside LanCarbon. Exports are snapshots; re-exporting warns when an existing exported Note is found and creates a new Note without overwriting your edits.
- **Translation shortcut hint:** the floating panel now shows **Continuous translation (Z)**; Z toggles continuous mode after a PDF selection.

Your Notes, Books, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. Annotated PDF/EPUB file export, multi-tab writing and the writing-side AI panel are not included. Automated paper discovery and collection expansion are not available yet.

---

## 主要更新

本次更新提供 PDF／EPUB 本地批注，以及批注导出为阅读笔记的完整流程。

- **边读边批注**：选中文字，使用 OCR 旁（EPUB 显示设置旁）固定工具栏中的 **Highlight**（高亮）、**Underline**（划线）或 **Comment**（评论），设置颜色、按需输入评论后保存。点击标记或使用 **Annotations** 列表编辑、删除；**Annotations** 位于 **Pages / Contents** 旁；紧凑列表按原文顺序排列，**Edit** 位于类型、颜色同行，删除操作在编辑窗口内。
- **独立本地保存**：批注保存在 **Data/Library/Annotations**，不改写 PDF／EPUB 原件。PDF 保存实际文件页码及页内相对位置；EPUB 保存章节及文字锚点。在 Library 内改名、移动后保留批注。更换原文件后，旧批注仍保留并提示版本变化，不把旧位置套用到新文字上。
- **导出为 Note**：可导出全部或勾选的批注，生成含原文摘录、评论、位置和 **Return to original** 返回链接的普通可编辑 Note。PDF 使用实际文件页码，可能与印刷页码不同；返回链接在 LanCarbon 内使用。导出是快照；发现已有导出笔记时会提醒，重复导出创建新 Note，不覆盖用户修改。
- **翻译快捷键提示**：浮窗显示 **Continuous translation (Z)**；PDF 选区后可按 Z 切换连续翻译。

升级保留 Notes、Books、模型设置和聊天记录，系统 ReadMe 与教程随软件同步。本次不包含带批注 PDF／EPUB 文件导出、多标签写作和写作侧栏 AI；自动文献发现与文献库自拓展尚未开放。`;

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
