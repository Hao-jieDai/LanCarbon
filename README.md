<p align="center"><img src="build/icon.png" alt="LanCarbon" width="180"></p>
<h1 align="center">LanCarbon</h1>
<p align="center">Read, ask, write and publish — build a personal knowledge library.</p>
<p align="center"><a href="https://github.com/Hao-jieDai/LanCarbon/releases/latest"><strong>Download the latest release</strong></a> · <a href="#english">English</a> · <a href="#中文">中文</a></p>

![The LanCarbon workspace](resources/starter-content/assets/18add49e1fa8d2c97fc66a43e2c8d939c7b3b983fbea6fbfaf1f766031668c90.png)

<a id="english"></a>

## English

### What is LanCarbon?

LanCarbon is a Windows desktop application that combines local writing and document reading with AI assistance. Keep original material in **Library**, explore it in **Workshop**, write your own **Notes**, and organize longer work as **Books**. Books can also become local websites or be published to GitHub Pages.

### What's new in 2.5.3

This update adds local PDF and EPUB annotations and reading-note exports.

- **Annotate while reading:** select text and choose **Highlight**, **Underline** or **Comment**. Choose a color, add an optional comment, and save. Click a mark or use **Annotations** to edit or delete it. The list follows document order.
- **Reliable local storage:** annotations are saved separately under **Data/Library/Annotations**, leaving original files unchanged. PDF locations use file pages and page-relative positions; EPUB locations use chapters and text anchors. Renaming or moving a document within Library preserves its annotations. A changed original keeps earlier annotations with a version warning instead of applying old locations to new text.
- **Export to Note:** export all or selected annotations into a new editable Note containing original excerpts, comments, locations and **Return to original** links. PDF locations use actual file page numbers, which may differ from printed page labels. Return links work inside LanCarbon. Exports are snapshots; re-exporting warns when an existing exported Note is found and creates a new Note without overwriting your edits.
- **Translation shortcut hint:** the floating panel now shows **Continuous translation (Z)**; Z toggles continuous mode after a PDF selection.

Your Notes, Books, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. Annotated PDF/EPUB file export, multi-tab writing and the writing-side AI panel are not included. Automated paper discovery and collection expansion are not available yet.

### Download and get started

Download **LanCarbon-2.5.3-x64-Setup.exe** from its Release when available. Until this update is published, the latest-release link points to the currently published version. GitHub's Source code archives are for developers, not the Windows installer.

The installer is not digitally signed; Windows may show an Unknown publisher or SmartScreen notice. Close LanCarbon before upgrading; the installer reuses the existing installation location. Keep a data backup and a working installer for recovery.

Open **Books → LanCarbon: From 0 to 1** for the bilingual tutorial. For reading, start with Library and then Workshop. For writing and publication, follow the installation, authoring, Build and Publish chapters. The tutorial is system-managed: updates replace its contents. Create your own Notes and Books for personal work.

### Local work, AI and publishing

Writing, document management, reading and OCR work locally. AI requests require your own configured service and network access; normal service fees apply. Chat sends conversation text and selected source material; translation sends selected text. Ordinary writing does not automatically upload your library. API keys are encrypted for the current Windows account.

Usage and balances are local records and estimates, not a synchronized provider bill. Check the service's account page for actual credit and charges. Back up the complete LanCarbon home, including Config, Library and encryption state in Cache, plus any separate Data Location. Changing Windows accounts may require re-entering API keys.

Building and publishing a Book are optional. **Environment Setup** guides you through Python, Node.js and Jupyter Book for Build, and Git and GitHub CLI for Publish. You do not need these website tools simply to write notes, read PDFs or use configured AI services.

### Development and feedback

```bash
npm ci
npm run dev
npm run typecheck
npm test
```

The app uses Electron, React and TypeScript. For the installed full-text question workflow, read [the RAG maintenance guide](docs/rag-update-guide.md) before making changes. `npm run setup:paperqa` prepares its development runtime; `npm run dev:paperqa` uses that workflow. `npm run dist` builds a Windows installer with the required reading and PaperQA resources.

