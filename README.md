<p align="center"><img src="build/icon.png" alt="LanCarbon" width="180"></p>
<h1 align="center">LanCarbon</h1>
<p align="center">An offline desktop application for writing Notes, creating structured Books, building Jupyter Book websites, and publishing them to GitHub Pages.</p>
<p align="center"><a href="https://github.com/Hao-jieDai/LanCarbon/releases/latest"><strong>Download the latest release</strong></a> · <a href="#english">English</a> · <a href="#中文">中文</a></p>

![The LanCarbon writing workspace](resources/starter-content/assets/32a3e216430183b9d8a8b7f239b26b4b0fb164fff5b42f399d119d880c23eb77.png)

<a id="english"></a>

## English

### What is LanCarbon?

LanCarbon is a Windows desktop application for writing ordinary Markdown Notes and organizing longer work as Books with Sections and Child Pages. It keeps writing and managed resources on your computer. An account is not required for ordinary writing, and LanCarbon sends content only when you explicitly use Publish or make AI requests.

Version 2.2.3 adds compact usage cards, hourly/daily activity heatmaps, editable CNY conversion and automatic price cleanup that preserves historical costs. AI Settings and Chat support SiliconFlow, OpenRouter and named Others configurations, system-network connections, encrypted API keys, model selection, streaming, cancellation, retry and locally saved conversations. PDF/EPUB reading and literature automation remain reserved. A new installation includes a pinned **ReadMe** Note and the complete bilingual **LanCarbon: From 0 to 1** tutorial Book. This system-managed tutorial is synchronized from the installed release on every upgrade; users should not edit it because changes are overwritten without a backup.

**Important publishing fix:** LanCarbon now preserves the system tutorial's GitHub repository binding when synchronizing official tutorial content. Earlier builds could show the repository as connected in the interface while the publishing backend had already lost that connection, preventing Publish from continuing. If an earlier build has already removed the binding, reconnect the existing repository once after upgrading; subsequent tutorial synchronization will retain it.

**Resource-dialog fix:** Duplicate images and attachments now use an in-app choice dialog instead of a Windows message box, restoring focus after closing to address the reported disappearing mouse after duplicate-resource warnings.

### Main features

- Offline Markdown Notes with search, tags, pinning and autosave. **Sort by** orders Notes and the Book selector by **Last modified**, **Date created** (newest first) or **Name (A–Z)**; pinned Notes stay first and the two workspaces remember their choices independently. A Book's last-modified time includes edits to its pages.
- Structured Books with Sections, Child Pages, page properties and Book settings. Click a page's triangle to expand or collapse its children; folds are saved separately for each Book. Navigating to a page or creating a child reveals its ancestors. Sorting the Book selector never reorders the Book's contents or exports.
- **Notes / Books** workspace tabs with an embedded **Q** hint in the Books tab and a **Ctrl+Q** hover tooltip, preserving your selected Note or Book page when switching. The shortcut is inactive while a dialog is open; Jupyter Book 2 remains the Build tool's name.
- CodeMirror editing, an expanded Math symbol panel, MyST-aware formatting tools and an offline Preview with **Ctrl+E** view switching.
- Images, attachments, reusable Resources, BibTeX libraries and citations.
- Optional export of a separate Jupyter Book source copy.
- Export the current Note or Markdown Book page as an A4 PDF with its title, text, math, managed images, tables and page numbers. Only the selected page is included, not its children or the entire Book.
- Managed local website builds with preflight checks and restart recovery.
- GitHub repository connection, GitHub Pages publishing and later website updates.
- Environment Setup with managed, independently repairable tools and folder-permission recovery under the LanCarbon root.
- Light and Dark themes with the LanCarbon visual style.

**AI refinements:** Cross-model history now carries source attribution and current-model identity instructions; shared editable response guidelines request professional replies without emoji. Chat uses its conversation title, saved keys have masked previews and a direct removal action, and transient rate-limit/server errors receive at most two cancellable retries before any output. Existing keys, chats and personal writing are retained. Persistent upstream limits still require the provider to recover.

