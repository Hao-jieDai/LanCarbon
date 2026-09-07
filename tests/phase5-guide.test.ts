import { describe, expect, it } from "vitest";
import { createBook } from "../src/shared/books";
import { ensurePhase5Guide } from "../src/shared/phase5Guide";
import { ensurePhase2Guide } from "../src/shared/releaseGuide";
import { ensurePhase3Guide } from "../src/shared/phase3Guide";
import { ensurePhase4Guide } from "../src/shared/phase4Guide";
import { validateBookContent } from "../src/shared/bookValidation";

describe("Phase 5 guide", () => {
  it("adds one section and five tutorials once", () => {
    const { book, homeNote } = createBook("LanCarbon Guide"); book.phase2GuideRevision = 1;
    const first = ensurePhase5Guide({ version: 2, books: [book], notes: [homeNote] });
    expect(first.changed).toBe(true);
    expect(first.workspace.notes.filter(note => ["Phase 5 Reference", "Publishing Readiness", "GitHub and Pages Setup", "Build and Publishing Workflow", "Publish and Update Website", "Phase 5 Acceptance"].includes(note.title))).toHaveLength(6);
    expect(ensurePhase5Guide(first.workspace).changed).toBe(false);
  });

  it("keeps the complete generated Guide free of blocking errors", () => {
    const { book, homeNote } = createBook("LanCarbon Guide");
    const phase2 = ensurePhase2Guide({ version: 2, books: [book], notes: [homeNote] }).workspace;
    const phase3 = ensurePhase3Guide(phase2).workspace;
    const phase4 = ensurePhase4Guide(phase3).workspace;
    const phase5 = ensurePhase5Guide(phase4).workspace;
    expect(validateBookContent(phase5, phase5.books[0].id).filter(item => item.severity === "error")).toEqual([]);
  });
});
