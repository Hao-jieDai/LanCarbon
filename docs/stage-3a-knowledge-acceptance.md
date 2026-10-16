# 3A 本地知识库验收

本轮验证资料准备、文本解析和本地索引。Embedding、语义检索及基于资料的 Chat 留到后续步骤；无需配置模型，不会产生 API 费用。

1. 打开 **Workshop → Knowledge base**。在 **Notes** 选择一篇个人笔记，在 **Books** 选择一本个人 Book，或单独选择其中的页面。在 **Library** 选择一个带文本层的 PDF 和一个 EPUB。内置教程和 ReadMe 默认不参与。
2. 保持 **Include linked attachments** 开启。Note、Book 共同引用的附件应只出现一份索引。也可以选择 Imports 文件夹，纳入其子文件夹和以后新增的文件。
3. 点击 **Build index**。正常资料变成 **Ready**；部分文本不可解析或达到限制时显示 **Partial** 并说明范围。扫描版 PDF、缺失文件、不支持的格式应显示原因，其余资料继续处理。
4. 分别点击 **Preview**，核对 PDF 页码、EPUB 章节／段落、Markdown 标题／行号及实际文本。输入原文中确定存在的英文或中文词句，点击 **Search**，检查来源及片段。当前使用关键词搜索，不能据此验收问答或语义理解。
5. 在所选 Note 或 Book 页面增加一段独特文字，等待保存，返回知识库。启用自动更新时，稍后可搜索到新文字。文件重命名、移动不会重新解析；通过 **Open externally** 保存新版本后，索引更新为新版本，不继续使用旧文本。
6. 使用 **Stop** 暂停，再用 **Update index** 继续。关闭并重新启动软件，确认范围和已完成索引保留。关闭自动更新后，内容变化需要手动 Update index。
7. 取消选择部分资料，点击 **Update index**，确认退出搜索。**Clear index** 只清除索引并保留选择；Note、Book、Library 原文件、聊天、用量和余额仍应存在。点击 Build index 可以重新建立。

每份资料最多处理 500 页 PDF、3,000 个 EPUB 章节、200 万文本字符和 2,000 个片段，总文本缓存上限 100 MB。复杂表格和多栏 PDF 可能提取为连续文本，请通过 Preview 核对。扫描件 OCR、密码保护 PDF、DRM 和固定版式 EPUB 不在本轮解析范围。

完整回滚快照：`backups/pre-install-2.4.0-2026-10-16`。索引位于当前数据目录的 `Research/Knowledge`，与原件分开存储。

---

# Local knowledge-base acceptance

Select personal Notes, Book pages or whole Books, and text-based PDF/EPUB files under **Workshop → Knowledge base**. Build the index, inspect source positions with Preview, and search literal terms. Shared attachments are indexed once. Check automatic updates after saved edits, unchanged-file reuse after rename/move, stop/resume, restart persistence, and source removal after applying a changed selection. Clear index must preserve source files, writing and account history. Text extraction and keyword search are local and make no AI requests; embedding retrieval and grounded Chat are later steps.
