# 第二阶段收尾：Library 文件与批量操作

LanCarbon 2.3.8。第三阶段 RAG 尚未开始。

1. 勾选、取消、全选当前列表／筛选结果及清空选取；显示数量，排序保留勾选，切换目录或筛选清空勾选。勾选和双击文件分别工作，系统教程资源不能删除。
2. 单文件 Delete、批量 Delete selected 均先确认全部 Note／Book 引用及历史版本。取消不改变任何资料。确认后删除选中记录、非共享原件及版本、关联写作资源与引用，保留周围正文和其他资源。缺失文件同样可清理；后续刷新、重启不恢复已删除记录。
3. 删除关联文件关闭其阅读标签并停止外部编辑跟踪；不影响其他文件、聊天、费用、余额和个人写作。Resources 中移除写作关联仍保留 Imports 原件，与 Library 的原件删除含义不同。
4. Move selected 仅对导入原件开放；选择 Imports 目标，默认明确勾选 Keep both when names match。冲突自动编号，保留文档 ID、全部版本、引用和阅读进度。未勾选保留两份时，名称冲突先提示，不覆盖文件。
5. Export selected 选择 Library 之外的文件夹，仅复制当前版本。目标同名或批次内重名自动编号，已有内容不覆盖；导出不改原件。取消目录选择不写文件；缺失／损坏文件逐项报告，其他成功文件保留。
6. 混合选取导入原件、图片、附件时可以删除与导出，移动按钮说明仅适用于导入原件。验证亮／暗主题、窄窗口、列表独立滚动以及固定引用面板。
7. 安装前完整快照包含实际 Data、Library、Config、Cache 和匹配的旧安装包。安装验证后运行 clean:installers，保留最新三个版本；README、内置 ReadMe 和长期教程同步，个人资料保持。

## English

Verify row deletion and checkbox selection, select-visible, clear, count, filter reset and sorting. System tutorial resources stay protected. Deletion confirms references across all Notes/Books and stored versions; cancellation changes nothing. Successful deletion removes records, unshared files, linked resources and their references while keeping surrounding writing and other resources. Missing files can be removed. Close deleted reader tabs and stop external-edit tracking without reviving deleted entries after refresh/restart. Resources-only unlinking still keeps imported originals.

Batch move applies to imported originals, uses an explicitly visible keep-both choice, numbers conflicts, and retains stable IDs, versions, references and reading positions. Without keep-both, conflicting names are rejected before moving. Export copies current versions outside Library, never overwrites existing destination files, numbers duplicate names, and reports individual failures while preserving successful files and originals. Check cancellation, mixed selections, themes, narrow layout, independent list scrolling, data preservation, complete backup, tutorial synchronization and the latest three rollback installers.
