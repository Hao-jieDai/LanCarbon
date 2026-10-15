import type { Asset } from "./assets";
import type { LibraryDocument } from "./research";

export type LibraryCollection = "all" | "imports" | "materials";
export type LibraryFormat = "pdf" | "epub" | "image" | "attachment";
export interface ResourceVersion { version: number; file: string; sha256: string; size: number; mime: string; createdAt: string }
export interface LibraryFolder { id: string; parentId: string | null; name: string; diskId?: string; missing?: boolean }
export interface LibraryEntry extends Asset {
  syncError?: string;
  source: "import" | "existing-resource";
  format: LibraryFormat;
  folderId?: string | null;
  location?: string;
  assetId?: string;
  sha256?: string;
}
export interface LibraryImportRecord extends LibraryDocument {
  diskId?: string;
  format: "pdf" | "epub";
  source: "import";
  size: number;
  updatedAt?: string;
  folderId?: string | null;
  version?: number;
  versions?: ResourceVersion[];
}
export interface LibraryImportItem {
  entry: LibraryEntry;
  status: "imported" | "existing" | "repaired";
  incomingName?: string;
  targetFolderId?: string | null;
  matchedVersion?: number;
  numbered?: boolean;
}
export interface LibraryImportBatch { items: LibraryImportItem[]; failures: Array<{ name: string; error: string }> }
export type LibraryImportResult = { ok: true; batch: LibraryImportBatch } | { ok: false; canceled?: boolean; error: string };
export interface LibraryBatchResult { items: Array<{ id: string; name: string }>; failures: Array<{ id: string; name: string; error: string }> }
export interface LibraryDesktopApi {
  list(): Promise<{ ok: true; entries: LibraryEntry[]; folders?: LibraryFolder[]; editErrors?: string[] } | { ok: false; error: string }>;
  choose(folderId?: string | null): Promise<LibraryImportResult>;
  importFiles(files: File[], folderId?: string | null): Promise<LibraryImportResult>;
  rename(id: string, name: string): Promise<{ ok: true; entry: LibraryEntry } | { ok: false; error: string }>;
  createFolder(name: string, parentId: string | null): Promise<{ ok: true; folder: LibraryFolder } | { ok: false; error: string }>;
  renameFolder(id: string, name: string): Promise<{ ok: true; folder: LibraryFolder } | { ok: false; error: string }>;
  deleteFolder(id: string): Promise<{ ok: true; parentId: string | null } | { ok: false; error: string }>;
  move(id: string, folderId: string | null, keepBoth?: boolean): Promise<{ ok: true; entry: LibraryEntry } | { ok: false; error: string; suggestedName?: string }>;
  moveMany(ids: string[], folderId: string | null, keepBoth: boolean): Promise<{ ok: true; batch: LibraryBatchResult } | { ok: false; error: string }>;
  exportMany(ids: string[]): Promise<{ ok: true; batch: LibraryBatchResult; canceled?: boolean } | { ok: false; error: string }>;
  remove(ids: string[]): Promise<{ ok: true; removed: boolean; ids: string[]; workspace?: import("./types").WorkspaceFile; warning?: string } | { ok: false; error: string }>;
  versions(id: string): Promise<{ ok: true; versions: ResourceVersion[] } | { ok: false; error: string }>;
  reveal(id: string): Promise<{ ok: boolean; error?: string }>;
  open(id: string): Promise<{ ok: boolean; error?: string }>;
  saveCopy(id: string, version?: number): Promise<{ ok: boolean; error?: string }>;
  onChanged?(callback: () => void): () => void;
}
export function libraryFormat(asset: Pick<Asset, "name" | "mime">): LibraryFormat {
  if (asset.mime.startsWith("image/")) return "image";
  if (/\.pdf$/i.test(asset.name)) return "pdf";
  if (/\.epub$/i.test(asset.name)) return "epub";
  return "attachment";
}
export function materialEntry(asset: Asset): LibraryEntry { return { ...asset, source: "existing-resource", format: libraryFormat(asset), location: "Source materials", version: asset.version ?? 1 }; }
export function folderLocation(folders: LibraryFolder[], id: string | null | undefined): string {
  if (!id) return "Imports";
  const parts: string[] = [], visited = new Set<string>(); let current: string | null = id;
  while (current) { if (visited.has(current)) return "Imports"; visited.add(current); const folder = folders.find(item => item.id === current); if (!folder) return "Imports"; parts.unshift(folder.name); current = folder.parentId; }
  return ["Imports", ...parts].join("/");
}
export function orderedFolders(folders: LibraryFolder[], parentId: string | null = null, depth = 0): Array<LibraryFolder & { depth: number }> {
  if (depth > folders.length) return [];
  return folders.filter(folder => folder.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).flatMap(folder => [{ ...folder, depth }, ...orderedFolders(folders, folder.id, depth + 1)]);
}
