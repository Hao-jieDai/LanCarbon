import { expect, it } from "vitest";
import { addNoteToBook, createBook, createEmptyWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import { sectionPages, writingKnowledgeScope, writingLocation, writingTabIds } from "../src/shared/writingWorkspace";

function fixture() {
  const { book: initial, homeNote } = createBook("Research");
  const section = createNote({id:"section",title:"Methods"}), child = createNote({id:"child",title:"Results"}), other = createNote({id:"other",title:"Other section"});
  let book = addNoteToBook(initial, section, {section:true});
  const sectionId = Object.values(book.pages).find(p => p.noteId === section.id)!.id;
  book = addNoteToBook(book, child, {parentPageId:sectionId});
  book = addNoteToBook(book, other, {section:true});
  const workspace = {...createEmptyWorkspace(), notes:[homeNote,section,child,other,createNote({id:"loose",content:"Outside"})],books:[book]};
  return {workspace, book, sectionId};
}
it("keeps current page, ancestor section and whole Book scopes distinct", () => {
  const {workspace,book,sectionId} = fixture();
  expect(writingKnowledgeScope(workspace,"child","page").noteIds).toEqual(["child"]);
  expect(writingKnowledgeScope(workspace,"child","section").noteIds).toEqual(["section","child"]);
  expect(writingKnowledgeScope(workspace,"child","book").bookIds).toEqual([book.id]);
  expect(writingKnowledgeScope(workspace,"loose","book").noteIds).toEqual(["loose"]);
  expect(writingKnowledgeScope(workspace,"child","page").includeAttachments).toBe(false);
  expect(sectionPages(book,sectionId)).toHaveLength(2);
  expect(() => writingKnowledgeScope(workspace,"deleted","page")).toThrow("no longer available");
});
it("resolves renamed/moved pages from live workspace and prunes invalid tabs", () => {
  const {workspace,book} = fixture();
  expect(writingLocation(workspace,"child")?.book?.id).toBe(book.id);
  expect(writingTabIds(["child","child","deleted",null,{},"../escape","loose"],workspace)).toEqual(["child","loose"]);
  expect(writingLocation({...workspace,books:[]},"child")?.book).toBeUndefined();
});
it("terminates safely for malformed cyclic chapter trees", () => {
  const {workspace,book,sectionId} = fixture();
  const child = writingLocation(workspace,"child")!.page!;
  child.children.push(sectionId);
  expect(new Set(sectionPages(book,child.id))).toEqual(new Set([sectionId,child.id]));
});
