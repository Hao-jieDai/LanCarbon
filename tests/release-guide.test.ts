import { describe, expect, it } from "vitest";
import { createBook, createEmptyWorkspace, validateWorkspace, normalizeBooks, addNoteToBook } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import { renderMystPreview } from "../src/preview/mystPreview";
import { generateBookProject } from "../src/shared/jupyter-book";
import { ensurePhase2Guide, PHASE_2_SECTION_NOTE_ID } from "../src/shared/releaseGuide";
import { relocateGuideLinks } from "../src/shared/consolidateGuide";

const titles = ["Editing and Formatting", "Tables and Mathematics", "Directives and Roles", "Cross References", "Syntax Lab", "Phase 2 Acceptance"];
function freshGuide() {
  const { book, homeNote } = createBook("LanCarbon Guide");
  return { version: 2 as const, notes: [homeNote], books: [book] };
}

describe("six-page Phase 2 guide", () => {
  it("does not create a Book for a notes-only workspace", () => {
    const workspace = createEmptyWorkspace([createNote({ title: "ReadMe" })]);
    expect(ensurePhase2Guide(workspace)).toEqual({ workspace, changed: false });
  });

  it("creates six complete tutorials once, including working formulas and references", () => {
    const result = ensurePhase2Guide(freshGuide());
    expect(result.changed).toBe(true);
    const workspace = result.workspace, book = workspace.books[0];
    const section = Object.values(book.pages).find(p => p.noteId === PHASE_2_SECTION_NOTE_ID)!;
    expect(section.children.map(id => workspace.notes.find(n => n.id === book.pages[id].noteId)!.title)).toEqual(titles);
    expect(validateWorkspace(workspace)).toEqual([]);
    const docs = Object.values(book.pages).map(p => ({ ...workspace.notes.find(n => n.id === p.noteId)!, path: p.exportPath, label: p.metadata.label }));
    const exported = generateBookProject(workspace, book.id);
    for (const doc of docs.filter(d => titles.includes(d.title))) {
      expect(doc.content).toContain("中文");
      expect(doc.content).toContain("English");
      const preview = renderMystPreview(doc, docs);
      expect(preview.error, doc.title).toBeUndefined();
      expect(preview.warnings, doc.title).toEqual([]);
      expect(exported.files.get(doc.path), doc.title).toContain("中文");
    }
    const reloaded = { ...workspace, books: normalizeBooks(JSON.parse(JSON.stringify(workspace.books)), workspace.notes) };
    expect(reloaded.books[0].phase2GuideRevision).toBe(1);
    expect(ensurePhase2Guide(reloaded)).toEqual({ workspace: reloaded, changed: false });
  });

  it("merges edited tutorials and personal exercises, preserving labels, macros and other chapters", () => {
    const workspace = freshGuide();
    let book = workspace.books[0];
    const phase = createNote({ id: PHASE_2_SECTION_NOTE_ID, title: "Phase 2 Reference", content: "My introduction / 自定义介绍" });
    book = addNoteToBook(book, phase, { section: true }); workspace.notes.push(phase);
    const section = Object.values(book.pages).find(p => p.noteId === phase.id)!;
    for (const [id, title, content, exportPath, label] of [
      ["lancarbon-guide-formatting-toolbar", "My toolbar instructions", "## English\n\nMy custom toolbar text.\n\n## 中文\n\n自定义工具栏内容", "custom/toolbar.md", "my-toolbar"],
      ["my-lab", "Syntax Lab", "---\nmath:\n  '\\R': '\\mathbb{R}'\n---\n\n$x \\in \\R$\n\n[Other lab](reference-lab.md)", "syntax-lab.md", "acceptance-syntax-page"],
      ["my-refs", "Reference Lab", "My reference exercises / 引用练习\n\n[Syntax](syntax-lab.md)", "reference-lab.md", "acceptance-reference-page"],
      ["my-tools", "Tools Test", "My original tools / 原有练习", "tools.md", "tools-test"],
    ]) {
      const note = createNote({ id, title, content, tags: ["custom"] }); workspace.notes.push(note);
      book = addNoteToBook(book, note, { parentPageId: section.id });
      const page = Object.values(book.pages).find(p => p.noteId === id)!;
      page.exportPath = exportPath; page.metadata.label = label;
      // Recognize renamed built-in pages by their stable page IDs.
      if (id === "lancarbon-guide-formatting-toolbar") {
        const old = page.id; page.id = `${id}-page`; book.pages[page.id] = page; delete book.pages[old];
        book.pages[section.id].children = book.pages[section.id].children.map(p => p === old ? page.id : p);
      }
    }
    const untouched = createNote({ title: "Phase 1 Reference", content: "Unchanged chapter" });
    workspace.notes.push(untouched); book = addNoteToBook(book, untouched, { section: true });
    workspace.books = [book];
    const before = JSON.stringify(workspace);
    const result = ensurePhase2Guide(workspace).workspace;
    expect(JSON.stringify(workspace)).toBe(before);
    const sectionAfter = result.books[0].pages[section.id];
    expect(sectionAfter.children).toHaveLength(6);
    expect(result.notes.find(n => n.id === untouched.id)).toEqual(untouched);
    expect(result.notes.find(n => n.id === phase.id)!.content).toContain("自定义介绍");
    expect(result.notes.find(n => n.title === "Editing and Formatting")!.content).toContain("自定义工具栏内容");
    expect(result.notes.find(n => n.title === "Syntax Lab")!.content).toContain("原有练习");
    expect(result.notes.find(n => n.title === "Syntax Lab")!.content).toContain("(tools-test)=");
    const docs = Object.values(result.books[0].pages).map(p => ({ ...result.notes.find(n => n.id === p.noteId)!, path: p.exportPath, label: p.metadata.label }));
    for (const doc of docs) expect(renderMystPreview(doc, docs).warnings, doc.title).toEqual([]);
    expect(validateWorkspace(result)).toEqual([]);
    result.notes.find(n => n.title === "Editing and Formatting")!.title = "My consolidated guide";
    result.notes.find(n => n.id === phase.id)!.title = "My Phase 2";
    expect(ensurePhase2Guide(result)).toEqual({ workspace: result, changed: false });
  });

  it("relocates links while leaving prose, URLs and code examples unchanged", () => {
    const moves = new Map([["old.md", { path: "guide/new.md", label: "old-label" }]]);
    const source = '[old](old.md) [anchor](old.md#target) [web](https://example.com)\n[ref]: <old.md> "Title"\n`[sample](old.md)`\n```markdown\n[example](old.md)\n```';
    expect(relocateGuideLinks(source, "index.md", "index.md", moves)).toBe('[old](guide/new.md#old-label) [anchor](guide/new.md#target) [web](https://example.com)\n[ref]: <guide/new.md#old-label> "Title"\n`[sample](old.md)`\n```markdown\n[example](old.md)\n```');
  });
});
