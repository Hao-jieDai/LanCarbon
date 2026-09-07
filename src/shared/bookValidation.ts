import path from "node:path";
import { assetId, assetReferences } from "./assets";
import { validateBookCitations } from "./bibliography";
import { collectPageIds, effectiveExportPath, isValidExportPath } from "./books";
import { splitFrontmatter } from "./jupyter-book";
import type { Book, BookCheckIssue, BookPage, Note, WorkspaceFile } from "./types";

interface Target { page: BookPage; note: Note; path: string; anchors: Set<string> }

function slug(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function pageAnchors(note: Note, page: BookPage): { anchors: Set<string>; globals: Set<string> } {
  const anchors = new Set<string>(), globals = new Set<string>();
  if (page.metadata.label?.trim()) { const label = page.metadata.label.trim().toLocaleLowerCase("en-US"); anchors.add(label); globals.add(label); }
  for (const line of note.content.split("\n")) {
    const explicit = /^\s*\(([^)\s]+)\)=\s*$/.exec(line);
    if (explicit) { const label = explicit[1].toLocaleLowerCase("en-US"); anchors.add(label); globals.add(label); }
    const option = /^\s*:(?:label|name):\s*([^\s]+)\s*$/.exec(line);
    if (option) { const label = option[1].toLocaleLowerCase("en-US"); anchors.add(label); globals.add(label); }
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const custom = /\{#([^}\s]+)\}\s*$/.exec(heading[1]);
      anchors.add((custom?.[1] ?? slug(heading[1].replace(/\s*\{#([^}]+)\}\s*$/, ""))).toLocaleLowerCase("en-US"));
    }
  }
  return { anchors, globals };
}

function issue(page: BookPage | undefined, note: Note | undefined, code: string, message: string, line?: number, severity: "error" | "warning" = "error"): BookCheckIssue {
  return { severity, source: "preflight", code, message, ...(page ? { pageId: page.id, noteId: page.noteId } : {}), ...(note ? { pageTitle: note.title } : {}), ...(line ? { line } : {}) };
}

function linesOutsideCode(source: string): Array<{ text: string; line: number }> {
  const result: Array<{ text: string; line: number }> = []; let fence = "";
  source.split("\n").forEach((text, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text);
    if (fence) { if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ""; return; }
    if (marker) { fence = marker[1]; return; }
    result.push({ text: text.replace(/`[^`]*`/g, ""), line: index + 1 });
  });
  return result;
}

export function validateBookContent(workspace: WorkspaceFile, bookId: string): BookCheckIssue[] {
  const book = workspace.books.find(item => item.id === bookId);
  if (!book) return [issue(undefined, undefined, "missing-book", "The selected Book no longer exists")];
  const notes = new Map(workspace.notes.map(note => [note.id, note]));
  const issues: BookCheckIssue[] = [];
  const reachable = collectPageIds(book);
  if (!book.pages[book.homePageId]) issues.push(issue(undefined, undefined, "missing-home", "The Book has no valid home page"));
  if (reachable.length !== Object.keys(book.pages).length) issues.push(issue(undefined, undefined, "disconnected-pages", "The Book contains pages that are disconnected from its table of contents"));
  const targets = new Map<string, Target>();
  const labels = new Map<string, Target[]>();
  for (const page of Object.values(book.pages)) {
    const note = notes.get(page.noteId);
    if (!note) { issues.push(issue(page, undefined, "missing-note", `Page ${page.id} references a missing note`)); continue; }
    if (!isValidExportPath(page.exportPath, page.sourceType)) issues.push(issue(page, note, "invalid-export-path", `Invalid export path: ${page.exportPath || "(empty)"}`));
    if (page.sourceType !== "markdown") issues.push(issue(page, note, "unsupported-source", `Notebook pages cannot be built yet: ${page.exportPath}`));
    const exported = effectiveExportPath(book, page).toLocaleLowerCase("en-US");
    if (targets.has(exported)) issues.push(issue(page, note, "duplicate-export-path", `Duplicate export path: ${effectiveExportPath(book, page)}`));
    const foundAnchors = pageAnchors(note, page);
    const target = { page, note, path: exported, anchors: foundAnchors.anchors };
    targets.set(exported, target);
    for (const anchor of foundAnchors.globals) labels.set(anchor, [...(labels.get(anchor) ?? []), target]);
    try { splitFrontmatter(note.content); } catch (error) { issues.push(issue(page, note, "frontmatter", error instanceof Error ? error.message : "Invalid YAML frontmatter")); }
    if (!note.content.trim()) issues.push(issue(page, note, "empty-page", "Page content is empty", undefined, "warning"));
  }
  for (const [label, matches] of labels) if (matches.length > 1) {
    for (const match of matches) issues.push(issue(match.page, match.note, "duplicate-label", `Duplicate reference label: ${label}`));
  }
  for (const target of targets.values()) for (const { text, line } of linesOutsideCode(target.note.content)) {
    const references: string[] = [];
    for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) references.push(match[1]);
    for (const match of text.matchAll(/\{(?:ref|numref|eq|doc)\}`(?:[^`<>]*<)?([^`<>\s]+)>?`/g)) references.push(match[1]);
    for (const raw of references) {
      if (/^(?:https?:|mailto:|data:)/i.test(raw) || assetId(raw)) continue;
      const [rawPath, rawFragment] = raw.split("#", 2); const fragment = rawFragment?.toLocaleLowerCase("en-US");
      if (!rawPath) {
        const matches = fragment ? labels.get(fragment) ?? [] : [];
        if (!fragment || (!target.anchors.has(fragment) && matches.length !== 1)) issues.push(issue(target.page, target.note, "unresolved-reference", `Unresolved reference: ${raw}`, line));
        continue;
      }
      if (!/[/.]/.test(rawPath)) {
        const matches = labels.get(rawPath.toLocaleLowerCase("en-US")) ?? [];
        if (matches.length !== 1) issues.push(issue(target.page, target.note, matches.length ? "ambiguous-reference" : "unresolved-reference", `${matches.length ? "Ambiguous" : "Unresolved"} reference: ${rawPath}`, line));
        continue;
      }
      const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(target.path), rawPath.replace(/^\.\//, ""))).replace(/^\/+/, "").toLocaleLowerCase("en-US");
      const destination = targets.get(normalized) ?? targets.get(`${normalized}.md`);
      if (!destination || (fragment && !destination.anchors.has(fragment))) issues.push(issue(target.page, target.note, "unresolved-reference", `Unresolved reference: ${raw}`, line));
    }
  }
  for (const message of validateBookCitations(book, workspace.notes)) {
    const match = /^(.*?) — line (\d+):/.exec(message); const note = match ? workspace.notes.find(item => item.title === match[1]) : undefined;
    const page = note ? Object.values(book.pages).find(item => item.noteId === note.id) : undefined;
    issues.push(issue(page, note, "citation", message, match ? Number(match[2]) : undefined));
  }
  const required = new Set<string>();
  for (const page of Object.values(book.pages)) { const note = notes.get(page.noteId); if (note) for (const ref of assetReferences(note.content)) required.add(ref.id); }
  for (const value of [book.settings.logo, book.settings.favicon]) { const id = value && assetId(value); if (id) required.add(id); }
  for (const source of book.settings.bibliography ?? []) required.add(source.assetId);
  // The Electron layer verifies these IDs against the managed catalog and file hashes.
  for (const id of required) if (!id) issues.push(issue(undefined, undefined, "invalid-resource", "A managed resource reference is invalid"));
  if (!book.settings.title.trim()) issues.push(issue(undefined, undefined, "book-title", "Book title is empty", undefined, "warning"));
  if (!book.settings.authors.length) issues.push(issue(undefined, undefined, "book-authors", "Book authors are not set", undefined, "warning"));
  return [...new Map(issues.map(item => [`${item.code}:${item.pageId ?? ""}:${item.line ?? ""}:${item.message}`, item])).values()];
}
