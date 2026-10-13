# LanCarbon 2.1.1 Library 验收

日常安装已升级到 `D:\LanCarbon` 下的 2.1.1。使用原来的桌面快捷方式即可打开，无需切换到测试副本。

## 更新范围

- 受管理图片、附件和文献库文件统一保存到 `Library/assets`，管理名称及资源 ID 的 `assets.json` 保留在实际 Data 位置。
- 写作时添加附件、粘贴图片和拖入文件，自动使用新的资源目录。
- Library 使用紧凑列表，选中文件的详情固定在列表上方；文件列表与较长的引用列表分别滚动。
- Save a copy 位于选中文件名同一行，Folder 定位真实受管理文件，Rename 修改显示和副本保存名称，保留扩展名、字节和稳定 ID。
- 点击正文引用打开对应 Note/Book 页面并选中引用行；设置与文献库引用打开 Book Settings/Citations。
- Research、AI 与 PDF/EPUB 阅读仍保留当前未启用状态。

## 建议检查

1. 打开 Library，选择一份文件，滚动下方列表，确认引用面板一直可见。
2. 点击某条 Notes 或 Book 引用，确认页面和引用行对应正确。
3. 使用 Folder，确认打开的是 `Library/assets` 中的实际文件。磁盘名称由软件管理，界面提供原始名称。
4. 对个人资源使用 Rename，再保存副本，确认新名称生效且原有正文链接仍然可用。系统教程资源由软件管理，Rename 不可用。
5. 插入一份新的图片或附件，检查预览与导出。已有 Notes/Books 正文不因资源迁移或重命名而改写。
6. 在内置教程第六章查看新的 Library 操作说明。

## 备份与恢复

安装前最新备份：`backups/pre-install-2.1.1-2026-10-13`，包含当时的个人数据、配置、网站/导出文件和 2.1.0 安装包，已逐文件校验。

资源位置改变后，恢复旧程序需要配合升级前的数据副本。先另存更新后的新内容，再将升级前备份恢复到新的空目录；数据检查通过后再决定日常恢复方式。恢复不会覆盖已有目标文件：

```powershell
node scripts/workspace-recovery.cjs verify --backup "backups/pre-install-2.1.1-2026-10-13"
node scripts/workspace-recovery.cjs restore --backup "backups/pre-install-2.1.1-2026-10-13" --target "D:\Recovered\LanCarbon"
```

隔离安装、迁移及旧版恢复已实际验证。详细记录保存在 `acceptance/2.1.1-verification.json`。
