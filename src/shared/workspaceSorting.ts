import type { Book, Note, WorkspaceSortOrder } from "./types";

const titles = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const timestamp = (value: string): number => Date.parse(value) || 0;

export function compareWorkspaceItems(
  a: { title: string; createdAt: string; updatedAt: string },
  b: { title: string; createdAt: string; updatedAt: string },
  order: WorkspaceSortOrder
): number {
  const byTitle = titles.compare(a.title.trim(), b.title.trim());
  return order === "title" ? byTitle : timestamp(b[order === "created" ? "createdAt" : "updatedAt"]) - timestamp(a[order === "created" ? "createdAt" : "updatedAt"]) || byTitle;
}

// Page edits belong to the Book's last-modified time without rewriting Book data.
export function sortBooks(books: Book[], notes: Note[], order: WorkspaceSortOrder = "updated"): Book[] {
  const noteDates = new Map(notes.map(note => [note.id, timestamp(note.updatedAt)]));
  const items = new Map(books.map(book => {
    let modified = timestamp(book.updatedAt);
    for (const page of Object.values(book.pages)) modified = Math.max(modified, noteDates.get(page.noteId) ?? 0);
    return [book.id, { title: book.settings.title, createdAt: book.createdAt, updatedAt: new Date(modified).toISOString() }];
  }));
  return [...books].sort((a, b) => compareWorkspaceItems(items.get(a.id)!, items.get(b.id)!, order));
}
