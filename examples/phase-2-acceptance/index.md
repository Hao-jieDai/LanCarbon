---
title: LanCarbon Syntax Acceptance
label: acceptance-home
---

# LanCarbon Syntax Acceptance

## 中文：如何验收

这本示例书用于同时检查 **LanCarbon 1.6.0 Preview** 和 **Jupyter Book 2**。

1. 先打开 [语法实验室](syntax-lab.md)，逐节比较 Edit 源码与 Preview。
2. 再打开 [引用实验室](reference-lab.md)，点击链接检查本页、跨页和公式定位。
3. 切回 Edit，确认原始 Markdown 完整。切换页面时应保持当前 Edit/Preview 模式。
4. 导出到空目录，运行 `jupyter book build --html --strict`。
5. 运行 `jupyter book start`，保持终端打开，访问它输出的 URL，再检查相同内容。

**通过标准：** 内容、结构、公式和引用可用，不要求应用内预览与网站主题的字号、间距、配色或编号完全一致。

这不是所有 MyST 插件语法的全集；图片、文献、可执行 Notebook、文件 include 和 Mermaid 不属于本次 Phase 2 正常验收样例。

## English: acceptance workflow

Open the [Syntax Lab](syntax-lab.md), compare source with Preview, then use the [Reference Lab](reference-lab.md) to test navigation. Export to an empty folder, run the strict HTML build and start the Jupyter Book server. Keep its terminal running while browsing.

Content, structure, mathematics and references must work. Exact typography, theme styling and publication numbering may differ. Images, bibliography, executable notebooks, file includes and Mermaid are outside this Phase 2 sample.