Report reproducible problems through [GitHub Issues](https://github.com/Hao-jieDai/LanCarbon/issues), with the application version and steps to reproduce. Remove API keys, personal documents and private conversations from reports.

---

<a id="中文"></a>

## 中文

### LanCarbon 是什么？

LanCarbon 是一款将本地写作、文档阅读与 AI 辅助结合起来的 Windows 桌面软件。用 **Library** 保存原始资料，在 **Workshop** 中理解和处理内容，用 **Notes** 记录自己的想法，再通过 **Books** 组织长期写作。Book 也可以构建成本地网站或发布到 GitHub Pages。

### 2.5.3 的主要更新

本次更新提供 PDF／EPUB 本地批注，以及批注导出为阅读笔记的完整流程。

- **边读边批注**：选中文字，选择 **Highlight**（高亮）、**Underline**（划线）或 **Comment**（评论），设置颜色、按需输入评论后保存。点击标记或使用 **Annotations** 列表编辑、删除；列表按原文顺序排列。
- **独立本地保存**：批注保存在 **Data/Library/Annotations**，不改写 PDF／EPUB 原件。PDF 保存实际文件页码及页内相对位置；EPUB 保存章节及文字锚点。在 Library 内改名、移动后保留批注。更换原文件后，旧批注仍保留并提示版本变化，不把旧位置套用到新文字上。
- **导出为 Note**：可导出全部或勾选的批注，生成含原文摘录、评论、位置和 **Return to original** 返回链接的普通可编辑 Note。PDF 使用实际文件页码，可能与印刷页码不同；返回链接在 LanCarbon 内使用。导出是快照；发现已有导出笔记时会提醒，重复导出创建新 Note，不覆盖用户修改。
- **翻译快捷键提示**：浮窗显示 **Continuous translation (Z)**；PDF 选区后可按 Z 切换连续翻译。

升级保留 Notes、Books、模型设置和聊天记录，系统 ReadMe 与教程随软件同步。本次不包含带批注 PDF／EPUB 文件导出、多标签写作和写作侧栏 AI；自动文献发现与文献库自拓展尚未开放。

### 下载与开始使用

本版本发布后，请从对应 Release 下载 **LanCarbon-2.5.3-x64-Setup.exe**。发布前，最新版本链接仍指向当前已公开版本。GitHub 的 Source code 压缩包面向开发者，不是 Windows 安装程序。

安装包尚未进行数字签名，Windows 可能显示“未知发布者”或 SmartScreen 提醒。升级前关闭 LanCarbon；安装程序沿用原有安装位置。请保留数据备份和可用安装包以便恢复。

打开 **Books → LanCarbon: From 0 to 1** 阅读双语教程。资料阅读从 Library 和 Workshop 开始；写作与发布按照安装、写作、Build、Publish 相关章节学习。教程由系统管理，升级会覆盖其内容；个人内容请放在自己创建的 Notes 和 Books 中。

### 本地使用、AI 与在线发布

写作、文件管理、阅读和 OCR 在本地完成。AI 请求需要你自行配置服务并能够通过网络访问它，费用按服务商规则计算。Chat 发送对话和选定来源，翻译发送选中文字；普通写作不会自动上传整个资料库。API Key 按当前 Windows 账户加密。

用量和余额是本地记录及估算，不是平台账单的同步副本；真实额度和费用请查看服务商账户页面。备份应包含整个 LanCarbon 主目录，包括 Config、Library、Cache 中的加密状态，以及另行设置的 Data Location。更换 Windows 账户后可能需要重新输入 API Key。

Book 构建与发布是可选功能。**Environment Setup** 引导安装配套工具：Build 使用 Python、Node.js 和 Jupyter Book，Publish 使用 Git 与 GitHub CLI。单纯写笔记、阅读 PDF 或使用已配置的 AI 服务，无需先安装网站构建工具。

### 开发与反馈

```bash
npm ci
npm run dev
npm run typecheck
npm test
```

软件使用 Electron、React 和 TypeScript。修改安装版全文问答流程前，请先阅读 [RAG 维护指南](docs/rag-update-guide.md)。`npm run setup:paperqa` 准备相应开发运行环境，`npm run dev:paperqa` 使用该流程。`npm run dist` 构建包含阅读及 PaperQA 资源的 Windows 安装包。

请通过 [GitHub Issues](https://github.com/Hao-jieDai/LanCarbon/issues)反馈可复现的问题，说明软件版本和复现步骤。请勿提交 API Key、个人文档或私人聊天。

## License

MIT — see [LICENSE](LICENSE).
