import YAML from "yaml";
import { createNote } from "./notes";
import { splitFrontmatter } from "./jupyter-book";
import { SYNTAX_LAB_GUIDE } from "./syntaxLabContent";
import { PHASE2_OVERVIEW } from "./phase2GuideContent";
import type { BookPage, Note, WorkspaceFile } from "./types";

type Source = { note: Note; page: BookPage };
const groups = [
  { title: "Editing and Formatting", ids: ["codemirror", "edit-preview", "myst-syntax", "formatting-toolbar"] },
  { title: "Tables and Mathematics", ids: ["mathematics", "table-math-panels"] },
  { title: "Directives and Roles", ids: ["directives", "toolbar-roles-directives"] },
  { title: "Cross References", ids: ["references"], extra: "Reference Lab" },
  { title: "Syntax Lab", ids: [], extra: "Syntax Lab" },
  { title: "Phase 2 Acceptance", ids: ["phase-2d", "phase-2a-acceptance", "phase-2b-acceptance", "phase-2c"] },
];

const overview = `## English

Phase 1 and Phase 2 have been completed and accepted. Phase 2A covers the CodeMirror editor, 2B covers Edit/Preview, 2C covers mathematics, directives, roles and cross-references, and 2D covers testing and delivery. The formatting toolbar is included in this guide.

The former short tutorials and checklists are now collected into six pages:

1. **Editing and Formatting** — editor, preview, Markdown basics, toolbar and shortcuts.
2. **Tables and Mathematics** — table/math panels, templates, formula syntax and offline rendering.
3. **Directives and Roles** — callouts, nested/expandable blocks and inline formatting.
4. **Cross References** — labels, file links and the existing Reference Lab exercises.
5. **Syntax Lab** — comprehensive bilingual examples and your existing Tools Test exercises.
6. **Phase 2 Acceptance** — the combined 2A–2D checks, export and restart verification.

Edit always stores Markdown; switching modes does not rewrite it. Preview is an offline writing aid, and final publication is verified using the official Jupyter Book CLI. Images, attachments and bibliography management belong to Phase 3. The original workspace is backed up in Data Location before consolidation.

## 中文

Phase 1 与 Phase 2 已完成并验收。2A 对应 CodeMirror 编辑器，2B 对应 Edit/Preview，2C 对应公式、指令、行内角色和交叉引用，2D 对应测试与交付。后续增加的格式工具栏也已纳入本教程。

原先分散的教程和验收清单现整合为六篇：

1. **Editing and Formatting**：编辑器、预览、Markdown 基础、工具栏及快捷键。
2. **Tables and Mathematics**：表格与公式面板、模板、公式语法及离线渲染。
3. **Directives and Roles**：提示框、嵌套与折叠块、行内格式。
4. **Cross References**：标签、文件链接，以及原 Reference Lab 引用练习。
5. **Syntax Lab**：综合双语语法示例，以及原 Tools Test 操作练习。
6. **Phase 2 Acceptance**：合并后的 2A–2D 验收清单、导出与重启验证。

Edit 始终保存 Markdown，切换模式不改写正文。Preview 是离线写作辅助，正式发布结果以官方 Jupyter Book CLI 构建为准。图片、附件和文献管理属于 Phase 3。整合前的完整工作区会备份到 Data Location 所示目录。`;

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

function relativePath(from: string, to: string): string {
  const a = from.split("/").slice(0, -1), b = to.split("/");
  while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
  return [...a.map(() => ".."), ...b].join("/");
}

