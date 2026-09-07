import { expect, it } from "vitest";
import { createBook } from "../src/shared/books";
import { ensurePhase3Guide } from "../src/shared/phase3Guide";
it("appends resource tools guidance once to existing tutorials without replacing personal text",()=>{
  const {book,homeNote}=createBook("Guide");book.phase2GuideRevision=1;
  const first=ensurePhase3Guide({version:2,books:[book],notes:[homeNote]}).workspace;
  expect(first.notes.filter(note=>["Images and Screenshots","Attachments and Resource Export","Citations and Bibliographies","Phase 3 Acceptance"].includes(note.title))).toHaveLength(4);
  const note=first.notes.find(n=>n.title==="Images and Screenshots")!;
  note.content="My personal edits";
  const updated=ensurePhase3Guide(first);
  expect(updated.changed).toBe(true);
  expect(updated.workspace.notes.find(n=>n.id===note.id)!.content).toMatch(/^My personal edits\n\n/);
  expect(updated.workspace.notes).toHaveLength(first.notes.length);
  expect(ensurePhase3Guide(updated.workspace).changed).toBe(false);
});
