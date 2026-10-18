import type { KnowledgeHit, KnowledgeScope, KnowledgeSource, KnowledgeView } from "./knowledge";
export const CHAT_EVIDENCE_MAX_CHUNKS = 96;
export interface ChatEvidence extends KnowledgeHit { label: string }
export interface ChatGrounding {
  scope: KnowledgeScope; sourceIds: string[]; evidence: ChatEvidence[];
  warnings: string[]; mode: "keyword" | "hybrid" | "reranked";
  research?: { focusSourceIds: string[]; searches: number; modelChecks: number; supplemented: boolean; review: "sufficient" | "limited" | "unavailable" | "not-needed" };
}
export type ChatSourceCatalogue = Pick<KnowledgeView, "sources" | "books" | "folders">;
export interface CitationTarget { source: KnowledgeSource; anchor: KnowledgeHit["chunk"]["anchor"]; excerpt: string; requestId: string }
export function hasChatSources(scope?: KnowledgeScope): boolean { return !!scope && !!(scope.noteIds.length || scope.fileIds.length || scope.bookIds.length || scope.folderIds.length); }
export function scopeKey(scope?: KnowledgeScope): string { return scope ? JSON.stringify([...[scope.noteIds, scope.fileIds, scope.bookIds, scope.folderIds].map(ids => [...ids].sort()), scope.includeSystem, scope.includeAttachments, [...(scope.excludedNoteIds ?? [])].sort(), [...(scope.excludedFileIds ?? [])].sort()]) : ""; }
export function citationLocation(hit: KnowledgeHit): string {
  const a = hit.chunk.anchor;
  return a.kind === "pdf" ? `Page ${a.page}${a.method === "ocr" ? ` · OCR${a.needsReview ? " · Check text" : ""}` : ""}` : a.kind === "epub" ? `Chapter ${(a.chapterIndex ?? 0) + 1} · Paragraph ${a.paragraph}` : `Lines ${a.line}–${a.endLine}`;
}
/** Normalize grouped/full-width citations, preserving code examples and existing Markdown links. */
export function mapCitations(text: string, render: (label: string) => string = label => `[${label}]`): string {
  return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part.replace(/[\[［（(]\s*(S[1-9]\d{0,2}(?:\s*[,，、;；]\s*S[1-9]\d{0,2})*)\s*[\]］）)]/g, (match, group: string, offset: number) => {
    const equation = /^[（(]/u.test(match) && /(?:\beq(?:uation)?|\bfig(?:ure)?|\btable|\bsection|公式|方程|章节|图|表|式)\.?\s*$/iu.test(part.slice(Math.max(0, offset - 30), offset));
    return equation || part[offset + match.length] === "(" || part[offset - 1] === "\\" ? match : (group.match(/S[1-9]\d{0,2}/g) ?? []).map(render).join(" ");
  })).join("");
}
export function citedLabels(text: string): Set<string> { const labels = new Set<string>(); mapCitations(text, label => { labels.add(label); return `[${label}]`; }); return labels; }
