import { createNote } from "./notes";
import type { Book, BookPage, Note, WorkspaceFile } from "./types";
import { DIRECTIVES_GUIDE, MATH_GUIDE, PHASE2_OVERVIEW, PHASE2C_ACCEPTANCE, PHASE2D_ACCEPTANCE, REFERENCES_GUIDE } from "./phase2GuideContent";
import { FORMATTING_TOOLBAR_GUIDE, INLINE_DIRECTIVES_PANELS_GUIDE, TABLES_MATH_PANELS_GUIDE } from "./toolbarGuideContent";
import { consolidatePhase2Guide } from "./consolidateGuide";
import { WEBSITE_THEME_GUIDE } from "./websiteTheme";

export const PHASE_2_SECTION_NOTE_ID = "lancarbon-guide-phase-2";
export const CODEMIRROR_GUIDE_NOTE_ID = "lancarbon-guide-codemirror";
export const PHASE_2A_ACCEPTANCE_NOTE_ID = "lancarbon-guide-phase-2a-acceptance";
export const EDIT_PREVIEW_GUIDE_NOTE_ID = "lancarbon-guide-edit-preview";
export const MYST_SYNTAX_GUIDE_NOTE_ID = "lancarbon-guide-myst-syntax";
export const PHASE_2B_ACCEPTANCE_NOTE_ID = "lancarbon-guide-phase-2b-acceptance";
const PHASE_2_SECTION_PAGE_ID = "lancarbon-guide-phase-2-page";
const CODEMIRROR_GUIDE_PAGE_ID = "lancarbon-guide-codemirror-page";
const PHASE_2A_ACCEPTANCE_PAGE_ID = "lancarbon-guide-phase-2a-acceptance-page";
const EDIT_PREVIEW_GUIDE_PAGE_ID = "lancarbon-guide-edit-preview-page";
const MYST_SYNTAX_GUIDE_PAGE_ID = "lancarbon-guide-myst-syntax-page";
const PHASE_2B_ACCEPTANCE_PAGE_ID = "lancarbon-guide-phase-2b-acceptance-page";

const PHASE_2_CONTENT = `## English

Phase 2 improves the writing experience while keeping the Phase 1 Workspace v2 format and Jupyter Book export unchanged.

Phase 2A replaces the plain text area with CodeMirror 6. It adds Markdown syntax highlighting, line numbers, the active line, bracket matching, folding, search, undo/redo, indentation and efficient editing for long documents. Light and dark editor themes follow the LanCarbon theme automatically.

Phase 2B adds a safe rendered preview based on the official MyST parser and HTML renderer. Mathematics, polished directives and roles, and cross-references will be added in Phase 2C. Editing always preserves the raw source: LanCarbon never rewrites or auto-formats stored content.

---

## 中文

Phase 2 在保持 Phase 1 的 Workspace v2 数据格式和 Jupyter Book 导出行为不变的前提下，逐步改善写作体验。

Phase 2A 使用 CodeMirror 6 取代原来的普通文本框，新增 Markdown 语法高亮、行号、当前行提示、括号匹配、代码折叠、搜索、撤销/重做、缩进以及长文档高效编辑。编辑器的浅色和深色外观会自动跟随 LanCarbon 主题。

Phase 2B 使用官方 MyST parser 和 HTML renderer 加入安全的渲染预览。数学公式、完善的 directive/role 以及交叉引用将在 Phase 2C 加入。编辑过程始终保留原始源码，LanCarbon 不会改写或自动格式化正文。`;

