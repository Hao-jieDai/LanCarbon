import { createNote, makeId } from "./notes";
import type { Book, BookPage, Note, PageMetadata, WorkspaceFile } from "./types";
import { validateBibliographies } from "./bibliography";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
export const MAX_BOOKS = 100;
export const MAX_BOOK_PAGES = 10_000;

function optionalString(value: unknown, maximum = 2_000): string | undefined {
  return typeof value === "string" ? value.slice(0, maximum) : undefined;
}

function normalizeAuthors(value: unknown): Array<{ name: string }> {
  return Array.isArray(value) ? value.slice(0, 50).flatMap(author => {
    if (!author || typeof author !== "object" || typeof (author as { name?: unknown }).name !== "string") return [];
    const name = (author as { name: string }).name.slice(0, 200);
    return name ? [{ name }] : [];
  }) : [];
}

function normalizeStringArray(value: unknown, maximum = 100): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, maximum).map(item => item.slice(0, 200)) : [];
}

function normalizePublishing(value: unknown): import("./types").GitHubPublishingBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository)
    || typeof source.repositoryUrl !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(source.repositoryUrl)
    || typeof source.branch !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(source.branch)
    || (source.visibility !== "PUBLIC" && source.visibility !== "PRIVATE")
    || typeof source.initializedAt !== "string" || Number.isNaN(Date.parse(source.initializedAt))) return undefined;
  return { repository: source.repository, repositoryUrl: source.repositoryUrl, branch: source.branch, visibility: source.visibility,
    initializedAt: source.initializedAt, ...(typeof source.pagesUrl === "string" && /^https:\/\//.test(source.pagesUrl) ? { pagesUrl: source.pagesUrl } : {}),
    ...(typeof source.lastPublishedAt === "string" && !Number.isNaN(Date.parse(source.lastPublishedAt)) ? { lastPublishedAt: source.lastPublishedAt } : {}),
    ...(typeof source.lastCommit === "string" && /^[a-f0-9]{7,40}$/i.test(source.lastCommit) ? { lastCommit: source.lastCommit } : {}) };
}

export function normalizeBooks(value: unknown, notes: Note[]): Book[] {
  if (!Array.isArray(value)) return [];
  const books: Book[] = [];
  for (const raw of value.slice(0, MAX_BOOKS)) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const settingsSource = source.settings && typeof source.settings === "object" ? source.settings as Record<string, unknown> : {};
    if (typeof source.id !== "string" || !source.id || !source.pages || typeof source.pages !== "object" || Array.isArray(source.pages)) continue;
    const pageEntries = Object.entries(source.pages as Record<string, unknown>).slice(0, MAX_BOOK_PAGES);
    const pages: Record<string, BookPage> = {};
    pageEntries.forEach(([key, rawPage]) => {
      if (!rawPage || typeof rawPage !== "object") return;
      const page = rawPage as Record<string, unknown>;
      const metadata = page.metadata && typeof page.metadata === "object" ? page.metadata as Record<string, unknown> : {};
      const id = typeof page.id === "string" && page.id ? page.id.slice(0, 200) : key.slice(0, 200);
      if (!id || typeof page.noteId !== "string" || typeof page.exportPath !== "string") return;
      pages[id] = {
        id,
        noteId: page.noteId.slice(0, 200),
        sourceType: page.sourceType === "notebook" ? "notebook" : "markdown",
        exportPath: page.exportPath.slice(0, 500),
        showInToc: page.showInToc !== false,
        metadata: {
          shortTitle: optionalString(metadata.shortTitle, 200),
          description: optionalString(metadata.description),
          authors: normalizeAuthors(metadata.authors),
          date: optionalString(metadata.date, 50),
          keywords: normalizeStringArray(metadata.keywords),
          label: optionalString(metadata.label, 200)
        },
        children: normalizeStringArray(page.children, MAX_BOOK_PAGES)
      };
    });
    const now = new Date().toISOString();
    const book: Book = {
      id: source.id.slice(0, 200),
      ...(source.phase2GuideRevision === 1 ? { phase2GuideRevision: 1 as const } : {}),
      settings: {
        title: typeof settingsSource.title === "string" ? settingsSource.title.slice(0, 200) : "Untitled Book",
        subtitle: optionalString(settingsSource.subtitle, 500),
        description: optionalString(settingsSource.description),
        authors: normalizeAuthors(settingsSource.authors),
        github: optionalString(settingsSource.github, 2_000),
        license: optionalString(settingsSource.license, 200),
        keywords: normalizeStringArray(settingsSource.keywords),
        siteTitle: optionalString(settingsSource.siteTitle, 200),
        logo: optionalString(settingsSource.logo, 500),
        favicon: optionalString(settingsSource.favicon, 500),
          bibliography: validateBibliographies(settingsSource.bibliography) ? settingsSource.bibliography : [],
          publishing: normalizePublishing(settingsSource.publishing)
      },
      pages,
      rootPageIds: normalizeStringArray(source.rootPageIds, MAX_BOOK_PAGES),
      homePageId: typeof source.homePageId === "string" ? source.homePageId.slice(0, 200) : "",
      createdAt: typeof source.createdAt === "string" && !Number.isNaN(Date.parse(source.createdAt)) ? source.createdAt : now,
      updatedAt: typeof source.updatedAt === "string" && !Number.isNaN(Date.parse(source.updatedAt)) ? source.updatedAt : now
    };
    if (validateWorkspace({ version: 2, notes, books: [...books, book] }).length === 0) books.push(book);
  }
  return books;
}

