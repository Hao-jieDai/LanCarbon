<p align="center"><img src="build/icon.png" alt="LanCarbon" width="180"></p>
<h1 align="center">LanCarbon</h1>
<p align="center">Read, ask, write and publish — build a personal knowledge library.</p>
<p align="center"><a href="https://github.com/Hao-jieDai/LanCarbon/releases/latest"><strong>Download the latest release</strong></a> · <a href="#english">English</a> · <a href="#中文">中文</a></p>

![The LanCarbon workspace](resources/starter-content/assets/18add49e1fa8d2c97fc66a43e2c8d939c7b3b983fbea6fbfaf1f766031668c90.png)

<a id="english"></a>

## English

### What is LanCarbon?

LanCarbon is a Windows desktop application that combines local writing and document reading with AI assistance. Keep original material in **Library**, explore it in **Workshop**, write your own **Notes**, and organize longer work as **Books**. Books can also become local websites or be published to GitHub Pages.

### What's new in 2.5.2

This update improves PDF selection and search alignment, adds continuous selection translation, and provides a personal To do note.

- **PDF reading:** text selection and search highlights now use the same page dimensions as the visible PDF at different zoom levels.
- **Continuous translation:** select the first passage, then check **Continuous translation** in the floating panel. In a PDF, **Z** also toggles the mode after selection. Select the continuation on the next page to translate the combined original. **New passage** clears the accumulated text; unchecking restores ordinary selection translation. Switching documents clears the passage and turns continuous mode off. The combined text remains limited to 1,600 characters or 250 words. Each accepted addition requests a translation of the combined text; matching cached results can be reused.
- **Personal To do:** new and existing users receive a pinned **To do** note. Use its checklist to add and check tasks, or edit Markdown task lines such as `- [ ] Read the paper`. Renaming, editing or unpinning it is preserved across upgrades. Deleting it allows a fresh default To do to be created on the next start; it does not restore deleted tasks.

Your Notes, Books, model settings and chat history are retained. The system ReadMe and tutorial synchronize with the app. To do is personal content and is not overwritten by tutorial synchronization. PDF/EPUB annotations, multi-tab writing and the writing-side AI panel are planned separately. Automated paper discovery and collection expansion are not available yet.

### Download and get started

Download **LanCarbon-2.5.2-x64-Setup.exe** from its Release when available. Until this update is published, the latest-release link points to the currently published version. GitHub's Source code archives are for developers, not the Windows installer.

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

### 2.5.2 的主要更新

本次更新修正 PDF 文字选取与搜索高亮的位置，增加连续选区翻译，并提供个人 To do 待办笔记。

- **PDF 阅读**：文字选区与搜索高亮使用和可见 PDF 相同的页面尺寸，在不同缩放比例下保持对应。
- **连续翻译**：先选第一段原文，再勾选浮窗中的 **Continuous translation**；在 PDF 中选取后也可按 **Z** 切换此模式。选取下一页的后续文字后，合并原文并整体翻译。**New passage** 清空累计内容；取消勾选恢复普通选区翻译。切换文档时清空累计内容并关闭连续模式。合并后仍限 1,600 个字符或 250 个词。每次有效追加都会请求翻译合并原文；命中缓存时可复用已有译文。
- **个人 To do**：新用户和升级用户都会获得一个置顶 **To do** 笔记。可通过清单添加和勾选任务，也可编辑 `- [ ] 阅读论文` 等 Markdown 任务行。改名、正文修改和取消置顶会在升级时保留。删除后下次启动会创建新的默认 To do，但不会恢复已删除任务。

升级保留 Notes、Books、模型设置和聊天记录。系统 ReadMe 与教程随软件同步；To do 属于个人内容，不会被教程同步覆盖。PDF／EPUB 批注、多标签写作和写作侧栏 AI 将另行更新；自动文献发现与文献库自拓展尚未开放。

### 下载与开始使用

本版本发布后，请从对应 Release 下载 **LanCarbon-2.5.2-x64-Setup.exe**。发布前，最新版本链接仍指向当前已公开版本。GitHub 的 Source code 压缩包面向开发者，不是 Windows 安装程序。

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