// Rewrite Markdown destinations, not arbitrary prose or fenced/inline code examples.
export function relocateGuideLinks(content: string, from: string, to: string, moves: Map<string, { path: string; label?: string }>): string {
  const rewrite = (url: string) => {
    if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)) return url;
    const match = /^([^?#]+)([?#].*)?$/.exec(url);
    if (!match) return url;
    let decoded: string;
    try { decoded = decodeURIComponent(match[1]); } catch { return url; }
    const resolved = normalizePath(`${from.split("/").slice(0, -1).join("/")}/${decoded}`);
    const moved = moves.get(resolved);
    if (!moved && from === to) return url;
    const target = moved?.path ?? resolved;
    const fragment = match[2] ?? (moved?.label ? `#${moved.label}` : "");
    return `${relativePath(to, target)}${fragment}`;
  };
  let fence: { char: string; length: number } | undefined;
  return content.split("\n").map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return line;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return line;
    return line.replace(/(`+)([\s\S]*?)\1|\]\(\s*(<[^>\n]+>|[^\s)]+)|^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)/g,
      (all, ticks: string | undefined, _code: string, inline: string | undefined, prefix: string | undefined, definition: string | undefined) => {
        if (ticks) return all;
        const value = inline ?? definition!;
        const wrapped = value.startsWith("<");
        const updated = rewrite(wrapped ? value.slice(1, -1) : value);
        return `${prefix ?? all.slice(0, all.length - value.length)}${wrapped ? `<${updated}>` : updated}`;
      });
  }).join("\n");
}

function currentInstructions(content: string): string {
  return content
    .replaceAll("Mathematics and Equations", "Tables and Mathematics")
    .replaceAll("Tables and Math Panels", "Tables and Mathematics")
    .replaceAll("Inline Roles and Directive Panels", "Directives and Roles")
    .replaceAll("Complete Phase 2C Acceptance.", "Complete the Phase 2C checklist below.")
    .replaceAll("完成 Phase 2C Acceptance。", "完成下方 Phase 2C 清单。")
    .replaceAll("Phase 2C will add dedicated presentation for mathematics, directives, roles and cross-references.", "Phase 2C provides mathematics, directives, roles and cross-references.")
    .replaceAll("Phase 2C 将为数学公式、directive、role 和交叉引用加入专门显示方式。", "Phase 2C 已提供数学公式、directive、role 和交叉引用的显示方式。")
    .replaceAll("Rendered Preview is intentionally not part of this increment.", "Preview is covered by the Phase 2B and Phase 2C checks below.")
    .replaceAll("本增量有意不包含渲染 Preview。", "Preview 由下方 Phase 2B 与 Phase 2C 清单覆盖。")
    .replaceAll("Click a link in Preview and confirm LanCarbon remains open on the same page.", "Click an external link and confirm it does not navigate the app; internal Book links should open their target.")
    .replaceAll("点击 Preview 中的链接，确认 LanCarbon 仍停留在当前应用页面。", "点击外部链接，确认不会导航应用窗口；Book 内部链接则应打开正确目标。");
}

export function consolidatePhase2Guide(workspace: WorkspaceFile, generated: Map<string, string>): { workspace: WorkspaceFile; changed: boolean } {
  const book = workspace.books.find(item => item.settings.title.trim().toLowerCase() === "lancarbon guide"
    || workspace.notes.find(note => note.id === item.pages[item.homePageId]?.noteId)?.title.trim().toLowerCase() === "lancarbon guide");
  if (!book || book.phase2GuideRevision === 1) return { workspace, changed: false };
  const section = Object.values(book.pages).find(page => page.noteId === "lancarbon-guide-phase-2")
    ?? Object.values(book.pages).find(page => workspace.notes.find(note => note.id === page.noteId)?.title === "Phase 2 Reference");
  if (!section) return { workspace, changed: false };
  const sources: Source[] = Object.values(book.pages).map(page => ({ page, note: workspace.notes.find(note => note.id === page.noteId)! }));
  const assigned = new Set<string>();
  const plans = groups.map(group => {
    const selected = group.ids.flatMap(id => {
      const source = sources.find(item => item.note.id === `lancarbon-guide-${id}`);
      return source ? [source] : [];
    });
    if (group.extra) {
      const extra = sources.find(item => item.note.title === group.extra && section.children.includes(item.page.id));
      if (extra) selected.push(extra);
    }
    if (group.title === "Syntax Lab" && !selected.length) {
      const note = createNote({ title: "Syntax Lab", content: SYNTAX_LAB_GUIDE });
      let exportPath = "syntax-lab.md", suffix = 2;
      while (sources.some(item => item.page.exportPath === exportPath)) exportPath = `syntax-lab-${suffix++}.md`;
      selected.push({ note, page: { id: `${note.id}-page`, noteId: note.id, sourceType: "markdown", exportPath, showInToc: true, metadata: { label: "acceptance-syntax-page" }, children: [] } });
    }
    selected.forEach(source => assigned.add(source.page.id));
    return { title: group.title, sources: selected, target: selected[0] };
  });
  // Additional user exercises stay in the guide, collected into Syntax Lab.
  const lab = plans[4];
  for (const source of sources.filter(item => section.children.includes(item.page.id) && !assigned.has(item.page.id))) {
    lab.sources.push(source); assigned.add(source.page.id);
  }
  if (plans.some(plan => !plan.target)) throw new Error("Cannot consolidate an incomplete Phase 2 guide");
  const moves = new Map<string, { path: string; label?: string }>();
  for (const plan of plans) for (const source of plan.sources) {
    const label = source.page.metadata.label ?? (source === plan.target ? undefined : `merged-${source.page.id}`);
    moves.set(source.page.exportPath, { path: plan.target.page.exportPath, ...(source !== plan.target ? { label } : {}) });
  }
  const notes = new Map(workspace.notes.map(note => [note.id, note]));
  const pages = { ...book.pages };
  const now = new Date().toISOString();
  for (const plan of plans) {
    const en: string[] = [], zh: string[] = [], custom: string[] = [];
    const frontmatter: Record<string, unknown> = {};
    for (const source of plan.sources) {
      const split = splitFrontmatter(source.note.content);
      // Keep page macros when a source with frontmatter becomes a subsection.
      for (const [key, value] of Object.entries(split.frontmatter)) {
        if (["title", "label", "short_title"].includes(key)) continue;
        if (key === "math" && value && typeof value === "object") {
          const previous = (frontmatter.math ?? {}) as Record<string, unknown>;
          for (const [macro, expansion] of Object.entries(value)) {
            if (macro in previous && previous[macro] !== expansion) throw new Error(`Conflicting math macro ${macro}; original guide kept`);
          }
          frontmatter.math = { ...previous, ...value };
        } else if (!(key in frontmatter)) frontmatter[key] = value;
      }
      let body = relocateGuideLinks(split.body, source.page.exportPath, plan.target.page.exportPath, moves);
      const known = generated.get(source.note.id);
      const clean = (value: string) => value.replace(/\r\n/g, "\n").trim();
      if (known && (clean(known) === clean(source.note.content) || source.note.id === "lancarbon-guide-myst-syntax" && /Phase 2C now adds/.test(source.note.content))) body = currentInstructions(body);
      const alias = moves.get(source.page.exportPath)?.label;
      const anchor = alias && !new RegExp(`^\\(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)=$`, "m").test(body) ? `(${alias})=\n` : "";
      const bilingual = /^## English\s*\n([\s\S]*?)\n## 中文\s*\n([\s\S]*)$/.exec(body.trim());
      if (bilingual) {
        en.push(`${anchor}### ${en.length + 1}. ${source.note.title}\n\n${bilingual[1].trim().replace(/\n---$/, "").replace(/^### /gm, "#### ")}`);
        zh.push(`### ${zh.length + 1}. ${source.note.title} / 中文\n\n${bilingual[2].trim().replace(/^### /gm, "#### ")}`);
      } else {
        const firstHeading = /^# ([^\n]+)\n/.exec(body.trim());
        const hasOwnTitle = firstHeading?.[1].startsWith(source.note.title);
        custom.push(hasOwnTitle ? `${anchor}${body.trim().replace(/^# /, "## ")}` : `${anchor}## ${source.note.title}\n\n${body.trim()}`);
      }
      notes.delete(source.note.id); delete pages[source.page.id];
    }
    let body = [...(en.length ? [`## English\n\n${en.join("\n\n")}\n\n## 中文\n\n${zh.join("\n\n")}`] : []), ...custom].join("\n\n");
    if (plan.title === "Syntax Lab") {
      body = body.replace(/\[Open Reference Lab \/ 打开引用实验室\]\(reference-lab.md\)/g, `[Open Cross References / 打开交叉引用](${relativePath(plan.target.page.exportPath, plans[3].target.page.exportPath)})`);
    }
    const content = Object.keys(frontmatter).length ? `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${body}` : body;
    const tags = [...new Set(plan.sources.flatMap(source => source.note.tags))];
    if (tags.length > 12) throw new Error("Too many tags to merge safely; original guide kept");
    notes.set(plan.target.note.id, { ...plan.target.note, title: plan.title, content, tags, pinned: plan.sources.some(source => source.note.pinned), updatedAt: now });
    pages[plan.target.page.id] = { ...plan.target.page, children: plan.sources.flatMap(source => source.page.children).filter(id => !assigned.has(id)) };
  }
  for (const [id, page] of Object.entries(pages)) {
    if (id !== section.id) pages[id] = { ...page, children: page.children.filter(child => !assigned.has(child)) };
    if (assigned.has(id)) continue;
    const note = notes.get(page.noteId)!;
    const content = relocateGuideLinks(note.content, page.exportPath, page.exportPath, moves);
    if (content !== note.content) notes.set(note.id, { ...note, content, updatedAt: now });
  }
  pages[section.id] = { ...section, children: plans.map(plan => plan.target.page.id) };
  const sectionNote = notes.get(section.noteId)!;
  const originalOverview = sectionNote.content.replace(/\r\n/g, "\n").trim() === PHASE2_OVERVIEW.replace(/\r\n/g, "\n").trim();
  notes.set(sectionNote.id, { ...sectionNote, content: originalOverview ? overview : `${overview}\n\n## Previous introduction / 原有介绍\n\n${sectionNote.content}`, updatedAt: now });
  const updated = { ...book, pages, phase2GuideRevision: 1 as const, rootPageIds: book.rootPageIds.filter(id => !assigned.has(id)), updatedAt: now };
  return { workspace: { ...workspace, notes: [...notes.values()], books: workspace.books.map(item => item.id === book.id ? updated : item) }, changed: true };
}
