import { isolateHistory, redo, undo } from "@codemirror/commands";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type Span = { from: number; to: number };
export type Format = "bold" | "italic" | "inlineCode" | "underline" | "delete" | "sup" | "sub" | "kbd";
export type Alignment = "left" | "center" | "right";
export type Command = Format | "undo" | "redo" | "quote" | "bullet" | "ordered" | "indent" | "outdent" | "separator" | `heading${number}` | `align${Capitalize<Alignment>}`;
export const admonitionOptions = [
  { value: "note", label: "Note" }, { value: "tip", label: "Tip" }, { value: "important", label: "Important" },
  { value: "warning", label: "Warning" }, { value: "caution", label: "Caution" }, { value: "admonition", label: "Admonition" }
] as const;
export type AdmonitionKind = typeof admonitionOptions[number]["value"];
export const directiveOptions = [...admonitionOptions, { value: "nested", label: "Nested blocks" }, { value: "dropdown", label: "Dropdown" }, { value: "initiallyOpen", label: "Initially open" }] as const;
export type DirectiveKind = typeof directiveOptions[number]["value"];
export type PanelKind = "link" | "code" | "table" | "math" | "abbr" | "keyboard" | DirectiveKind;
export const isDirectiveKind = (kind: PanelKind): kind is DirectiveKind => directiveOptions.some(option => option.value === kind);
export type TableData = { rows: string[][]; align: ("default" | "left" | "center" | "right")[] };
export type PanelDraft = Span & { kind: PanelKind; original: string; existing: boolean; text: string; title: string; url: string; language: string; display: boolean; table: TableData; explanation: string; innerText: string; innerTitle: string; outerKind: AdmonitionKind; innerKind: AdmonitionKind };
const wrappers: Record<Format, [string, string]> = {
  bold: ["**", "**"], italic: ["*", "*"], inlineCode: ["`", "`"],
  underline: ["{underline}`", "`"], delete: ["{delete}`", "`"], sup: ["{sup}`", "`"], sub: ["{sub}`", "`"], kbd: ["{kbd}`", "`"]
};
const intersects = (a: Span, b: Span) => a.from === a.to ? a.from >= b.from && a.from < b.to : a.from < b.to && a.to > b.from;
const escaped = (source: string, i: number) => { let n = 0; while (i > 0 && source[--i] === "\\") n++; return n % 2 === 1; };

function alignmentBlock(source: string, range: Span) {
  const pattern = /^(:{3,})\{div\}\s*\r?\n:class:\s+(lc-align-(left|center|right))\s*\r?\n\r?\n([\s\S]*?)^\1\s*$/gm;
  for (const match of source.matchAll(pattern)) {
    const localClass = match[0].indexOf(match[2]);
    const localBody = match[0].indexOf(match[4], localClass + match[2].length);
    const body = { from: match.index! + localBody, to: match.index! + localBody + match[4].length };
    if (range.from >= body.from && range.to <= body.to) return { classRange: { from: match.index! + localClass, to: match.index! + localClass + match[2].length }, body };
  }
}

// Parsing is performed on command/panel invocation, never on every text input.
export function nodes(source: string, names: string[]) {
  const result: (Span & { name: string; parent: string })[] = [];
  markdownLanguage.parser.parse(source).iterate({ enter(node) {
    if (names.includes(node.name)) result.push({ from: node.from, to: node.to, name: node.name, parent: node.node.parent?.name ?? "" });
  } });
  return result;
}