### AI Settings and Chat

1. Open **Research → AI Settings** and choose **SiliconFlow**, **OpenRouter** or **Others**. Presets supply their base addresses. Others supports OpenAI-compatible Chat Completions services and additional named configurations.
2. Paste the service's **API Key** and select **Refresh models**, or enter an exact **Model ID** and **Display name**, then **Add model → Save models**. Choose a **Default model**. Use the platform catalogue for current model IDs and account permissions.
3. Saved keys appear as **Configured**, showing their first four and last four characters with the middle hidden. Leave the key input blank to retain it, or enter a replacement and save. **Remove saved key** asks for confirmation and removes only the local key, preserving models and chats. Revoke the key separately at the service when required.
4. Expand **Response guidelines · all chat models** to edit the shared **System prompt**, then select **Save guidelines**. **Restore default guidelines** fills the default; save to apply it. Defaults request professional, accurate, calm, neutral and concise responses, without emoji or decorative language, and distinguish facts from interpretation and uncertainty. These instructions apply to future replies across all services; they do not rewrite history or guarantee identical model quality.
5. **Test model** saves the connection and makes a small request. **Stop test** cancels a running test. Connections follow the computer's network and system proxy; normal service charges apply.
6. In **Chat**, select **service · model** and send text. **Enter** sends; **Shift+Enter** inserts a line break. Use **Stop generating**, **Retry reply** and **Copy**. Markdown, code and mathematics are rendered; provided reasoning is folded separately. The heading shows the actual conversation title.
7. Use **New chat**, **Rename chat** and **Delete chat** to manage local conversations. Switching models retains relevant context, but earlier replies from other models are explicitly attributed reference material. The current model is asked to answer independently, using its configured model ID for identity questions. Similar answers alone do not establish which model was used; check each reply's recorded service/model. When the same question is repeated after switching models, earlier answers to that exact question from other models are omitted from the request and retained locally. For a comparison without any prior context, start a separate chat.

SiliconFlow uses base address `https://api.siliconflow.cn/v1`; OpenRouter uses `https://openrouter.ai/api/v1`. Use **Refresh models** or your platform's catalogue for current IDs. The OpenRouter model `meta-llama/llama-4-maverick` can be added manually when available to your account.

Keys remain encrypted for the current Windows account in **Config/ai-settings.json**; only masked previews reach the interface. Moving to another Windows account may require re-entry. Back up the complete LanCarbon home folder, including Config, Cache and Library, together with any separately selected Data location. Conversations are local in **Data/Research/Chats/chats.json**. Switching to Notes or Books lets generation continue; closing LanCarbon stops it and preserves partial replies. Chat submits your conversation text and response guidelines; Notes, Books and Library files are not automatically attached. PDF/EPUB reading, retrieval and literature workflows remain reserved.

### Token usage and costs

Open **Research → Usage**. The default is **Today**; choose **Last 7 days**, **Last 30 days**, or custom **From / To** dates. Source, model and purpose filters apply to the entire range. The compact overview shows **Requests**, total **Tokens** and **Costs**, with each title and value on one line. Requests are newest first, ten per page; pagination does not change totals or activity.

**Token activity → Hourly** shows 24 hours for a selected local date. **Daily** shows one cell per date, arranged by week with month labels; use the year control for a range spanning multiple years. Darker cells mean more tokens. Hover or focus a cell for its time/date, tokens and CNY cost. Missing usage or fees remain unknown rather than zero.

In **Model prices**, choose a configured model and save its input/output rates per million tokens and original currency. Optional cache rates use the input rate when blank; enter zero for a verified free model. Saved prices can be edited. Removing a model and saving its configuration, deleting a service, or changing its API address automatically removes obsolete prices. Historical requests retain their own price snapshots and original reported charges.

