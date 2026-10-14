import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.2.3";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

Welcome to **LanCarbon**, an offline-first desktop application for writing Notes and creating structured Books that can become local or online websites.

Version 2.2.3 adds compact usage cards, hourly/daily activity heatmaps, editable CNY conversion and automatic price cleanup that preserves historical costs. AI Settings and Chat: configure SiliconFlow, OpenRouter or an OpenAI-compatible Others service, save encrypted API keys and chat models, then stream, stop, retry and reopen local conversations. Connections follow your computer’s network. PDF/EPUB reading and literature tasks remain reserved. Notes, Books and Library files are not automatically attached to AI requests.

**Important publishing fix:** LanCarbon now preserves the system tutorial's GitHub repository binding when synchronizing official tutorial content. Earlier builds could show the repository as connected in the interface while the publishing backend had already lost that connection, preventing Publish from continuing. If an earlier build has already removed the binding, reconnect the existing repository once after upgrading; subsequent tutorial synchronization will retain it.

LanCarbon now uses the new Logo consistently across the application, installer, repository ReadMe, built-in tutorial, and the default favicon for generated Book websites.

**Resource-dialog fix:** Duplicate images and attachments now use an in-app choice dialog instead of a Windows message box, restoring focus after closing to address the reported disappearing mouse after duplicate-resource warnings.

**AI refinements:** Cross-model history now carries source attribution and current-model identity instructions; shared editable response guidelines request professional replies without emoji. Chat uses its conversation title, saved keys have masked previews and a direct removal action, and transient rate-limit/server errors receive at most two cancellable retries before any output. Existing keys, chats and personal writing are retained. Persistent upstream limits still require the provider to recover.

### AI Settings and Chat

1. Open **Research → AI Settings** and choose **SiliconFlow**, **OpenRouter** or **Others**. Presets supply their base addresses. Others supports OpenAI-compatible Chat Completions services and additional named configurations.
2. Paste the service's **API Key** and select **Refresh models**, or enter an exact **Model ID** and **Display name**, then **Add model → Save models**. Choose a **Default model**. Use the platform catalogue for current model IDs and account permissions.
3. Saved keys appear as **Configured**, showing their first four and last four characters with the middle hidden. Leave the key input blank to retain it, or enter a replacement and save. **Remove saved key** asks for confirmation and removes only the local key, preserving models and chats. Revoke the key separately at the service when required.
4. Expand **Response guidelines · all chat models** to edit the shared **System prompt**, then select **Save guidelines**. **Restore default guidelines** fills the default; save to apply it. Defaults request professional, accurate, calm, neutral and concise responses, without emoji or decorative language, and distinguish facts from interpretation and uncertainty. These instructions apply to future replies across all services; they do not rewrite history or guarantee identical model quality.
5. **Test model** saves the connection and makes a small request. **Stop test** cancels a running test. Connections follow the computer's network and system proxy; normal service charges apply.
6. In **Chat**, select **service · model** and send text. **Enter** sends; **Shift+Enter** inserts a line break. Use **Stop generating**, **Retry reply** and **Copy**. Markdown, code and mathematics are rendered; provided reasoning is folded separately. The heading shows the actual conversation title.
7. Use **New chat**, **Rename chat** and **Delete chat** to manage local conversations. Switching models retains relevant context, but earlier replies from other models are explicitly attributed reference material. The current model is asked to answer independently, using its configured model ID for identity questions. Similar answers alone do not establish which model was used; check each reply's recorded service/model. When the same question is repeated after switching models, earlier answers to that exact question from other models are omitted from the request and retained locally. For a comparison without any prior context, start a separate chat.

