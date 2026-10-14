import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.2.0";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

Welcome to **LanCarbon**, an offline-first desktop application for writing Notes and creating structured Books that can become local or online websites.

Version 2.2.0 enables AI Settings and Chat: configure SiliconFlow, OpenRouter or an OpenAI-compatible Others service, save encrypted API keys and chat models, then stream, stop, retry and reopen local conversations. Connections follow your computer’s network. PDF/EPUB reading and literature tasks remain reserved. Notes, Books and Library files are not automatically attached to AI requests.

**Important publishing fix:** LanCarbon now preserves the system tutorial's GitHub repository binding when synchronizing official tutorial content. Earlier builds could show the repository as connected in the interface while the publishing backend had already lost that connection, preventing Publish from continuing. If an earlier build has already removed the binding, reconnect the existing repository once after upgrading; subsequent tutorial synchronization will retain it.

LanCarbon now uses the new Logo consistently across the application, installer, repository ReadMe, built-in tutorial, and the default favicon for generated Book websites.

**Resource-dialog fix:** Duplicate images and attachments now use an in-app choice dialog instead of a Windows message box, restoring focus after closing to address the reported disappearing mouse after duplicate-resource warnings.

### AI Settings and Chat

1. Open **Research → AI Settings** and choose **SiliconFlow**, **OpenRouter** or **Others**. Presets supply their official base addresses. Others supports an OpenAI-compatible Chat Completions service and additional named configurations.
2. Paste that service's **API Key**. Use **Refresh models** to save the connection and fetch its chat models, or enter a **Model ID** and **Display name** manually and select **Add model**. The preset shortcut adds DeepSeek V4 Pro or GPT-6 Luna. Choose a **Default model**, then **Save models**.
3. Select **Test model** to save and make a small API request; normal service charges may apply. Connections follow the computer's network and system proxy. LanCarbon has no separate proxy controls.
4. Open **Chat**, choose a model labelled **service · model**, and send text. **Enter** sends; **Shift+Enter** inserts a line break. Use **Stop generating** or **Retry reply** for a stopped or failed reply. Replies support Markdown, code and mathematics; provided reasoning is shown separately. **Copy** copies the original text.
5. Use **New chat**, **Rename chat** and **Delete chat** to manage conversations. Messages are saved locally in the active **Data/Research/Chats/chats.json**. Switching to Notes or Books lets generation continue; reopening Chat or restarting restores conversations. Closing LanCarbon stops generation and saves partial replies.

