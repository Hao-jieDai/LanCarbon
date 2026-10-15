# 第二阶段 2A：Library 导入与整理验收

本次安装版本 **LanCarbon 2.3.0**。第一阶段的 AI、用量统计、复用和独立翻译配置已由用户验收；2A 完成资料导入与管理，以及翻译浮窗滚动微调。PDF 内置阅读器在 2B、EPUB 内置阅读器在 2C 分别验收。

## 资料导入

1. 打开 Library。左侧 All files 合并全部资源；Imports 显示直接导入的原件，Source materials 显示写作附件、图片和文献库。分类及所选文件在切换、重启后保留。
2. 使用 Import PDF / EPUB，或拖入文件到主区域。每批最多 20 个 PDF/EPUB，每个最多 100 MB；空文件、格式不符和超限文件逐项报错，成功文件保留。取消选择不修改数据。
3. 导入后移动外部原文件，Library 副本仍能打开、定位文件夹和另存。相同内容不会重复导入；已有写作附件直接选中 Source materials 原条目。同名但内容不同的文件分别保留，自动编号。
4. 文件缺失时显示 Missing。重新导入原始内容可修复 Imports 副本，保留文档 ID 与已改名称。打开或导出前校验原件完整性；格式检查不等于完整阅读兼容性验证。
5. File type、Find a resource 和 Sort by 可组合使用。单击保留上方引用面板，点击引用可跳回 Note/Book。Open 或双击 PDF/EPUB 使用系统默认应用；尚未内置阅读，外部阅读程序中的选词不属于 LanCarbon 翻译范围。电脑未配置对应默认应用时按系统提示安装或关联阅读软件。
6. Folder 定位受管理原件；Rename 只修改显示及导出副本名，保留扩展名、ID 与正文链接。Save a copy 导出到受管理 Library 之外，不能覆盖受管理原件。系统教程资源不能重命名。

## 数据与翻译

- 新原件在根目录 Library/Imports；新目录记录在实际 Data/Library/documents.json。现有 Library/assets、Data/assets.json 及正文引用沿用。更改 Data Location 携带管理记录，原件仍在根目录 Library；Notes/Books 保持 Workspace v2。
- 导入、列表、管理和默认应用打开不产生 AI 请求；没有加入 PDF/EPUB 解析缓存。翻译仍沿用现有开关、限额与缓存。
- 长原文与长译文各自滚动，整体浮窗保持紧凑，标题和模型信息可见。更换选取后从原文开头显示；浮窗在内容变长及窗口缩小时留在可见区域。
- 检查 Notes/Books 编辑、预览、资源管理、PDF 导出，以及已有 AI 配置、聊天、历史用量、翻译配置和发布绑定。

## 备份与验证

安装前完整快照：backups/pre-install-2.3.0-2026-10-15，包含 Config、Cache、Library、实际 Data 及匹配的 2.2.5 安装包。安装包验证后保留 2.3.0、2.2.5、2.2.4 及其 blockmap。

自动化使用独立工作区、有效的合成 PDF/EPUB 和模拟 AI 响应，不调用真实 API。安装包及日常数据核对见 acceptance/2.3.0-verification.json。ReadMe 与系统教程的 Library 导入操作同时同步；系统教程保持长期说明，不写入版本日志。

283 项单元测试、最终安装包全部 21 个桌面场景通过。真实数据升级演练和安装后核对保留 56 个个人写作条目、2 个个人 Book、30 个 Library 文件、2 个聊天的 16 条消息、38 条历史用量、4 个模型价格，以及现有翻译配置与缓存。安装包为 163,062,227 字节，比上一版增加 6,927 字节。

## English

Phase 1 has been accepted, including dedicated translation configuration. This step adds Library imports and resource organization; internal PDF and EPUB readers are separate following steps.

Choose All files, Imports or Source materials, then Import PDF / EPUB or drop local documents into the main area. Batches accept up to 20 files of up to 100 MB each, report failures individually and retain successes. Imported originals remain available after moving external sources. Identical content reuses imported originals or existing writing attachments; equal names with different contents get numbered names. Re-import repairs missing/damaged imported copies without changing their IDs or display names.

Search, filter and sort files. Single-click for pinned references and writing navigation. Open or double-click uses the system default app; selection translation inside external reading apps is outside LanCarbon. Folder reveals the original, Rename preserves extensions/IDs/links, and Save a copy exports outside managed Library. Missing files are marked; managed tutorial resources cannot be renamed.

Originals live in root Library/Imports and records in active Data/Library/documents.json. Existing writing assets remain in Library/assets, with the existing catalog and Workspace v2 unchanged. Data Location carries management records while originals stay in root Library. Importing and opening do not invoke AI or create reading caches.

Long source and translated text scroll independently within a compact floating panel, retaining the header and model information. New selections start at the source beginning; resizing and content growth keep the panel visible. Verify personal writing, resources, exports, AI settings, conversations, usage, translation and publishing bindings. The full pre-install snapshot includes Config, Cache and the matching previous installer. Final verification retains the latest three installers and records evidence in acceptance/2.3.0-verification.json.

All 283 unit tests and 21 final-installer desktop scenarios passed. Upgrade rehearsal and daily-data audits preserved 56 writing records, two personal Books, 30 Library files, two chats with 16 messages, 38 usage records, four model prices, saved translation settings and cache. The installer is 163,062,227 bytes, an increase of 6,927 bytes over the previous package.
