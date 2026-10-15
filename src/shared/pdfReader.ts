import type { LibraryEntry } from "./library";
export interface ReadingPosition { page: number; zoom: string; x: number; y: number; updatedAt?: string }
export interface PdfSession { token: string; entry: LibraryEntry; readingId: string; length: number; initial: Uint8Array; position?: ReadingPosition }
export type ReaderResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface PdfReaderApi {
  open(id: string): Promise<ReaderResult<{ session: PdfSession }>>;
  range(token: string, begin: number, end: number): Promise<ReaderResult<{ bytes: Uint8Array }>>;
  release(token: string): Promise<ReaderResult<object>>;
  savePosition(id: string, position: ReadingPosition): Promise<ReaderResult<object>>;
}
export function validReadingPosition(value: ReadingPosition): boolean {
  return !!value && Number.isInteger(value.page) && value.page >= 1 && value.page <= 1_000_000 && typeof value.zoom === "string" && (["page-width", "page-fit", "auto"].includes(value.zoom) || /^\d+(?:\.\d+)?$/.test(value.zoom) && Number(value.zoom) >= 0.25 && Number(value.zoom) <= 4) && [value.x, value.y].every(number => Number.isFinite(number) && Math.abs(number) <= 1_000_000);
}
export function requestPdfReading(id: string): void { window.dispatchEvent(new CustomEvent("lancarbon:open-pdf", { detail: { id } })); }
