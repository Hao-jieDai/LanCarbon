import type { LibraryFolder } from "./library";
export type KnowledgeStatus = "pending" | "processing" | "ready" | "partial" | "failed" | "missing" | "unsupported";
export interface KnowledgeLocation { kind: "note" | "book" | "file"; noteId?: string; bookId?: string; pageId?: string; fileId?: string; label: string }
export interface KnowledgeSource {
  id: string; kind: "note" | "file"; entityId: string; title: string; format: "markdown" | "pdf" | "epub" | "other";
  fingerprint: string; locations: KnowledgeLocation[]; attachments: string[]; tags: string[]; systemManaged: boolean;
  folderId?: string | null; imported?: boolean; unavailable?: string;
}
export interface KnowledgeScope { noteIds: string[]; fileIds: string[]; bookIds: string[]; folderIds: Array<string | null>; excludedNoteIds?: string[]; excludedFileIds?: string[]; includeSystem: boolean; includeAttachments: boolean; autoUpdate: boolean }
export const emptyKnowledgeScope = (): KnowledgeScope => ({ noteIds: [], fileIds: [], bookIds: [], folderIds: [], includeSystem: false, includeAttachments: true, autoUpdate: true });
export interface KnowledgeAnchor { kind: "markdown" | "pdf" | "epub"; line?: number; endLine?: number; page?: number; chapter?: string; chapterIndex?: number; paragraph?: number; heading?: string; fragment?: string; method?: "ocr"; confidence?: number; needsReview?: boolean }
export interface KnowledgeChunk { id: string; text: string; anchor: KnowledgeAnchor }
export interface KnowledgeExtraction { chunks: KnowledgeChunk[]; partial: boolean; message?: string; totalUnits: number; processedUnits: number; ocrVersion?: number; ocrPages?: number }
export interface KnowledgeRecord { sourceId: string; fingerprint: string; status: KnowledgeStatus; message?: string; chunks: number; bytes: number; indexedAt?: string; processedUnits?: number; totalUnits?: number; ocrVersion?: number; ocrPages?: number }
export interface KnowledgeView {
  sources: KnowledgeSource[]; folders: LibraryFolder[]; books: Array<{ id: string; title: string; noteIds: string[]; systemManaged: boolean; pages?: Array<{ id: string; noteId: string; title: string; children: string[] }>; rootPageIds?: string[]; homePageId?: string }>;
  scope: KnowledgeScope; selectedIds: string[]; records: KnowledgeRecord[]; running: boolean; paused: boolean; enabled: boolean;
  progress: { completed: number; total: number; current?: string; unit?: number; units?: number }; bytes: number; limitBytes: number; error?: string;
}
export interface KnowledgeHit { source: KnowledgeSource; chunk: KnowledgeChunk; indexedAt?: string; fingerprint: string }
export type KnowledgeResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface KnowledgeApi {
  inspect(): Promise<KnowledgeResult<{ view: KnowledgeView }>>;
  start(scope: KnowledgeScope, rebuild?: boolean): Promise<KnowledgeResult<object>>;
  stop(): Promise<KnowledgeResult<object>>;
  clear(): Promise<KnowledgeResult<object>>;
  preview(sourceId: string, offset?: number): Promise<KnowledgeResult<{ hits: KnowledgeHit[]; total: number }>>;
  search(query: string): Promise<KnowledgeResult<{ hits: KnowledgeHit[]; total: number }>>;
  onChanged(callback: () => void): () => void;
}
export const KNOWLEDGE_PARSER_VERSION = 1;
export const KNOWLEDGE_MAX_TEXT = 2_000_000;
export const KNOWLEDGE_MAX_CHUNKS = 2000;
export const KNOWLEDGE_MAX_BYTES = 100 * 1024 * 1024;
export const KNOWLEDGE_MAX_SOURCES = 20_000;
export function selectedKnowledgeSources(snapshot: Pick<KnowledgeView, "sources" | "books" | "folders">, scope: KnowledgeScope): Set<string> {
  const selected = new Set<string>(), notes = new Set(scope.noteIds), files = new Set(scope.fileIds), sources = new Map(snapshot.sources.map(source => [source.id, source]));
  const excluded = new Set([...(scope.excludedNoteIds ?? []).map(id => `note:${id}`), ...(scope.excludedFileIds ?? []).map(id => `file:${id}`)]);
  for (const book of snapshot.books) if (scope.bookIds.includes(book.id) && (!book.systemManaged || scope.includeSystem)) for (const id of book.noteIds) notes.add(id);
  const folders = new Map(snapshot.folders.map(folder => [folder.id, folder])), chosenFolders = new Set(scope.folderIds);
  for (const source of snapshot.sources) {
    if (source.systemManaged && !scope.includeSystem || excluded.has(source.id)) continue;
    const folder = source.kind === "file" && source.imported && (() => {
      if (chosenFolders.has(null)) return true;
      let current = source.folderId; const visited = new Set<string>();
      while (current && !visited.has(current)) { if (folders.has(current) && chosenFolders.has(current)) return true; visited.add(current); current = folders.get(current)?.parentId; } return false;
    })();
    if (source.kind === "note" ? notes.has(source.entityId) : files.has(source.entityId) || folder) selected.add(source.id);
  }
  if (scope.includeAttachments) for (const id of [...selected]) for (const attachment of sources.get(id)?.attachments ?? []) { const file = sources.get(attachment); if (file && !excluded.has(attachment) && (!file.systemManaged || scope.includeSystem)) selected.add(attachment); }
  return selected;
}