export function mathSpans(source: string): (Span & { text: string; display: boolean })[] {
  const code = nodes(source, ["FencedCode", "CodeBlock", "InlineCode"]);
  const result: (Span & { text: string; display: boolean })[] = [];
  for (let i = 0; i < source.length; i++) {
    const excluded = code.find(span => i >= span.from && i < span.to);
    if (excluded) { i = excluded.to - 1; continue; }
    if (source[i] !== "$" || escaped(source, i)) continue;
    const display = source[i + 1] === "$";
    const width = display ? 2 : 1;
    for (let j = i + width; j < source.length; j++) {
      if (!display && source[j] === "\n") break;
      if (source[j] !== "$" || escaped(source, j)) continue;
      if (display && source[j + 1] !== "$") continue;
      if (!display && (source[j + 1] === "$" || j === i + 1 || /\s/.test(source[i + 1]) || /\s/.test(source[j - 1]) || /\d/.test(source[j + 1] ?? ""))) break;
      result.push({ from: i, to: j + width, text: source.slice(i + width, j).replace(/^\n|\n$/g, ""), display });
      i = j + width - 1; break;
    }
  }
  return result;
}

function protectedSpans(source: string, allowInlineCode = false) {
  const spans: Span[] = nodes(source, ["FencedCode", "CodeBlock", "Table", "HTMLBlock", ...(allowInlineCode ? [] : ["InlineCode"])]);
  spans.push(...mathSpans(source));
  const yaml = /^(?:\uFEFF)?---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/.exec(source);
  if (yaml) spans.push({ from: 0, to: yaml[0].length });
  // MyST colon math/directive options cannot be safely formatted as prose.
  for (const match of source.matchAll(/^(:{3,})\{(?:math|list-table)\}[^\n]*\n[\s\S]*?^\1\s*$/gm)) spans.push({ from: match.index!, to: match.index! + match[0].length });
  for (const match of source.matchAll(/^\s*(?::{3,}.*|:[\w-]+:.*|\([^)]+\)=)\s*$/gm)) spans.push({ from: match.index!, to: match.index! + match[0].length });
  return spans;
}

export function replace(view: EditorView, range: Span, insert: string, selection?: Span) {
  view.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: EditorSelection.range(selection?.from ?? range.from + insert.length, selection?.to ?? selection?.from ?? range.from + insert.length), annotations: isolateHistory.of("full"), scrollIntoView: true });
  view.focus();
}

export function blockText(source: string, range: Span, body: string) {
  const before = source.slice(0, range.from), after = source.slice(range.to);
  const prefix = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = !after ? "\n\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return { text: prefix + body + suffix, offset: prefix.length };
}

function formatNode(source: string, range: Span, format: Format) {
  const [open, close] = wrappers[format];
  if (range.from === range.to && source.slice(range.from - open.length, range.from) === open && source.slice(range.to, range.to + close.length) === close) return { from: range.from - open.length, to: range.to + close.length, open: open.length, close: close.length };
  const name = format === "bold" ? "StrongEmphasis" : format === "italic" ? "Emphasis" : "InlineCode";
  const candidates = nodes(source, [name]).filter(n => range.from >= n.from && range.to <= n.to);
  for (const node of candidates.reverse()) {
    const raw = source.slice(node.from, node.to);
    if (format === "bold" || format === "italic") {
      const size = format === "bold" ? 2 : 1;
      return { ...node, open: size, close: size };
    }
    const role = /\{([\w-]+)\}$/.exec(source.slice(Math.max(0, node.from - 30), node.from));
    if (format === "inlineCode" && !role) return { ...node, open: /^`+/.exec(raw)![0].length, close: /`+$/.exec(raw)![0].length };
    if (role?.[1] === format) return { ...node, from: node.from - role[0].length, open: role[0].length + 1, close: 1 };
  }
}

