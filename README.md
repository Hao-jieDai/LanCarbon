<p align="center"><img src="build/icon.png" alt="LanCarbon" width="180"></p>
<h1 align="center">LanCarbon</h1>
<p align="center">Read, ask, write and publish — build a personal knowledge library.</p>
<p align="center"><a href="https://github.com/Hao-jieDai/LanCarbon/releases/latest"><strong>Download the latest release</strong></a> · <a href="#english">English</a> · <a href="#中文">中文</a></p>

![The LanCarbon workspace](resources/starter-content/assets/18add49e1fa8d2c97fc66a43e2c8d939c7b3b983fbea6fbfaf1f766031668c90.png)

<a id="english"></a>

## English

### What is LanCarbon?

LanCarbon is a Windows desktop application that combines local writing and document reading with AI assistance. Keep original material in **Library**, explore it in **Workshop**, write your own **Notes**, and organize longer work as **Books**. Books can also become local websites or be published to GitHub Pages.

### What's new in 2.5.4

This update adds writing tabs and a shared right sidebar for page chat and reading annotations.

- **Writing tabs:** keep multiple Notes and pages from different Books open, displaying one at a time. Switching retains the current session's cursor, undo history, scroll position and Edit / Preview choice. Closing a tab does not delete its page; open tabs return after restart.
- **AI Chat beside your writing:** open **AI Chat** in a Note or Book page. The default source is the current Note/page; Book pages also offer **Current section** and **Whole Book**. A section includes its top-level page and descendants. Each page has its own conversations and session drafts. Sending saves the latest text first and uses the existing model connections and source-citation workflow; opening or switching tabs does not call a model.
- **One right sidebar:** Notes and Books show AI Chat, while PDF and EPUB show **Annotations**. Opening the right sidebar closes the left workspace list; opening the left list closes the right. Reader Pages / Contents and Annotations also close one another. Annotation controls, local storage and Note exports remain available.

Your personal Notes, Books, annotations, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. Mac/tablet adaptation and automated paper discovery/collection expansion remain deferred.

### Download and get started

Download **LanCarbon-2.5.4-x64-Setup.exe** from its Release when available. Until this update is published, the latest-release link points to the currently published version. GitHub's Source code archives are for developers, not the Windows installer.

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

### 2.5.4 的主要更新

本次更新增加多标签写作，以及用于随页聊天和阅读批注的统一右侧栏。

- **多标签切换**：可同时保留多个 Notes、不同 Books 的页面，每次显示一个。切换时保留本次使用中的光标、撤销记录、滚动位置及 Edit / Preview 状态。关闭标签不删除内容；重启后恢复已打开的标签。
- **边写边问**：在 Note 或 Book 页面点击 **AI Chat**，默认以当前 Note／页面为资料；Book 页面还可选择 **Current section**（所属顶层章节及其子页面）或 **Whole Book**。每页分别保留聊天记录和本次使用中的输入草稿。发送前保存最新正文，复用已有模型连接及来源引用流程；打开或切换标签不会调用模型。
- **统一右侧栏**：Notes／Books 显示 AI Chat，PDF／EPUB 显示 **Annotations**。打开右侧栏自动收起左侧工作区列表，打开左侧列表自动收起右侧栏；阅读器的 Pages / Contents 与 Annotations 也互斥。批注工具、本地保存和导出 Note 继续可用。

升级保留个人 Notes、Books、批注、模型配置和聊天记录，系统 ReadMe 与教程随软件同步。Mac／平板适配、自动文献发现和文献库自拓展继续暂缓。

### 下载与开始使用

本版本发布后，请从对应 Release 下载 **LanCarbon-2.5.4-x64-Setup.exe**。发布前，最新版本链接仍指向当前已公开版本。GitHub 的 Source code 压缩包面向开发者，不是 Windows 安装程序。

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