const CODEMIRROR_CONTENT = `## English

### What changed

The note body is now powered by CodeMirror 6. Markdown markers remain visible because LanCarbon stores your exact source text.

Available editing features:

- Line numbers and active-line highlighting.
- Markdown-aware syntax highlighting and code folding.
- Bracket matching and automatic bracket closing.
- Undo and redo with \`Ctrl+Z\` and \`Ctrl+Shift+Z\` or \`Ctrl+Y\`.
- Search and replace with \`Ctrl+F\`.
- Indent and outdent with \`Tab\` and \`Shift+Tab\`.
- Line wrapping without changing the saved Markdown.
- Chinese IME input and mixed Chinese/English documents.

LanCarbon still autosaves after an edit. The status at the top changes from **Saving…** to **All changes saved**. Switching notes, changing the app theme, restarting, and exporting a Book preserve the exact Markdown text.

### Useful checks

Try headings, emphasis, a link, a list, a fenced code block and Chinese text. Confirm that Markdown tokens use different colors, the line-number gutter follows the document, and no spelling underline appears.

---

## 中文

### 本次变化

笔记正文现在由 CodeMirror 6 驱动。Markdown 标记仍会直接显示，因为 LanCarbon 保存的是用户输入的原始文本。

当前可用的编辑功能：

- 显示行号并突出当前行。
- 根据 Markdown 语法高亮，并支持代码折叠。
- 括号匹配和自动补全括号。
- 使用 \`Ctrl+Z\` 撤销，使用 \`Ctrl+Shift+Z\` 或 \`Ctrl+Y\` 重做。
- 使用 \`Ctrl+F\` 搜索和替换。
- 使用 \`Tab\` 和 \`Shift+Tab\` 增加或减少缩进。
- 自动换行，但不会改变实际保存的 Markdown。
- 支持中文输入法以及中英文混合文档。

编辑后 LanCarbon 仍会自动保存，顶部状态会从 **Saving…** 变为 **All changes saved**。切换笔记、切换应用主题、重启软件以及导出 Book 时，原始 Markdown 都应保持不变。

### 建议检查

可以输入标题、强调、链接、列表、围栏代码块和中文内容，确认 Markdown 标记呈现不同颜色、行号随正文变化，并且不会出现拼写检查红色下划线。`;

const ACCEPTANCE_CONTENT = `## English

Use this checklist to accept Phase 2A:

1. Open this page and confirm that line numbers and Markdown syntax colors are visible.
2. Create a normal Note and enter Chinese and English text with an IME.
3. Add several Markdown headings, lists, links, brackets and a fenced code block.
4. Test \`Tab\`, \`Shift+Tab\`, \`Ctrl+Z\`, redo and \`Ctrl+F\` inside the body editor.
5. Switch between Light and Dark themes and confirm the editor changes without losing the cursor or content.
6. Wait for **All changes saved**, switch to another note, return, and confirm the exact text remains.
7. Restart LanCarbon and confirm the edited Note and Book pages are restored.
8. Export this Book to an empty directory and run \`jupyter book build --html --strict\` to confirm Phase 1 export still works.

Phase 2A is accepted when all checks pass. Rendered Preview is intentionally not part of this increment.

---

## 中文

请按以下步骤验收 Phase 2A：

1. 打开本页面，确认正文左侧显示行号，并且 Markdown 语法具有不同颜色。
2. 新建普通 Note，使用中文输入法输入中英文混合内容。
3. 输入多个 Markdown 标题、列表、链接、括号和围栏代码块。
4. 在正文编辑器中测试 \`Tab\`、\`Shift+Tab\`、\`Ctrl+Z\`、重做和 \`Ctrl+F\`。
5. 在 Light 与 Dark 主题之间切换，确认编辑器随之变化，并且光标和正文不会丢失。
6. 等待顶部显示 **All changes saved**，切换到其他笔记后再返回，确认文本完全一致。
7. 重启 LanCarbon，确认修改后的普通 Note 和 Book 页面都能恢复。
8. 将本 Book 导出到空目录，并运行 \`jupyter book build --html --strict\`，确认 Phase 1 导出功能没有回归。

以上检查全部通过即可验收 Phase 2A。本增量有意不包含渲染 Preview。`;

const EDIT_PREVIEW_CONTENT = `## English

Use the **Edit** and **Preview** buttons in the top toolbar to switch the note body between source editing and rendered output.

- **Edit** shows the CodeMirror Markdown source editor.
- **Preview** parses the current source with the official MyST parser and renders safe HTML.
- Switching modes does not save a second copy, rewrite Markdown, or change the export result.
- The editor instance stays alive while Preview is open, preserving its selection and undo history.
- Preview links are displayed but cannot navigate the Electron window away from LanCarbon.
- Embedded executable HTML and remote images are removed from the in-app preview for security. Asset handling belongs to Phase 3.

The title and tags remain visible in both modes. Statistics continue to count the original Markdown source rather than rendered text.

---

## 中文

使用顶部工具栏中的 **Edit** 和 **Preview** 按钮，可以在 Markdown 源码编辑与渲染结果之间切换。

- **Edit** 显示 CodeMirror Markdown 源码编辑器。
- **Preview** 使用官方 MyST parser 解析当前源码，并输出经过安全清理的 HTML。
- 切换模式不会另存一份内容、改写 Markdown 或改变导出结果。
- 打开 Preview 时编辑器实例仍会保留，因此选区和撤销历史不会丢失。
- 预览会显示链接，但不会允许链接把 Electron 窗口导航到 LanCarbon 之外。
- 为保证安全，应用内预览会删除可执行 HTML 和远程图片；资源管理属于 Phase 3。

标题和标签在两种模式下都保持可见，底部统计继续以原始 Markdown 源码为准，而不是统计渲染后的文字。`;

