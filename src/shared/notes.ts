import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.5.1";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

## What's new

This update extends the writing and publishing tools of 1.1.4 into a personal knowledge library: collect documents in **Library**, explore them in **Workshop**, and keep your own work in **Notes** and **Books**.

### Library and built-in reading

Import and organize PDF/EPUB documents, manage folders and duplicates, follow writing references and keep file versions. Batch selection supports moving, exporting and deleting files. Read PDF and EPUB inside LanCarbon with search, document outlines, remembered reading positions and up to ten open tabs. Included English/Chinese OCR recognizes scanned PDF text locally.

### AI Chat and knowledge-library questions

Configure SiliconFlow, OpenRouter or another compatible service, save models and select one in Chat. Set shared response guidelines, read available Thinking and export conversations as PDF or editable Notes. Choose Library documents, Notes and Book pages to ask source-based questions or compare materials, then open citations to read the originals. Current full-text questions use your selected Chat model; Embedding and Rerank setup is not required.

### Selection translation

Translate English words, phrases and short passages across writing and reading. Reuse a saved model or configure a separate translation connection. Turn **Translate** on when needed, or use **Ctrl+Alt+T**; long original and translated text scroll separately in the floating panel.

### Usage, costs and balances

Review request history, tokens and activity heatmaps. Set model prices and a reference USD/CNY rate for estimates. Enter an account balance to track later charges, group connections billed to the same account, or disable balance tracking for free-only use. Provider bills remain the source of actual charges.

### Learn the workflow

Open **Books → LanCarbon: From 0 to 1**. The tutorial introduces the four workspaces and offers separate Library and Workshop chapters, current screenshots and two routes: writing/publishing and reading/knowledge-library work. The first five chapters retain the writing and publishing workflow.

Your Notes, Books, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app; write personal content in your own Notes and Books. Automated paper discovery and collection expansion are not available yet. Check important source-based findings against the original before using them in research.

---

## 主要更新

本次更新在 1.1.4 写作与发布功能的基础上，扩展为个人知识库工作流程：在 **Library** 收集文档，在 **Workshop** 中阅读提问，并用 **Notes** 和 **Books** 保存与整理自己的成果。

### Library 与内置阅读

导入、分类 PDF／EPUB，管理文件夹和重复文件，查看写作引用并保留文件版本。批量选择支持移动、导出和删除。可在软件内阅读 PDF 和 EPUB，使用搜索、目录、阅读进度及最多十个文件标签。随软件提供的中英文 OCR 在本地识别扫描 PDF 文字。

### AI Chat 与个人知识库问答

配置 SiliconFlow、OpenRouter 或其他兼容服务，保存模型并在 Chat 中选择。可设置共用回答规范、查看模型提供的 Thinking，并将聊天导出为 PDF 或可编辑 Note。选择 Library 文档、Notes 和 Book 页面后，可以围绕资料提问和比较，并通过引用返回原文。当前全文问答使用选定的 Chat 模型，不要求配置 Embedding 或 Rerank。

### 划词翻译

在写作或阅读时翻译英文单词、词组和短段落，支持复用已保存模型或独立配置翻译连接。按需开启 **Translate**，也可使用 **Ctrl+Alt+T**；浮窗中的长原文和长译文分别滚动。

### 用量、费用与余额

查看请求历史、Token 用量和活动热力图，设置模型价格与美元／人民币参考汇率进行估算。手动输入账户余额后，统计后续费用；共用计费账户的连接可以合并，只使用免费模型时也可以关闭余额跟踪。实际费用以服务商账单为准。

### 学习使用流程

打开 **Books → LanCarbon: From 0 to 1**。教程重新介绍四个工作区，分设 Library 和 Workshop 章节，更新截图，并提供“写作与发布”和“阅读与知识库”两条学习路线。前五章保留原有写作与发布流程。

升级保留 Notes、Books、模型配置和聊天记录。系统 ReadMe 与教程随软件同步，个人内容请写在自己创建的 Notes 和 Books 中。自动文献发现与资料库自动拓展尚未开放。资料问答的重要结论用于研究前，请返回原文核对。`;

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
