import type { Note } from "./types";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "1.1.2";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

Welcome to **LanCarbon**, an offline-first desktop application for writing Notes and creating structured Books that can become local or online websites.

Version 1.1.2 expands the Math panel with grouped Greek letters and common mathematical symbols, and adds **Ctrl+E** for quickly switching between Edit and Preview. Your writing and managed resources stay in the local Data folder you selected during installation. LanCarbon does not require an account for ordinary writing and does not automatically upload your content.

LanCarbon now uses the new Logo consistently across the application, installer, repository ReadMe, built-in tutorial, and the default favicon for generated Book websites.

### What you can do

- Write and organize ordinary Markdown Notes.
- Create Books with Sections and Child Pages.
- Edit Markdown and MyST content with the formatting toolbar, use the expanded Math symbol panel, then switch between Edit and Preview with **Ctrl+E**.
- Insert and manage images, attachments, citations and other reusable Resources.
- Export a separate Jupyter Book source copy for backup or external editing.
- Build the current Book as a local website and reopen or rebuild the saved result later.
- Publish a successful build to GitHub Pages, then update the same website after editing the Book.

### Included when you first install LanCarbon

LanCarbon includes two starting resources:

1. **ReadMe** — this pinned Note introduces the current release and its main capabilities. It is refreshed when LanCarbon is updated.
2. **LanCarbon: From 0 to 1** — a complete bilingual Book that guides a beginner from installation through writing, local Build and GitHub Pages publication.

Open **Jupyter Book** in the left sidebar and select *LanCarbon: From 0 to 1* for the detailed tutorial. You may keep it as a reference while creating your own Book.

*LanCarbon: From 0 to 1* is a system-managed tutorial. Do not edit it: each software update synchronizes it to the bundled edition and overwrites changes without creating a backup. LanCarbon is not responsible for content lost because this system tutorial was edited. Your own Notes and Books are never part of this replacement.

### Tools used by Build and Publish

Basic writing, Preview and source-copy Export work inside LanCarbon. This first-run ReadMe introduces **Environment Setup**; open it from the sidebar, Build or Publish to inspect every requirement and optionally install managed copies under the LanCarbon \`Tools\` folder:

- **Build** requires Python 3 and Jupyter Book 2.
- **Publish** requires Git, GitHub CLI, a GitHub account and network access to GitHub.

Each tool is installed independently from its official source, verified, and checked again. Existing compatible system installations are marked **Using existing** and have no Install button. Managed Python is portable and does not alter a registered system Python. Live download, verification, deployment and post-install progress is shown; Cancel stops the operation and removes partial files. Failed downloads do not affect local editing or tools already installed successfully. Some networks may require a system proxy or TUN mode to reach GitHub.

### A simple workflow

1. Create a Book and organize its Sections and Child Pages.
2. Write in Edit and inspect the result in Preview.
3. Select **Build** to create and check the local website.
4. Select **Publish** to connect a GitHub repository and publish the latest successful build.
5. After later edits, rebuild and update the same website.

Export is optional in this workflow. It creates a separate source copy and is not required before Build or Publish.

---

# LanCarbon ${RELEASE_VERSION}

欢迎使用 **LanCarbon**。这是一款优先离线使用的桌面写作软件，可以撰写普通 Notes，也可以组织结构化 Books，并将 Book 构建为本地网站或发布为在线网站。

1.1.2 扩充了 Math 面板，加入分组显示的希腊字母和常用数学符号，并新增 **Ctrl+E**，用于快速切换 Edit 与 Preview。你的正文和受管理资源保存在安装时选择的本地 Data 文件夹中。普通写作不需要注册账号，LanCarbon 也不会自动把你的内容上传到网络。

LanCarbon 现已在软件界面、安装包、仓库 ReadMe、系统内置教程以及生成 Book 网站的默认 favicon 中统一使用新版 Logo。

### 主要功能

- 撰写和管理普通 Markdown Notes。
- 创建包含 Sections 和 Child Pages 的 Books。
- 使用格式工具栏和扩充后的 Math 符号面板编辑 Markdown 与 MyST 内容，并通过 **Ctrl+E** 快速切换 Edit 和 Preview。
- 插入和管理图片、附件、文献及其他可重复使用的 Resources。
- 导出独立的 Jupyter Book 源文件副本，用于备份或外部编辑。
- 把当前 Book 构建为本地网站，并在以后重新打开或重建保存的网站。
- 将成功构建的网站发布到 GitHub Pages，并在修改 Book 后更新同一个在线网站。

### 第一次安装自带的内容

LanCarbon 首次安装后会提供两项起始内容：

1. **ReadMe**——当前这篇置顶 Note，用于介绍正式版本和主要功能；升级 LanCarbon 时会同步更新。
2. **LanCarbon: From 0 to 1**——一本完整的中英文双语教程 Book，面向新手讲解安装、写作、本地 Build 和 GitHub Pages 在线发布的全过程。

在左侧切换到 **Jupyter Book**，选择 *LanCarbon: From 0 to 1*，即可阅读详细教程。你可以保留这本书作为参考，同时创建自己的第一本 Book。

*LanCarbon: From 0 to 1* 是系统管理教程，请勿编辑。每次软件更新都会把它同步为安装包内的最新版，覆盖其中的修改且不会创建备份；因自行编辑这本系统教程而造成的内容丢失，LanCarbon 不承担责任。用户自己创建的 Notes 和 Books 不会参与此次替换。

### Build 和 Publish 使用的工具

普通写作、Preview 和源文件副本 Export 可以直接在 LanCarbon 中完成。这篇首次启动 ReadMe 会介绍 **Environment Setup**；可以从侧边栏、Build 或 Publish 打开它，集中检查全部要求，并按需把受管理版本安装到 LanCarbon 的 \`Tools\` 文件夹：

- **Build** 需要 Python 3 和 Jupyter Book 2。
- **Publish** 需要 Git、GitHub CLI、GitHub 账号以及能够访问 GitHub 的网络。

各项工具独立安装，从官方来源下载并在安装后重新检查。系统中已有的兼容工具显示 **Using existing**，不提供 Install 按钮；受管理 Python 为便携版，不会修改已注册的系统 Python。界面会显示下载、校验、部署和复检进度，Cancel 会停止任务并清理未完成文件。下载失败不会影响本地编辑或此前成功安装的工具。部分网络环境可能需要开启系统代理或 TUN 模式才能访问 GitHub。

### 推荐工作流程

1. 创建 Book，并组织 Sections 和 Child Pages。
2. 在 Edit 中写作，通过 Preview 检查内容。
3. 点击 **Build**，生成并检查本地网站。
4. 点击 **Publish**，连接 GitHub 仓库并发布最近一次成功构建的网站。
5. 后续修改内容后，重新构建并更新同一个在线网站。

这个流程不要求提前 Export。Export 用于生成一份独立的源文件副本，是否使用由你决定。`;

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

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function filterNotes(notes: Note[], query = "", filter: "all" | "pinned" = "all"): Note[] {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  return sortNotes(notes).filter(note => {
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
