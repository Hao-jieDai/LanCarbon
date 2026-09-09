每次完成代码修改后，都需要提交一次git commit

每次生成并验证新的安装包后，都必须清理 release 中的旧安装包：按版本号保留包括当前版本在内的最新三个版本（当前版本和前两个已发布版本），供故障回滚使用。删除更早版本的安装包及对应 .blockmap 文件。示例：最新为 1.8.2 时保留 1.8.2、1.8.1、1.8.0；最新为 1.8.1 时保留 1.8.1、1.8.0、1.7.8。只清理已识别的安装包及其配套文件，不删除用户数据、备份或其他项目文件。执行 npm run clean:installers，并核对最终保留列表。

正式发布版本序列从 1.0.0 重新开始。生成并验证 1.0.0 时，只保留 1.0.0 与旧的 2.5.0 过渡回滚安装包；生成任意后续 1.x 版本后删除 2.5.0，并仅在 1.x 正式版本序列中保留最新三个版本。

ReadMe 与系统内置教程 `LanCarbon: From 0 to 1` 必须按以下规则维护：

- 新功能、功能调整或用户操作流程变化，必须同时更新 ReadMe，并同步更新 `LanCarbon: From 0 to 1` 中对应的长期教程内容。
- Bug 修复、稳定性优化和内部实现调整只写入 ReadMe，不写入 `LanCarbon: From 0 to 1`，避免把教程写成版本日志。
- `LanCarbon: From 0 to 1` 只保留长期有效的新手操作说明，标题、章节和正文中不得出现 LanCarbon 版本号、更新记录或 Bug 修复历史。
- `LanCarbon: From 0 to 1` 是由 LanCarbon 管理的系统内置教程，必须在教程开头用中英文明确说明：用户不应编辑；软件升级时教程会被自动同步并覆盖；因用户自行编辑造成的内容丢失，LanCarbon 不承担责任。
- 软件启动时必须按稳定 ID 将 `LanCarbon: From 0 to 1` 的 Book 设置、目录结构和全部官方页面同步为当前安装包内的最新版。不得保留用户对该系统教程的修改，也不得为这些修改自动创建备份副本。用户自行创建的 Notes 和 Books 不得受到影响。
- ReadMe 继续随软件版本自动更新，可以包含当前版本的新功能、Bug 修复和重要变化。

## GitHub Release 统一规范

所有后续 GitHub Release 必须遵循以下规则。

### Release 标题与 Tag

- Release 标题统一使用 `LanCarbon X.Y.Z`。
- Tag 统一使用 `vX.Y.Z`。
- Release 正文不得重复书写一级标题或版本标题。

### Release 正文

- Release 正文必须提供完整的中英文双语内容。
- 英文版本在前，中文版本在后，中间使用 `---` 分隔。
- 中英文的章节、说明和更新条目必须一一对应。
- 首次正式发布可以介绍软件定位、主要功能和内置内容。
- 后续版本只说明当前版本新增、调整和修复的内容，不重复介绍以前版本已经发布的内容。
- 不写入无实际必要的版本过渡说明、已撤回版本说明、内部构建过程或其他无关开发信息。
- 不单独书写 `Installer: ...`；安装包名称应在下载说明和 SHA-256 校验代码块中体现。
- Logo 更新统一称为“新版 Logo / new Logo”，不得使用未经确认的品牌描述。
- 具体功能章节可以根据版本内容调整，但下载说明和高级校验章节必须保留。

### Release 正文模板

````markdown
简短的英文版本概述。

## Highlights

- Current release highlight.
- Current release adjustment.
- Current release fix.

## Download

Download **LanCarbon-X.Y.Z-x64-Setup.exe** below. The automatically generated Source code archives are intended for developers and are not the Windows installer.

Necessary installation, compatibility, or upgrade information.

This installer is not digitally signed. Windows may display an Unknown publisher or Microsoft Defender SmartScreen warning. Advanced users can verify the SHA-256 value at the end of these notes.

---

简短的中文版本概述。

## 主要更新

- 与英文对应的当前版本重要更新。
- 与英文对应的当前版本功能调整。
- 与英文对应的当前版本问题修复。

## 下载说明