const MYST_SYNTAX_CONTENT = `## English

Phase 2B previews the common document structures needed for everyday writing:

- Headings, paragraphs, emphasis and strong text.
- Ordered and unordered lists.
- Links, block quotes and horizontal rules.
- Inline code and fenced code blocks.
- Tables and footnotes supported by the MyST parser.
- Standard MyST parsing of the source before HTML rendering.

This is a basic document preview, not the final Jupyter Book website theme. Phase 2C will add dedicated presentation for mathematics, directives, roles and cross-references. The exported project remains the authoritative way to verify full Jupyter Book output.

---

## 中文

Phase 2B 可以预览日常写作最常用的文档结构：

- 标题、段落、强调和粗体文字。
- 有序列表与无序列表。
- 链接、引用块和水平分隔线。
- 行内代码和围栏代码块。
- MyST parser 支持的表格与脚注。
- 在生成 HTML 前，先按照标准 MyST 规则解析源码。

这里提供的是基础文档预览，并不等同于最终的 Jupyter Book 网站主题。Phase 2C 将为数学公式、directive、role 和交叉引用加入专门显示方式。导出项目并使用官方 CLI 构建，仍然是验证完整 Jupyter Book 输出的权威方式。`;

const PHASE_2B_ACCEPTANCE_CONTENT = `## English

1. Open a Note containing headings, lists, emphasis, a link, a quote, a table and a fenced code block.
2. Select **Preview** and confirm each structure renders as formatted content rather than visible Markdown markers.
3. Select **Edit** and confirm the exact original source and undo history remain available.
4. Edit the source, open Preview again, and confirm the result updates immediately.
5. Click a link in Preview and confirm LanCarbon remains open on the same page.
6. Switch Light/Dark themes in both modes and confirm all text remains readable.
7. Restart the app and confirm the saved source remains unchanged.
8. Export the Book and run \`jupyter book build --html --strict\` to verify Phase 1 compatibility.

Phase 2B is accepted when this checklist and the Phase 2A checklist both pass.

---

## 中文

1. 打开一篇包含标题、列表、强调、链接、引用、表格和围栏代码块的 Note。
2. 点击 **Preview**，确认各种结构显示为格式化内容，而不是直接显示 Markdown 标记。
3. 点击 **Edit**，确认原始源码完全一致，且撤销历史仍然可用。
4. 修改源码后再次打开 Preview，确认渲染结果立即更新。
5. 点击 Preview 中的链接，确认 LanCarbon 仍停留在当前应用页面。
6. 在两种模式下切换 Light/Dark 主题，确认所有文字都清晰可读。
7. 重启应用，确认保存的源码没有发生变化。
8. 导出 Book 并运行 \`jupyter book build --html --strict\`，确认 Phase 1 兼容性。

本清单和 Phase 2A 清单全部通过，即可验收 Phase 2B。`;

function noteForPage(notes: Note[], book: Book, title: string): { note?: Note; page?: BookPage } {
  const note = notes.find(item => item.title.trim().toLocaleLowerCase("en-US") === title.toLocaleLowerCase("en-US")
    && Object.values(book.pages).some(page => page.noteId === item.id));
  return { note, page: note ? Object.values(book.pages).find(item => item.noteId === note.id) : undefined };
}