SiliconFlow: base address \`https://api.siliconflow.cn/v1\`, model ID \`deepseek-ai/DeepSeek-V4-Pro\`. OpenRouter: base address \`https://openrouter.ai/api/v1\`, model ID \`openai/gpt-6-luna\`. Use the exact ID shown by your platform if its catalogue changes. Each service can contain several saved chat models; changing service within a conversation sends its relevant conversation history with the next message.

API keys are encrypted for the current Windows account in **Config/ai-settings.json** and are not returned to the Chat interface. A blank key field retains the existing key; the remove-key checkbox clears it when saving. Enter keys again after moving to another Windows account. Back up Config together with the active Data folder. Only conversation text you send is submitted; Notes, Books and Library files are not automatically attached. PDF/EPUB reading, document-based answers, Embedding, Rerank and literature tasks are reserved for later phases.

### Workspaces

The four workspace buttons are arranged in two rows: Notes / Books above Research / Library. Switching and restarting retain your selected Note, Book page, Research page and Library resource. **Ctrl+Q** switches Notes and Books; from Research or Library it returns to the most recently used writing workspace. **Ctrl+N** and **Ctrl+E** act only in Notes or Books. Images and attachments are managed in **Library/assets**, with their IDs and writing links intact. In Library, select a file to keep its references visible above the scrolling list. Select a writing reference to open its Note or Book page at the cited line. Use **Folder** to reveal the actual managed file, **Rename** to change its display/save-copy name, and **Save a copy** beside the selected filename to export a copy. Renaming preserves the original extension and IDs; built-in tutorial resources are managed by LanCarbon and cannot be renamed. **Open Library folder** opens the originals folder under the LanCarbon root.

### What you can do

- Write and organize ordinary Markdown Notes; choose **Sort by** to order Notes or Books by **Last modified**, **Date created** (newest first) or **Name (A–Z)**. Pinned Notes stay first, and each workspace remembers its own choice.
- Create Books with Sections and Child Pages. Use a page's triangle to expand or collapse its children; each Book remembers its folded branches. Navigating to a page or creating a child reveals its ancestors. Sorting the Book selector does not change the Book's table of contents or export order.
- Press **Ctrl+Q** to switch between **Notes** and **Books**, keeping the selected Note or Book page. A **Q** hint is embedded at the right of the Books tab; hover to see **Ctrl+Q**. The shortcut is inactive while a dialog is open.
- Edit Markdown and MyST content with the formatting toolbar, use the expanded Math symbol panel, then switch between Edit and Preview with **Ctrl+E**.
- Insert and manage images, attachments, citations and other reusable Resources.
- Export a separate Jupyter Book source copy for backup or external editing.
- Export the current Note or Markdown Book page as an A4 PDF with its title, text, math, managed images, tables and page numbers. Only the selected page is included, not its children or the entire Book.
- Build the current Book as a local website and reopen or rebuild the saved result later.
- Publish a successful build to GitHub Pages, then update the same website after editing the Book.

### Export a page as PDF

Select **Export PDF** in the page header from Edit or Preview, choose a filename and destination (default: the page title), and save. The default PDF destination is the **PDFs** folder beside Exports under the LanCarbon root. Installation or startup creates it automatically; you can still choose another destination. Exports remains for Book source copies, and existing PDFs are not moved. Export saves the latest edits first and needs no optional tools. It uses a white reading layout without editor controls or line numbers. Book home pages, Sections and Child Pages are exported individually. Links to omitted Book pages and attachments remain readable labels, not embedded content. Preview limitations also apply to PDF; check export notices and inspect the result. Existing PDFs require overwrite confirmation; canceling or a failed export leaves the previous file intact. The sidebar **Export** still creates the entire Book source copy.

### Included when you first install LanCarbon

LanCarbon includes two starting resources:

1. **ReadMe** — this pinned Note introduces the current release and its main capabilities. It is refreshed when LanCarbon is updated.
2. **LanCarbon: From 0 to 1** — a complete bilingual Book that guides a beginner from installation through writing, local Build and GitHub Pages publication.

Open **Books** in the left sidebar and select *LanCarbon: From 0 to 1* for the detailed tutorial. You may keep it as a reference while creating your own Book.

*LanCarbon: From 0 to 1* is a system-managed tutorial. Do not edit it: each software update synchronizes it to the bundled edition and overwrites changes without creating a backup. LanCarbon is not responsible for content lost because this system tutorial was edited. Your own Notes and Books are never part of this replacement.

### Tools used by Build and Publish

Basic writing, Preview, PDF export and source-copy Export work inside LanCarbon. This first-run ReadMe introduces **Environment Setup**; open it from the sidebar, Build or Publish to inspect every requirement and optionally install managed copies under the LanCarbon \`Tools\` folder:

- **Build** requires Python 3, Node.js and Jupyter Book 2.
- **Publish** requires Git, GitHub CLI, a GitHub account and network access to GitHub.

Each tool is installed from its official source, verified, and checked again. Installing Jupyter Book also prepares missing managed Python and Node.js dependencies. Existing compatible system installations are marked **Using existing** and have no Install button. Managed Python is portable and does not alter a registered system Python. Live download, verification, deployment and post-install progress is shown; Cancel stops the operation and removes partial files. LanCarbon retries temporary Windows file locks and offers **Repair folder permissions** when \`Tools\` is not writable. Failed downloads or repairs do not affect local editing or tools already installed successfully. The system-managed tutorial retains its GitHub publishing connection when official tutorial content is refreshed. Some networks may require a system proxy or TUN mode to reach GitHub.

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

2.2.0 启用 AI Settings 与 Chat：配置 SiliconFlow、OpenRouter 或兼容 OpenAI 的 Others 服务，保存加密密钥及聊天模型，然后进行流式对话、停止、重试与会话恢复。连接跟随电脑网络。PDF/EPUB 阅读和文献任务留待后续阶段，Notes、Books 和 Library 文件不会自动附加到 AI 请求。

**重要发布修复：** LanCarbon 现在会在同步官方教程内容时保留系统教程的 GitHub 仓库绑定。旧版本可能出现界面显示仓库已经连接，但发布后台已经丢失连接，导致 Publish 无法继续的问题。如果旧版本已经清除了绑定，请在升级后重新连接一次现有仓库；此后的教程同步会保留该连接。

LanCarbon 现已在软件界面、安装包、仓库 ReadMe、系统内置教程以及生成 Book 网站的默认 favicon 中统一使用新版 Logo。

**资源提示修复：** 图片或附件重名时改用软件内选择对话框，关闭后恢复焦点，以处理重复资源提示后鼠标消失的问题。

### AI Settings 与 Chat

1. 打开 **Research → AI Settings**，选择 **SiliconFlow**、**OpenRouter** 或 **Others**。前两项预填官方 API 地址；Others 支持兼容 OpenAI Chat Completions 的服务，也可以添加多个命名配置。
2. 粘贴对应平台的 **API Key**。点击 **Refresh models** 保存连接并获取聊天模型，或手动填写 **Model ID** 和 **Display name**，点击 **Add model**。预设快捷按钮可添加 DeepSeek V4 Pro 或 GPT-6 Luna。选择 **Default model** 后点击 **Save models**。
3. 点击 **Test model** 保存并发送一次小型 API 请求，可能产生平台正常费用。连接跟随电脑网络与系统代理，LanCarbon 不提供单独的代理设置。
4. 进入 **Chat**，选择标为 **服务 · 模型** 的模型并发送文字。**Enter** 发送，**Shift+Enter** 换行。可以 **Stop generating** 停止生成，或用 **Retry reply** 重试最后一条停止或失败的回复。回复支持 Markdown、代码和公式，模型提供的推理文字单独折叠显示；**Copy** 复制原始文本。
5. 使用 **New chat**、**Rename chat** 和 **Delete chat** 管理会话。消息保存在实际 **Data/Research/Chats/chats.json**；切到 Notes 或 Books 后生成继续，返回 Chat 或重启后恢复记录。关闭 LanCarbon 会停止生成并保存已有回复。

SiliconFlow 的地址为 \`https://api.siliconflow.cn/v1\`，模型 ID 为 \`deepseek-ai/DeepSeek-V4-Pro\`；OpenRouter 的地址为 \`https://openrouter.ai/api/v1\`，模型 ID 为 \`openai/gpt-6-luna\`。平台目录变化时，以平台显示的准确 ID 为准。每个服务可以保存多个聊天模型；在同一会话切换服务后，下次发送会携带相关会话历史。

API Key 使用当前 Windows 账户加密，保存在 **Config/ai-settings.json**，不会返回 Chat 界面。密钥栏留空会保留已有密钥，勾选删除项后保存会清除密钥；迁移到另一个 Windows 账户后需要重新输入。备份时同时保存 Config 和实际 Data。仅提交发送的会话文字，Notes、Books 和 Library 文件不会自动附加。PDF/EPUB 阅读、基于文档的问答、Embedding、Rerank 和文献任务留待后续阶段。

### 工作区

四个工作区入口按两行排列：上行为 Notes / Books，下行为 Research / Library。切换和重启后保留所选 Note、Book 页面、Research 子页和 Library 资源。**Ctrl+Q** 在 Notes 与 Books 之间切换；在 Research 或 Library 中按下时返回最近使用的写作工作区。**Ctrl+N** 和 **Ctrl+E** 仅在 Notes 或 Books 中生效。图片和附件统一保存在 **Library/assets**，资源 ID 和正文引用保持有效。在 Library 中选择文件后，引用面板保持在滚动列表上方；点击正文引用可跳到对应 Note 或 Book 页面并定位引用行。使用 **Folder** 定位受管理文件，**Rename** 修改显示及保存副本时的名称，文件名旁的 **Save a copy** 导出副本。重命名保留扩展名和资源 ID；系统教程资源由 LanCarbon 管理，不提供重命名。**Open Library folder** 打开 LanCarbon 根目录下的原始资料文件夹。

### 主要功能

- 撰写和管理普通 Markdown Notes；通过 **Sort by** 将 Notes 或 Books 按 **Last modified**（修改时间）、**Date created**（创建时间，时间均为最新在前）或 **Name (A–Z)**（名称）排序。置顶 Notes 始终优先，两个工作区分别记住排序选择。
- 创建包含 Sections 和 Child Pages 的 Books。点击页面前的三角形展开或折叠子页面，每本 Book 分别记住折叠状态；跳转到页面或新建子页面时会自动展开上级目录。Book 下拉框的排序不会改变 Book 内部目录和导出顺序。
- 按 **Ctrl+Q** 在 **Notes** 和 **Books** 之间切换，并保留原来选中的 Note 或 Book 页面。**Q** 提示显示在 Books 按钮内部右侧，悬停可查看 **Ctrl+Q**；打开对话框时不触发切换。
- 使用格式工具栏和扩充后的 Math 符号面板编辑 Markdown 与 MyST 内容，并通过 **Ctrl+E** 快速切换 Edit 和 Preview。
- 插入和管理图片、附件、文献及其他可重复使用的 Resources。
- 导出独立的 Jupyter Book 源文件副本，用于备份或外部编辑。
- 将当前 Note 或 Markdown Book 页面导出为 A4 PDF，保留标题、文字、公式、受管理图片、表格和页码；只包含当前页面，不包含子页面或整本 Book。
- 把当前 Book 构建为本地网站，并在以后重新打开或重建保存的网站。
- 将成功构建的网站发布到 GitHub Pages，并在修改 Book 后更新同一个在线网站。

### 导出页面为 PDF

在 Edit 或 Preview 中点击页面顶部的 **Export PDF**，选择文件名和保存位置（默认为页面标题），然后保存。PDF 默认保存位置为 LanCarbon 根目录下与 Exports 同级的 **PDFs** 文件夹，安装或启动时会自动创建；仍可自行选择其他保存位置。Exports 继续用于 Book 源文件副本，已有 PDF 不会自动搬移。导出前会先保存最新修改，不需要额外工具。PDF 使用白底阅读排版，不包含编辑工具栏和行号。Book 首页、Section 和 Child Page 均可单独导出。指向未导出 Book 页面的链接和附件保留为可读文字，不会嵌入目标内容。Preview 的支持范围同样适用于 PDF，请检查导出后的注意事项和生成结果。覆盖已有 PDF 需要确认；取消或导出失败不会破坏原有文件。侧边栏的 **Export** 仍用于导出整本 Book 的源文件副本。

### 第一次安装自带的内容

LanCarbon 首次安装后会提供两项起始内容：

1. **ReadMe**——当前这篇置顶 Note，用于介绍正式版本和主要功能；升级 LanCarbon 时会同步更新。
2. **LanCarbon: From 0 to 1**——一本完整的中英文双语教程 Book，面向新手讲解安装、写作、本地 Build 和 GitHub Pages 在线发布的全过程。

在左侧切换到 **Books**，选择 *LanCarbon: From 0 to 1*，即可阅读详细教程。你可以保留这本书作为参考，同时创建自己的第一本 Book。

*LanCarbon: From 0 to 1* 是系统管理教程，请勿编辑。每次软件更新都会把它同步为安装包内的最新版，覆盖其中的修改且不会创建备份；因自行编辑这本系统教程而造成的内容丢失，LanCarbon 不承担责任。用户自己创建的 Notes 和 Books 不会参与此次替换。

### Build 和 Publish 使用的工具

普通写作、Preview、PDF 导出和源文件副本 Export 可以直接在 LanCarbon 中完成。这篇首次启动 ReadMe 会介绍 **Environment Setup**；可以从侧边栏、Build 或 Publish 打开它，集中检查全部要求，并按需把受管理版本安装到 LanCarbon 的 \`Tools\` 文件夹：

- **Build** 需要 Python 3、Node.js 和 Jupyter Book 2。
- **Publish** 需要 Git、GitHub CLI、GitHub 账号以及能够访问 GitHub 的网络。

各项工具都会从官方来源安装、校验并复检；安装 Jupyter Book 时也会自动准备缺失的受管理 Python 和 Node.js。系统中已有的兼容工具显示 **Using existing**，不提供 Install 按钮；受管理 Python 为便携版，不会修改已注册的系统 Python。界面会显示下载、校验、部署和复检进度，Cancel 会停止任务并清理未完成文件。LanCarbon 会自动重试临时的 Windows 文件占用，并在 \`Tools\` 不可写时提供 **Repair folder permissions**。下载或修复失败不会影响本地编辑或此前成功安装的工具。系统管理教程在刷新官方内容时会保留 GitHub 发布连接。部分网络环境可能需要开启系统代理或 TUN 模式才能访问 GitHub。

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
