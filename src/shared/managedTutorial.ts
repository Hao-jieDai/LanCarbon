import type { Book, Note, WorkspaceFile } from "./types";

export const MANAGED_TUTORIAL_BOOK_ID = "lancarbon-from-zero-to-one";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function syncManagedTutorial(workspace: WorkspaceFile, bundled: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const officialBook = bundled.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID);
  if (!officialBook) return { workspace, changed: false };
  const officialNoteIds = new Set(Object.values(officialBook.pages).map(page => page.noteId));
  const officialNotes = bundled.notes.filter(note => officialNoteIds.has(note.id));
  if (officialNotes.length !== officialNoteIds.size) throw new Error("The bundled system tutorial references missing Notes");

  const existingBook = workspace.books.find(book => book.id === MANAGED_TUTORIAL_BOOK_ID);
  const existingNoteIds = new Set(existingBook ? Object.values(existingBook.pages).map(page => page.noteId) : []);
  const notes = [
    ...workspace.notes.filter(note => !existingNoteIds.has(note.id) && !officialNoteIds.has(note.id)),
    ...clone<Note[]>(officialNotes)
  ];
  const books = existingBook
    ? workspace.books.map(book => book.id === MANAGED_TUTORIAL_BOOK_ID ? clone<Book>(officialBook) : book)
    : [...workspace.books, clone<Book>(officialBook)];
  const next: WorkspaceFile = { ...workspace, notes, books };
  return JSON.stringify(next) === JSON.stringify(workspace) ? { workspace, changed: false } : { workspace: next, changed: true };
}
