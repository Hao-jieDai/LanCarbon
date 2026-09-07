// These pages double as editable, exportable Phase 2 acceptance fixtures.
export const PHASE2_OVERVIEW = `## English

Phase 2 is implemented and awaits your acceptance. Phase 2A provides the CodeMirror source editor; 2B adds Edit/Preview; 2C adds offline mathematics, MyST directives/roles and within-Book cross-references; 2D delivers regression tests, this bilingual tutorial and the Windows installer.

Your exact Markdown remains the source of truth. Changing mode never rewrites it. Edit/Preview remains selected while you navigate pages; restarting opens Edit. Read Mathematics and Equations, Directives and Roles, Cross References, then Phase 2C Acceptance and Phase 2D Acceptance below.

The local preview is a writing aid, not the full Jupyter Book website. Equations are numbered within each page. Project-wide custom numbering and third-party plugins require the official build. Images, bibliography tools, advanced validation, CLI preview management and GitHub publishing remain in later phases.

## 中文

Phase 2 已完成开发，等待你验收。Phase 2A 提供 CodeMirror 源码编辑器；2B 提供 Edit/Preview；2C 增加离线公式、MyST directive/role 及同一本 Book 内的交叉引用；2D 完成回归测试、这份双语教程和 Windows 安装包。

原始 Markdown 始终是唯一正文。切换模式不会改写内容；浏览其他页面时保留 Edit/Preview 选择，重启后默认 Edit。请依次阅读下方的 Mathematics and Equations、Directives and Roles、Cross References，以及 Phase 2C Acceptance 和 Phase 2D Acceptance。

本地预览是写作辅助，不是完整的 Jupyter Book 网站。公式按当前页面编号；跨项目的自定义编号和第三方插件应以官方构建为准。图片、文献工具、进阶校验、CLI 预览管理和 GitHub 发布仍属于后续阶段。`;

export const MATH_GUIDE = String.raw`## English

Inline mathematics uses single dollar signs: $E=mc^2$. The equivalent role is {math}\`a^2+b^2=c^2\`.

A labelled equation uses the math directive. Switch to Edit to see its exact source; Preview should show a typeset fraction and an equation number:

\`\`\`{math}
:label: guide-carbon-balance
\Delta C = E - R, \qquad f = \frac{R}{E}
\`\`\`

See [](#guide-carbon-balance). Dollar blocks also work:

$$
\sum_{i=1}^{n} C_i = C_{\mathrm{total}}
$$

KaTeX and its fonts are bundled: no internet is needed. Page YAML frontmatter can define a math mapping of macro names to strings. Invalid formulas show their source and a Preview notice; fix them in Edit. Unsafe HTML/URL macros are disabled. Local equation numbers may differ from custom numbering in the final website.

## 中文

行内公式使用单个美元符号，例如上面的能量公式；等价写法是 math role。点击 Edit 可以查看美元符号和 role 的完整源码，Preview 中应显示排版后的公式，而不是源码标记。

上面的 math directive 定义了碳收支公式，其中 label 为 guide-carbon-balance。预览应显示分式和公式编号；点击“See”后面的引用应跳到该公式。双美元符号包围的公式块也可以正常排版，上方总和公式就是例子。

KaTeX 及其字体随软件安装，不需要网络。页面 YAML frontmatter 中的 math 映射可以定义字符串宏。无效公式会保留源码并出现在 Preview notices 中，请返回 Edit 修正。出于安全考虑，HTML/URL 宏被禁用。本地公式编号可能与最终网站的自定义编号不同。` .replaceAll(String.fromCharCode(92, 96), "`");

