# 第二阶段 2B：PDF 内置阅读与 API 估算余额

本次更新 LanCarbon 2.3.2，属于第二阶段；第二阶段沿用 2.3.x，进入第三阶段才使用 2.4.x。PDF 使用本地 Mozilla PDF.js 组件；EPUB 内置阅读、批注创建、OCR 与 RAG 留待后续步骤。

## PDF 验收

1. Library 的 Open 或双击 PDF 进入内置阅读。Note／Book 的 Preview 中点击 PDF 附件，或 Resources → Read PDF 进入同一阅读器。Back 返回原写作／列表，保留所选页面、预览模式、筛选与列表状态；切换工作区可退出阅读。
2. 验证连续滚动、页码输入、前后页、Fit width、Fit page、缩放；Pages／Contents 显示按需缩略图及文档自带目录。Find in PDF／Ctrl+F 搜索全文，支持前后匹配。没有目录的文件有明确说明。
3. 阅读位置（页码、页内位置、缩放）按稳定 ID 保存在 Data/Library/reading.json。改名、移动及 Note／Book 关联附件共用阅读进度；重启可恢复。文件页数变化时，重载会限制在有效页码范围。
4. 开启现有 Translate 开关，选择 PDF 中的短英文后显示中文，沿用现有翻译配置、缓存和用量统计。仅含图片的扫描件可阅读；文字选取和全文搜索依赖文件自带文字层。关闭翻译后选取不发送请求。
5. Open externally 通过默认程序编辑，沿用 Library 版本功能。外部保存后提示 Reload latest version，用户主动重载前保持原阅读快照；重载后读取新版本。单纯阅读、滚动、搜索与翻译不修改原 PDF，也不新增文件版本。
6. 无效、损坏、缺失 PDF 显示错误并保留文件，可返回或尝试外部打开；密码在本地输入且不保存。禁用 PDF 脚本及编辑器。普通文件和 EPUB 的默认程序打开功能继续保留。
7. 按需读取页面字节；一次仅保留一个最大 100 MB 的校验后原文快照，退出释放。渲染和缩略图按需进行，不建立 PDF 解析或缩略图磁盘缓存。支持最多 20,000 页；超出时提示外部打开。阅读不调用 AI、不需要联网；仅主动开启的翻译调用模型。

## 余额验收

1. Research → Usage 顶部显示已配置来源的 Estimated balances 卡片；未配置、未使用的翻译预设不占卡片。每张卡片可 Set balance／Update balance，输入平台完整当前余额、选择 CNY／USD；校准时间由软件记录。
2. 未消费时保持输入值。将 50 元设置为起点，随后记录 3 元费用，应显示约 47 元；充值后手动输入平台完整余额 67 元，应从 67 元重新扣减，历史费用不得再扣一次。
3. 同一连接下各模型、聊天、测试、翻译的费用合并；复用翻译连接共享同一来源，独立配置的连接单独列出。来源身份包括连接 ID 和 API 地址；更换地址不继承旧余额。校准时仍在运行的请求在结算后扣费。
4. 优先使用接口返回费用，否则采用请求当时保存的价格快照估算。免费调用不扣费，未知费用保持未知；费用未知和请求进行中会标注。跨币种沿用 Model prices 中的手动汇率，约人民币 10 元及以下突出提示，也保留负数估算。
5. 余额独立于 Usage 的日期、来源、模型和用途筛选；改变筛选、翻页、重启不重复扣费。Stop tracking 只移除余额起点，不删除用量和历史费用。模型价格被清理后，旧请求的费用快照继续有效。
6. 余额起点和校准时累计费用保存在 Data/Research/Usage/balances.json，随 Data Location 迁移；不调用平台余额接口。其他软件消费、赠额或平台调价需要手动校准。

## 数据与安装

- 原件、历史版本、附件链接、Notes／Books 与 AI 数据沿用已有格式和位置。阅读进度和余额为独立的小型记录；系统教程新增长期有效的 Reading PDF Documents 页面，并同步 Usage 的余额操作。
- 安装前完整备份当前 LanCarbon，包含实际 Data、Config、Cache、Library 和匹配的 2.3.1 安装包。回滚旧程序时使用匹配快照，另行保留升级后的新增内容。
- 最终包验证后保留 2.3.2、2.3.1、2.3.0 及其 blockmap，执行 clean:installers。自动化使用隔离工作区和模拟 AI，不调用真实 API。最终包和真实数据核对记录在 acceptance/2.3.2-verification.json。

## English

This step adds local PDF reading and manually calibrated source balance estimates. Library opens PDFs internally; Note and Book preview attachments and Resources → Read PDF use the same reader. Back restores writing or Library state. Verify scrolling, page navigation, zoom/fit, lazy thumbnails, document outlines, search and previous/next matches. Stable document IDs share saved reading progress across rename, move and linked attachments. Selection translation uses existing settings, cache and usage accounting; scans without a text layer remain viewable. Passwords stay local and are not saved. PDF scripts and editing are disabled. Reading itself is offline and leaves originals unchanged. External saves offer explicit reload while retaining the open reading snapshot. EPUB reading, annotation creation and OCR follow separately.

Usage displays balances for configured connections. Enter the full current platform balance in CNY or USD; saving records a new local ledger checkpoint and calibration time. Subsequent fees from every model and purpose using that connection are deducted once, including pending requests when they finish. Recalibration starts from the new balance without clearing history or subtracting past fees again. Reported fees take precedence over request-time price estimates. Free calls cost zero; unknown fees remain unknown. Date filters and pagination never affect balances. Low/negative estimates are highlighted. Stop tracking deletes only the checkpoint. Reused translation connections share their source; dedicated connections remain separate, and connection identity includes the API address. Other apps' charges and platform credits require manual recalibration; no balance endpoint is called.

Reading progress is stored in Data/Library/reading.json and balance checkpoints beside the usage ledger in Data/Research/Usage/balances.json. Both travel with Data Location. The reader serves bounded page-data chunks from one verified in-memory snapshot, releases it on close and writes no PDF parsing/thumbnail disk cache. The evergreen tutorial gains a PDF reading page and balance instructions. A full pre-install snapshot includes the matching previous installer. Final verification checks the packaged/installed program, existing personal data and the three retained rollback installers using isolated tests and simulated AI.
