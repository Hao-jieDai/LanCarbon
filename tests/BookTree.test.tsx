import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookTree } from "../src/components/BookTree";
import { addNoteToBook, createBook } from "../src/shared/books";
import { createNote } from "../src/shared/notes";

function fixture() {
  const created = createBook("Climate Handbook");
  const sectionOne = createNote({ id: "basics", title: "Climate Basics" });
  let book = addNoteToBook(created.book, sectionOne, { section: true });
  const firstSectionPage = Object.values(book.pages).find(page => page.noteId === sectionOne.id)!;
  const childOne = createNote({ id: "cycle", title: "Carbon Cycle" });
  book = addNoteToBook(book, childOne, { parentPageId: firstSectionPage.id });
  const sectionTwo = createNote({ id: "solutions", title: "Climate Solutions" });
  book = addNoteToBook(book, sectionTwo, { section: true });
  const secondSectionPage = Object.values(book.pages).find(page => page.noteId === sectionTwo.id)!;
  const childTwo = createNote({ id: "renewable", title: "Renewable Energy" });
  book = addNoteToBook(book, childTwo, { parentPageId: secondSectionPage.id });
  return { book, notes: [created.homeNote, sectionOne, childOne, sectionTwo, childTwo] };
}

function drag(sourceName: string, targetName: string, targetY: number) {
  const source = screen.getByRole("button", { name: sourceName });
  const target = screen.getByRole("button", { name: targetName });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ x: 0, y: 100, top: 100, left: 0, right: 300, bottom: 136, width: 300, height: 36, toJSON: () => ({}) });
  fireEvent.pointerDown(source, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: targetY });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: targetY });
}

describe("BookTree pointer drag and drop", () => {
  it("allows every section and child page except the home page to complete a drag", () => {
    const { book, notes } = fixture(); const onMove = vi.fn();
    render(<BookTree book={book} notes={notes} activePageId={null} onSelect={vi.fn()} onMove={onMove} />);
    drag("Climate Basics", "Climate Solutions", 102);
    drag("Carbon Cycle", "Climate Solutions", 118);
    drag("Climate Solutions", "Climate Basics", 134);
    drag("Renewable Energy", "Climate Basics", 118);
    expect(onMove).toHaveBeenCalledTimes(4);
    expect(new Set(onMove.mock.calls.map(call => call[0])).size).toBe(4);
    expect(onMove.mock.calls.map(call => call[2])).toEqual(["before", "inside", "after", "inside"]);
  });

  it("never starts a drag from the required home page", () => {
    const { book, notes } = fixture(); const onMove = vi.fn();
    render(<BookTree book={book} notes={notes} activePageId={null} onSelect={vi.fn()} onMove={onMove} />);
    drag("Climate Handbook", "Climate Basics", 118);
    expect(onMove).not.toHaveBeenCalled();
  });
});