请下载下方的 **LanCarbon-X.Y.Z-x64-Setup.exe**。GitHub 自动生成的 Source code 压缩包面向开发者，不是 Windows 安装程序。

与英文对应的安装、兼容性或升级说明。

当前安装包尚未进行数字签名，Windows 可能显示“未知发布者”或 Microsoft Defender SmartScreen 提醒。有需要的用户可以使用页面末尾的 SHA-256 校验安装包。

## Advanced verification / 高级校验

The SHA-256 fingerprint below can be used to verify that the downloaded installer is identical to the official Release file.

下面的 SHA-256 指纹可用于确认下载的安装包与官方 Release 文件完全一致。

```text
SHA-256  LanCarbon-X.Y.Z-x64-Setup.exe
```
````

### Release 附件

每个正式 Release 只手动上传：

- `LanCarbon-X.Y.Z-x64-Setup.exe`

不得上传：

- `.blockmap`
- `latest.yml`
- `SHA256SUMS.txt`
- 其他内部构建文件

以下文件由 GitHub 自动生成，无需手动制作或上传：

- Source code（zip）
- Source code（tar.gz）

### SHA-256 校验

- 必须根据最终验证并准备发布的安装包重新计算 SHA-256。
- Release 正文中的 SHA-256 必须与最终上传的安装包完全一致。
- SHA-256 必须使用 64 位大写十六进制字符。
- SHA-256 必须放在 `Advanced verification / 高级校验` 章节的 `text` 代码块中。
- SHA-256 和安装包完整文件名必须写在同一行。
- 发布前必须再次核对 GitHub 已上传安装包的摘要。

### Release 发布流程

Release 流程分为“创建草稿前”和“开始创建草稿后”两个阶段。

#### 创建草稿前

- 只有用户明确提出“开始创建 Release 草稿”或含义相同的指令，才表示当前版本进入冻结状态。
- 在用户明确要求创建 Release 草稿之前，代码和版本号不得被视为已经冻结；可以继续按用户要求修改代码、文档、版本号和安装包。
- 讨论发布内容、整理 Release Notes、评估发布条件或确认发布流程，均不等同于用户要求开始创建 Release 草稿。
- 此阶段不得创建或推送当前版本的正式 Tag，也不得擅自创建 Release 草稿。

#### 开始创建草稿后

用户明确要求开始创建 Release 草稿后，必须按以下顺序执行：

1. 立即冻结当前版本的代码和版本号。
2. 完成最终测试、生产构建、安装包生成和实际安装验证。
3. 运行安装包清理脚本并核对保留的回滚版本。
4. 根据最终安装包重新计算 SHA-256。
5. 按统一格式撰写中英文 Release Notes。
6. 获取并整合 GitHub `main` 的最新变化。
7. 将当前版本的全部最终提交推送到 GitHub `main`。
8. 确认本地 HEAD、远端 `main` 和最终验证的代码完全一致。
9. 创建 `vX.Y.Z` 版本 Tag，使其准确指向远端 `main` 的最终提交，并将该 Tag 推送到 GitHub。
10. 核对远端 Tag 指向的提交与最终版本提交完全一致。
11. 使用已经存在的 Tag 创建 Draft Release，并且只手动上传 `LanCarbon-X.Y.Z-x64-Setup.exe`。
12. 确认草稿中可以获得 Windows 安装包、Source code（zip）和 Source code（tar.gz）。
13. 核对 Release 标题、Tag、正文、中英文结构、SHA-256、安装包摘要和下载文件。
14. 由用户验收 Draft Release。
15. 只有在用户明确确认后，才能正式发布 Release。

#### 草稿创建后的变更限制

- 草稿验收期间可以按用户要求修改 Release Notes 的文字和排版，但不得修改本版本的代码、版本号、Tag 指向或安装包。
- 创建草稿后如果确实必须修改代码或安装包，必须等待用户明确告知并按用户指示停止当前发布流程；修改完成后重新执行最终测试、构建、安装验证、安装包清理、SHA-256 校验、代码推送、Tag 和草稿核对流程。
- Tag 属于公开版本标识。不得在用户未明确授权的情况下删除、覆盖或强制移动 Tag。
- 正式发布阶段只将已经验收的 Draft Release 转为正式 Release，不得同时变更代码、版本号、Tag 指向、Release Notes 或附件。