export function createEmptyWorkspace(notes: Note[] = []): WorkspaceFile {
  return { version: 2, notes, books: [] };
}

const BILINGUAL_LANGUAGE_HEADING = /^##[ \t]*(?:English|中文)[ \t]*(?:\r?\n(?:[ \t]*\r?\n)?|$)/gimu;

export function removeBookLanguageHeadings(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const bookNoteIds = new Set(workspace.books.flatMap(book => Object.values(book.pages).map(page => page.noteId)));
  let changed = false;
  const updatedAt = new Date().toISOString();
  const notes = workspace.notes.map(note => {
    if (!bookNoteIds.has(note.id)) return note;
    const content = note.content.replace(BILINGUAL_LANGUAGE_HEADING, "");
    if (content === note.content) return note;
    changed = true;
    return { ...note, content, updatedAt };
  });
  return changed ? { workspace: { ...workspace, notes }, changed: true } : { workspace, changed: false };
}

export function normalizeExportPath(value: string, fallbackId: string, section = false): string {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US")
    .replace(/\\/g, "/")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
  const safeSegments = normalized.split("/").filter(segment => segment && segment !== "." && segment !== ".." && !WINDOWS_RESERVED.test(segment));
  const base = safeSegments.join("/").replace(/\.(md|ipynb)$/i, "") || `page-${fallbackId.slice(0, 8)}`;
  return section ? `${base}/index.md` : `${base}.md`;
}

