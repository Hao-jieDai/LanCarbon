import type { Book, WorkspaceFile } from "./types";
import { emptyKnowledgeScope, type KnowledgeScope } from "./knowledge";

export type WritingScope = "page" | "section" | "book";
export function writingLocation(workspace: WorkspaceFile, noteId: string) {
  const note = workspace.notes.find(item => item.id === noteId);
  if (!note) return undefined;
  for (const book of workspace.books) {
    const page = Object.values(book.pages).find(item => item.noteId === noteId);
    if (page) return { note, book, page };
  }
  return { note, book: undefined, page: undefined };
}

export function writingTabIds(value: unknown, workspace?: WorkspaceFile): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id)))].filter(id => !workspace || workspace.notes.some(note => note.id === id));
}

/** A section is the highest ancestor below the Book home, including descendants. */
export function sectionPages(book: Book, pageId: string): string[] {
  let root = pageId;
  const ancestors = new Set<string>();
  while (!ancestors.has(root)) {
    ancestors.add(root);
    const parent = Object.values(book.pages).find(page => page.children.includes(root));
    if (!parent || parent.id === book.homePageId) break;
    root = parent.id;
  }
  const found = new Set<string>();
  const visit = (id: string) => {
    if (found.has(id) || !book.pages[id]) return;
    found.add(id); book.pages[id].children.forEach(visit);
  };
  visit(root);
  return [...found];
}

export function writingKnowledgeScope(workspace: WorkspaceFile, noteId: string, range: WritingScope): KnowledgeScope {
  const location = writingLocation(workspace, noteId);
  if (!location) throw Error("This page is no longer available. Open another page before sending.");
  const scope = emptyKnowledgeScope();
  // Explicit current pages include system tutorials too; unrelated files are not implied.
  scope.includeSystem = true; scope.includeAttachments = false;
  if (range === "book" && location.book) scope.bookIds = [location.book.id];
  else if (range === "section" && location.book && location.page) scope.noteIds = sectionPages(location.book, location.page.id).map(id => location.book!.pages[id].noteId);
  else scope.noteIds = [noteId];
  return scope;
}
