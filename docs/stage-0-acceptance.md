# LanCarbon 2.1.0 第 0 阶段验收

本次交付四工作区基础框架、旧资源浏览、独立开发环境和数据恢复保障。AI 对话、PDF/EPUB 阅读、文献检索和自动归档尚未启用，相关页面显示 Coming soon。

## 验收入口

优先使用项目 `acceptance` 目录中的 `打开第0阶段验收.cmd`。该入口启动隔离安装的 LanCarbon，使用独立的数据和配置副本。日常安装仍位于 `D:\LanCarbon`，稳定版为 1.1.4。

`release/LanCarbon-2.1.0-x64-Setup.exe` 是正式应用身份的安装包。完成隔离验收后，可以将其安装到日常 LanCarbon 根目录。阶段验收不等同于创建 GitHub Release 草稿。

## 操作检查

- 入口按 2×2 排列：Notes / Books 在上，Research / Library 在下。
- 编辑一篇测试 Note，切换到 Research 和 Library，再返回，确认标题和正文保留。
- 打开 Book 页面，切换工作区，再返回，确认仍是同一页。
- Research 中可以选择 Run、Templates、Outputs、Chat、AI Settings，尚未启用的页面标明 Coming soon。
- Library 可以按文件名搜索旧资源、查看引用，并使用 Save a copy 保存副本。
- Open Library folder 打开验收目录中的 Library。
- 关闭并通过同一验收入口重新打开，确认工作区及所选页面恢复。
- Ctrl+Q 在 Notes/Books 之间切换，从 Research/Library 返回最近的写作工作区。Ctrl+N 和 Ctrl+E 只在写作工作区生效。
- 检查原有排序、目录折叠、Edit/Preview、资源插入、PDF 导出和 Book 源文件导出。
- 在内置教程中查看独立的第六章 Research and Library。

验收副本上的编辑仅保存在验收目录。若需要保留，请先导出或复制到日常工作区，避免与原数据混淆。

## 稳定版本与备份

升级前快照位于项目 `backups/phase-0-2026-10-13`，其中 `Installer` 保存已核对的 1.1.4 安装包。备份包含实际 Data、Config、Builds、Exports、PDFs，以及当时存在的根目录 Library。Cache、Temp 和可重新安装的 Tools 不属于该用户资料快照。

`recovery.json` 记录全部备份文件的大小及 SHA-256。验证方式：

```powershell
node scripts/workspace-recovery.cjs verify --backup "backups/phase-0-2026-10-13"
```

恢复使用新的空目录，复制前会验证全部备份文件；已有目标文件不会被覆盖。受管理的数据、构建和导出路径会调整为恢复目录：

```powershell
node scripts/workspace-recovery.cjs restore --backup "backups/phase-0-2026-10-13" --target "D:\Recovered\LanCarbon"
```

恢复快照会回到备份时的状态。升级后的新增内容应在恢复前另行保留。需要恢复日常安装时，先关闭软件，保留当前数据，再使用稳定版安装包和匹配的数据副本；不要直接让旧程序读取不兼容的新数据格式。

## 验证记录

最终测试结果、安装包摘要和隔离安装/恢复演练结果记录在 `acceptance/verification.json`。源代码提交和已验证安装包在验收期间继续保留；下一阶段在本阶段验收后开始。
