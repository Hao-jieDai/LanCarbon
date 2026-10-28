import type { ReaderResult } from "./pdfReader";
import type { WorkspaceFile } from "./types";
import { validReaderId } from "./readerTabs";

export type AnnotationColor = "yellow" | "green" | "blue" | "pink";
export type AnnotationKind = "highlight" | "underline" | "comment";
export interface PageRect { page: number; x: number; y: number; width: number; height: number }
export type AnnotationAnchor = { kind: "pdf"; rects: PageRect[] } | { kind: "epub"; chapter: string; chapterIndex: number; chapterTitle: string; start: number; end: number; prefix: string; suffix: string; paragraph?: number };
export interface ReadingAnnotation {
  id: string; documentId: string; fingerprint: string; fileVersion: number;
  quote: string; comment: string; kind: AnnotationKind; color: AnnotationColor;
  anchor: AnnotationAnchor; createdAt: string; updatedAt: string;
}
export type AnnotationDraft = Pick<ReadingAnnotation, "fingerprint" | "quote" | "comment" | "kind" | "color" | "anchor">;
export interface AnnotationCollection { version: 1; documentId: string; annotations: ReadingAnnotation[] }
export interface AnnotationExport { noteId: string; createdAt: string }
export interface AnnotationApi {
  list(id: string): Promise<ReaderResult<{ collection: AnnotationCollection; fingerprint: string; exports: AnnotationExport[] }>>;
  save(id: string, draft: AnnotationDraft, annotationId?: string): Promise<ReaderResult<{ annotation: ReadingAnnotation }>>;
  remove(id: string, annotationId: string): Promise<ReaderResult<object>>;
  exportNote(id: string, selected?: string[]): Promise<ReaderResult<{ workspace: WorkspaceFile; noteId: string }>>;
}
export const annotationColors: Record<AnnotationColor, string> = { yellow: "#e9b72b", green: "#51b781", blue: "#5a9fdf", pink: "#df80a4" };
export const validAnnotationId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export const validFingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const boundedText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
export function validAnnotationDraft(value: AnnotationDraft): boolean {
  if (!value || !validFingerprint(value.fingerprint) || !boundedText(value.quote, 20000) || !value.quote.trim() || !boundedText(value.comment, 20000) || !["highlight", "underline", "comment"].includes(value.kind) || !Object.hasOwn(annotationColors, value.color)) return false;
  if (value.kind === "comment" && !value.comment.trim()) return false;
  const a = value.anchor;
  if (!a) return false;
  if (a.kind === "pdf") return Array.isArray(a.rects) && a.rects.length > 0 && a.rects.length <= 2000 && a.rects.every(r => r && integer(r.page, 1, 1000000) && [r.x, r.y, r.width, r.height].every(n => Number.isFinite(n) && n >= 0 && n <= 1) && r.width > 0 && r.height > 0 && r.x + r.width <= 1.001 && r.y + r.height <= 1.001);
  return a.kind === "epub" && boundedText(a.chapter, 1000) && !!a.chapter && !/[\\\x00-\x1f]/.test(a.chapter) && !a.chapter.split("/").some(p => p === ".." || p === ".") && boundedText(a.chapterTitle, 1000) && integer(a.chapterIndex, 0, 10000) && integer(a.start, 0, 32000000) && integer(a.end, a.start + 1, 32000000) && a.end - a.start === value.quote.length && boundedText(a.prefix, 100) && boundedText(a.suffix, 100) && (a.paragraph === undefined || integer(a.paragraph, 1, 1000000));
}
export function validAnnotation(value: ReadingAnnotation): boolean {
  return validAnnotationDraft(value) && validAnnotationId(value.id) && validReaderId(value.documentId) && integer(value.fileVersion, 1, 1000000) && [value.createdAt, value.updatedAt].every(d => typeof d === "string" && d.length < 40 && Number.isFinite(Date.parse(d)));
}
export function annotationLocation(a: ReadingAnnotation): string {
  if (a.anchor.kind === "epub") return `Chapter ${a.anchor.chapterIndex + 1}: ${a.anchor.chapterTitle}${a.anchor.paragraph ? ` · Paragraph ${a.anchor.paragraph}` : ""}`;
  const pages = [...new Set(a.anchor.rects.map(r => r.page))].sort((x, y) => x - y);
  return `PDF file ${pages.length > 1 ? "pages" : "page"} ${pages.join(", ")}`;
}
export function sortAnnotations(annotations: ReadingAnnotation[]): ReadingAnnotation[] {
  const position = (a: ReadingAnnotation) => a.anchor.kind === "epub" ? [a.anchor.chapterIndex, a.anchor.start, 0] : a.anchor.rects.map(r => [r.page, r.y, r.x]).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])[0];
  return [...annotations].sort((a, b) => { const x = position(a), y = position(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.createdAt.localeCompare(b.createdAt); });
}
export function annotationLink(documentId: string, id: string): string { return `lancarbon-annotation:${encodeURIComponent(documentId)}/${id}`; }
export function parseAnnotationLink(url: unknown): { documentId: string; annotationId: string } | undefined {
  if (typeof url !== "string" || !url.startsWith("lancarbon-annotation:")) return;
  try { const [documentId, annotationId, extra] = url.slice(21).split("/").map(decodeURIComponent); if (!extra && validReaderId(documentId) && validAnnotationId(annotationId)) return { documentId, annotationId }; } catch { /* Invalid URI is never dispatched. */ }
}
// Literal text remains literal in both MyST and ordinary Markdown exports.
export function annotationText(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_{}\[\]()#+.!|~:$-])/g, "\\$1"); }
export function annotationNoteContent(title: string, documentId: string, annotations: ReadingAnnotation[], now: string): string {
  return `# Reading annotations — ${annotationText(title)}\n\nSource: ${annotationText(title)}\n\nExported: ${now}\n\nThis Note is an editable snapshot. Return links open the original in LanCarbon.\n\n` + sortAnnotations(annotations).map((a, i) => `## ${i + 1}. ${annotationText(annotationLocation(a))}\n\n${a.kind} · ${a.color} · File version ${a.fileVersion}\n\n**Original excerpt**\n\n${annotationText(a.quote).split(/\r?\n/).map(line => `> ${line}`).join("\n")}\n\n${a.comment.trim() ? `**My comment**\n\n${annotationText(a.comment)}\n\n` : ""}[Return to original](${annotationLink(documentId, a.id)})\n`).join("\n---\n\n");
}
