# Phase 2 comprehensive acceptance example / 综合验收示例

For LanCarbon 1.6.0 and Jupyter Book 2. This is an example project, not an app update. The verification script uses disposable data and does not touch your existing workspace.

适用于 LanCarbon 1.6.0 与 Jupyter Book 2。本目录只是验收样例，不是软件更新；验证脚本使用隔离临时数据，不修改你的现有笔记。

Verified on 2026-09-02 against the packaged LanCarbon 1.6.0 client: rendered structure assertions, 12 reference jumps, application export, 3-page strict HTML build with no content warnings, and local HTTP preview all passed. The CLI emitted a Node.js `url.parse()` deprecation notice, not a document error.

2026-09-02 已使用打包后的 LanCarbon 1.6.0 实测：格式结构断言、12 次引用跳转、软件导出、三页 HTML 严格构建（无内容警告）及本地 HTTP 预览均通过。CLI 有 Node.js `url.parse()` 弃用提示，但不是文档错误。

## 1. Create the Book / 创建 Book

Create a Book named **LanCarbon Syntax Acceptance**. In Book Settings:

| Field | Value / 填写值 |
| --- | --- |
| Book title | LanCarbon Syntax Acceptance |
| Authors | Example Author（示例作者，可换成自己的完整姓名，也可留空） |
| Site title | LanCarbon Syntax Acceptance（可选） |
| Other fields / 其他字段 | Leave empty / 留空 |

Keep the generated home page. Add two root-level Sections named **Syntax Lab** and **Reference Lab**. They do not need child pages for this example.

保留自动生成的首页，再点击两次 **+ Section** 创建两篇顶层页面，分别命名为 **Syntax Lab** 和 **Reference Lab**。这个示例不需要子页面。

## 2. Paste source and set properties / 粘贴源码并填写页面属性

Open each `.md` file in a plain-text editor, select all, and paste the entire file into the corresponding note's **Edit** body. Include the opening YAML frontmatter; do not paste a rendered webpage or wrap the whole document in a code fence.

使用纯文本方式打开以下 `.md` 文件，全选后把完整源码粘贴到对应笔记的 **Edit** 正文。保留开头的 YAML frontmatter；不要复制渲染后的网页，也不要给整篇内容再套一层代码围栏。

| Note title / 笔记标题 | File / 复制的文件 | Page Properties → Export Path | Page Properties → Label |
| --- | --- | --- | --- |
| LanCarbon Syntax Acceptance | `index.md` | `index.md`（首页固定） | `acceptance-home` |
| Syntax Lab | `syntax-lab.md` | `syntax-lab.md` | `acceptance-syntax-page` |
| Reference Lab | `reference-lab.md` | `reference-lab.md` | `acceptance-reference-page` |

**Important:** set the Label in Page Properties, not just frontmatter. Current LanCarbon 1.6.0 export replaces the frontmatter label with the page-property value, even when that value is empty. This sample explicitly sets both so whole-page references survive export. Other page properties are optional for this sample.

**重要：** Label 必须按表格在 Page Properties 中填写，不能只粘贴 frontmatter。实测当前 1.6.0 导出会用页面属性覆盖正文中的 label，即使页面属性为空。因此本例同时填写两处，确保整页引用导出后仍有效。其他页面属性对本例均可留空。

Wait for **All changes saved** before restarting or exporting. The app does not automatically import this directory.

重启或导出前等待 **All changes saved**。应用不会自动导入本目录，需要按上表粘贴和设置。

## 3. Preview checklist / 应用预览检查

| Syntax / 语法 | Expected / 预期 |
| --- | --- |
| Bold, italic, combined/nested emphasis / 粗体、斜体、组合与嵌套 | Distinct formatting, no visible marker characters / 格式可区分，不显示标记 |
| Underline, delete, smallcaps roles / 下划线、删除线、小型大写 | Corresponding styling / 对应样式 |
| H1–H5, paragraphs, hard breaks / 一至五级标题、段落、显式换行 | Correct structural levels and line breaks / 层级与换行正确 |
| Escapes, entities, inline code / 转义、实体、行内代码 | Literal characters preserved / 保留预期字面字符 |
| Nested ordered/unordered and definition lists / 嵌套有序无序、定义列表 | Correct indentation and item structure / 层次清晰 |
| Nested quotes and horizontal rule / 嵌套引用、分隔线 | Block structure and separator / 引用层次及分隔线可见 |
| Markdown, table and list-table directives / 三种表格 | Three tables, full cell content / 三张表，单元格完整 |
| Python, TypeScript, JSON, YAML and code-block / 多种代码块 | Preserve text, whitespace and newlines; never execute / 保留文本空格换行，不执行 |
| abbr, sub, sup, kbd / 缩写、上下标、按键 | Abbreviation title, correct baseline offsets and keyboard text / 缩写提示、上下标和按键文字 |
| Inline/block/role math and page macros / 行内、块级、角色公式和页面宏 | Typeset formulas and mathematical symbols / 正确排版 |
| Fractions, roots, integrals, sums, matrices, aligned/cases / 分式根号积分求和矩阵对齐分段 | No error fallback, readable geometry / 没有错误回退，布局清晰 |
| note, tip, important, warning, caution, admonition / 提示块 | Styled callouts; custom title appears once / 提示框可见，自定义标题只出现一次 |
| Nested callouts and dropdowns / 嵌套提示、折叠 | Nesting intact; both closed and initially open states work / 嵌套正确，可展开收起 |
| Twelve reference forms / 十二种引用形式 | All jump to the correct page/target; retain Preview / 正确定位并保持预览模式 |

