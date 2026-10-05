import type { RefObject } from "react";
import { filterNotes } from "../shared/notes";
import { getBookForNote } from "../shared/books";
import { sortBooks } from "../shared/workspaceSorting";
import type { Book, Note, NoteFilter, Theme, WorkspaceSortOrder } from "../shared/types";
import { BookTree } from "./BookTree";
import { SearchIcon } from "./Icons";

interface SidebarProps {
  notes: Note[]; books: Book[]; mode: "notes" | "book"; activeBookId: string | null; activePageId: string | null; activeId: string | null;
  query: string; filter: NoteFilter; theme: Theme; searchRef: RefObject<HTMLInputElement | null>;
  notesSort: WorkspaceSortOrder; booksSort: WorkspaceSortOrder;
  onNotesSortChange(value: WorkspaceSortOrder): void; onBooksSortChange(value: WorkspaceSortOrder): void;
  onModeChange(value: "notes" | "book"): void; onBookChange(id: string): void; onQueryChange(value: string): void; onFilterChange(value: NoteFilter): void;
  onSelectNote(id: string): void; onSelectPage(id: string): void; onNewNote(): void; onNewBook(): void; onNewPage(section: boolean): void;
  onMovePage(pageId: string, targetId: string, placement: "before" | "inside" | "after"): void; onBookSettings(): void; onExportBook(): void; onBuildBook(): void; onPublishBook(): void; onDeleteBook(): void;
  onClear(): void; onDataLocation(): void; onEnvironmentSetup(): void; onThemeChange(value: Theme): void; onClose(): void;
}

function shortDate(iso: string): string {
  const date = new Date(iso); const today = new Date();
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SortControl({ workspace, value, onChange }: { workspace: "Notes" | "Books"; value: WorkspaceSortOrder; onChange(value: WorkspaceSortOrder): void }) {
  return <label className="workspace-sort"><span>Sort by</span><select aria-label={`Sort ${workspace}`} value={value} onChange={event => onChange(event.target.value as WorkspaceSortOrder)}>
    <option value="updated">Last modified</option><option value="created">Date created</option><option value="title">Name (A–Z)</option>
  </select></label>;
}

export function Sidebar(props: SidebarProps) {
  const looseNotes = props.notes.filter(note => !getBookForNote(props.books, note.id));
  const visibleNotes = filterNotes(looseNotes, props.query, props.filter, props.notesSort);
  const visibleBooks = sortBooks(props.books, props.notes, props.booksSort);
  const activeBook = props.books.find(book => book.id === props.activeBookId) ?? null;
  return <aside className="sidebar">
    <header className="brand-row"><div className="brand"><img className="brand-mark" src="./icon.png" alt="" /><strong>LanCarbon</strong></div><button className="icon-button mobile-close" aria-label="Close notes list" onClick={props.onClose}>×</button></header>
    <nav className="workspace-tabs" aria-label="Workspace mode"><button className={props.mode === "notes" ? "active" : ""} aria-pressed={props.mode === "notes"} title="Switch to Notes (Ctrl+Q)" onClick={() => props.onModeChange("notes")}>Notes</button><button className={props.mode === "book" ? "active" : ""} aria-label="Books" aria-pressed={props.mode === "book"} aria-keyshortcuts="Control+Q" title="Switch between Notes and Books (Ctrl+Q)" onClick={() => props.onModeChange("book")}>Books<kbd aria-hidden="true">Q</kbd></button></nav>
    {props.mode === "notes" ? <>
      <button className="new-note" onClick={props.onNewNote}><span aria-hidden="true">＋</span> New Note <kbd>N</kbd></button>
      <label className="search-box"><SearchIcon /><input spellCheck={false} autoCorrect="off" autoCapitalize="off" ref={props.searchRef} type="search" aria-label="Search notes" placeholder="Search notes…" autoComplete="off" value={props.query} onChange={event => props.onQueryChange(event.target.value)} /><kbd>Ctrl K</kbd></label>
      <nav className="filter-row" aria-label="Note filter"><button className={`filter ${props.filter === "all" ? "active" : ""}`} onClick={() => props.onFilterChange("all")}>All</button><button className={`filter ${props.filter === "pinned" ? "active" : ""}`} onClick={() => props.onFilterChange("pinned")}>Pinned</button></nav>
      <SortControl workspace="Notes" value={props.notesSort} onChange={props.onNotesSortChange} />
      <div className="note-list" aria-live="polite">{visibleNotes.length === 0 ? <div className="list-empty">{looseNotes.length ? "No matching notes" : <>No regular notes yet<br />Create your first note above</>}</div> : visibleNotes.map(note => <button key={note.id} className={`note-card ${note.id === props.activeId ? "active" : ""}`} onClick={() => props.onSelectNote(note.id)}><div className="note-card-top"><h3>{note.title.trim() || "Untitled Note"}</h3>{note.pinned && <span className="pin-dot">◆</span>}<time>{shortDate(note.updatedAt)}</time></div><p>{note.content.replace(/\s+/g, " ").trim() || "No content"}</p><div className="card-tags">{note.tags.slice(0, 3).map(tag => <span className="card-tag" key={tag}>#{tag}</span>)}</div></button>)}</div>
    </> : <>
      <SortControl workspace="Books" value={props.booksSort} onChange={props.onBooksSortChange} />
      <div className="book-picker-row"><select aria-label="Select Book" value={activeBook?.id ?? ""} onChange={event => props.onBookChange(event.target.value)}><option value="" disabled>Select Book</option>{visibleBooks.map(book => <option key={book.id} value={book.id}>{book.settings.title}</option>)}</select><button className="icon-button" aria-label="New Book" onClick={props.onNewBook}>＋</button></div>
      {activeBook ? <><div className="book-actions"><button onClick={() => props.onNewPage(true)}>＋ Section</button><button onClick={() => props.onNewPage(false)}>＋ Child Page</button></div><div className="book-secondary-actions"><button onClick={props.onBookSettings}>Settings</button><button onClick={props.onExportBook}>Export</button><button onClick={props.onBuildBook}>Build</button><button onClick={props.onPublishBook}>Publish</button><button className="danger-text" onClick={props.onDeleteBook}>Delete</button></div><div className="note-list"><BookTree book={activeBook} notes={props.notes} activePageId={props.activePageId} onSelect={props.onSelectPage} onMove={props.onMovePage} /></div></> : <div className="list-empty">No Books yet<br /><button className="text-button" onClick={props.onNewBook}>Create your first Book</button></div>}
    </>}
    <footer className="sidebar-footer"><div className="theme-row"><span className="theme-label">Theme</span><div className="theme-switch" role="group" aria-label="Choose theme"><button className="theme-option" aria-pressed={props.theme === "light"} onClick={() => props.onThemeChange("light")}><span>☀</span> Light</button><button className="theme-option" aria-pressed={props.theme === "dark"} onClick={() => props.onThemeChange("dark")}><span>☾</span> Dark</button></div></div><div className="storage-row"><button className="text-button" onClick={props.onEnvironmentSetup}>Environment Setup</button><button className="text-button" onClick={props.onDataLocation}>Data Location</button>{props.mode === "notes" && <button className="text-button" onClick={props.onClear}>Clear Notes</button>}</div></footer>
  </aside>;
}
