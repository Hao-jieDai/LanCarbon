# 第二阶段 2A：Library 导入与整理验收

本次更新版本 **LanCarbon 2.3.1**，继续完善 2A 的资料整理和外部编辑。PDF 内置阅读器在 2B、EPUB 内置阅读器在 2C 分别验收。

## 文件夹、导入与重名规则

1. Library 左侧 All files 合并全部资源，Imports 显示直接导入的原件及子文件夹，Source materials 显示写作附件、图片和文献库。New folder 可以在 Imports 下建立多级文件夹；文件夹、所选条目与分类在切换及重启后保留。
2. Import PDF / EPUB 或拖入文件，导入当前 Imports 文件夹。每批最多 20 个 PDF/EPUB，每个最多 100 MB。失败逐项提示，成功文件保留；取消选择不修改数据。
3. 内容相同，无论名称及文件夹是否相同，均复用已有条目；搜索范围包括当前和保留的历史版本。导入报告展示传入名、当前名、现有位置和匹配版本，可定位已有条目或明确选择移动。导入 a.pdf、改名 b.pdf、再次导入原 a.pdf，应保留 b.pdf 和原 ID，不再复制，也不改回旧名。
4. 同一文件夹中，同名而内容不同的导入文件自动编号；不同文件夹允许同名。重命名与同目录已有名称冲突时拒绝覆盖并提示可用名称；移动出现冲突时，由用户明确选择 Keep both 或取消。重命名和移动均保留稳定 ID、全部版本与写作引用。
5. File type、Find a resource 和 Sort by 可组合使用。搜索时可跨 Imports 子文件夹查找并显示位置。单击查看上方固定的引用面板，点击引用跳回 Note/Book；Folder 定位受管理文件。
6. 缺失条目显示 Missing；重新导入相同原始内容，可修复对应的 Imports 文件并保留 ID、现有名和版本顺序。重新导入旧版本不会将当前版本回退。

## 外部打开与文件版本

1. Open 或双击使用系统默认应用打开 PDF、EPUB、TXT、Word、图片等普通资料；程序、脚本和快捷方式不能作为资料直接执行。系统没有默认应用时按提示配置。尚未加入 PDF/EPUB 内置阅读器，外部程序中的选词不属于 LanCarbon 翻译范围。
2. 默认应用打开的是 Library/.Editing 中保留显示名称的工作副本。外部保存稳定后，LanCarbon 自动生成新的当前版本，保留原 ID、显示名称、文件夹、引用和旧内容；后台定期检查，返回 Library 或 Refresh 也会检查。软件关闭期间保存的内容在下次启动时核对。
3. 选择文件后用 Versions 查看版本和另存旧版；Save a copy 导出当前内容。导出目的地必须在受管理 Library 之外。只重复保存相同内容不新增版本；格式不符或超过限制的保存不会覆盖有效原件，工作副本保留并显示错误。
4. 系统教程附件受软件管理；外部编辑不会替换官方内容，应另存为个人资料。不要在资源管理器中直接修改或移动哈希命名的受管理原件；应使用软件内的 Open、Rename 和 Move。
5. Note 与 Book 的 Attach file 选择器默认打开根 Library。选中已导入原件或其相同内容，引用已有文档，不再复制一份；以当前显示名称插入，后续打开、导出及资源元数据跟随当前版本。正文中用户原有的链接显示文字保留。

## 数据与回滚

- Imports 原件及版本存放于根 Library/Imports 和其子目录；已有写作资源保留于 Library/assets。管理记录在实际 Data/Library/documents.json、Data/assets.json；外部编辑会话记录在 Data/Library/edit-sessions.json。Notes/Books 继续使用 Workspace v2。
- 更改 Data Location 携带管理记录；Library 仍位于根目录。版本、工作副本及原件都是本地文件，不调用 AI，不产生阅读缓存。保留历史内容会随实际编辑增加磁盘占用。
- 安装前完整快照为 backups/pre-install-2.3.1-2026-10-15，包含 Config、Cache、Library、实际 Data 与匹配的 2.3.0 安装包。旧版不支持新的版本/引用记录，需要回滚时应在独立位置使用匹配快照，避免旧程序操作新数据。
- 安装包验证后运行清理脚本，保留 2.3.1、2.3.0、2.2.5 及对应 blockmap。自动化使用独立工作区和模拟 AI，不调用真实 API；最终数据与包摘要记录在 acceptance/2.3.1-verification.json。
- ReadMe 与系统教程同步更新操作说明；教程继续按稳定 ID 同步，个人 Notes、Books、AI 配置、聊天、历史费用、翻译及发布绑定纳入升级核对。

## English

This update continues phase 2A with Library organization and external editing. Internal PDF and EPUB readers remain separate following steps.

Create nested Imports folders, import or drop PDF/EPUB originals, and move files between folders. Batches accept up to 20 files of up to 100 MB each. Identical content reuses an existing resource across folders and retained versions. Reports show the incoming name, current name, location and matching version. Importing a.pdf after renaming its identical original to b.pdf retains b.pdf and its ID. Different content with the same name is numbered within a folder; separate folders may use equal names. Rename conflicts reject overwriting, and move conflicts require an explicit Keep both choice or cancellation. IDs, versions and writing references remain stable.

Open or double-click opens ordinary documents and images with the default application. Programs, scripts and shortcuts are not executed as documents. External applications edit named working copies under Library/.Editing. Changed, stable saves create new current versions while retaining older content, IDs, names, folders and references. Background checks, Library refresh and startup detect pending saves. Versions lists revisions and exports older copies. Invalid or oversized saves preserve the last valid original and the working copy. Save a copy exports outside managed Library. Official tutorial resources remain managed; save edited personal copies separately.

The Attach file picker in Notes and Books starts at root Library. Selecting an existing imported original or identical content reuses it without another byte copy and inserts its current display name. Reads and exports follow the current version; existing Markdown labels remain as authored. Search can span Imports folders and shows locations. Selected resources show pinned references with writing navigation. Re-importing older content never rolls back the current version.

Originals and revisions live in Library/Imports and its subfolders; writing resources remain in Library/assets. Active Data contains catalogs and external-edit session records. Workspace v2 is retained, and Data Location transfers management records while root Library stays in place. These operations are local and make no AI requests. Retained revisions grow with real edits. Use the full pre-install snapshot and its matching previous installer when rolling back to software that cannot understand the new records. The latest three installers are retained after verification. Automated checks use isolated workspaces and simulated AI, and the final verification record is acceptance/2.3.1-verification.json. README and the evergreen system tutorial describe the new workflows; personal writing, bindings, configurations, conversations, fees and translation data are checked during upgrade.