Set **1 USD = CNY → Save exchange rate** to choose a local display reference (default 7, not a live quote). USD fees are converted and combined with CNY fees for display; changing this rate updates historical CNY display values without changing original charges. Hover a cost for its original currency and Reported/Estimated source. Reported costs come from the API; estimates use the price saved when the request started. The platform statement remains authoritative.

Viewing Usage works offline and does not call a model. Local logs are in **Data/Research/Usage**, prices and exchange rate in **Config/ai-pricing.json**. Logs contain no keys or conversation bodies; model/chat deletion does not erase history. Only recorded LanCarbon calls are included, without backfilling older chats or other apps.

### Workspaces and recovery

The four workspace buttons form a 2×2 grid: **Notes / Books** above **Research / Library**. Each retains its selection when switching and restarting. Research contains **Run**, **Templates**, **Outputs**, **Chat** and **AI Settings**; pages labeled **Coming soon** have no active AI or literature actions yet. Library uses a compact file list. Selecting a file keeps its references in a fixed panel above the independently scrolling list; **Save a copy** sits beside its filename. Select a reference to open its Note or Book page and highlight the cited line, or open the corresponding Book settings/Citations panel. **Folder** reveals the actual file and **Rename** changes its display and saved-copy name while retaining IDs, extensions and existing writing. Built-in tutorial resources cannot be renamed; **Open Library folder** opens the originals folder. Existing resources retain their IDs, locations and Markdown links.

**Ctrl+Q** switches Notes and Books; from Research or Library it returns to the most recently used writing workspace. **Ctrl+N** and **Ctrl+E** operate only in Notes and Books.

Managed writing resources are stored in root **Library/assets**. Existing Data/assets is copied and verified before retirement; file IDs, bytes, catalog records and writing links are retained. Newly attached, pasted or dropped files use Library/assets. The resource catalog **assets.json** remains in the active Data folder. Original files have a dedicated root **Library/Imports** and **Library/AI-Paper**. Management data lives under the active **Data/Library**; templates, drafts, records and chats have separate folders under **Data/Research**. Moving Data includes these management folders and assets.json; root Library and its resource files stay with the installation. Notes and Books retain Workspace v2, and unsupported workspace versions are blocked without modifying their files.

Before upgrading, close LanCarbon and back up the complete LanCarbon home folder and any separately selected Data location. Include Cache because its encryption state is needed to read previously saved API keys. Keep the stable installer alongside the backup. Reinstalling an older application may also require restoring matching data. A restored snapshot returns to the backup date; retain later edits separately. Developers can use the verified snapshot commands below. Restore accepts a new empty folder, verifies all files before copying and adjusts saved managed paths to that folder.

```powershell
node scripts/workspace-recovery.cjs backup --root "D:\LanCarbon" --destination "D:\Backups\LanCarbon-snapshot" --installer "release/LanCarbon-2.2.3-x64-Setup.exe"
node scripts/workspace-recovery.cjs verify --backup "D:\Backups\LanCarbon-snapshot"
node scripts/workspace-recovery.cjs restore --backup "D:\Backups\LanCarbon-snapshot" --target "D:\Recovered\LanCarbon"
```

### Export a page as PDF

Select **Export PDF** in the page header from Edit or Preview, choose a filename and destination (default: the page title), and save. The default PDF destination is the **PDFs** folder beside Exports under the LanCarbon root. Installation or startup creates it automatically; you can still choose another destination. Exports remains for Book source copies, and existing PDFs are not moved. Export saves the latest edits first and needs no optional tools. It uses a white reading layout without editor controls or line numbers. Book home pages, Sections and Child Pages are exported individually. Links to omitted Book pages and attachments remain readable labels, not embedded content. Preview limitations also apply to PDF; check export notices and inspect the result. Existing PDFs require overwrite confirmation; canceling or a failed export leaves the previous file intact. The sidebar **Export** still creates the entire Book source copy.

### Download and install

