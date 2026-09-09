# Changelog

All notable changes to official LanCarbon releases are recorded here.

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