Then check light/dark themes, Edit → Preview → Edit, Chinese typing and Enter, autosave and restart. Source must not change simply because you previewed it.

之后检查浅/深主题、Edit → Preview → Edit、中文输入与回车、自动保存和重启恢复。不能因为打开预览就改变原文。

## 4. Jupyter Book check / Jupyter Book 验收

For the full LanCarbon workflow, export your Book to a new empty folder and open PowerShell there:

验证完整软件流程时，先把这个 Book 导出到新的空目录，然后在导出目录打开 PowerShell：

```powershell
jupyter book build --html --strict
jupyter book start
```

Wait for the server-start message, open the **actual URL printed by the CLI**, and leave PowerShell running. Visit all three pages, expand the dropdowns and follow the references. Stop the server with **Ctrl+C** after checking. A completed build alone does not keep a preview server running.

等待服务启动，打开 CLI **实际输出的网址**，保持 PowerShell 运行。检查三页内容、折叠块和引用，结束后按 **Ctrl+C**。仅完成 build 并不等于预览服务持续运行。

You can also copy this directory elsewhere and run those commands directly against its `myst.yml`, but that bypasses LanCarbon editing/export and cannot replace the full workflow check.

也可以把本目录复制到其他位置后直接针对 `myst.yml` 运行命令；但这会绕过软件编辑与导出，不能代替完整链路验收。

## 5. Boundaries and findings / 边界与实测发现

- This is a representative supported-syntax suite, not a promise that every MyST plugin is implemented.
- Current CLI warns about heading depth above five, so H6 is excluded from the clean-build example.
- Use `{delete}` for the tested strikethrough example. Markdown `~~...~~`, task checkboxes, citation libraries, images, Mermaid and executable notebooks are not certified by this sample.
- Local code blocks preserve code but need not have the same token colors as the website. Equation numbering and theme layout may differ.
- External links are intentionally blocked inside LanCarbon, but can open from the exported website.
- Unknown directives, invalid math and missing references belong in separate disposable error tests, not the normal clean-build Book.

- 本例覆盖大量当前支持的语法，但不保证所有 MyST 插件都已实现。
- 当前 CLI 对超过五级的标题报警告，因此无警告的正式样例不包含 H6。
- 删除线使用已验证的 `{delete}` role。本例不为 `~~...~~`、任务复选框、文献库、图片、Mermaid 和可执行 Notebook 背书。
- 本地代码块保证内容，不要求与网站具有相同的语法高亮颜色；公式编号和主题布局也可能不同。
- LanCarbon 有意阻止外链导航，但导出网站可以打开外链。
- 未知指令、错误公式和缺失引用应放在单独的可删除错误测试页中，不要混入正常构建用 Book。

Syntax references / 语法参考：[MyST tables](https://mystmd.org/guide/tables)、[cross-references](https://mystmd.org/guide/cross-references)、[math](https://mystmd.org/guide/math)。

## Developer verification / 开发者复验

From the repository root, after building the application:

在仓库根目录完成构建后：

```powershell
npm run build
node examples/phase-2-acceptance/verify.cjs --cli
```

Set `E2E_EXECUTABLE` to a packaged `LanCarbon.exe` to test that binary. The verifier checks rendered structures, all twelve reference jumps, app-generated export, content warnings from the official strict build, and HTTP service availability. It removes only its own temporary directory afterward.

设置 `E2E_EXECUTABLE` 为打包客户端路径即可检查安装包对应的程序。脚本验证渲染结构、十二个引用跳转、软件生成的导出、官方严格构建中的内容警告及 HTTP 服务可访问性，结束后只清理自己创建的临时目录。
