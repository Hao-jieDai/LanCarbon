import { describe, expect, it } from "vitest";
import { createBook } from "../src/shared/books";
import { ensurePhase4Guide } from "../src/shared/phase4Guide";
import { ensurePhase2Guide } from "../src/shared/releaseGuide";
import { ensurePhase3Guide } from "../src/shared/phase3Guide";
import { validateBookContent } from "../src/shared/bookValidation";

describe("Phase 4 guide", () => {
  it("adds one section and four tutorials once", () => {
    const { book, homeNote } = createBook("LanCarbon Guide"); book.phase2GuideRevision = 1;
    const first = ensurePhase4Guide({ version: 2, books: [book], notes: [homeNote] });
    expect(first.changed).toBe(true);
    expect(first.workspace.notes.filter(note => ["Phase 4 Reference", "Book Preflight", "Build and Saved Website", "Local Website", "Phase 4 Acceptance"].includes(note.title))).toHaveLength(5);
    expect(ensurePhase4Guide(first.workspace).changed).toBe(false);
  });

  it("adds the offline theme guidance to an existing generated build page once", () => {
    const { book, homeNote } = createBook("LanCarbon Guide"); book.phase2GuideRevision = 1;
    const original = ensurePhase4Guide({ version: 2, books: [book], notes: [homeNote] }).workspace;
    const buildPage = Object.values(original.books[0].pages).find(page => page.metadata.label === "lancarbon-phase4-build")!;
    const old = { ...original, notes: original.notes.map(note => note.id === buildPage.noteId ? { ...note, content: note.content.replace(/\n\n<!-- lancarbon-offline-theme-runtime-1 -->[\s\S]*$/, "") } : note) };
    const migrated = ensurePhase4Guide(old);
    expect(migrated.changed).toBe(true);
    expect(migrated.workspace.notes.find(note => note.id === buildPage.noteId)?.content).toContain("lancarbon-offline-theme-runtime-1");
    expect(ensurePhase4Guide(migrated.workspace).changed).toBe(false);
  });

  it("keeps the complete generated Guide free of blocking preflight errors", () => {
    const { book, homeNote } = createBook("LanCarbon Guide");
    const phase2 = ensurePhase2Guide({ version: 2, books: [book], notes: [homeNote] }).workspace;
    const phase3 = ensurePhase3Guide(phase2).workspace;
    const phase4 = ensurePhase4Guide(phase3).workspace;
    expect(validateBookContent(phase4, phase4.books[0].id).filter(item => item.severity === "error")).toEqual([]);
  });
});
