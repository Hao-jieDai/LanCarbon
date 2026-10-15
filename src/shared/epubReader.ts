import type { LibraryEntry } from "./library";
import type { ReaderResult } from "./pdfReader";
export interface EpubPosition { chapter: string; progress: number; fontSize: number; lineHeight: number; width: number; updatedAt?: string }
export interface EpubChapter { path: string; title: string }
export interface EpubToc { title: string; chapter: number; anchor: string; depth: number }
export interface EpubSession { token: string; readingId: string; entry: LibraryEntry; title: string; chapters: EpubChapter[]; toc: EpubToc[]; position?: EpubPosition }
export interface EpubMatch { chapter: number; excerpt: string; occurrence: number }
export interface EpubReaderApi {
  open(id: string): Promise<ReaderResult<{ session: EpubSession }>>;
  chapter(token: string, index: number): Promise<ReaderResult<{ html: string }>>;
  search(token: string, query: string): Promise<ReaderResult<{ matches: EpubMatch[]; truncated: boolean }>>;
  release(token: string): Promise<ReaderResult<object>>;
  savePosition(id: string, position: EpubPosition): Promise<ReaderResult<object>>;
}
export function validEpubPosition(value: EpubPosition): boolean { return !!value && typeof value.chapter === "string" && value.chapter.length > 0 && value.chapter.length <= 1000 && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 1 && Number.isInteger(value.fontSize) && value.fontSize >= 14 && value.fontSize <= 32 && [1.4,1.7,2].includes(value.lineHeight) && [640,800,1000].includes(value.width); }
