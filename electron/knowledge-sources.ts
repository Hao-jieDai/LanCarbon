import { createHash } from "node:crypto";
import { assetReferences } from "../src/shared/assets";
import type { LibraryEntry, LibraryFolder } from "../src/shared/library";
import type { WorkspaceFile } from "../src/shared/types";
import { KNOWLEDGE_PARSER_VERSION, selectedKnowledgeSources, type KnowledgeScope, type KnowledgeSource, type KnowledgeView } from "../src/shared/knowledge";
export interface KnowledgeSnapshot { sources: KnowledgeSource[]; folders: LibraryFolder[]; books: KnowledgeView["books"]; content: Map<string, string> }
export const knowledgeHash = (text: string) => createHash("sha256").update(text).digest("hex");
export function knowledgeSnapshot(workspace: WorkspaceFile, entries: LibraryEntry[], folders: LibraryFolder[]): KnowledgeSnapshot {
  const content = new Map<string, string>(), sources: KnowledgeSource[] = [], files = new Map<string, string>();
  for (const entry of entries) { const id = `file:${entry.documentId ?? entry.id}`; files.set(entry.id, id); if (entry.assetId) files.set(entry.assetId, id); }
  const noteMap = new Map(workspace.notes.map(note => [note.id, note])), origins = new Map<string, KnowledgeSource["locations"]>();
  const books = workspace.books.map(book => ({ id: book.id, title: book.settings.title, noteIds: [...new Set(Object.values(book.pages).map(page => page.noteId))], systemManaged: book.id === "lancarbon-from-zero-to-one", homePageId: book.homePageId, rootPageIds: book.rootPageIds, pages: Object.values(book.pages).map(page => ({ id: page.id, noteId: page.noteId, title: page.metadata.shortTitle || noteMap.get(page.noteId)?.title || "Untitled", children: page.children })) }));
  for (const book of workspace.books) {
    const visited = new Set<string>();
    const visit = (id: string, titles: string[] = []) => {
      const page = book.pages[id]; if (!page || visited.has(id) || titles.length > 100) return; visited.add(id);
      const trail = [...titles, page.metadata.shortTitle || noteMap.get(page.noteId)?.title || "Untitled"], locations = origins.get(page.noteId) ?? [];
      locations.push({ kind: "book", noteId: page.noteId, bookId: book.id, pageId: page.id, label: `${book.settings.title} / ${trail.join(" / ")}` }); origins.set(page.noteId, locations);
      for (const child of page.children) visit(child, trail);
    };
    for (const id of [book.homePageId, ...book.rootPageIds, ...Object.keys(book.pages)]) visit(id);
  }
  for (const note of workspace.notes) {
    const locations: KnowledgeSource["locations"] = origins.get(note.id) ?? [];
    if (!locations.length) locations.push({ kind: "note", noteId: note.id, label: `Notes / ${note.title || "Untitled"}` });
    const id = `note:${note.id}`, attachments = [...new Set(assetReferences(note.content).map(ref => files.get(ref.id)).filter((id): id is string => !!id))];
    sources.push({ id, entityId: note.id, kind: "note", title: note.title || "Untitled", format: "markdown", fingerprint: knowledgeHash(`${KNOWLEDGE_PARSER_VERSION}\0${note.content}`), locations, attachments, tags: note.tags, systemManaged: note.id === "lancarbon-release-readme" || note.id === "lancarbon-usage-guide" || locations.some(location => location.bookId === "lancarbon-from-zero-to-one") });
    content.set(id, note.content);
  }
  for (const entry of entries) sources.push({ id: files.get(entry.id)!, kind: "file", entityId: entry.documentId ?? entry.id, title: entry.name, format: entry.format === "pdf" || entry.format === "epub" ? entry.format : "other", fingerprint: knowledgeHash(`${KNOWLEDGE_PARSER_VERSION}\0${entry.sha256 ?? entry.versions?.at(-1)?.sha256 ?? entry.id}\0${entry.version ?? 1}`), locations: [{ kind: "file", fileId: entry.documentId ?? entry.id, label: `${entry.location ?? "Source materials"} / ${entry.name}` }], attachments: [], tags: [], systemManaged: !!entry.systemManaged, folderId: entry.folderId, imported: entry.source === "import", unavailable: entry.missing ? "The original file is missing. Restore it or remove it from the selection." : entry.syncError });
  return { sources, folders, books, content };
}
export function selectedKnowledgeIds(snapshot: KnowledgeSnapshot, scope: KnowledgeScope): Set<string> {
  return selectedKnowledgeSources(snapshot, scope);
}
export function validKnowledgeScope(value: KnowledgeScope): KnowledgeScope {
  if (!value || typeof value !== "object" || ![value.noteIds, value.fileIds, value.bookIds, value.folderIds].every(ids => Array.isArray(ids) && ids.length <= 20000) || ![value.includeSystem, value.includeAttachments, value.autoUpdate].every(value => typeof value === "boolean")) throw Error("Invalid knowledge selection.");
  const strings = (items: unknown[]): string[] => { if (!items.every(item => typeof item === "string" && item.length > 0 && item.length <= 300 && !/[\x00-\x1f]/.test(item))) throw Error("Invalid knowledge selection."); return [...new Set(items as string[])]; };
  for (const key of ["excludedNoteIds", "excludedFileIds"] as const) if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key]!.length > 20000)) throw Error("Invalid knowledge selection.");
  return { noteIds: strings(value.noteIds), fileIds: strings(value.fileIds), bookIds: strings(value.bookIds), folderIds: [...new Set(value.folderIds.map(id => { if (id !== null && (typeof id !== "string" || !/^folder_[a-f0-9]{32}$/.test(id))) throw Error("Invalid selected folder."); return id; }))], ...(value.excludedNoteIds ? { excludedNoteIds: strings(value.excludedNoteIds) } : {}), ...(value.excludedFileIds ? { excludedFileIds: strings(value.excludedFileIds) } : {}), includeSystem: value.includeSystem, includeAttachments: value.includeAttachments, autoUpdate: value.autoUpdate };
}
