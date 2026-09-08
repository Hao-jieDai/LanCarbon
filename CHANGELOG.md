# Changelog

All notable changes to official LanCarbon releases are recorded here.

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
