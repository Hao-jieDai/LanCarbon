export const OCR_VERSION = 1;
export const OCR_MAX_BYTES = 64 * 1024 * 1024;
export interface OcrLine { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrPage {
  version: 1; page: number; width: number; height: number; rotation: number;
  text: string; confidence: number; lines: OcrLine[]; manual: boolean; reviewNotes?: string[];
}
export interface OcrStats { pages: number; bytes: number; limitBytes: number }
export function validOcrPage(value: unknown): value is OcrPage {
  const p = value as OcrPage;
  return !!p && p.version === OCR_VERSION && Number.isSafeInteger(p.page) && p.page > 0 && p.page <= 20000 &&
    [p.width, p.height].every(n => Number.isFinite(n) && n > 0 && n <= 10000) &&
    Number.isFinite(p.rotation) && p.rotation % 90 === 0 && typeof p.manual === "boolean" &&
    typeof p.text === "string" && p.text.length <= 100000 && Number.isFinite(p.confidence) && p.confidence >= 0 && p.confidence <= 100 &&
    (p.reviewNotes === undefined || Array.isArray(p.reviewNotes) && p.reviewNotes.length <= 10 && p.reviewNotes.every(note => typeof note === "string" && note.length <= 300)) &&
    Array.isArray(p.lines) && p.lines.length <= 5000 && p.lines.every(l => l && typeof l.text === "string" && l.text.length <= 4000 &&
      [l.x0, l.x1, l.y0, l.y1].every(Number.isFinite) && l.x0 >= 0 && l.y0 >= 0 && l.x1 > l.x0 && l.y1 > l.y0 && l.x1 <= p.width + 1 && l.y1 <= p.height + 1);
}
export function ocrReviewNotes(text: string, confidence: number): string[] {
  const notes: string[] = [];
  if (text && confidence < 55) notes.push("Low OCR confidence; check the original page.");
  if (text.split(/\r?\n/).some(line => /\b\d{6,}\b/u.test(line) && (line.match(/\d+\.\d+/g)?.length ?? 0) >= 2)) notes.push("Mixed long integers and decimal values in a row; verify decimal points and digit grouping against the original.");
  return notes;
}
export function pdfTextNeedsOcr(text: string): boolean {
  const compact = text.replace(/\s/g, ""), letters = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters < 12 || (compact.match(/[\uFFFD\u0000-\u0008]/g)?.length ?? 0) > Math.max(2, compact.length / 8);
}
