import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookSettingsDialog, ChooseBookDialog, CreateBookDialog, DataLocationDialog, PagePropertiesDialog } from "./components/BookDialogs";
import { BookBuildPanel } from "./components/BookBuildPanel";
import { GitHubPublishingPanel } from "./components/GitHubPublishingPanel";
import { EnvironmentSetupPanel } from "./components/EnvironmentSetupPanel";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { addNoteToBook, createBook, createEmptyWorkspace, getBookForNote, isValidExportPath, movePage, removeBookLanguageHeadings, removePageFromBook, updatePageMetadata } from "./shared/books";
import { createInitialNotes, createNote, ensureReleaseReadme, parseTags, sortNotes } from "./shared/notes";
import { ensurePhase2Guide } from "./shared/releaseGuide";
import { ensurePhase3Guide } from "./shared/phase3Guide";
import { ensurePhase4Guide } from "./shared/phase4Guide";
import { ensurePhase5Guide } from "./shared/phase5Guide";
import type { PreviewDocument } from "./preview/mystPreview";
import type { Book, BookCheckIssue, Note, NoteFilter, SaveState, Theme, WorkspaceFile } from "./shared/types";

const THEME_KEY = "lancarbon-theme-v1";
const LAST_BOOK_KEY = "lancarbon-last-book-v1";
function lastBookId(): string | null { try { return localStorage.getItem(LAST_BOOK_KEY); } catch { return null; } }
function initialTheme(): Theme { try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; } }

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceFile>(createEmptyWorkspace());
  const [mode, setMode] = useState<"notes" | "book">("notes");
  // View mode belongs to the workspace session, not a keyed note editor.
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [previewNavigation, setPreviewNavigation] = useState<{ noteId: string; anchor: string; sequence: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [showBookSettings, setShowBookSettings] = useState(false);
  const [showPageProperties, setShowPageProperties] = useState(false);
  const [showCreateBook, setShowCreateBook] = useState(false);
  const [showBookChooser, setShowBookChooser] = useState(false);
  const [showDataLocation, setShowDataLocation] = useState(false);
  const [showBookBuild, setShowBookBuild] = useState(false);
  const [showGitHubPublishing, setShowGitHubPublishing] = useState(false);
  const [showEnvironmentSetup, setShowEnvironmentSetup] = useState(false);
  const [dataLocation, setDataLocation] = useState("");
  const workspaceRef = useRef(workspace);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 1800); }, []);
  const persist = useCallback((next: WorkspaceFile, delay = 0) => {
    workspaceRef.current = next; setWorkspace(next); setSaveState("saving"); clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => { const result = await window.notesDesktop.saveWorkspace(workspaceRef.current); setSaveState(result.ok ? "saved" : "error"); }, delay);
  }, []);
  const saveNow = useCallback(async () => {
    clearTimeout(saveTimer.current); setSaveState("saving");
    const result = await window.notesDesktop.saveWorkspace(workspaceRef.current); setSaveState(result.ok ? "saved" : "error"); return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.notesDesktop.loadWorkspace().then(result => {
      if (cancelled) return;
      if (!result.ok) { setSaveState("error"); setLoaded(true); showToast(result.error); return; }
      const base = result.isFirstRun
        ? { ...result.workspace, notes: [...createInitialNotes(), ...result.workspace.notes.filter(note => note.id !== "lancarbon-release-readme")] }
        : result.workspace;
      const release = ensureReleaseReadme(base.notes);
      const released = release.changed ? { ...base, notes: release.notes } : base;
      const guide = ensurePhase2Guide(released);
      const phase3 = ensurePhase3Guide(guide.workspace);
      const phase4 = ensurePhase4Guide(phase3.workspace);
      const phase5 = ensurePhase5Guide(phase4.workspace);
      const languageHeadings = removeBookLanguageHeadings(phase5.workspace);
      const next = languageHeadings.workspace;
      workspaceRef.current = next; setWorkspace(next);
      const preferredNotes = result.isFirstRun ? next.notes : base.notes;
      const loose = preferredNotes.filter(note => !getBookForNote(next.books, note.id));
      setActiveId(sortNotes(loose)[0]?.id ?? null);
      setActiveBookId(next.books.find(book => book.id === lastBookId())?.id ?? next.books[0]?.id ?? null);
      setLoaded(true);
      if (result.isFirstRun || result.migrated || release.changed || guide.changed || phase3.changed || phase4.changed || phase5.changed || languageHeadings.changed) persist(next);
    });
    void window.notesDesktop.getDataLocation().then(result => { if (!cancelled && result.ok) setDataLocation(result.path); });
    return () => { cancelled = true; clearTimeout(saveTimer.current); clearTimeout(toastTimer.current); };
  }, [persist, showToast]);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem(THEME_KEY, theme); } catch { /* optional */ } }, [theme]);
  useEffect(() => {
    if (!loaded || !activeBookId) return;
    try { localStorage.setItem(LAST_BOOK_KEY, activeBookId); } catch { /* optional preference */ }
  }, [loaded, activeBookId]);

  const activeBook = useMemo(() => workspace.books.find(book => book.id === activeBookId) ?? null, [workspace.books, activeBookId]);
  const activePage = activeBook && activePageId ? activeBook.pages[activePageId] ?? null : null;
  const activeNoteId = mode === "book" ? activePage?.noteId ?? null : activeId;
  const activeNote = useMemo(() => workspace.notes.find(note => note.id === activeNoteId) ?? null, [workspace.notes, activeNoteId]);
  const previewDocuments = useMemo<PreviewDocument[]>(() => {
    if (mode !== "book" || !activeBook) return activeNote ? [{ id: activeNote.id, title: activeNote.title, content: activeNote.content }] : [];
    const notesById = new Map(workspace.notes.map(note => [note.id, note]));
    return Object.values(activeBook.pages).flatMap(page => {
      const note = notesById.get(page.noteId);
      return note && page.sourceType === "markdown" ? [{ id: note.id, title: note.title, content: note.content, path: page.exportPath, label: page.metadata.label, bibliography:activeBook.settings.bibliography?.flatMap(source=>source.entries) }] : [];
    });
  }, [mode, activeBook, activeNote, workspace.notes]);
  const navigatePreview = (noteId: string, anchor: string) => {
    const page = activeBook && Object.values(activeBook.pages).find(item => item.noteId === noteId);
    if (mode !== "book" || !page) return;
    setActivePageId(page.id); setPreviewNavigation({ noteId, anchor, sequence: Date.now() });
  };

  const addOrdinaryNote = useCallback(() => {
    const note = createNote(); const next = { ...workspaceRef.current, notes: [...workspaceRef.current.notes, note] };
    setMode("notes"); setActiveId(note.id); setQuery(""); setFilter("all"); persist(next); showToast("New note created");
    requestAnimationFrame(() => (document.querySelector(".title-input") as HTMLInputElement | null)?.select());
  }, [persist, showToast]);

  const addBookPage = useCallback((section: boolean) => {
    const current = workspaceRef.current; const book = current.books.find(item => item.id === activeBookId); if (!book) return;
    const note = createNote({ title: section ? "New Section" : "Untitled Page", content: section ? "# New Section\n" : "" });
    const updated = addNoteToBook(book, note, { parentPageId: section ? undefined : activePageId ?? book.homePageId, section });
    const page = Object.values(updated.pages).find(item => item.noteId === note.id)!;
    persist({ ...current, notes: [...current.notes, note], books: current.books.map(item => item.id === book.id ? updated : item) });
    setActivePageId(page.id); showToast(section ? "Section created" : "Child page created");
  }, [activeBookId, activePageId, persist, showToast]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || (event.target instanceof Element && event.target.closest(".insert-dialog"))) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); if (mode === "notes") searchRef.current?.focus(); }
      if (mod && event.key.toLowerCase() === "n") { event.preventDefault(); mode === "book" ? addBookPage(false) : addOrdinaryNote(); }
      if (mod && event.shiftKey && event.key.toLowerCase() === "e" && activeNoteId && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        const next = viewMode === "edit" ? "preview" : "edit";
        setViewMode(next);
        if (next === "edit") requestAnimationFrame(() => document.querySelector<HTMLElement>(".markdown-workspace:not([hidden]) .cm-content")?.focus());
      }
      if (event.key === "Escape") { document.body.classList.remove("sidebar-open"); searchRef.current?.blur(); setShowBookSettings(false); setShowPageProperties(false); setShowCreateBook(false); setShowBookChooser(false); setShowDataLocation(false); setShowBookBuild(false); setShowGitHubPublishing(false); setShowEnvironmentSetup(false); }
    };
    document.addEventListener("keydown", shortcut); return () => document.removeEventListener("keydown", shortcut);
  }, [activeNoteId, addBookPage, addOrdinaryNote, mode, viewMode]);

  const createNewBook = (title: string) => {
    const { book, homeNote } = createBook(title); const current = workspaceRef.current;
    persist({ ...current, notes: [...current.notes, homeNote], books: [...current.books, book] });
    setShowCreateBook(false); setMode("book"); setActiveBookId(book.id); setActivePageId(book.homePageId); showToast("Jupyter Book created");
  };

  const switchMode = (value: "notes" | "book") => {
    setMode(value);
    if (value === "notes") {
      const loose = workspaceRef.current.notes.filter(note => !getBookForNote(workspaceRef.current.books, note.id)); setActiveId(sortNotes(loose)[0]?.id ?? null);
    } else {
      const book = workspaceRef.current.books.find(item => item.id === activeBookId) ?? workspaceRef.current.books[0];
      setActiveBookId(book?.id ?? null); setActivePageId(book?.homePageId ?? null);
    }
  };

  const switchBook = (bookId: string) => { const book = workspace.books.find(item => item.id === bookId); setActiveBookId(bookId); setActivePageId(book?.homePageId ?? null); };
  const updateActive = (patch: Partial<Pick<Note, "title" | "content" | "tags">>) => {
    const next = { ...workspaceRef.current, notes: workspaceRef.current.notes.map(note => note.id === activeNoteId ? { ...note, ...patch, ...(patch.tags ? { tags: parseTags(patch.tags.join(",")) } : {}), updatedAt: new Date().toISOString() } : note) };
    persist(next, 260);
  };
  const togglePin = () => { if (!activeNote) return; const pinned = !activeNote.pinned; persist({ ...workspaceRef.current, notes: workspaceRef.current.notes.map(note => note.id === activeNote.id ? { ...note, pinned, updatedAt: new Date().toISOString() } : note) }); showToast(pinned ? "Note pinned" : "Note unpinned"); };

  const joinActiveNoteToBook = (bookId: string) => {
    if (!activeNote || getBookForNote(workspace.books, activeNote.id) || !workspace.books.length) return;
    const book = workspace.books.find(item => item.id === bookId); if (!book) return;
    const updated = addNoteToBook(book, activeNote); const page = Object.values(updated.pages).find(item => item.noteId === activeNote.id)!;
    persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(item => item.id === book.id ? updated : item) });
    setShowBookChooser(false); setMode("book"); setActiveBookId(book.id); setActivePageId(page.id); showToast("Note added to Book");
  };

  const addActiveToBook = () => {
    if (!activeNote || getBookForNote(workspace.books, activeNote.id) || !workspace.books.length) return;
    if (workspace.books.length === 1) joinActiveNoteToBook(workspace.books[0].id); else setShowBookChooser(true);
  };

  const removeActiveFromBook = () => {
    if (!activeBook || !activePage || activePage.id === activeBook.homePageId || !window.confirm("This page and its children will return to Notes. Their content will not be deleted. Continue?")) return;
    const result = removePageFromBook(activeBook, activePage.id);
    persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(book => book.id === activeBook.id ? result.book : book) });
    setMode("notes"); setActivePageId(null); setActiveId(activeNote?.id ?? result.removedNoteIds[0] ?? null); showToast("Page removed from Book");
  };

  const deleteActive = () => {
    if (!activeNote) return;
    if (mode === "book" && activeBook && activePage) {
      if (activePage.id === activeBook.homePageId) { showToast("The Book home page cannot be deleted"); return; }
      const result = removePageFromBook(activeBook, activePage.id);
      persist({ ...workspaceRef.current, notes: workspaceRef.current.notes.filter(note => !result.removedNoteIds.includes(note.id)), books: workspaceRef.current.books.map(book => book.id === activeBook.id ? result.book : book) });
      setActivePageId(activeBook.homePageId); showToast("Page permanently deleted"); return;
    }
    const notes = workspaceRef.current.notes.filter(note => note.id !== activeNote.id); const loose = notes.filter(note => !getBookForNote(workspaceRef.current.books, note.id));
    persist({ ...workspaceRef.current, notes }); setActiveId(sortNotes(loose)[0]?.id ?? null); showToast("Note deleted");
  };

  const clearLoose = () => {
    const loose = workspaceRef.current.notes.filter(note => !getBookForNote(workspaceRef.current.books, note.id));
    if (!loose.length || !window.confirm("Clear all regular notes? Pages inside Books will not be affected.")) return;
    const ids = new Set(loose.map(note => note.id)); persist({ ...workspaceRef.current, notes: workspaceRef.current.notes.filter(note => !ids.has(note.id)) }); setActiveId(null); showToast("All regular notes cleared");
  };

  const deleteBook = () => {
    if (!activeBook) return;
    const deletedNoteIds = new Set(Object.values(activeBook.pages).map(page => page.noteId));
    const books = workspaceRef.current.books.filter(book => book.id !== activeBook.id);
    const notes = workspaceRef.current.notes.filter(note => !deletedNoteIds.has(note.id));
    const loose = notes.filter(note => !getBookForNote(books, note.id));
    persist({ ...workspaceRef.current, notes, books });
    setMode("notes"); setActiveBookId(books[0]?.id ?? null); setActivePageId(null); setActiveId(sortNotes(loose)[0]?.id ?? null); showToast("Book and all of its pages deleted");
  };

  const exportBook = async () => {
    if (!activeBook) return; const saved = await saveNow(); if (!saved.ok) { showToast(saved.error); return; }
    const result = await window.notesDesktop.exportBook(activeBook.id); if (result.ok) showToast(`Exported to ${result.destination}`); else if (!result.canceled) showToast(result.error);
  };

  const checkAndBuildBook = async () => {
    if (!activeBook) return; const saved = await saveNow(); if (!saved.ok) { showToast(saved.error); return; }
    setShowBookBuild(true);
  };

  const openPublishBook = async () => {
    if (!activeBook) return; const saved = await saveNow(); if (!saved.ok) { showToast(saved.error); return; }
    setShowGitHubPublishing(true);
  };

  const navigateBuildIssue = (item: BookCheckIssue) => {
    if (!item.pageId || !activeBook?.pages[item.pageId]) return;
    setActivePageId(item.pageId); setShowBookBuild(false); setViewMode("edit");
    showToast(item.line ? `Opened ${item.pageTitle ?? "page"}, line ${item.line}` : `Opened ${item.pageTitle ?? "page"}`);
  };

  const changeDataLocation = async () => {
    const saved = await saveNow();
    if (!saved.ok) { showToast(saved.error); return; }
    const result = await window.notesDesktop.changeDataLocation();
    if (result.ok) { setDataLocation(result.path); setShowDataLocation(false); showToast(`Data moved to ${result.path}`); }
    else if (!result.canceled) showToast(result.error);
  };

  const openDataLocation = async () => {
    const result = await window.notesDesktop.openDataLocation();
    if (!result.ok) showToast(result.error);
  };

  const savePageProperties = (value: { exportPath: string; showInToc: boolean; metadata: typeof activePage extends infer _T ? NonNullable<typeof activePage>["metadata"] : never }) => {
    if (!activeBook || !activePage) return;
    if (value.exportPath && !isValidExportPath(value.exportPath, activePage.sourceType)) { showToast("Invalid export path. Use a safe relative .md path."); return; }
    if (Object.values(activeBook.pages).some(page => page.id !== activePage.id && page.exportPath.toLocaleLowerCase("en-US") === value.exportPath.toLocaleLowerCase("en-US"))) { showToast("Another page already uses this export path"); return; }
    const updated = updatePageMetadata(activeBook, activePage.id, value);
    persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(book => book.id === activeBook.id ? updated : book) }); setShowPageProperties(false); showToast("Page properties saved");
  };

  if (!loaded) return <div className="loading-screen" role="status">Loading notes…</div>;
  return <>
    <main className="app-shell" aria-label="LanCarbon application">
      <Sidebar notes={workspace.notes} books={workspace.books} mode={mode} activeBookId={activeBookId} activePageId={activePageId} activeId={activeId} query={query} filter={filter} theme={theme} searchRef={searchRef} onModeChange={switchMode} onBookChange={switchBook} onQueryChange={setQuery} onFilterChange={setFilter} onSelectNote={id => { setActiveId(id); document.body.classList.remove("sidebar-open"); }} onSelectPage={id => { setActivePageId(id); document.body.classList.remove("sidebar-open"); }} onNewNote={addOrdinaryNote} onNewBook={() => setShowCreateBook(true)} onNewPage={addBookPage} onMovePage={(pageId, targetId, placement) => { if (!activeBook) return; const updated = movePage(activeBook, pageId, targetId, placement); persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(book => book.id === activeBook.id ? updated : book) }); }} onBookSettings={() => setShowBookSettings(true)} onExportBook={() => void exportBook()} onBuildBook={() => void checkAndBuildBook()} onPublishBook={() => void openPublishBook()} onDeleteBook={deleteBook} onClear={clearLoose} onEnvironmentSetup={() => setShowEnvironmentSetup(true)} onDataLocation={() => setShowDataLocation(true)} onThemeChange={value => { setTheme(value); showToast(value === "light" ? "Switched to light theme" : "Switched to dark theme"); }} onClose={() => document.body.classList.remove("sidebar-open")} />
      <Editor bibliographyBook={mode === "book" ? activeBook ?? undefined : undefined} onBibliographyBookChange={updated => persist({...workspaceRef.current,books:workspaceRef.current.books.map(book=>book.id===updated.id?updated:book)})} onResourcesChanged={next => { clearTimeout(saveTimer.current); workspaceRef.current = next; setWorkspace(next); setSaveState("saved"); }} resourceBooks={workspace.books} beforeResourceChange={async () => { const result = await saveNow(); if (!result.ok) throw new Error(result.error); }} resourceNotes={workspace.notes} key={`${mode}:${activeNoteId ?? "empty"}`} previewDocuments={previewDocuments} previewNavigation={previewNavigation} onPreviewNavigate={navigatePreview} onPreviewNavigated={() => setPreviewNavigation(null)} note={activeNote} saveState={saveState} theme={theme} viewMode={viewMode} onViewModeChange={setViewMode} bookContext={activePage ? { isHome: activePage.id === activeBook?.homePageId } : undefined} booksAvailable={workspace.books.length > 0} onChange={updateActive} onNew={mode === "book" ? () => addBookPage(false) : addOrdinaryNote} onPin={togglePin} onDelete={deleteActive} onAddToBook={mode === "notes" ? addActiveToBook : undefined} onRemoveFromBook={mode === "book" && activePage ? removeActiveFromBook : undefined} onPageProperties={mode === "book" && activePage ? () => setShowPageProperties(true) : undefined} onOpenSidebar={() => document.body.classList.add("sidebar-open")} />
    </main>
    <button className="sidebar-backdrop" aria-label="Close notes list" onClick={() => document.body.classList.remove("sidebar-open")} />
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    {showCreateBook && <CreateBookDialog onClose={() => setShowCreateBook(false)} onCreate={createNewBook} />}
    {showBookChooser && <ChooseBookDialog books={workspace.books} onClose={() => setShowBookChooser(false)} onChoose={joinActiveNoteToBook} />}
    {showBookSettings && activeBook && <BookSettingsDialog book={activeBook} onClose={() => setShowBookSettings(false)} onSave={settings => { const updated: Book = { ...activeBook, settings, updatedAt: new Date().toISOString() }; persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(book => book.id === activeBook.id ? updated : book) }); setShowBookSettings(false); showToast("Book settings saved"); }} />}
    {showPageProperties && activePage && <PagePropertiesDialog exportPath={activePage.exportPath} showInToc={activePage.showInToc} metadata={activePage.metadata} onClose={() => setShowPageProperties(false)} onSave={savePageProperties} />}
    {showDataLocation && <DataLocationDialog path={dataLocation} onClose={() => setShowDataLocation(false)} onChange={() => void changeDataLocation()} onOpen={() => void openDataLocation()} />}
    {showBookBuild && activeBook && <BookBuildPanel book={activeBook} onClose={() => setShowBookBuild(false)} onNavigate={navigateBuildIssue} onNotice={showToast} onEnvironmentSetup={() => setShowEnvironmentSetup(true)} />}
    {showGitHubPublishing && activeBook && <GitHubPublishingPanel book={activeBook} onClose={() => setShowGitHubPublishing(false)} onNotice={showToast} onEnvironmentSetup={() => setShowEnvironmentSetup(true)} onBinding={binding => {
      const updated: Book = { ...activeBook, settings: { ...activeBook.settings, github: binding.repositoryUrl, publishing: binding }, updatedAt: new Date().toISOString() };
      persist({ ...workspaceRef.current, books: workspaceRef.current.books.map(book => book.id === activeBook.id ? updated : book) });
    }} />}
    {showEnvironmentSetup && <EnvironmentSetupPanel onClose={() => setShowEnvironmentSetup(false)} onNotice={showToast} />}
  </>;
}
