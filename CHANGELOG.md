# Changelog

User-facing changes are recorded here. The current release candidate is marked as unreleased until publication; internal development patches are consolidated into that release.

本文件记录用户可见的变化。当前候选版本在正式发布前标记为未发布，内部开发过程中的小版本调整合并说明。

## 2.5.1 — Unreleased / 尚未发布

This update extends the writing and publishing tools of 1.1.4 into a personal knowledge library.

- **Library and reading:** document import, folders, file versions, resource references, batch operations, PDF/EPUB reading, up to ten reading tabs and local English/Chinese OCR.
- **Workshop:** Chat with SiliconFlow, OpenRouter, DeepSeek or compatible custom connections; shared response guidelines, Thinking display, and PDF/Note exports.
- **Translation and usage:** selection translation, independent or reused model connections, token/cost records, activity heatmaps and estimated shared-account balances.
- **Document questions and tutorial:** ask about selected Library documents, Notes and Book pages using the current full-text Chat flow; follow citations to originals. Separate Library and Workshop tutorial chapters explain the available features.

Automated paper discovery and collection expansion are not implemented. Document answers support reading and comparison; important figures, formulas and interpretations still require checking against the originals.

本次在 1.1.4 的写作与发布工具基础上，扩展个人知识库功能。

- **Library 与阅读：**文档导入、文件夹、文件版本、资源引用、批量操作、PDF/EPUB 阅读、最多十个阅读标签页，以及本地中英文 OCR。
- **Workshop：**支持 SiliconFlow、OpenRouter、DeepSeek 或兼容自定义连接的 Chat，共用回答规范、Thinking 展示及 PDF/Note 导出。
- **翻译与用量：**选词翻译、独立或复用模型连接、token/费用记录、活动热力图及共享账户估算余额。
- **资料问答与教程：**通过当前全文 Chat 流程询问选定的 Library 文档、Notes 和 Book 页面，沿引用返回原文；Library、Workshop 独立教程章节介绍已实现功能。

自动文献发现和文献库自拓展尚未实现。资料回答用于辅助阅读与比较，重要数字、公式和解读仍需核对原文。

## 1.1.4 — 2026-10-05

### Added

- Offline A4 PDF export for the current Note or Markdown Book home page, Section or Child Page, with saved edits, selectable text, math, managed images, tables and page numbers. Descendants and other pages are not included.
- Save-location selection, overwrite confirmation, export notices and atomic output that preserves an existing PDF if export fails.
- Bilingual PDF instructions in the ReadMe and the corresponding interface, Preview and export tutorial pages.

### Changed

- Page PDFs default to a dedicated PDFs folder beside Exports, created during installation or startup without moving older exports.
- The Ctrl+Q hint is now an inline Q inside the Books tab, with the full shortcut on hover and no separate hint row.

### Fixed

- Duplicate-resource warnings now use an in-app modal with explicit Replace, Keep both and Cancel actions and focus restoration, avoiding the native Windows message-box path implicated in the disappearing-mouse report.

## 1.1.3 — 2026-10-04

### Added

- Automatic Notes and Books sorting by last-modified time, creation time or name, with independently saved preferences and pinned Notes kept first. Book modification time includes page edits without changing stored content or the table of contents.
- Independent expand/collapse controls for Book branches, remembered per Book across restarts, with ancestor expansion when navigating to a page or adding a child.
- **Ctrl+Q** switches Notes and Books while preserving selections, with a visible shortcut hint and safeguards for dialogs, composition and key repeat.

### Changed

- Renamed the workspace tab and related creation dialogs from Jupyter Book to Books/Book; the Jupyter Book 2 tool name is unchanged.
- Updated the bilingual ReadMe and the corresponding interface and Book-creation tutorial instructions.

### Validation

- Added regression tests for all sorting modes, pinned Notes, unmodified source order, per-Book folding, ancestor expansion, restart persistence and real Ctrl+Q handling with a native menu accelerator.

## 1.1.2 — 2026-09-14

### Added