export const DIRECTIVES_GUIDE = String.raw`## English

Directives are blocks; roles are inline. Use three backticks or colons around a directive. Use a longer outer fence for nesting. Common callouts include note, tip, warning, important, caution and admonition.

::::{note}
This is a **note** with nested content.

:::{tip}
Keep the original Markdown editable.
:::
::::

:::{warning} Check your source
A warning is visible without changing the saved text.
:::

:::{dropdown} Open this example
You can expand this block with the mouse or keyboard.
:::

Roles: {abbr}\`CO2 (Carbon dioxide)\`, H{sub}\`2\`O, x{sup}\`2\`, {kbd}\`Ctrl+F\`, {underline}\`underlined\`, {smallcaps}\`Small Capitals\`.

Unknown directives/roles remain visible with a Preview notice. File includes, embedded programs, diagrams and remote images are not executed or downloaded. Some official CLI plugins provide additional syntax that is not available in this local preview.

## 中文

directive 用于整块内容，role 用于行内内容。directive 外层可使用三个反引号或冒号；嵌套时外层围栏应比内层长。常用提示块包括 note、tip、warning、important、caution 和 admonition。

上面先展示 note 中嵌套 tip，然后展示带自定义标题的 warning，最后是 dropdown 折叠块。展开 Open this example，确认可以看到折叠正文。所有格式只影响预览，不会改变保存的源码。

行内示例依次展示：带完整名称提示的 CO2 缩写、水分子下标、平方上标、Ctrl+F 按键、下划线以及小型大写字母。切换 Edit 可查看每个 role 的完整语法。

未知 directive/role 会保留可见内容并显示 Preview notice。软件不会执行文件 include、嵌入程序、图表程序，也不会下载远程图片。官方 CLI 的部分插件扩展语法可能不在本地预览支持范围内。`.replaceAll(String.fromCharCode(92, 96), "`");

export const REFERENCES_GUIDE = String.raw`## English

Give a heading a label by placing (label)= immediately before it. In this Book, labels should be unique. Links with an empty title automatically use the target title. Page Properties → Label names an entire page. Stable Export Paths let you link to a file even after renaming its title.

(guide-reference-target)=
### A local reference target

- Local heading: [](#guide-reference-target).
- Equation on another page: [](#guide-carbon-balance).
- Another guide page: [](#phase-2-mathematics).
- Explicit link text: [Read the formula](#guide-carbon-balance).

The ref, eq and numref roles are also accepted. For example, {eq}\`guide-carbon-balance\` references the equation. Relative Markdown file links such as ../chapter/page.md#label are resolved against the current page's Export Path, inside this Book only. Hidden TOC pages remain referenceable. Clicking an internal reference selects its page and scrolls to the target, keeping Preview mode.

Missing or ambiguous references are marked and listed under Preview notices; they do not silently jump to an arbitrary page. Ordinary Notes resolve their own targets only. External links cannot navigate the Electron window. Equation numbering here is local to each page; verify final publication with Jupyter Book.

## 中文

在标题前单独写一行 (label)= 即可给标题命名，同一本 Book 内应使用唯一 label。链接标题留空时会自动显示目标标题。Page Properties 中的 Label 命名整个页面；稳定的 Export Path 让标题重命名后文件链接仍然有效。

上面的四个链接依次演示：本页标题、另一页公式、另一篇教程页面，以及自定义链接文字。点击后应定位对应页面和目标，并保持 Preview 模式。

也支持 ref、eq、numref role，上面的 eq 示例引用另一页的碳收支公式。相对 Markdown 路径链接（例如 ../chapter/page.md#label）以当前页面的 Export Path 为基准，只在当前 Book 中解析。设置为不显示在目录中的页面仍可引用。

缺失或有歧义的引用会在正文中标记，并列入 Preview notices，不会随意跳到某个页面。普通 Notes 只解析自身目标。外部链接不能把 Electron 窗口导航到其他网站。当前公式按每页编号，正式发布编号请用 Jupyter Book 验证。`.replaceAll(String.fromCharCode(92, 96), "`");

