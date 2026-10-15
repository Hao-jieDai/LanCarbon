import type { Note, WorkspaceSortOrder } from "./types";
import { compareWorkspaceItems } from "./workspaceSorting";

export const MAX_NOTES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 2_000_000;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const GUIDE_NOTE_ID = "lancarbon-usage-guide";
export const RELEASE_README_ID = "lancarbon-release-readme";
export const RELEASE_VERSION = "2.4.0";

export const RELEASE_README_CONTENT = `# LanCarbon ${RELEASE_VERSION}

Welcome to **LanCarbon**, an offline-first desktop application for writing Notes and creating structured Books that can become local or online websites.

Version 2.4.0 adds offline PDF reading with search, outlines, thumbnails, saved progress and selection translation, plus manually calibrated API balance estimates by source. Notes and Books can open PDF attachments in the same reader. Existing writing, files, versions and AI configuration are preserved; EPUB reading follows separately.

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

Keys remain encrypted for the current Windows account in **Config/ai-settings.json**; only masked previews reach the interface. Moving to another Windows account may require re-entry. Back up the complete LanCarbon home folder, including Config, Cache and Library, together with any separately selected Data location. Conversations are local in **Data/Research/Chats/chats.json**. Switching to Notes or Books lets generation continue; closing LanCarbon stops it and preserves partial replies. Chat submits your conversation text and response guidelines; Notes, Books and Library files are not automatically attached. PDF reading is available in Library; EPUB reading, retrieval and literature workflows follow separately.

### Library imports

1. Open **Library → Imports**, choose a destination folder and use **Import PDF / EPUB** or drop local documents into the main area. Each batch accepts 20 files, 100 MB each. **New folder** creates an Imports subfolder; the sidebar shows the hierarchy. **All files** and filename search show file locations. Source materials remains the managed writing-resource collection.
2. Duplicate checks use exact file contents across Library and its retained versions. Import details shows the incoming filename, existing/current name, location and matching version. Importing a.pdf, renaming it b.pdf, then importing the same a.pdf reuses b.pdf and retains its name. Re-importing an old revision does not roll back the current one. **Locate** opens the existing entry; **Move to…** can move an imported original into the chosen folder.
3. Equal names with different contents receive numbered names in the same folder; the report shows the final name. Different folders can contain equal names. Renaming checks names in the same folder, ignores case and preserves extensions; conflicts show a suggested available name without overwriting or merging. **Move** preserves the document ID, writing links and versions; conflicts require **Keep both as…** or Cancel.
4. **Open** or double-click reads PDFs in LanCarbon; **Open externally** uses the default app. Images, TXT, Word and other ordinary resources use the default app. Executables, scripts and shortcuts are excluded. The app opens a named working copy under **Library/.Editing**; saving that file registers a new current version within a few seconds while LanCarbon runs, or after its next launch. Unchanged saves add no version. **Versions** lists revisions and **Save version** exports an earlier one; old versions remain stored locally. Saving as another file/location requires a separate import. Keep managed hash-named originals intact; use Open for editing.
5. Notes and Books **Attach file** starts in root **Library**. Selecting an imported original reuses it with its current display name and a stable writing reference, without copying its bytes into assets. Later rename/move/version changes keep the reference valid and use the current contents. Removing this linked resource in Resources removes its writing references while the Library original remains in Imports. Ordinary resource deletion still removes its files and versions after confirmation.
6. **Folder** reveals the managed original and **Save a copy** exports outside Library. Importing itself is offline and inserts no writing link. Catalogs and edit-session records live in the active **Data/Library**; originals, retained versions and working copies stay in root **Library**. Moving Data carries the records. Back up both locations, including pending working copies. After using folders, linked attachments or new versions, application rollback needs a matching data snapshot; preserve newer writing separately before restoring it.

### Reading PDFs

Open a PDF from Library with **Open** or a double-click. In a Note or Book, click its attachment in **Preview**, or use **Resources → Read PDF**. **Back** returns to the original writing or Library view. **Open externally** retains default-app editing and file versions; EPUB and other ordinary files still use their default apps.

Use page numbers, previous/next, **Fit width**, **Fit page**, zoom, or **Pages / Contents** for on-demand thumbnails and the document's own outline. **Find in PDF** (Ctrl+F) searches the document with previous/next matches. Reading position and zoom are saved by document ID in **Data/Library/reading.json**, so rename/move and linked writing attachments share progress. The currently open PDF is an immutable reading snapshot; a new externally saved version offers **Reload latest version**.

Enable the existing **Translate** switch (Ctrl+Alt+T), then select short English text in the PDF. Existing translation settings, cache and usage accounting apply. PDFs need a selectable text layer for selection/search; image-only scans remain viewable. Reading is local and does not call AI or change the file. Password-protected files prompt locally without saving the password. PDF scripts and editing are disabled. Annotation creation, OCR and EPUB reading follow separately. The reader loads page data as needed and releases the open snapshot when closed; no PDF parsing or thumbnail disk cache is created.

### Estimated API balances

At the top of **Research → Usage**, each configured source has **Set balance / Update balance**. Enter the platform's full current balance and choose CNY or USD. Saving records the calibration time and cumulative charges. Only subsequent recorded fees are deducted, combining all models, chat, connection tests and translation using that connection. Requests already running at calibration are counted when their fees arrive. Reported charges take priority; otherwise the request's saved price estimate is used. Unknown fees stay unknown.

After a top-up, enter the new full platform balance; this resets the starting point without deleting historical usage. Cards show the estimate and calibration time independently of Usage date filters. Low estimates (approximately CNY 10 or less, including zero/negative) are highlighted. **Stop tracking** removes only that balance checkpoint. Reused translation connections share their original source; dedicated connections have their own entries. Source identities include the API address. Local balance checkpoints live with the usage ledger in **Data/Research/Usage/balances.json**. Other apps' charges or platform credits require manual recalibration; no balance API is called. Cross-currency deductions use the exchange rate saved in Model prices.

### Selection translation

1. Open **Research → Translation Settings**. With **Use an existing AI connection**, select a service and a model already saved in AI Settings. The saved key and model display name are reused; this mode has no model catalogue refresh or editable model fields. To add a dedicated translation service/model, choose **Separate translation connection**, configure SiliconFlow, OpenRouter or Others, then use **Refresh translation models** or enter its exact Model ID and display name. Refresh reads a platform catalogue; account access and pricing still need checking.
2. **Save translation settings**, then **Test translation**. The result beside the buttons shows **Translation test succeeded**, the selected service/model, the fixed English sentence **Climate change affects investment.**, and its Chinese translation. **Stop translation test** cancels a running test. Testing makes a real request even with automatic translation off. The editable **Translation prompt** applies only to translation; model format adaptation is automatic. The default asks for accurate academic Chinese without explanations or emoji. English within this prompt field can also be selected for translation without changing its contents.
3. Translation starts **off** each time LanCarbon opens. Enable the sidebar **Translate** switch or press **Ctrl+Alt+T**. Select an English word, phrase or short passage in Notes/Books **Edit** or **Preview**, Research, Library or selectable interface text. After selection settles, the floating panel shows the selected English and Chinese translation. Drag its header to move it; the position is remembered. Long source and translated text scroll independently inside the compact panel. Close the panel or use the switch/shortcut to disable automatic requests. Passwords, API keys and connection addresses are excluded.
4. Select at most **1,600 characters / 250 words**. Only the selection and translation instructions are sent, without the whole Note, Book or Chat. New selections cancel earlier translation requests. Cancellation cannot undo charges already incurred upstream.
5. Repeated selections with the same saved service/model/prompt reuse local results without another API call. **Saved translations → Clear translation cache** clears only the translation cache, limited to **1,000 results / 5 MB**, stored under **Data/Research/Translation**. Translation and manual tests appear in **Usage → Purpose: Translation**; locally reused results do not add tokens or requests. Configure the translation model's price in **Model prices** when the service does not report costs. Dedicated keys have masked previews and **Remove translation key**; blank key inputs retain the saved key.

### Token usage and costs

Open **Research → Usage**. The default is **Today**; choose **Last 7 days**, **Last 30 days**, or custom **From / To** dates. Source, model and purpose filters apply to the entire range. The compact overview shows **Requests**, total **Tokens** and **Costs**, with each title and value on one line. Requests are newest first, ten per page; pagination does not change totals or activity.

**Token activity** has its own dates, independently of the summary/request filters above. **Hourly** defaults to today and shows 24 square cells centered in three rows of eight (00–07, 08–15, 16–23); choose another day using its calendar. **Daily** defaults to the current full year, with 365/366 cells arranged by week and labeled by month; select a different year independently. Changing From / To or Today / Last 7 days / Last 30 days changes summaries and request records without switching activity mode or dates. Source, model and purpose filters apply to both. From, To and the hourly day use the LanCarbon-themed calendar; dates can also be typed as YYYY-MM-DD. Darker cells mean more tokens. Hover or focus for time/date, tokens and CNY cost; missing data stays unknown.

In **Model prices**, choose a configured model and save its input/output rates per million tokens and original currency. Optional cache rates use the input rate when blank; enter zero for a verified free model. Saved prices can be edited. Removing a model and saving its configuration, deleting a service, or changing its API address automatically removes obsolete prices. Historical requests retain their own price snapshots and original reported charges.

Set **1 USD = CNY → Save exchange rate** to choose a local display reference (default 7, not a live quote). USD fees are converted and combined with CNY fees for display; changing this rate updates historical CNY display values without changing original charges. Hover a cost for its original currency and Reported/Estimated source. Reported costs come from the API; estimates use the price saved when the request started. The platform statement remains authoritative.

Viewing Usage works offline and does not call a model. Local logs are in **Data/Research/Usage**, prices and exchange rate in **Config/ai-pricing.json**. Logs contain no keys or conversation bodies; model/chat deletion does not erase history. Use **Purpose: Translation** for selection translation and its tests; locally reused translations do not create requests. Only recorded LanCarbon calls are included, without backfilling older chats or other apps.

### Library 资料导入

1. 打开 **Library → Imports**，选择目标文件夹后 **Import PDF / EPUB** 或拖入本地文档。每批最多 20 个、每个 100 MB。**New folder** 创建 Imports 子文件夹，左侧显示目录树。**All files** 与文件名搜索显示所属位置；Source materials 仍用于受管理的写作资源。
2. 在整个 Library 及保留版本中按文件字节去重。Import details 显示导入名称、已有文件当前名称、位置和匹配版本。导入 a.pdf、改名 b.pdf 后，再导入相同 a.pdf，会复用 b.pdf 并保留改名。重新导入旧版本不会回退当前版本。**Locate** 定位原条目；**Move to…** 可将导入原件移动到所选文件夹。
3. 同文件夹内同名不同内容自动编号，报告显示最终名称；不同文件夹允许同名。重命名只检查同文件夹名称，忽略大小写并保留扩展名，冲突时提示可用名称，不覆盖或合并。**Move** 保留文档 ID、引用与全部版本；移动重名时明确选择 **Keep both as…** 或取消。
4. **Open** 或双击在 LanCarbon 阅读 PDF，**Open externally** 使用默认程序；图片、TXT、Word 等普通资料使用默认程序，程序、脚本和快捷方式不直接打开。软件打开 **Library/.Editing** 中带名称的编辑副本；保存该文件后，LanCarbon 运行时会在几秒内登记新版本，关闭期间的保存会在下次启动后处理。内容未变不新增版本。**Versions** 查看历史，**Save version** 导出旧版本；历史原件保留在本地。另存其他文件或位置需另行导入。请保持带哈希的受管理原件完整，通过 Open 进行编辑。
5. Notes 和 Books 的 **Attach file** 默认打开根目录 **Library**。选择导入原件时沿用当前显示名与稳定写作引用，不再把原件复制到 assets。之后改名、移动或产生新版本，引用保持有效并读取当前内容。在 Resources 删除此类关联资源时移除写作引用，原件仍在 Imports；普通资源删除仍会在确认后删除文件和历史版本。
6. **Folder** 定位受管理原件，**Save a copy** 将副本导出到 Library 之外。导入本身可离线完成，不自动插入写作链接。目录及编辑会话记录在实际 **Data/Library**，原件、历史版本和编辑副本在根目录 **Library**；更改 Data 携带记录。两处都需备份，包括尚未登记的编辑副本。使用子目录、关联附件或新版本后，回滚程序需要匹配的数据快照；恢复前另行保留新增写作内容。

### PDF 阅读

在 Library 中点击 **Open** 或双击 PDF。在 Note／Book 的 **Preview** 点击 PDF 附件，或通过 **Resources → Read PDF** 打开；**Back** 返回原来的写作或文件列表。**Open externally** 保留默认程序编辑和文件版本功能，EPUB 及其他普通文件继续使用默认程序。

使用页码、前后翻页、**Fit width**、**Fit page**、缩放，以及 **Pages / Contents** 中按需生成的缩略图和原文目录。**Find in PDF**（Ctrl+F）提供全文搜索与前后匹配。阅读位置和缩放按文档 ID 保存在 **Data/Library/reading.json**；改名、移动及写作附件共用进度。正在阅读的内容保持为打开时的版本，外部保存新版后，可选择 **Reload latest version**。

开启现有 **Translate**（Ctrl+Alt+T），选取 PDF 中的短英文即可翻译，沿用翻译配置、缓存和用量统计。选词与搜索需要 PDF 自带文字层；纯扫描件仍可查看。阅读本身离线运行，不调用 AI、不修改原件。加密文件在本地输入密码，密码不保存；禁用 PDF 脚本和编辑。新建批注、OCR 和 EPUB 阅读另行提供。页面按需读取，关闭后释放打开快照，不建立 PDF 解析或缩略图磁盘缓存。

### API 估算余额

在 **Research → Usage** 顶部，已配置来源可通过 **Set balance / Update balance** 填写平台当前的完整余额，并选择 CNY 或 USD。保存时记录校准时间和累计费用，只扣减此后记录到的费用；同一连接下的所有模型、聊天、连接测试和翻译合并计算，校准时尚未结束的请求在费用结算后计入。优先使用接口返回费用，否则采用请求当时保存的价格估算；未知费用保持未知。

充值后重新输入平台新的完整余额，重新设置起点，不清空历史用量。卡片展示估算余额和校准时间，独立于 Usage 日期筛选。折合约人民币 10 元及以下（含零、负值）突出提醒。**Stop tracking** 只移除余额起点。复用翻译连接计入原来源；独立连接单独显示，来源身份包含 API 地址。校准记录与用量账本一起保存在 **Data/Research/Usage/balances.json**；其他软件消费或平台赠额需手动重新校准，不调用平台余额接口。跨币种扣减沿用 Model prices 中的手动汇率。

### 选词翻译

1. 打开 **Research → Translation Settings**。选择 **Use an existing AI connection** 时，仅选择服务与 AI Settings 已保存的模型，密钥和显示名称沿用原配置；该模式不提供目录刷新或模型字段编辑。新增独立的翻译服务／模型时，选择 **Separate translation connection** 配置 SiliconFlow、OpenRouter 或 Others，再 **Refresh translation models** 或手填准确的 Model ID 与显示名称。刷新读取平台目录，可调用权限与价格仍需核对。
2. **Save translation settings → Test translation**。按钮附近的结果明确展示 **Translation test succeeded**、服务／模型、固定原句 **Climate change affects investment.** 与中文译文。**Stop translation test** 取消正在进行的测试；自动翻译关闭时也可手动测试，会产生真实请求。可编辑的 **Translation prompt** 仅用于翻译，所需模型格式自动适配；默认要求准确、专业、只输出简体中文且不用 emoji。提示词输入框中的英文也可选取翻译，原内容不受修改。
3. 每次启动默认**关闭**。点击侧栏 **Translate** 或按 **Ctrl+Alt+T** 开启后，在 Notes／Books 的 **Edit** 或 **Preview**、Research、Library 及可选取的界面文字中选择英文单词、词组或短句。选取稳定后浮窗显示原文与中文；原文与长译文分别在内部滚动，保持窗口紧凑。拖动标题栏可移动并记住位置。关闭浮窗或使用开关／快捷键停止自动调用。密码、API Key 与接口地址不参与翻译。
4. 单次最多 **1,600 字符／250 词**，仅发送选取内容与翻译要求，不附带整篇 Note、Book 或聊天。新的选取取消旧翻译请求；取消不能撤销上游已经发生的费用。
5. 相同来源、模型、提示词的重复选取复用本地结果，不再次请求 API。**Saved translations → Clear translation cache** 仅清除翻译缓存，位于 **Data/Research/Translation**，上限 **1,000 条／5 MB**。翻译及手动测试在 **Usage → Purpose: Translation** 中统计；本地复用不增加请求与 Token。服务不返回费用时，在 **Model prices** 配置翻译模型价格。独立密钥显示掩码，可用 **Remove translation key** 清除本地保存；输入框留空保留原密钥。

### Token 用量与费用

打开 **Research → Usage**，默认查看 **Today**；可选 **Last 7 days**、**Last 30 days**，或自选 **From / To** 日期。来源、模型和用途筛选作用于整个区间。紧凑概览只显示 **Requests**、总 **Tokens** 和 **Costs**，标题与数字在同一行。请求按最新在前排列，每页十条；翻页不影响汇总和活动热力图。

**Token activity** 使用独立日期，不跟随上方汇总／请求筛选。**Hourly** 默认今天，24 个正方形格子按三行八列居中排列（00–07、08–15、16–23），可用自己的日历切换日期。**Daily** 默认当前完整年份，365／366 格按周排列、标记月份，可独立切换年份。修改 From／To 或 Today／Last 7 days／Last 30 days 只调整汇总和请求记录，不切换热力图模式或日期；来源、模型和用途筛选同时作用于两者。From、To 与小时日期使用 LanCarbon 风格日历，也可手填 YYYY-MM-DD。颜色越深表示 Token 越多；悬浮或聚焦查看时间／日期、总 Token 和人民币费用，缺失数据仍为未知。

在 **Model prices** 选择已配置模型，保存每百万 Token 的输入／输出单价及原始币种。缓存价格留空按输入价；经平台确认的免费模型可填零。已保存价格可编辑。删除模型并保存配置、删除服务或更改 API 地址时，自动清理对应的旧价格；历史请求保留当时单价及平台返回的原币费用，不受清理影响。

通过 **1 USD = CNY → Save exchange rate** 设置本地换算参考值（默认 7，不是实时汇率）。美元费用折算后与人民币费用合计显示；修改汇率会更新历史记录的人民币显示值，但不改变原币费用。悬浮费用可查看原币金额以及 Reported／Estimated 来源。Reported 来自接口，Estimated 按请求开始时的单价估算，最终以平台账单为准。

查看 Usage 支持离线，不额外调用模型。日志位于 **Data/Research/Usage**，单价和汇率位于 **Config/ai-pricing.json**。日志不包含密钥或对话正文；删除模型或聊天不删除历史。通过 **Purpose: Translation** 查看选词翻译及其测试，本地复用不产生请求。仅统计 LanCarbon 已记录的调用，不补算旧聊天或其他软件消耗。

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

2.4.0 新增离线 PDF 阅读、搜索、目录、缩略图、进度记忆及选词翻译，并按来源显示手动校准的 API 估算余额。Note／Book 的 PDF 附件使用同一阅读器；保留现有写作、文件版本和 AI 配置，EPUB 阅读另行提供。

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

密钥仍使用当前 Windows 账户加密，保存在 **Config/ai-settings.json**，界面只接收掩码。迁移 Windows 账户后可能需要重填；备份时保留完整 LanCarbon 文件夹（包括 Config、Cache 和 Library），另选的数据目录也需同时备份。会话位于 **Data/Research/Chats/chats.json**；切到 Notes 或 Books 后生成继续，关闭软件会停止生成并保存已有回复。Chat 提交会话文字与回答规范，Notes、Books 和 Library 文件不会自动附加。PDF 可在 Library 内阅读；EPUB 阅读、检索与文献工作流另行提供。

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
