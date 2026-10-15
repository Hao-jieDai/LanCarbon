import type { Asset } from "./assets";
import type { LibraryDocument } from "./research";

export type LibraryCollection = "all" | "imports" | "materials";
export type LibraryFormat = "pdf" | "epub" | "image" | "attachment";
export interface LibraryEntry extends Asset {
  source: "import" | "existing-resource";
  format: LibraryFormat;
}
export interface LibraryImportRecord extends LibraryDocument {
  format: "pdf" | "epub";
  source: "import";
  size: number;
  updatedAt?: string;
}
export interface LibraryImportItem {
  entry: LibraryEntry;
  status: "imported" | "existing" | "repaired";
}
export interface LibraryImportBatch {
  items: LibraryImportItem[];
  failures: Array<{ name: string; error: string }>;
}
export type LibraryImportResult = { ok: true; batch: LibraryImportBatch } | { ok: false; canceled?: boolean; error: string };
export interface LibraryDesktopApi {
  list(): Promise<{ ok: true; entries: LibraryEntry[] } | { ok: false; error: string }>;
  choose(): Promise<LibraryImportResult>;
  importFiles(files: File[]): Promise<LibraryImportResult>;
  rename(id: string, name: string): Promise<{ ok: true; entry: LibraryEntry } | { ok: false; error: string }>;
  reveal(id: string): Promise<{ ok: boolean; error?: string }>;
  open(id: string): Promise<{ ok: boolean; error?: string }>;
  saveCopy(id: string): Promise<{ ok: boolean; error?: string }>;
}
export function libraryFormat(asset: Pick<Asset, "name" | "mime">): LibraryFormat {
  if (/\.pdf$/i.test(asset.name)) return "pdf";
  if (/\.epub$/i.test(asset.name)) return "epub";
  return asset.mime.startsWith("image/") ? "image" : "attachment";
}
export function materialEntry(asset: Asset): LibraryEntry {
  return { ...asset, source: "existing-resource", format: libraryFormat(asset) };
}
