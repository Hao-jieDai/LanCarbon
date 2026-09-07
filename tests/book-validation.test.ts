import { describe, expect, it } from "vitest";
import { addNoteToBook, createBook } from "../src/shared/books";
import { validateBookContent } from "../src/shared/bookValidation";
import { createNote } from "../src/shared/notes";

describe("Book preflight", () => {
  it("locates invalid frontmatter and unresolved references", () => {
    const { book: initial, homeNote } = createBook("Check");
    const note = createNote({ title: "Broken", content: "---\ntitle: [\n---\n\n[Missing](other.md#nope)" });
    const book = addNoteToBook(initial, note);
    const issues = validateBookContent({ version: 2, books: [book], notes: [homeNote, note] }, book.id);
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "frontmatter", pageTitle: "Broken" }), expect.objectContaining({ code: "unresolved-reference", pageTitle: "Broken", line: 5 })]));
  });

  it("accepts a valid page path, heading link and citation", () => {
    const { book: initial, homeNote } = createBook("Check");
    const target = createNote({ title: "Target", content: "# Target heading" });
    let book = addNoteToBook(initial, target); const targetPage = Object.values(book.pages).find(page => page.noteId === target.id)!;
    const source = createNote({ title: "Source", content: `[Read](./${targetPage.exportPath}#target-heading)` }); book = addNoteToBook(book, source);
    const issues = validateBookContent({ version: 2, books: [book], notes: [homeNote, target, source] }, book.id);
    expect(issues.filter(item => item.severity === "error")).toEqual([]);
  });

  it("allows repeated heading slugs across pages while detecting duplicate explicit labels", () => {
    const { book: initial, homeNote } = createBook("Labels"); homeNote.content = "# Introduction\n\n(label)=\n## One";
    const other = createNote({ title: "Other", content: "# Introduction\n\n(label)=\n## Two" }); const book = addNoteToBook(initial, other);
    const issues = validateBookContent({ version: 2, books: [book], notes: [homeNote, other] }, book.id);
    expect(issues.filter(item => item.code === "duplicate-label")).toHaveLength(2);
    expect(issues.some(item => item.message.includes("introduction"))).toBe(false);
  });
});
