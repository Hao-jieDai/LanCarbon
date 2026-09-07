export interface Asset {
  id: string;
  file?: string;
  updatedAt?: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  missing?: boolean;
}
export interface ResourceUsage { id: string; noteId?: string; bookId?: string; title: string; location: string; line: number }
export function resourceUsages(notes: import("./types").Note[], books: import("./types").Book[]): ResourceUsage[] {
  const result: ResourceUsage[] = [];
  for (const note of notes) {
    const book = books.find(b => Object.values(b.pages).some(p => p.noteId === note.id));
    for (const ref of assetReferences(note.content)) result.push({...ref,noteId:note.id,bookId:book?.id,title:note.title,location:book ? `Book: ${book.settings.title}` : "Notes"});
  }
  for (const book of books) for (const field of ["logo","favicon"] as const) {
    const id = assetId(book.settings[field] ?? "");
    if (id) result.push({id,bookId:book.id,title:`Book settings (${field})`,location:`Book: ${book.settings.title}`,line:0});
  }
  for (const book of books) for (const source of book.settings.bibliography ?? []) result.push({id:source.assetId,bookId:book.id,title:`Bibliography (${source.name})`,location:`Book: ${book.settings.title}`,line:0});
  return result;
}
export const ASSET_ID = /^[a-f0-9]{64}\.[a-z0-9]{1,12}$/;
export const MAX_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export function assetId(url: string): string | null {
  const id = url.startsWith("assets/") ? url.slice(7) : "";
  return ASSET_ID.test(id) ? id : null;
}
export function assetMarkdown(asset: Asset): string {
  const name = asset.name.replace(/[\\[\]<>\r\n]/g, "_");
  return `${asset.mime.startsWith("image/") ? "!" : ""}[${name}](assets/${asset.id})`;
}
/** Rewrite only managed Markdown destinations, reference definitions and image/figure arguments. */
export function mapAssetLinks(source: string, map: (id: string, line: number) => string): string {
  let fence = "";
  const destination = "assets/([a-f0-9]{64}\\.[a-z0-9]{1,12})";
  return source.split("\n").map((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ""; return line; }
    if (marker) {
      fence = marker[1];
      return line.replace(new RegExp(`(\\{(?:image|figure)\\}\\s+)${destination}(?=\\s*$)`), (_all, prefix, id) => prefix + map(id, index + 1));
    }
    if (/^(?: {4}|\t)/.test(line)) return line;
    return line.replace(new RegExp("(`+).*?\\1|(" + "\\]\\(\\s*<?|^\\s*\\[[^\\]]+\\]:\\s*<?" + ")" + destination + "(?=[\\s)>]|$)", "g"),
      (all, code, prefix, id) => code ? all : prefix + map(id, index + 1));
  }).join("\n");
}
export function assetReferences(source: string): Array<{ id: string; line: number }> {
  const found: Array<{ id: string; line: number }> = [];
  mapAssetLinks(source, (id, line) => { found.push({ id, line }); return `assets/${id}`; });
  return found;
}