export const PHASE2C_ACCEPTANCE = `## English

1. Open Mathematics and Equations in Preview. Confirm inline, block and role mathematics, fractions, symbols, offline fonts and equation numbers.
2. Open Directives and Roles. Confirm nested callouts, a custom warning title, an expandable dropdown, abbreviations, sub/superscripts and keyboard text.
3. Open Cross References. Click each local/page/equation reference; confirm the right page and target open without leaving Preview.
4. In a disposable page, add an unknown directive, an invalid formula and a missing label. Confirm Preview notices and visible fallback text. Fix the source and confirm the notices disappear.
5. Rename a target page title without changing its Export Path. Confirm file links still work. Change a label deliberately and confirm old label references become unresolved.
6. Switch between light/dark, Edit/Preview and other pages. Confirm readability, intact Markdown and normal editing. No network is needed for these steps.

## 中文

1. 在 Preview 打开 Mathematics and Equations，检查行内公式、公式块、math role、分式、符号、离线字体和编号。
2. 打开 Directives and Roles，检查嵌套提示块、自定义 warning 标题、可展开的 dropdown、缩写、上下标和按键文字。
3. 打开 Cross References，逐个点击本页、跨页和公式引用，确认打开正确页面并定位目标，且始终保持 Preview。
4. 新建一篇可删除的测试页，加入未知 directive、错误公式和不存在的 label。确认 Preview notices 和回退原文可见；修正源码后提示应消失。
5. 修改目标页面标题，但不要修改 Export Path，确认文件路径链接仍然有效；故意修改 label，确认旧 label 引用变为无法解析。
6. 切换浅/深主题、Edit/Preview 和其他页面，确认可读性、源码完整性以及编辑正常。以上操作均不需要联网。`;

export const PHASE2D_ACCEPTANCE = `## English

Phase 2D packages and verifies the complete Phase 2. It does not introduce Phase 3 assets or bibliography management.

1. Back up your workspace using the folder shown by Data Location. Close LanCarbon and install this release over the previous version; do not uninstall or remove your data.
2. Confirm ReadMe shows the new release and this Book retains your original Getting Started and Phase 1 Reference pages. New reference pages should appear exactly once; user-edited pages must not be overwritten.
3. Repeat the Phase 2A/2B checks: old notes and ReadMe visible in Edit, real Chinese IME, multiple Enter presses, search, undo/redo, persistent view mode and long-document scrolling.
4. Complete Phase 2C Acceptance. Wait for All changes saved, restart, and verify the source and Book structure.
5. Export this Book into an empty directory. Run jupyter book build --html --strict. Then run jupyter book start and keep the terminal open while visiting the printed localhost URL. Stop it with Ctrl+C after checking.
6. Test new/delete/pin/search, Book pages and tree dragging on disposable content. Confirm editing continues immediately after deletion.

Official CLI validation may need internet to download book-theme; this does not mean LanCarbon's local preview needs internet. If downloads fail, resolve the network/proxy problem and retry without changing your Markdown. Phase 2 is accepted only after you approve these checks.

## 中文

Phase 2D 负责完整 Phase 2 的测试和交付，不提前实现 Phase 3 的资源或文献管理。

1. 根据 Data Location 显示的目录备份工作区；关闭 LanCarbon 后直接覆盖安装，不卸载或删除数据。
2. 确认 ReadMe 显示新版本，Book 中原有 Getting Started 和 Phase 1 Reference 保持不变；新教程只增加一次，用户修改过的页面不能被覆盖。
3. 重新检查 Phase 2A/2B：旧笔记和 ReadMe 在 Edit 可见，真实中文输入法、多次回车、搜索、撤销/重做、模式保持和长文滚动正常。
4. 完成 Phase 2C Acceptance。等待 All changes saved 后重启，确认源码和 Book 结构恢复正常。
5. 导出本 Book 到空目录，运行 jupyter book build --html --strict；再运行 jupyter book start，保持终端打开并访问输出的 localhost 地址。检查后使用 Ctrl+C 停止服务。
6. 用可删除内容检查新建/删除/置顶/搜索、Book 页面和目录拖拽，删除后应能立即继续编辑。

官方 CLI 可能需要联网下载 book-theme，这不意味着 LanCarbon 的本地预览需要网络。如果下载失败，请排查网络/代理后重试，不要因此改写 Markdown。Phase 2 只有在你确认上述检查后才算验收完成。`;