function ensureLegacyPhase2Guide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const guideIndex = workspace.books.findIndex(book => {
    const homeTitle = workspace.notes.find(note => note.id === book.pages[book.homePageId]?.noteId)?.title;
    return book.settings.title.trim().toLocaleLowerCase("en-US") === "lancarbon guide" || homeTitle?.trim().toLocaleLowerCase("en-US") === "lancarbon guide";
  });
  if (guideIndex < 0) return { workspace, changed: false };

  const original = workspace.books[guideIndex];
  let notes = workspace.notes;
  let pages = { ...original.pages };
  let roots = [...original.rootPageIds];
  let changed = false;
  const availableId = (requested: string, occupied: string[]) => occupied.includes(requested) ? `${requested}-${Date.now().toString(36)}` : requested;
  const availablePath = (requested: string) => {
    const occupied = new Set(Object.values(pages).map(page => page.exportPath.toLocaleLowerCase("en-US")));
    if (!occupied.has(requested.toLocaleLowerCase("en-US"))) return requested;
    const stem = requested.slice(0, -3);
    let suffix = 2;
    while (occupied.has(`${stem}-${suffix}.md`.toLocaleLowerCase("en-US"))) suffix += 1;
    return `${stem}-${suffix}.md`;
  };

  let section = noteForPage(notes, { ...original, pages }, "Phase 2 Reference").page
    ?? Object.values(pages).find(page => page.noteId === PHASE_2_SECTION_NOTE_ID);
  if (!section) {
    const noteId = availableId(PHASE_2_SECTION_NOTE_ID, notes.map(note => note.id));
    const pageId = availableId(PHASE_2_SECTION_PAGE_ID, Object.keys(pages));
    const note = createNote({ id: noteId, title: "Phase 2 Reference", content: PHASE2_OVERVIEW });
    section = { id: pageId, noteId: note.id, sourceType: "markdown", exportPath: availablePath("guide/phase-2/index.md"), showInToc: true, metadata: { label: "phase-2-reference" }, children: [] };
    notes = [...notes, note]; pages[section.id] = section; roots.push(section.id); changed = true;
  }

  const addChild = (title: string, noteId: string, pageId: string, exportPath: string, label: string, content: string) => {
    if (noteForPage(notes, { ...original, pages }, title).page || pages[pageId]?.noteId === noteId) return;
    noteId = availableId(noteId, notes.map(note => note.id));
    pageId = availableId(pageId, Object.keys(pages));
    const note = createNote({ id: noteId, title, content });
    const page: BookPage = { id: pageId, noteId, sourceType: "markdown", exportPath: availablePath(exportPath), showInToc: true, metadata: { label }, children: [] };
    notes = [...notes, note]; pages[pageId] = page;
    section = { ...section!, children: [...section!.children, pageId] }; pages[section!.id] = section!; changed = true;
  };

  addChild("CodeMirror Editor", CODEMIRROR_GUIDE_NOTE_ID, CODEMIRROR_GUIDE_PAGE_ID, "guide/phase-2/codemirror-editor.md", "codemirror-editor", CODEMIRROR_CONTENT);
  addChild("Phase 2A Acceptance", PHASE_2A_ACCEPTANCE_NOTE_ID, PHASE_2A_ACCEPTANCE_PAGE_ID, "guide/phase-2/phase-2a-acceptance.md", "phase-2a-acceptance", ACCEPTANCE_CONTENT);
  addChild("Edit and Preview", EDIT_PREVIEW_GUIDE_NOTE_ID, EDIT_PREVIEW_GUIDE_PAGE_ID, "guide/phase-2/edit-and-preview.md", "edit-and-preview", EDIT_PREVIEW_CONTENT);
  addChild("MyST Syntax", MYST_SYNTAX_GUIDE_NOTE_ID, MYST_SYNTAX_GUIDE_PAGE_ID, "guide/phase-2/myst-syntax.md", "myst-syntax", MYST_SYNTAX_CONTENT);
  addChild("Phase 2B Acceptance", PHASE_2B_ACCEPTANCE_NOTE_ID, PHASE_2B_ACCEPTANCE_PAGE_ID, "guide/phase-2/phase-2b-acceptance.md", "phase-2b-acceptance", PHASE_2B_ACCEPTANCE_CONTENT);
  addChild("Mathematics and Equations", "lancarbon-guide-mathematics", "lancarbon-guide-mathematics-page", "guide/phase-2/mathematics.md", "phase-2-mathematics", MATH_GUIDE);
  addChild("Directives and Roles", "lancarbon-guide-directives", "lancarbon-guide-directives-page", "guide/phase-2/directives.md", "phase-2-directives", DIRECTIVES_GUIDE);
  addChild("Cross References", "lancarbon-guide-references", "lancarbon-guide-references-page", "guide/phase-2/references.md", "phase-2-references", REFERENCES_GUIDE);
  addChild("Phase 2C Acceptance", "lancarbon-guide-phase-2c", "lancarbon-guide-phase-2c-page", "guide/phase-2/phase-2c-acceptance.md", "phase-2c-acceptance", PHASE2C_ACCEPTANCE);
  addChild("Phase 2D Acceptance", "lancarbon-guide-phase-2d", "lancarbon-guide-phase-2d-page", "guide/phase-2/phase-2d-acceptance.md", "phase-2d-acceptance", PHASE2D_ACCEPTANCE);
  addChild("Formatting Toolbar", "lancarbon-guide-formatting-toolbar", "lancarbon-guide-formatting-toolbar-page", "guide/phase-2/formatting-toolbar.md", "formatting-toolbar", FORMATTING_TOOLBAR_GUIDE);
  addChild("Tables and Math Panels", "lancarbon-guide-table-math-panels", "lancarbon-guide-table-math-panels-page", "guide/phase-2/table-math-panels.md", "table-math-panels", TABLES_MATH_PANELS_GUIDE);
  addChild("Inline Roles and Directive Panels", "lancarbon-guide-toolbar-roles-directives", "lancarbon-guide-toolbar-roles-directives-page", "guide/phase-2/toolbar-roles-directives.md", "toolbar-roles-directives", INLINE_DIRECTIVES_PANELS_GUIDE);
  // Upgrade only untouched generated introductions. User-authored text is never replaced.
  const upgrades = new Map([
    [PHASE_2_CONTENT, PHASE2_OVERVIEW],
    [MYST_SYNTAX_CONTENT, MYST_SYNTAX_CONTENT.replace("Phase 2C will add dedicated presentation for mathematics, directives, roles and cross-references.", "Phase 2C now adds mathematics, directives, roles and within-Book cross-references; see the new reference pages below.").replace("Phase 2C 将为数学公式、directive、role 和交叉引用加入专门显示方式。", "Phase 2C 现已加入数学公式、directive、role 和同 Book 交叉引用，请继续阅读新增参考页面。")]
  ]);
  const pageNoteIds = new Set(Object.values(pages).map(page => page.noteId));
  notes = notes.map(note => {
    const content = pageNoteIds.has(note.id) ? upgrades.get(note.content) : undefined;
    if (!content) return note;
    changed = true; return { ...note, content, updatedAt: new Date().toISOString() };
  });
  if (!changed) return { workspace, changed: false };

  const book = { ...original, pages, rootPageIds: roots, updatedAt: new Date().toISOString() };
  return { workspace: { ...workspace, notes, books: workspace.books.map((item, index) => index === guideIndex ? book : item) }, changed: true };
}