SiliconFlow uses base address \`https://api.siliconflow.cn/v1\`; OpenRouter uses \`https://openrouter.ai/api/v1\`. Use **Refresh models** or your platform's catalogue for current IDs. The OpenRouter model \`meta-llama/llama-4-maverick\` can be added manually when available to your account.

Keys remain encrypted for the current Windows account in **Config/ai-settings.json**; only masked previews reach the interface. Moving to another Windows account may require re-entry. Back up the complete LanCarbon home folder, including Config, Cache and Library, together with any separately selected Data location. Conversations are local in **Data/Research/Chats/chats.json**. Switching to Notes or Books lets generation continue; closing LanCarbon stops it and preserves partial replies. Chat submits your conversation text and response guidelines; Notes, Books and Library files are not automatically attached. PDF/EPUB reading, retrieval and literature workflows remain reserved.

### Token usage and costs

Open **Research → Usage**. The default is **Today**; choose **Last 7 days**, **Last 30 days**, or custom **From / To** dates. Source, model and purpose filters apply to the entire range. The compact overview shows **Requests**, total **Tokens** and **Costs**, with each title and value on one line. Requests are newest first, ten per page; pagination does not change totals or activity.

**Token activity → Hourly** shows 24 hours for a selected local date. **Daily** shows one cell per date, arranged by week with month labels; use the year control for a range spanning multiple years. Darker cells mean more tokens. Hover or focus a cell for its time/date, tokens and CNY cost. Missing usage or fees remain unknown rather than zero.

In **Model prices**, choose a configured model and save its input/output rates per million tokens and original currency. Optional cache rates use the input rate when blank; enter zero for a verified free model. Saved prices can be edited. Removing a model and saving its configuration, deleting a service, or changing its API address automatically removes obsolete prices. Historical requests retain their own price snapshots and original reported charges.

Set **1 USD = CNY → Save exchange rate** to choose a local display reference (default 7, not a live quote). USD fees are converted and combined with CNY fees for display; changing this rate updates historical CNY display values without changing original charges. Hover a cost for its original currency and Reported/Estimated source. Reported costs come from the API; estimates use the price saved when the request started. The platform statement remains authoritative.

Viewing Usage works offline and does not call a model. Local logs are in **Data/Research/Usage**, prices and exchange rate in **Config/ai-pricing.json**. Logs contain no keys or conversation bodies; model/chat deletion does not erase history. Only recorded LanCarbon calls are included, without backfilling older chats or other apps.

### Token 用量与费用

打开 **Research → Usage**，默认查看 **Today**；可选 **Last 7 days**、**Last 30 days**，或自选 **From / To** 日期。来源、模型和用途筛选作用于整个区间。紧凑概览只显示 **Requests**、总 **Tokens** 和 **Costs**，标题与数字在同一行。请求按最新在前排列，每页十条；翻页不影响汇总和活动热力图。

**Token activity → Hourly** 展示指定本地日期的 24 小时；**Daily** 每天一格，按周排列并标记月份，跨年区间可切换年份。颜色越深表示 Token 越多；悬浮或键盘聚焦格子可查看时间／日期、总 Token 和人民币费用。缺失用量或费用仍为未知，不当作零。

在 **Model prices** 选择已配置模型，保存每百万 Token 的输入／输出单价及原始币种。缓存价格留空按输入价；经平台确认的免费模型可填零。已保存价格可编辑。删除模型并保存配置、删除服务或更改 API 地址时，自动清理对应的旧价格；历史请求保留当时单价及平台返回的原币费用，不受清理影响。

通过 **1 USD = CNY → Save exchange rate** 设置本地换算参考值（默认 7，不是实时汇率）。美元费用折算后与人民币费用合计显示；修改汇率会更新历史记录的人民币显示值，但不改变原币费用。悬浮费用可查看原币金额以及 Reported／Estimated 来源。Reported 来自接口，Estimated 按请求开始时的单价估算，最终以平台账单为准。

查看 Usage 支持离线，不额外调用模型。日志位于 **Data/Research/Usage**，单价和汇率位于 **Config/ai-pricing.json**。日志不包含密钥或对话正文；删除模型或聊天不删除历史。仅统计 LanCarbon 已记录的调用，不补算旧聊天或其他软件消耗。

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

2.2.3 加入紧凑用量概览、活动热力图、人民币费用合计和价格自动清理；AI Settings 与 Chat：配置 SiliconFlow、OpenRouter 或兼容 OpenAI 的 Others 服务，保存加密密钥及聊天模型，然后进行流式对话、停止、重试与会话恢复。连接跟随电脑网络。PDF/EPUB 阅读和文献任务留待后续阶段，Notes、Books 和 Library 文件不会自动附加到 AI 请求。

**重要发布修复：** LanCarbon 现在会在同步官方教程内容时保留系统教程的 GitHub 仓库绑定。旧版本可能出现界面显示仓库已经连接，但发布后台已经丢失连接，导致 Publish 无法继续的问题。如果旧版本已经清除了绑定，请在升级后重新连接一次现有仓库；此后的教程同步会保留该连接。

LanCarbon 现已在软件界面、安装包、仓库 ReadMe、系统内置教程以及生成 Book 网站的默认 favicon 中统一使用新版 Logo。

**资源提示修复：** 图片或附件重名时改用软件内选择对话框，关闭后恢复焦点，以处理重复资源提示后鼠标消失的问题。

**AI 功能修正：** 跨模型历史标注来源并明确当前模型身份；可编辑共用回答规范默认要求专业表达、不使用 emoji。聊天顶部直接显示会话标题；密钥提供掩码与直接删除入口；输出开始前的临时限流或服务错误最多进行两次可取消重试。已有密钥、会话和个人写作保留，持续的上游限流仍需平台恢复。

### AI Settings 与 Chat

1. 打开 **Research → AI Settings**，选择 **SiliconFlow**、**OpenRouter** 或 **Others**。前两项预填 API 地址；Others 支持兼容 OpenAI Chat Completions 的服务，也可添加多个命名配置。
2. 填入服务的 **API Key** 后点击 **Refresh models**，或填写准确的 **Model ID** 与 **Display name**，点击 **Add model → Save models**，并选择 **Default model**。通过平台目录确认当前模型 ID 与账号调用权限。
3. 已保存密钥显示 **Configured**，仅展示前四位和后四位，中间隐藏。密钥输入栏留空保留原密钥，填写新密钥并保存可替换。**Remove saved key** 经确认后仅清除本地保存的密钥，保留模型配置与会话；需要撤销平台上的密钥时另到平台操作。
4. 展开 **Response guidelines · all chat models**，编辑共用的 **System prompt**，点击 **Save guidelines** 保存。**Restore default guidelines** 填入默认内容，保存后生效。默认要求专业准确、冷静中立、简洁高效，不使用 emoji 或装饰性表达，区分事实、解释与不确定性。规范用于各服务后续回复，不改写旧记录，也不保证不同模型质量相同。
5. **Test model** 保存配置并发送小型请求，运行期间可以 **Stop test**。连接跟随电脑网络与系统代理，可能产生平台正常费用。
6. 在 **Chat** 中选择 **服务 · 模型** 并发送文字。**Enter** 发送，**Shift+Enter** 换行。使用 **Stop generating**、**Retry reply** 与 **Copy**；支持 Markdown、代码和公式，提供的推理文字单独折叠。顶部直接显示会话标题。
7. **New chat**、**Rename chat** 和 **Delete chat** 管理本地会话。切换模型保留相关上下文，但其他模型的旧回答会标注来源，作为参考资料传递。当前模型按自己的配置 ID 回答身份问题，并独立分析新问题。回答相似不能单独证明调用了哪个模型，应查看回复记录的服务和模型；切换模型后重复同一问题时，不向新模型发送其他模型对这道题的旧答案，旧记录仍保留在本地；需要完全独立的上下文时另建会话。

SiliconFlow 地址为 \`https://api.siliconflow.cn/v1\`，OpenRouter 地址为 \`https://openrouter.ai/api/v1\`。通过 **Refresh models** 或平台目录获取当前准确 ID；账号可用时可以手动添加 OpenRouter 模型 \`meta-llama/llama-4-maverick\`。

密钥仍使用当前 Windows 账户加密，保存在 **Config/ai-settings.json**，界面只接收掩码。迁移 Windows 账户后可能需要重填；备份时保留完整 LanCarbon 文件夹（包括 Config、Cache 和 Library），另选的数据目录也需同时备份。会话位于 **Data/Research/Chats/chats.json**；切到 Notes 或 Books 后生成继续，关闭软件会停止生成并保存已有回复。Chat 提交会话文字与回答规范，Notes、Books 和 Library 文件不会自动附加。PDF/EPUB 阅读、检索与文献工作流仍留待后续阶段。

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
