# LanCarbon 2.1.0 第 0 阶段验收

本次交付四工作区基础框架、旧资源浏览、独立开发环境和数据恢复保障。AI 对话、PDF/EPUB 阅读、文献检索和自动归档尚未启用，相关页面显示 Coming soon。

自动化验证包括写作与数据保护测试、桌面操作场景，以及使用真实用户资料副本的隔离安装、升级、降级与恢复。隔离安装包使用独立注册身份，不创建日常快捷方式；正式安装包的应用代码和内置内容摘要与经过安装验证的副本一致。

## 验收入口

日常安装位于 `D:\LanCarbon`，已升级为 2.1.0。使用原来的桌面快捷方式即可验收四工作区及教程等功能，编辑内容保存在原有工作区。

项目 `acceptance` 目录中的 `打开第0阶段验收.cmd` 用于可选的独立测试，使用升级前资料的副本。该副本上的编辑与日常工作区分别保存。

`release/LanCarbon-2.1.0-x64-Setup.exe` 是已用于日常升级的正式应用身份安装包。阶段验收不等同于创建 GitHub Release 草稿。

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

日常安装升级前另保存了最新快照 `backups/pre-install-2.1.0-2026-10-13`；需要回到升级前状态时，优先使用这份快照及其中的 1.1.4 安装包。

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