export function ensurePhase2Guide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const guide = workspace.books.find(book => book.phase2GuideRevision === 1);
  if (guide) return ensureWebsiteThemeGuide(workspace);
  const legacy = ensureLegacyPhase2Guide(workspace);
  const consolidated = consolidatePhase2Guide(legacy.workspace, new Map([
    [CODEMIRROR_GUIDE_NOTE_ID, CODEMIRROR_CONTENT],
    [EDIT_PREVIEW_GUIDE_NOTE_ID, EDIT_PREVIEW_CONTENT],
    [MYST_SYNTAX_GUIDE_NOTE_ID, MYST_SYNTAX_CONTENT],
    [PHASE_2A_ACCEPTANCE_NOTE_ID, ACCEPTANCE_CONTENT],
    [PHASE_2B_ACCEPTANCE_NOTE_ID, PHASE_2B_ACCEPTANCE_CONTENT],
    ["lancarbon-guide-mathematics", MATH_GUIDE],
    ["lancarbon-guide-directives", DIRECTIVES_GUIDE],
    ["lancarbon-guide-references", REFERENCES_GUIDE],
    ["lancarbon-guide-phase-2c", PHASE2C_ACCEPTANCE],
    ["lancarbon-guide-phase-2d", PHASE2D_ACCEPTANCE],
    ["lancarbon-guide-formatting-toolbar", FORMATTING_TOOLBAR_GUIDE],
    ["lancarbon-guide-table-math-panels", TABLES_MATH_PANELS_GUIDE],
    ["lancarbon-guide-toolbar-roles-directives", INLINE_DIRECTIVES_PANELS_GUIDE],
  ]));
  const themed = ensureWebsiteThemeGuide(consolidated.workspace);
  return { workspace: themed.workspace, changed: consolidated.changed || themed.changed };
}

function ensureWebsiteThemeGuide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const book = workspace.books.find(item => item.phase2GuideRevision === 1);
  const page = book && Object.values(book.pages).find(item => item.noteId === CODEMIRROR_GUIDE_NOTE_ID);
  const note = page && workspace.notes.find(item => item.id === page.noteId);
  if (!note || note.content.includes("## Exported Website Theme / 导出网站主题")) return { workspace, changed: false };
  const updated = { ...note, content: `${note.content}\n\n${WEBSITE_THEME_GUIDE}`, updatedAt: new Date().toISOString() };
  return { workspace: { ...workspace, notes: workspace.notes.map(item => item.id === note.id ? updated : item) }, changed: true };
}
