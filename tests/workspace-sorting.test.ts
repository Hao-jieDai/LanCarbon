import { describe, expect, it } from "vitest";
import { addNoteToBook, createBook } from "../src/shared/books";
import { createNote, filterNotes, sortNotes } from "../src/shared/notes";
import { sortBooks } from "../src/shared/workspaceSorting";

describe("workspace display sorting", () => {
  const notes = [
    createNote({ id: "ten", title: "Note 10", createdAt: "2026-01-01", updatedAt: "2026-03-01", tags: ["match"] }),
    createNote({ id: "two", title: "note 2", createdAt: "2026-02-01", updatedAt: "2026-02-01", tags: ["match"] }),
    createNote({ id: "pin", title: "Z pinned", pinned: true, createdAt: "2025-01-01", updatedAt: "2025-01-01", tags: ["match"] })
  ];

  it("keeps pinned Notes first in every order, including filtered results", () => {
    expect(sortNotes(notes, "updated").map(note => note.id)).toEqual(["pin", "ten", "two"]);
    for (const order of ["created", "title"] as const) {
      expect(sortNotes(notes, order).map(note => note.id)).toEqual(["pin", "two", "ten"]);
      expect(filterNotes(notes, "match", "all", order).map(note => note.id)).toEqual(["pin", "two", "ten"]);
      expect(filterNotes(notes, "match", "pinned", order).map(note => note.id)).toEqual(["pin"]);
    }
  });

  it("sorts Books using page edits, creation dates and natural title ordering without changing data", () => {
    const first = createBook("书10");
    const second = createBook("书2");
    first.book.createdAt = first.book.updatedAt = "2026-01-01";
    second.book.createdAt = second.book.updatedAt = "2026-02-01";
    first.homeNote.updatedAt = "2026-01-01";
    second.homeNote.updatedAt = "2026-02-01";
    const child = createNote({ title: "Recently edited", updatedAt: "2026-03-01" });
    const modifiedBook = { ...addNoteToBook(first.book, child, { section: true }), updatedAt: "2026-01-01" };
    const books = [second.book, modifiedBook];
    const allNotes = [first.homeNote, second.homeNote, child, createNote({ updatedAt: "2027-01-01" })];
    const before = JSON.stringify({ books, notes: allNotes });
    expect(sortBooks(books, allNotes, "updated").map(book => book.id)).toEqual([modifiedBook.id, second.book.id]);
    expect(sortBooks(books, allNotes, "created").map(book => book.id)).toEqual([second.book.id, modifiedBook.id]);
    expect(sortBooks(books, allNotes, "title").map(book => book.id)).toEqual([second.book.id, modifiedBook.id]);
    sortNotes(allNotes, "title");
    expect(JSON.stringify({ books, notes: allNotes })).toBe(before);
  });
});