export function isValidExportPath(value: string, sourceType: "markdown" | "notebook" = "markdown"): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\") || /^[a-z]:/i.test(value) || value.includes("\\")) return false;
  const parts = value.split("/");
  const extension = sourceType === "notebook" ? ".ipynb" : ".md";
  return parts.every(part => part && part !== "." && part !== ".." && !WINDOWS_RESERVED.test(part) && !/[<>:"|?*\u0000-\u001f]/.test(part))
    && value.toLocaleLowerCase("en-US").endsWith(extension);
}

export function effectiveExportPath(book: Book, page: BookPage): string {
  if (page.id === book.homePageId) return "index.md";
  if (page.exportPath && isValidExportPath(page.exportPath, page.sourceType)) return page.exportPath;
  const extension = page.sourceType === "notebook" ? ".ipynb" : ".md";
  return `page-${page.id.slice(0, 8)}${extension}`;
}

export function createBook(title = "Untitled Book"): { book: Book; homeNote: Note } {
  const now = new Date().toISOString();
  const homeNote = createNote({ title: title.trim() || "Untitled Book", content: "# Home\n" });
  const homePage: BookPage = {
    id: makeId(), noteId: homeNote.id, sourceType: "markdown", exportPath: "index.md",
    showInToc: true, metadata: {}, children: []
  };
  return {
    homeNote,
    book: {
      id: makeId(),
      settings: { title: title.trim() || "Untitled Book", authors: [], keywords: [], bibliography: [] },
      pages: { [homePage.id]: homePage }, rootPageIds: [homePage.id], homePageId: homePage.id,
      createdAt: now, updatedAt: now
    }
  };
}

export function getBookForNote(books: Book[], noteId: string): Book | undefined {
  return books.find(book => Object.values(book.pages).some(page => page.noteId === noteId));
}

export function collectPageIds(book: Book): string[] {
  const result: string[] = [];
  const visit = (id: string) => {
    if (result.includes(id)) return;
    const page = book.pages[id];
    if (!page) return;
    result.push(id);
    page.children.forEach(visit);
  };
  book.rootPageIds.forEach(visit);
  return result;
}

function uniquePath(book: Book, requested: string, pageId: string): string {
  const existing = new Set(Object.values(book.pages).map(page => page.exportPath.toLocaleLowerCase("en-US")));
  if (!existing.has(requested.toLocaleLowerCase("en-US"))) return requested;
  const extension = requested.endsWith("/index.md") ? "/index.md" : ".md";
  const base = requested.slice(0, -extension.length);
  let suffix = 2;
  while (existing.has(`${base}-${suffix}${extension}`.toLocaleLowerCase("en-US"))) suffix += 1;
  return `${base}-${suffix}${extension}` || `page-${pageId.slice(0, 8)}.md`;
}

export function addNoteToBook(book: Book, note: Note, options: { parentPageId?: string; section?: boolean } = {}): Book {
  const pageId = makeId();
  const requested = normalizeExportPath(note.title, pageId, options.section);
  const page: BookPage = {
    id: pageId, noteId: note.id, sourceType: "markdown",
    exportPath: uniquePath(book, requested, pageId), showInToc: true, metadata: {}, children: []
  };
  const pages = { ...book.pages, [pageId]: page };
  if (options.parentPageId && pages[options.parentPageId]) {
    pages[options.parentPageId] = { ...pages[options.parentPageId], children: [...pages[options.parentPageId].children, pageId] };
    return { ...book, pages, updatedAt: new Date().toISOString() };
  }
  return { ...book, pages, rootPageIds: [...book.rootPageIds, pageId], updatedAt: new Date().toISOString() };
}

export function removePageFromBook(book: Book, pageId: string): { book: Book; removedNoteIds: string[] } {
  if (pageId === book.homePageId) throw new Error("The Book home page cannot be removed or deleted");
  const removedPageIds: string[] = [];
  const visit = (id: string) => { const page = book.pages[id]; if (!page) return; removedPageIds.push(id); page.children.forEach(visit); };
  visit(pageId);
  const removed = new Set(removedPageIds);
  const pages = Object.fromEntries(Object.entries(book.pages)
    .filter(([id]) => !removed.has(id))
    .map(([id, page]) => [id, { ...page, children: page.children.filter(child => !removed.has(child)) }]));
  return {
    book: { ...book, pages, rootPageIds: book.rootPageIds.filter(id => !removed.has(id)), updatedAt: new Date().toISOString() },
    removedNoteIds: removedPageIds.map(id => book.pages[id].noteId)
  };
}

export function movePage(book: Book, pageId: string, targetId: string, placement: "before" | "inside" | "after"): Book {
  if (pageId === book.homePageId || pageId === targetId) return book;
  const descendants = new Set<string>();
  const collect = (id: string) => { book.pages[id]?.children.forEach(child => { descendants.add(child); collect(child); }); };
  collect(pageId);
  if (descendants.has(targetId)) return book;
  const pages = Object.fromEntries(Object.entries(book.pages).map(([id, page]) => [id, { ...page, children: page.children.filter(child => child !== pageId) }]));
  let roots = book.rootPageIds.filter(id => id !== pageId);
  if (placement === "inside") pages[targetId] = { ...pages[targetId], children: [...pages[targetId].children, pageId] };
  else {
    const parent = Object.values(pages).find(page => page.children.includes(targetId));
    const list = parent ? parent.children : roots;
    const index = list.indexOf(targetId) + (placement === "after" ? 1 : 0);
    const next = [...list.slice(0, index), pageId, ...list.slice(index)];
    if (parent) pages[parent.id] = { ...parent, children: next }; else roots = next;
  }
  return { ...book, pages, rootPageIds: roots, updatedAt: new Date().toISOString() };
}

export function updatePageMetadata(book: Book, pageId: string, patch: Partial<BookPage> & { metadata?: PageMetadata }): Book {
  const page = book.pages[pageId];
  if (!page) return book;
  const exportPath = pageId === book.homePageId ? "index.md" : (patch.exportPath ?? page.exportPath);
  return { ...book, pages: { ...book.pages, [pageId]: { ...page, ...patch, exportPath, metadata: { ...page.metadata, ...patch.metadata } } }, updatedAt: new Date().toISOString() };
}

export function validateWorkspace(workspace: WorkspaceFile): string[] {
  const errors: string[] = [];
  const memberships = new Map<string, string>();
  workspace.books.forEach(book => {
    if (!book.pages[book.homePageId] || book.pages[book.homePageId].exportPath !== "index.md") errors.push(`Book “${book.settings.title}” has no valid home page`);
    const reachable = collectPageIds(book);
    if (reachable.length !== Object.keys(book.pages).length) errors.push(`Book “${book.settings.title}” contains disconnected pages`);
    const paths = new Set<string>();
    Object.values(book.pages).forEach(page => {
      if (!workspace.notes.some(note => note.id === page.noteId)) errors.push(`Page references a missing note: ${page.noteId}`);
      if (memberships.has(page.noteId)) errors.push(`A note cannot belong to multiple Books: ${page.noteId}`); else memberships.set(page.noteId, book.id);
      const exportedPath = effectiveExportPath(book, page);
      const lower = exportedPath.toLocaleLowerCase("en-US");
      if (page.exportPath && !isValidExportPath(page.exportPath, page.sourceType)) errors.push(`Invalid export path: ${page.exportPath}`);
      if (paths.has(lower)) errors.push(`Duplicate export path: ${exportedPath}`); else paths.add(lower);
    });
  });
  return errors;
}
