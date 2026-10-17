import type { KnowledgeHit, KnowledgeScope, KnowledgeSource, KnowledgeView } from "./knowledge";
export const CHAT_EVIDENCE_MAX_CHUNKS = 96;
export interface ChatEvidence extends KnowledgeHit { label: string }
export interface ChatGrounding {
  scope: KnowledgeScope; sourceIds: string[]; evidence: ChatEvidence[];
  warnings: string[]; mode: "keyword" | "hybrid" | "reranked";
}
export type ChatSourceCatalogue = Pick<KnowledgeView, "sources" | "books" | "folders">;
export interface CitationTarget { source: KnowledgeSource; anchor: KnowledgeHit["chunk"]["anchor"]; excerpt: string; requestId: string }
export function hasChatSources(scope?: KnowledgeScope): boolean { return !!scope && !!(scope.noteIds.length || scope.fileIds.length || scope.bookIds.length || scope.folderIds.length); }
export function scopeKey(scope?: KnowledgeScope): string { return scope ? JSON.stringify([...[scope.noteIds, scope.fileIds, scope.bookIds, scope.folderIds].map(ids => [...ids].sort()), scope.includeSystem, scope.includeAttachments, [...(scope.excludedNoteIds ?? [])].sort(), [...(scope.excludedFileIds ?? [])].sort()]) : ""; }
export function citationLocation(hit: KnowledgeHit): string {
  const a = hit.chunk.anchor;
  return a.kind === "pdf" ? `Page ${a.page}` : a.kind === "epub" ? `Chapter ${(a.chapterIndex ?? 0) + 1} · Paragraph ${a.paragraph}` : `Lines ${a.line}–${a.endLine}`;
}
export function citedLabels(text: string): Set<string> { return new Set([...text.matchAll(/\[(S[1-9]\d{0,2})\]/g)].map(match => match[1])); }