export function runCommand(view: EditorView, command: Command): string | null {
  if (view.composing) return "Finish composing your text before formatting.";
  if (command === "undo" || command === "redo") { (command === "undo" ? undo : redo)(view); view.focus(); return null; }
  if (view.state.selection.ranges.length > 1) return "Use one selection at a time when formatting.";
  const range = view.state.selection.main, source = view.state.doc.toString();
  const inline = command in wrappers;
  const current = inline ? formatNode(source, range, command as Format) : undefined;
  const first = view.state.doc.lineAt(range.from), last = view.state.doc.lineAt(range.to > range.from && source[range.to - 1] === "\n" ? range.to - 1 : range.to);
  const affected = inline || command === "separator" ? range : { from: first.from, to: last.to };
  if (/^align(?:Left|Center|Right)$/.test(command)) {
    const alignment = command.slice(5).toLowerCase() as Alignment;
    const className = `lc-align-${alignment}`;
    const existing = alignmentBlock(source, range);
    if (existing) {
      const delta = className.length - (existing.classRange.to - existing.classRange.from);
      replace(view, existing.classRange, className, { from: range.from + delta, to: range.to + delta });
      return null;
    }
    if (!source.slice(affected.from, affected.to).trim()) return "Enter text before choosing its alignment.";
    if (protectedSpans(source).some(span => intersects(affected, span))) return "This selection contains code, math, a table or special syntax. Use its panel or edit the source.";
    const selected = source.slice(affected.from, affected.to);
    const longestFence = Math.max(2, ...Array.from(selected.matchAll(/:{3,}/g), match => match[0].length));
    const fence = ":".repeat(longestFence + 1);
    const opening = `${fence}{div}\n:class: ${className}\n\n`;
    const block = blockText(source, affected, `${opening}${selected}\n${fence}`);
    replace(view, affected, block.text, {
      from: affected.from + block.offset + opening.length + range.from - affected.from,
      to: affected.from + block.offset + opening.length + range.to - affected.from
    });
    return null;
  }
  if (protectedSpans(source, !!current || command === "inlineCode").some(span => intersects(affected, span))) return "This selection contains code, math, a table or special syntax. Use its panel or edit the source.";
  if (inline) {
    if (current) {
      const body = source.slice(current.from + current.open, current.to - current.close);
      const mapped = (position: number) => Math.min(current.from + body.length, Math.max(current.from, position - current.open));
      replace(view, current, body, { from: mapped(range.from), to: mapped(range.to) });
      return null;
    }
    // Removing a format across paragraphs must remove each complete wrapper,
    // including wrappers just outside the preserved inner selection.
    if (!range.empty) {
      const parts = source.slice(range.from, range.to).split("\n");
      let offset = range.from;
      const formatted = parts.filter(line => {
        const start = offset; offset += line.length + 1;
        if (!line.trim()) return false;
        return !formatNode(source, { from: start, to: start + line.length }, command as Format);
      });
      if (!formatted.length && parts.some(line => line.trim())) {
        offset = range.from;
        const spans = parts.flatMap(line => {
          const start = offset; offset += line.length + 1;
          const node = line.trim() ? formatNode(source, { from: start, to: start + line.length }, command as Format) : undefined;
          return node ? [node] : [];
        });
        const start = spans[0].from, end = spans.at(-1)!.to;
        let output = "", cursor = start;
        for (const span of spans) { output += source.slice(cursor, span.from) + source.slice(span.from + span.open, span.to - span.close); cursor = span.to; }
        output += source.slice(cursor, end);
        replace(view, { from: start, to: end }, output, { from: start, to: start + output.length }); return null;
      }
    }
    let [open, close] = wrappers[command as Format];
    const selected = source.slice(range.from, range.to);
    if (command === "inlineCode") {
      const fence = "`".repeat(Math.max(0, ...Array.from(selected.matchAll(/`+/g), m => m[0].length)) + 1);
      const pad = /^`|`$|^ .* $/.test(selected) ? " " : "";
      open = fence + pad; close = pad + fence;
    }
    if (!range.empty && ["underline", "delete", "sup", "sub", "kbd"].includes(command) && selected.includes("`")) return "The selection contains backticks. Edit this extended format in source.";
    if (command === "kbd" && /[\r\n]/.test(selected)) return "A keyboard shortcut must be on one line.";
    const insert = selected ? selected.split("\n").map(line => line.trim() ? line.replace(/^(\s*)(.*?)(\s*)$/, (_m, left, text, right) => left + open + text + close + right) : line).join("\n") : open + close;
    replace(view, range, insert, { from: range.from + open.length, to: range.empty ? range.from + open.length : range.from + insert.length - close.length });
    return null;
  }
  if (command === "separator") {
    const block = blockText(source, { from: last.to, to: last.to }, "---");
    replace(view, { from: last.to, to: last.to }, block.text); return null;
  }
  let end = last.to;
  const lines = source.slice(first.from, end).split("\n");
  if (command === "indent" || command === "outdent") {
    if (!/^\s*(?:[-+*]|\d+[.)])\s/.test(lines[0])) return "Place the cursor in a list item.";
    const indent = /^ */.exec(lines[0])![0].length;
    let item = markdownLanguage.parser.parse(source).resolveInner(first.to, -1);
    while (item.name !== "ListItem" && item.parent) item = item.parent;
    if (item.name !== "ListItem") return "Edit indentation in source for this complex list.";
    // Include descendants of the final selected item, retaining relative indentation.
    for (let n = last.number + 1; n <= view.state.doc.lines; n++) {
      const line = view.state.doc.line(n);
      if (!line.text.trim() || /^ */.exec(line.text)![0].length <= indent) break;
      lines.push(line.text); end = line.to;
    }
    const previous = item.prevSibling;
    if (command === "indent" && previous?.name !== "ListItem") return "The first list item cannot be indented. Add a preceding item at the same level.";
    if (command === "outdent" && indent === 0) return null;
    let parentItem = item.parent;
    while (parentItem && parentItem.name !== "ListItem") parentItem = parentItem.parent;
    const parentIndent = parentItem ? /^ */.exec(view.state.doc.lineAt(parentItem.from).text)![0].length : 0;
    const amount = command === "indent" ? /^(?:[-+*]|\d+[.)])\s+/.exec(source.slice(previous!.from, previous!.to))?.[0].length ?? 2 : indent - parentIndent;
    const result = lines.map(line => command === "indent" ? " ".repeat(amount) + line : line.slice(Math.min(amount, /^ */.exec(line)![0].length))).join("\n");
    replace(view, { from: first.from, to: end }, result, { from: first.from, to: first.from + result.length }); return null;
  }
  const quoteOn = lines.every(line => /^\s*>/.test(line));
  const bulletOn = lines.some(line => /^\s*(?:>\s*)*[-+*]\s/.test(line)) && lines.every(line => !line.trim() || /^\s*(?:>\s*)*[-+*]\s/.test(line));
  const orderedOn = lines.some(line => /^\s*(?:>\s*)*\d+[.)]\s/.test(line)) && lines.every(line => !line.trim() || /^\s*(?:>\s*)*\d+[.)]\s/.test(line));
  const counts = new Map<string, number>();
  if (command === "bullet" || command === "ordered") {
    const items = nodes(source, ["ListItem"]);
    const changes = lines.map((line, index) => {
      const lineStart = view.state.doc.line(first.number + index).from;
      const prefix = /^(\s*(?:>\s*)*)/.exec(line)![0];
      const oldMarker = /^(?:[-+*]|\d+[.)])\s+/.exec(line.slice(prefix.length))?.[0] ?? "";
      for (const key of counts.keys()) if (key.length > prefix.length) counts.delete(key);
      const count = (counts.get(prefix) ?? 0) + 1; counts.set(prefix, count);
      const marker = (command === "bullet" && bulletOn) || (command === "ordered" && orderedOn) ? "" : command === "bullet" ? "- " : `${count}. `;
      const item = items.find(item => item.from === lineStart + prefix.length);
      return { lineStart, prefix, oldMarker, marker: !line.trim() && lines.length > 1 ? "" : marker, item };
    });
    const end = Math.max(last.to, ...changes.map(change => change.item?.to ?? last.to));
    const lastLine = view.state.doc.lineAt(end);
    const result: string[] = [];
    for (let n = first.number; n <= lastLine.number; n++) {
      const line = view.state.doc.line(n);
      const indentation = /^ */.exec(line.text)![0].length;
      const shift = changes.reduce((sum, change) => sum + (change.item && line.from > change.lineStart && line.from < change.item.to && indentation >= change.prefix.length + change.oldMarker.length ? change.marker.length - change.oldMarker.length : 0), 0);
      const own = changes.find(change => change.lineStart === line.from);
      const text = own ? own.prefix + own.marker + line.text.slice(own.prefix.length + own.oldMarker.length) : line.text;
      result.push(!text.trim() ? "" : shift >= 0 ? " ".repeat(shift) + text : text.slice(Math.min(-shift, /^ */.exec(text)![0].length)));
    }
    const insert = result.join("\n");
    const caret = Math.min(first.from + insert.length, Math.max(first.from, range.from + changes[0].marker.length - changes[0].oldMarker.length));
    const selectedEnd = first.from + result.slice(0, last.number - first.number + 1).join("\n").length;
    replace(view, { from: first.from, to: lastLine.to }, insert, range.empty ? { from: caret, to: caret } : { from: first.from, to: selectedEnd });
    return null;
  }
  const insert = lines.map(line => {
    if (command === "quote") return quoteOn ? line.replace(/^(\s*)> ?/, "$1") : "> " + line;
    const prefix = /^(\s*(?:>\s*)*)/.exec(line)![0];
    let body = line.slice(prefix.length);
    if (command.startsWith("heading")) {
      const level = Number(command.slice(7));
      body = body.replace(/^#{1,6}(?:\s+|$)/, "");
      return prefix + "#".repeat(level) + (level ? " " : "") + body;
    }
    return line;
  }).join("\n");
  const delta = insert.length - (last.to - first.from);
  replace(view, { from: first.from, to: last.to }, insert, range.empty ? { from: Math.max(first.from, Math.min(first.from + insert.length, range.from + delta)), to: Math.max(first.from, Math.min(first.from + insert.length, range.from + delta)) } : { from: first.from, to: first.from + insert.length });
  return null;
}

export function emptyTable(columns = 2, dataRows = 2): TableData { return { rows: Array.from({ length: dataRows + 1 }, () => Array(columns).fill("")), align: Array(columns).fill("default") }; }
function splitRow(line: string) {
  let raw = line.trim(); if (raw.startsWith("|")) raw = raw.slice(1); if (raw.endsWith("|") && !escaped(raw, raw.length - 1)) raw = raw.slice(0, -1);
  const result: string[] = []; let cell = "";
  for (let i = 0; i < raw.length; i++) { if (raw[i] === "|" && !escaped(raw, i)) { result.push(cell.trim()); cell = ""; } else cell += raw[i]; }
  result.push(cell.trim()); return result;
}
export function parseTable(source: string): TableData {
  const lines = source.split("\n");
  const rows = lines.map(splitRow), separator = rows.splice(1, 1)[0];
  if (!separator || !separator.every(cell => /^:?-+:?$/.test(cell)) || rows.some(row => row.length !== separator.length)) throw new Error("This table has an irregular structure. Edit its source to preserve all content.");
  return { rows, align: separator.map(cell => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.startsWith(":") ? "left" : cell.endsWith(":") ? "right" : "default") };
}
export function serializeTable(table: TableData) {
  const row = (cells: string[]) => "| " + cells.map(cell => cell.replace(/\r?\n/g, " ").replace(/\|/g, (char, offset: number) => escaped(cell, offset) ? char : "\\|")).join(" | ") + " |";
  return [row(table.rows[0]), row(table.align.map(a => ({ default: "---", left: ":---", center: ":---:", right: "---:" })[a])), ...table.rows.slice(1).map(row)].join("\n");
}

export function openDraft(view: EditorView, kind: PanelKind): PanelDraft {
  if (view.composing) throw new Error("Finish composing your text before opening a panel.");
  if (view.state.selection.ranges.length > 1) throw new Error("Use one selection at a time.");
  const source = view.state.doc.toString(), selected = view.state.selection.main;
  let range: Span = selected;
  const draft: PanelDraft = { from: range.from, to: range.to, kind, original: source, existing: false, text: source.slice(range.from, range.to), title: "", url: "", language: "", display: false, table: emptyTable(), explanation: "", innerText: "", innerTitle: "", outerKind: "note", innerKind: "tip" };
  const names = kind === "table" ? ["Table"] : kind === "link" ? ["Link"] : kind === "code" ? ["FencedCode"] : [];
  const node = nodes(source, names).find(n => range.from >= n.from && range.to <= n.to);
  if (node) {
    range = node; draft.existing = true;
    const raw = source.slice(node.from, node.to);
    if (kind === "table") {
      if (node.parent !== "Document" || source.slice(source.lastIndexOf("\n", node.from - 1) + 1, node.from).trim()) throw new Error("Edit nested tables in source.");
      draft.table = parseTable(raw);
      if (draft.table.align.length > 20 || draft.table.rows.length > 101) throw new Error("The panel supports up to 20 columns and 100 data rows. Edit larger tables in source.");
    }
    if (kind === "code") {
      const match = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1\s*$/.exec(raw);
      if (!match || !/^[\w+-]*$/.test(match[2].trim()) || node.parent !== "Document") throw new Error("This code block contains directives, options or nesting. Please edit its source.");
      draft.language = match[2].trim(); draft.text = match[3];
    }
    if (kind === "link") {
      const match = /^\[([^\n]*)\]\((?:<([^<>\n]*)>|([^\s]*))\)$/.exec(raw);
      if (!match) throw new Error("This link contains a reference definition or additional metadata. Please edit its source.");
      draft.text = match[1]; draft.url = match[2] ?? match[3];
    }
  }
  if (kind === "math") {
    const math = mathSpans(source).find(n => range.from >= n.from && range.to <= n.to);
    if (math) {
      if (/\\label\s*\{/.test(math.text) || (math.display && (/^\s*\([^)]+\)[ \t]*(?:\n|$)/.test(source.slice(math.to)) || /\([^)]+\)=[ \t]*\n\s*$/.test(source.slice(0, math.from))))) throw new Error("This formula has a label. Edit its source to preserve references.");
      range = math; draft.existing = true; draft.text = math.text; draft.display = math.display;
    }
  }
  if (kind === "abbr" || kind === "keyboard") {
    const role = kind === "abbr" ? "abbr" : "kbd";
    const inline = nodes(source, ["InlineCode"]).find(n => selected.from >= n.from - role.length - 2 && selected.to <= n.to && source.slice(n.from - role.length - 2, n.from) === `{${role}}`);
    if (inline) {
      const raw = source.slice(inline.from, inline.to);
      const match = /^`([^`\r\n]*)`$/.exec(raw);
      if (!match) throw new Error("Edit this extended role syntax in source.");
      range = { from: inline.from - role.length - 2, to: inline.to }; draft.existing = true;
      if (kind === "abbr") {
        const parts = /^(.*?)\s+\((.+)\)$/.exec(match[1]);
        if (!parts) throw new Error("Edit this abbreviation in source to preserve its content.");
        draft.text = parts[1]; draft.explanation = parts[2];
      } else draft.text = match[1];
    }
  }
  if (draft.existing && protectedSpans(source).some(span => (span.from !== range.from || span.to !== range.to) && intersects(range, span) && !(["code", "abbr", "keyboard"].includes(kind) && span.from >= range.from && span.to <= range.to))) throw new Error("This content is inside complex or nested syntax. Please edit its source.");
  if (!draft.existing && protectedSpans(source).some(span => intersects(range, span))) throw new Error("Move the cursor to plain text or edit this complex syntax in source.");
  if (!draft.existing && !selected.empty && kind === "table") throw new Error("Place the cursor at an insertion point to create a table, or inside a table to edit it.");
  // Reject overlapping partial syntax selections rather than silently replacing it.
  if (!draft.existing && kind === "link" && /[\r\n]/.test(draft.text)) throw new Error("Link text must be on one line.");
  return { ...draft, ...range };
}

function directiveBlock(kind: string, title: string, body: string, options = "") {
  const fence = ":".repeat(Math.max(2, ...Array.from(body.matchAll(/^\s*(:{3,})/gm), match => match[1].length)) + 1);
  return `${fence}{${kind}}${title.trim() ? " " + title.trim() : ""}\n${options}${body}\n${fence}`;
}

export function applyDraft(view: EditorView, draft: PanelDraft, removeLink = false): string | null {
  const source = view.state.doc.toString();
  if (source !== draft.original) return "The note has changed. Cancel and reopen this panel to avoid overwriting changes.";
  let body = draft.text;
  let block = false;
  if (draft.kind === "abbr" || draft.kind === "keyboard") {
    if (!body.trim()) return draft.kind === "abbr" ? "Enter an abbreviation." : "Enter a keyboard shortcut.";
    if (/[`\r\n]/.test(body) || (draft.kind === "abbr" && /[`\r\n]/.test(draft.explanation))) return "Use one line without backticks for this inline role.";
    if (draft.kind === "abbr" && !draft.explanation.trim()) return "Enter the full meaning of the abbreviation.";
    body = draft.kind === "abbr" ? `{abbr}\`${body.trim()} (${draft.explanation.trim()})\`` : `{kbd}\`${body.trim()}\``;
  }
  if (draft.kind === "table") { body = serializeTable(draft.table); block = true; }
  if (draft.kind === "math") {
    if (!body.trim()) return "Enter a formula.";
    body = body.trim();
    if (!draft.display && /[\r\n]/.test(body)) return "Choose Display for a multiline formula.";
    if (Array.from(body.matchAll(/\$/g)).some(match => !escaped(body, match.index!))) return "Enter only the formula, without surrounding dollar signs.";
    body = draft.display ? `$$\n${body}\n$$` : `$${body}$`; block = draft.display;
  }
  if (draft.kind === "link" && !removeLink) {
    if (!draft.text.trim() || !draft.url.trim()) return "Enter the link text and URL.";
    if (/[\r\n<>]/.test(draft.url) || /[\r\n]/.test(draft.text)) return "Use single-line text and a valid URL.";
    const url = draft.url.trim();
    if (/^[a-z][\w+.-]*:/i.test(url) && !/^(https?:|mailto:)/i.test(url)) return "Use http, https, mailto or a relative path.";
    body = `[${draft.text.replace(/[\[\]]/g, (char, i: number) => escaped(draft.text, i) ? char : "\\" + char)}](<${url}>)`;
  }
  if (draft.kind === "code") {
    if (!/^[\w+-]*$/.test(draft.language)) return "Use letters, numbers, underscores, plus signs or hyphens for the language name.";
    const fence = "`".repeat(Math.max(2, ...Array.from(body.matchAll(/`+/g), m => m[0].length)) + 1);
    body = `${fence}${draft.language}\n${body}\n${fence}`; block = true;
  }
  if (isDirectiveKind(draft.kind)) {
    if (/[\r\n]/.test(draft.title) || (draft.kind === "nested" && /[\r\n]/.test(draft.innerTitle))) return "Block titles must be on one line.";
    if (["dropdown", "admonition", "initiallyOpen"].includes(draft.kind) && !draft.title.trim()) return "Enter a block title.";
    if (draft.kind === "nested") {
      if ((draft.outerKind === "admonition" && !draft.title.trim()) || (draft.innerKind === "admonition" && !draft.innerTitle.trim())) return "Enter a title for each custom admonition.";
      const inner = directiveBlock(draft.innerKind, draft.innerTitle, draft.innerText);
      body = directiveBlock(draft.outerKind, draft.title, (body ? body + "\n\n" : "") + inner);
    } else if (draft.kind === "initiallyOpen") body = directiveBlock("admonition", draft.title, body, ":class: dropdown\n:open: true\n\n");
    else body = directiveBlock(draft.kind, draft.title, body);
    block = true;
  }
  const output = block ? blockText(source, draft, body).text : body;
  replace(view, draft, output); return null;
}