Open [Releases](https://github.com/Hao-jieDai/LanCarbon/releases) and download `LanCarbon-2.2.3-x64-Setup.exe`. Ordinary users should download the installer, rather than GitHub's automatically generated source-code archives.

The installer supports 64-bit Windows. Its default root is `D:\LanCarbon`. You may choose another location, but a first-install destination must be an empty folder named `LanCarbon`. The installer creates:

```text
LanCarbon/
├─ Application/   Program files
├─ Data/          Notes, Books and resource records
├─ Config/        Application and Book preferences
├─ Cache/         Re-creatable runtime cache
├─ Temp/          Temporary build and publishing files
├─ Builds/        Saved local websites
├─ Exports/       Default starting location for Book source-copy Export
├─ PDFs/          Default destination for page PDFs
├─ Library/      assets: writing resources; Imports / AI-Paper: source materials / 原始资料
└─ Tools/         Optional tools managed by Environment Setup
```

If the computer has no D drive, the installer uses a `LanCarbon` folder in the current Windows user's directory. Windows itself may still use system folders briefly for installer extraction, shortcuts, registry records and operating-system caches.

### Additional tools

Basic writing, Preview, PDF export and source-copy Export work inside LanCarbon. Additional tools are required only for the corresponding workflow:

- **Build:** Python 3, Node.js and Jupyter Book 2.
- **Publish:** Git, GitHub CLI, a GitHub account and network access to GitHub.

LanCarbon checks these requirements in **Environment Setup**, introduced by the first-run ReadMe and available from the sidebar and from the Build and Publish panels. Compatible system installations are marked **Using existing** and do not show an install action. Missing or incompatible tools can be installed as private managed copies under `LanCarbon/Tools`; installing Jupyter Book also prepares missing managed Python and Node.js dependencies. The Python action uses a portable archive and never changes a registered system Python. Downloads show live byte and percentage progress, are verified before deployment, and can be canceled with partial files removed. Windows file-lock failures are retried with increasing waits. Environment Setup checks whether `Tools` is writable and offers **Repair folder permissions**—with a Windows approval prompt when elevation is required—if its access rules block managed installation. Failed downloads or repairs do not affect Notes, Books or tools already installed successfully. The system-managed tutorial retains its GitHub publishing connection when official tutorial content is refreshed, so its connected repository remains available for later updates.

If GitHub cannot be reached, enable the proxy application's system proxy or TUN mode and retry. The bundled *LanCarbon: From 0 to 1* Book explains managed and manual installation, writing, Build, GitHub sign-in, publication and common errors.

### Privacy and local data

LanCarbon stores the active workspace in the selected `Data` folder. It does not require a LanCarbon account or synchronize Notes automatically. Back up the whole LanCarbon root before moving to another computer or making major system changes.

### Development

Development requires Node.js 22.12 or newer. Jupyter Book 2 is also required for the complete build and end-to-end test suite.

```bash
npm install
npm run dev
```

Development defaults to `.dev-workspace/LanCarbon` inside this checkout. Set `LANCARBON_ROOT` only when deliberately choosing another isolated root.

Installed-workspace verification accepts an optional report directory: `node scripts/verify-acceptance-workspace.cjs ROOT BACKUP VERSION REPORT_DIRECTORY`. Choose a report folder inside the checkout when verifying a daily installation.

开发启动默认使用当前项目中的 `.dev-workspace/LanCarbon`，与日常安装隔离；仅在明确指定另一处独立目录时设置 `LANCARBON_ROOT`。

已安装工作区验证可通过 `node scripts/verify-acceptance-workspace.cjs ROOT BACKUP VERSION REPORT_DIRECTORY` 指定报告目录。验证日常安装时，请将报告保存到项目内的独立目录。

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dist
```

The Windows installer is written to `release/`. Generated dependencies, builds, installers, caches and test output are excluded from Git.

### Support

Use [GitHub Issues](https://github.com/Hao-jieDai/LanCarbon/issues) to report reproducible problems or suggest improvements. Do not include passwords, GitHub tokens, private Book content or personal data in an issue.

---

<a id="中文"></a>

## 中文

### LanCarbon 是什么？

LanCarbon 是一款 Windows 桌面写作软件，既可以撰写普通 Markdown Notes，也可以通过 Sections 和 Child Pages 组织较长的 Books。正文和受管理资源保存在你的电脑上。普通写作不需要账号，只有在你明确使用 Publish 时，LanCarbon 才会上传内容。

2.2.3 调整用量界面，加入小时／每日热力图、可编辑汇率的人民币费用合计，以及保留历史费用的价格自动清理。AI Settings 与 Chat 支持 SiliconFlow、OpenRouter 和命名 Others 配置、系统网络连接、加密 API Key、模型选择、流式回复、停止、重试和本地会话保存。PDF/EPUB 阅读与文献自动化仍留待后续阶段。全新安装会自带一篇置顶的 **ReadMe** 笔记，以及完整的中英文双语教程 Book **LanCarbon: From 0 to 1**。这本系统管理教程会在每次软件升级时同步为当前安装版本；用户不应编辑，因为修改会被覆盖且不会创建备份。

**重要发布修复：** LanCarbon 现在会在同步官方教程内容时保留系统教程的 GitHub 仓库绑定。旧版本可能出现界面显示仓库已经连接，但发布后台已经丢失连接，导致 Publish 无法继续的问题。如果旧版本已经清除了绑定，请在升级后重新连接一次现有仓库；此后的教程同步会保留该连接。

**资源提示修复：** 图片或附件重名时改用软件内选择对话框，关闭后恢复焦点，以处理重复资源提示后鼠标消失的问题。

### 主要功能

- 支持搜索、标签、置顶和自动保存的离线 Markdown Notes。通过 **Sort by** 将 Notes 列表或 Book 下拉框按 **Last modified**（修改时间）、**Date created**（创建时间，时间均为最新在前）或 **Name (A–Z)**（名称）排序；置顶 Notes 始终优先，两个工作区分别记住排序选择。Book 修改时间也会计入其页面正文的修改。
- 使用 Sections、Child Pages、Page Properties 和 Book Settings 组织 Books。点击页面前的三角形展开或折叠子页面，每本 Book 分别保存折叠状态；跳转到页面或新建子页面时会自动展开上级目录。Book 下拉框的排序不会改变 Book 内部目录和导出顺序。
- 工作区统一显示为 **Notes / Books**，Books 按钮内部右侧显示 **Q** 提示，悬停可查看 **Ctrl+Q** 快捷键；切换时保留原来选中的 Note 或 Book 页面，对话框打开时不触发快捷键。Build 工具名称仍为 Jupyter Book 2。
- CodeMirror 编辑器、扩充后的 Math 符号面板、MyST 格式工具，以及支持 **Ctrl+E** 切换的离线 Preview。
- 图片、附件、可重复使用的 Resources、BibTeX 文献库和 Citations。
- 按需导出独立的 Jupyter Book 源文件副本。
- 将当前 Note 或 Markdown Book 页面导出为 A4 PDF，保留标题、文字、公式、受管理图片、表格和页码；只包含当前页面，不包含子页面或整本 Book。
- 带预检和重启恢复的本地网站 Build。
- 连接 GitHub 仓库、发布到 GitHub Pages，并在以后更新网站。
- Environment Setup 可在 LanCarbon 根目录中独立安装和修复所需工具，并恢复 Tools 文件夹权限。
- 具有 LanCarbon 视觉风格的 Light 和 Dark 主题。

**AI 功能修正：** 跨模型历史标注来源并明确当前模型身份；可编辑共用回答规范默认要求专业表达、不使用 emoji。聊天顶部直接显示会话标题；密钥提供掩码与直接删除入口；输出开始前的临时限流或服务错误最多进行两次可取消重试。已有密钥、会话和个人写作保留，持续的上游限流仍需平台恢复。

### AI Settings 与 Chat

1. 打开 **Research → AI Settings**，选择 **SiliconFlow**、**OpenRouter** 或 **Others**。前两项预填 API 地址；Others 支持兼容 OpenAI Chat Completions 的服务，也可添加多个命名配置。
2. 填入服务的 **API Key** 后点击 **Refresh models**，或填写准确的 **Model ID** 与 **Display name**，点击 **Add model → Save models**，并选择 **Default model**。通过平台目录确认当前模型 ID 与账号调用权限。
3. 已保存密钥显示 **Configured**，仅展示前四位和后四位，中间隐藏。密钥输入栏留空保留原密钥，填写新密钥并保存可替换。**Remove saved key** 经确认后仅清除本地保存的密钥，保留模型配置与会话；需要撤销平台上的密钥时另到平台操作。
4. 展开 **Response guidelines · all chat models**，编辑共用的 **System prompt**，点击 **Save guidelines** 保存。**Restore default guidelines** 填入默认内容，保存后生效。默认要求专业准确、冷静中立、简洁高效，不使用 emoji 或装饰性表达，区分事实、解释与不确定性。规范用于各服务后续回复，不改写旧记录，也不保证不同模型质量相同。
5. **Test model** 保存配置并发送小型请求，运行期间可以 **Stop test**。连接跟随电脑网络与系统代理，可能产生平台正常费用。
6. 在 **Chat** 中选择 **服务 · 模型** 并发送文字。**Enter** 发送，**Shift+Enter** 换行。使用 **Stop generating**、**Retry reply** 与 **Copy**；支持 Markdown、代码和公式，提供的推理文字单独折叠。顶部直接显示会话标题。
7. **New chat**、**Rename chat** 和 **Delete chat** 管理本地会话。切换模型保留相关上下文，但其他模型的旧回答会标注来源，作为参考资料传递。当前模型按自己的配置 ID 回答身份问题，并独立分析新问题。回答相似不能单独证明调用了哪个模型，应查看回复记录的服务和模型；切换模型后重复同一问题时，不向新模型发送其他模型对这道题的旧答案，旧记录仍保留在本地；需要完全独立的上下文时另建会话。

SiliconFlow 地址为 `https://api.siliconflow.cn/v1`，OpenRouter 地址为 `https://openrouter.ai/api/v1`。通过 **Refresh models** 或平台目录获取当前准确 ID；账号可用时可以手动添加 OpenRouter 模型 `meta-llama/llama-4-maverick`。

密钥仍使用当前 Windows 账户加密，保存在 **Config/ai-settings.json**，界面只接收掩码。迁移 Windows 账户后可能需要重填；备份时保留完整 LanCarbon 文件夹（包括 Config、Cache 和 Library），另选的数据目录也需同时备份。会话位于 **Data/Research/Chats/chats.json**；切到 Notes 或 Books 后生成继续，关闭软件会停止生成并保存已有回复。Chat 提交会话文字与回答规范，Notes、Books 和 Library 文件不会自动附加。PDF/EPUB 阅读、检索与文献工作流仍留待后续阶段。

### Token 用量与费用

打开 **Research → Usage**，默认查看 **Today**；可选 **Last 7 days**、**Last 30 days**，或自选 **From / To** 日期。来源、模型和用途筛选作用于整个区间。紧凑概览只显示 **Requests**、总 **Tokens** 和 **Costs**，标题与数字在同一行。请求按最新在前排列，每页十条；翻页不影响汇总和活动热力图。

**Token activity → Hourly** 展示指定本地日期的 24 小时；**Daily** 每天一格，按周排列并标记月份，跨年区间可切换年份。颜色越深表示 Token 越多；悬浮或键盘聚焦格子可查看时间／日期、总 Token 和人民币费用。缺失用量或费用仍为未知，不当作零。

在 **Model prices** 选择已配置模型，保存每百万 Token 的输入／输出单价及原始币种。缓存价格留空按输入价；经平台确认的免费模型可填零。已保存价格可编辑。删除模型并保存配置、删除服务或更改 API 地址时，自动清理对应的旧价格；历史请求保留当时单价及平台返回的原币费用，不受清理影响。

通过 **1 USD = CNY → Save exchange rate** 设置本地换算参考值（默认 7，不是实时汇率）。美元费用折算后与人民币费用合计显示；修改汇率会更新历史记录的人民币显示值，但不改变原币费用。悬浮费用可查看原币金额以及 Reported／Estimated 来源。Reported 来自接口，Estimated 按请求开始时的单价估算，最终以平台账单为准。

查看 Usage 支持离线，不额外调用模型。日志位于 **Data/Research/Usage**，单价和汇率位于 **Config/ai-pricing.json**。日志不包含密钥或对话正文；删除模型或聊天不删除历史。仅统计 LanCarbon 已记录的调用，不补算旧聊天或其他软件消耗。

### 工作区与恢复

四个工作区入口按 2×2 排列：上行为 **Notes / Books**，下行为 **Research / Library**，切换和重启后保留各自选择。Research 包含 **Run**、**Templates**、**Outputs**、**Chat** 和 **AI Settings**；标记为 **Coming soon** 的页面尚未启用 AI 或文献处理。Library 使用紧凑列表，选择文件后引用面板固定在独立滚动列表上方，**Save a copy** 位于文件名旁。点击引用可打开对应 Note 或 Book 页面并选中引用行，或进入对应 Book Settings/Citations。**Folder** 定位实际文件，**Rename** 修改显示与副本保存名称，保留 ID、扩展名和原有正文；系统教程资源不提供重命名；**Open Library folder** 打开原始资料文件夹。旧资源保留原有 ID、位置和 Markdown 引用。

**Ctrl+Q** 在 Notes 与 Books 之间切换；在 Research 或 Library 中按下时返回最近使用的写作工作区。**Ctrl+N** 与 **Ctrl+E** 仅在 Notes 和 Books 中生效。

受管理写作资源统一保存在根目录 **Library/assets**；旧 Data/assets 先复制校验再迁出，保留文件 ID、字节、管理记录及正文链接。新附件、粘贴图片和拖入文件也使用 Library/assets。资源目录记录 **assets.json** 继续保存在实际 Data 中。原始文件目录为根目录下的 **Library/Imports** 和 **Library/AI-Paper**；管理数据位于实际数据目录中的 **Data/Library**。模板、生成稿、记录和聊天分别位于 **Data/Research** 下。更换 Data 位置会一并复制这些管理目录和 assets.json，根目录 Library 及其原始资源仍随安装位置保存。Notes 和 Books 沿用 Workspace v2，不支持的数据版本会停止加载，保留原文件。

升级前请关闭 LanCarbon，备份实际数据位置、Config、Library，以及需要保留的 Builds、Exports 和 PDFs，并保存稳定版安装包。恢复旧程序时可能还需要恢复匹配的数据；恢复快照会回到备份时的状态，后续新增编辑应另行保留。开发者可使用英文对应章节的备份、校验和恢复命令。恢复只接受新的空目录，复制前验证全部文件，并将受管理路径调整为恢复目录。

### 导出页面为 PDF

在 Edit 或 Preview 中点击页面顶部的 **Export PDF**，选择文件名和保存位置（默认为页面标题），然后保存。PDF 默认保存位置为 LanCarbon 根目录下与 Exports 同级的 **PDFs** 文件夹，安装或启动时会自动创建；仍可自行选择其他保存位置。Exports 继续用于 Book 源文件副本，已有 PDF 不会自动搬移。导出前会先保存最新修改，不需要额外工具。PDF 使用白底阅读排版，不包含编辑工具栏和行号。Book 首页、Section 和 Child Page 均可单独导出。指向未导出 Book 页面的链接和附件保留为可读文字，不会嵌入目标内容。Preview 的支持范围同样适用于 PDF，请检查导出后的注意事项和生成结果。覆盖已有 PDF 需要确认；取消或导出失败不会破坏原有文件。侧边栏的 **Export** 仍用于导出整本 Book 的源文件副本。

### 下载与安装

打开 [Releases](https://github.com/Hao-jieDai/LanCarbon/releases)，下载 `LanCarbon-2.2.3-x64-Setup.exe`。普通用户应下载安装程序，不要下载 GitHub 自动生成的 Source code 压缩包。

安装程序支持 64 位 Windows，默认根目录为 `D:\LanCarbon`。你也可以选择其他位置，但首次安装的目标必须是一个名为 `LanCarbon` 的空文件夹。安装后自动建立：

```text
LanCarbon/
├─ Application/   程序文件
├─ Data/          Notes、Books 和资源管理记录
├─ Config/        软件与 Book 设置
├─ Cache/         可以重新生成的运行缓存
├─ Temp/          构建和发布临时文件
├─ Builds/        保存的本地网站
├─ Exports/       Book 源文件副本 Export 默认起始位置
├─ PDFs/          页面 PDF 默认保存位置
├─ Library/      assets: writing resources; Imports / AI-Paper: source materials / 原始资料
└─ Tools/         Environment Setup 管理的可选工具
```

如果电脑没有 D 盘，安装器会使用当前 Windows 用户目录中的 `LanCarbon` 文件夹。Windows 仍可能短暂使用系统目录完成安装器解压、快捷方式、注册信息和操作系统缓存。

### 额外工具

普通写作、Preview、PDF 导出和源文件副本 Export 可以直接在 LanCarbon 中完成。只有相应流程需要以下工具：

- **Build：** Python 3、Node.js 和 Jupyter Book 2。
- **Publish：** Git、GitHub CLI、GitHub 账号，以及能够访问 GitHub 的网络。

LanCarbon 会在统一的 **Environment Setup** 中检查这些条件；首次启动的 ReadMe 会介绍该页面，可以从侧边栏、Build 和 Publish 面板进入。系统中已有的兼容工具只显示 **Using existing**，不再提供安装操作；缺失或不兼容的工具可作为私有副本安装到 `LanCarbon/Tools`，安装 Jupyter Book 时也会自动准备缺失的受管理 Python 和 Node.js。Python 使用便携压缩包，不会修改已注册的系统 Python。下载过程显示实时字节数和百分比，校验、部署与复检阶段均清楚可见，取消后会清理未完成文件。Windows 文件占用错误会按逐渐增长的等待时间自动重试；Environment Setup 还会检查 `Tools` 是否可写，并在权限阻止安装时提供 **Repair folder permissions**，需要管理员权限时显示 Windows 确认窗口。下载或修复失败不会影响 Notes、Books 或此前成功安装的工具。系统管理教程在刷新官方内容时会保留 GitHub 发布连接，因此已经连接的仓库仍可用于后续更新。

如果无法访问 GitHub，请先开启代理软件的系统代理或 TUN 模式再重试。内置的 *LanCarbon: From 0 to 1* 教程详细讲解受管理安装、手动安装、写作、本地 Build、GitHub 登录、发布和常见错误。

### 隐私与本地数据

LanCarbon 将当前工作区保存在选定的 `Data` 文件夹中。它不要求注册 LanCarbon 账号，也不会自动同步 Notes。迁移到其他电脑或进行较大的系统修改前，请备份整个 LanCarbon 根目录。

### 开发

开发需要 Node.js 22.12 或更高版本。运行完整构建和端到端测试还需要 Jupyter Book 2。

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dist
```

Windows 安装包输出到 `release/`。依赖、构建结果、安装包、缓存和测试输出均不会进入 Git 仓库。

### 问题反馈

可以通过 [GitHub Issues](https://github.com/Hao-jieDai/LanCarbon/issues) 报告能够复现的问题或提出改进建议。请勿在 Issue 中公开密码、GitHub Token、私人 Book 内容或个人数据。

## License

LanCarbon is released under the [MIT License](LICENSE).
