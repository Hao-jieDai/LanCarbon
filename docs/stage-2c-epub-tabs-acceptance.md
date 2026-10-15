# 第二阶段 2C：EPUB 阅读与多文件标签

LanCarbon 2.3.7，继续使用第二阶段的 2.3.x。尚未进入文献检索、RAG 或自动推送阶段。

## 阅读验收

1. Library 中打开 EPUB，验证章节目录、目录中的子标题、前后章节、内部链接、正文滚动、内嵌图片及表格。正文使用统一排版并随应用主题切换。
2. 调整字号、行距和阅读宽度。关闭重开或重启后恢复同一章节、滚动位置和文字设置。从 Library、Note 与 Book 的同一附件打开共用进度。
3. Find in EPUB / Ctrl+F 搜索全书，点击结果定位章节并高亮匹配。最多返回 250 条，超过时显示加号。无匹配或搜索中的状态明确可见。
4. 开启 Translate 后选取短英文，沿用已有翻译配置、缓存及用量统计；关闭时选取不调用 API。阅读本身离线运行，不改变原件。
5. 外部编辑后，新版本提供 Reload latest version；保留版本及文档 ID。损坏、缺失、DRM 或固定版式文件显示说明，保留 Open externally。

## 工具栏与 Workshop 验收

1. PDF 和 EPUB 均无重复文件名标题行、无 Back 按钮。第一行为文件标签和侧栏开关，第二行为阅读操作；Open externally 紧邻搜索框左侧。
2. 收起侧栏、切换文件、横向滚动多个标签以及窄窗口下，仍可通过标签行的固定按钮展开侧栏。Workspace 返回原写作或 Library 页面。
3. 顶层导航、页面路径与内置教程统一显示 Workshop，原有 Chat、AI Settings、Usage、Translation Settings 和保存状态正常。已有 Data/Research 路径继续保存原数据。

## 标签验收

1. 打开多个 PDF／EPUB，顶部标签显示格式、文件名及关闭按钮；长名称省略，悬停看完整名称。当前标签滚动到可见处，标签多时可水平滚动。
2. 同一原件经 Library 和写作附件打开，只产生一个标签。最多十个；第十一个提示先关闭，不自动替换已有文件。
3. 切换文件分别恢复进度。Workspace 返回原写作或列表且保留标签。关闭标签只结束该文件的阅读；关闭当前标签后切换到相邻文件，全部关闭后返回原工作区。
4. 重启恢复标签及当前文件；文件改名和移动后更新名称并保留身份。标签获得焦点时，可用左右方向键、Home、End 切换。
5. 验证亮／暗主题、侧栏收起及窄窗口。仅当前文档加载正文和解析快照，切换会保存位置并释放上一文档的内存；标签本身不产生磁盘解析缓存。

## 保存与支持范围

- PDF 进度继续位于 Data/Library/reading.json；EPUB 进度和文字设置位于 Data/Library/epub-reading.json。标签列表在本地界面状态中保存，不把文献内容写入其中。
- EPUB 2 的 NCX 与 EPUB 3 的导航目录均在本地解析。按章节读取 ZIP 内容，不向磁盘解压；检查资源校验值，并限制文件数量、解压大小与正文／图片大小。
- 支持普通可重排 EPUB；不执行书内脚本、不加载外部 URL、不采用出版物专用 CSS。固定版式、DRM、音视频、批注和 OCR 不在本次范围。
- 完整备份包括 Data、Library、Config 和 Cache。安装包按项目规则保留最近三个版本，回滚需使用匹配的数据快照。

## English

Verify local EPUB chapter navigation, nested contents, internal links, text search, embedded images/tables, typography, shared stable reading progress and selection translation from Library and Note/Book attachments. Verify new-version reload and actionable errors without changing original files.

PDF and EPUB share up to ten file tabs. Reopening a linked original selects its existing tab; an eleventh file requires closing a tab. Workspace retains tabs, closing the active tab selects a neighbor, and restart restores tabs. Check themes, collapsed navigation, narrow windows and keyboard tab navigation. Only the active document body is loaded; no extracted-book cache is persisted. Reflowable EPUB 2/3 is supported; publisher CSS, scripts, external URLs, DRM, fixed layouts, audio/video, annotations and OCR are excluded.