- The Math panel now groups a broader selection of Greek letters, variants, operators, relations, set symbols and arrows.
- **Ctrl+E** switches quickly between Edit and Preview, with the shortcut shown beside the view controls.
- Environment Setup now detects Node.js as a Build requirement and can install a verified portable copy under `LanCarbon\\Tools`.
- Installing Jupyter Book 2 automatically prepares missing managed Python and Node.js dependencies.

### Fixed

- Managed installation retries transient Windows file-lock errors with increasing waits instead of failing immediately during folder creation or replacement.
- Environment Setup tests write access to the managed `Tools` folder and can repair its Windows access rules, requesting elevation only when required.
- System tutorial synchronization now preserves its GitHub publishing binding, preventing a connected repository from being reported as unconnected when publishing.

### Validation

- Added automated coverage for grouped mathematical-symbol insertion, keyboard view switching, Node.js Build checks, transient file-lock retries and folder-permission recovery.

## 1.1.1 — 2026-09-08

### Fixed

- Compatible system tools are now shown as **Using existing** and never offer an Install button; the main process also blocks redundant install requests.
- Python managed installation now uses the official portable archive under `LanCarbon\\Tools` and cannot upgrade or modify a registered system Python installation.
- Downloads expose byte and percentage progress, followed by explicit verification, installation and post-install check phases.
- Cancel now aborts network reads, terminates the complete child-process tree, removes partial files and leaves the previous managed copy intact.
- Detection checks every supported command, so an obsolete command cannot hide a later compatible installation.
- Portable archives are extracted with the Windows inbox `tar.exe`, avoiding a dependency on the optional PowerShell Archive module.
- Managed directories are verified after their atomic switch and automatically roll back if final-path verification fails; Jupyter dependency activity is surfaced during its longer install phase.

### Changed

- The system-managed *LanCarbon: From 0 to 1* tutorial is synchronized from the installed release on every upgrade by stable Book, Page and Note IDs. User-created Notes and Books remain untouched.
- The tutorial now begins with a bilingual do-not-edit and overwrite notice, and release-version references have been removed so its guidance remains evergreen.
- Refreshed the LanCarbon brand artwork across the application, Windows executable and shortcuts, installer, GitHub ReadMe, built-in tutorial, tutorial screenshots and generated Book favicon.

### Validation

- Added isolated tests for fully installed, missing, incompatible, offline and mid-download cancellation scenarios.
- Version 1.1.0 was withdrawn before distribution because its Python action could update an existing registered installation.

## 1.1.0 — 2026-09-08

### Added

- A unified Environment Setup page available on first launch and from the sidebar, Build and Publish.
- Detection of versions, locations and compatibility for Python, Jupyter Book 2, Git and GitHub CLI.
- GitHub authentication and connectivity checks with proxy and TUN guidance.
- Independent managed installation and repair under `LanCarbon\\Tools`, with official downloads, SHA-256 verification, retry, cancellation and logs.
- Continued support for compatible tools already installed elsewhere on the system.

### Changed

- Build and Publish automatically use LanCarbon-managed tools without modifying the system PATH.
- The installer now creates the `Tools` folder beside Application, Data, Config, Cache, Temp, Builds and Exports.

## 1.0.0 — 2026-09-07

First official release.

### Added

- Offline Markdown Notes with search, tags, pinning and autosave.
- Structured Books with Sections, Child Pages, Book settings and page properties.
- Markdown and MyST editing tools with an offline Preview.
- Managed images, attachments, Resources, BibTeX libraries and citations.
- Separate Jupyter Book source-copy Export.
- Jupyter Book 2 preflight, managed local website Build and restart recovery.
- GitHub repository setup, GitHub Pages publishing and later website updates.
- Build checks for Python and Jupyter Book 2.
- Publish checks for Git, GitHub CLI, GitHub authentication and repository access.
- A consolidated installation layout under a user-selected LanCarbon root.
- A pinned bilingual ReadMe and the 37-page bilingual *LanCarbon: From 0 to 1* tutorial Book for new installations.

### Supported platform

- Windows x64.
