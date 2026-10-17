import type { ChatSourceCatalogue } from "./grounding";
import type { KnowledgeScope, KnowledgeSource } from "./knowledge";

export interface SourceNode {
  id: string; title: string; detail?: string; sourceIds: string[]; children: SourceNode[];
  bookId?: string; folderId?: string;
}
const unique = (values: string[]) => [...new Set(values)];

/** Presentation follows stable workspace IDs; no file paths or titles are parsed into folders. */
export function sourceTree(catalogue: ChatSourceCatalogue, includeSystem: boolean) {
  const sources = catalogue.sources.filter(source => (includeSystem || !source.systemManaged) && ["markdown", "pdf", "epub"].includes(source.format));
  const byId = new Map(sources.map(source => [source.id, source]));
  const leaf = (source: KnowledgeSource, id = source.id, title = source.title): SourceNode => ({ id, title, detail: source.unavailable || source.locations.map(location => location.label).join(" · "), sourceIds: [source.id], children: [] });
  const books = catalogue.books.filter(book => includeSystem || !book.systemManaged).map(book => {
    const pages = new Map(book.pages?.map(page => [page.id, page])), visited = new Set<string>();
    const visit = (id: string, depth = 0): SourceNode[] => {
      const page = pages.get(id); if (!page || visited.has(id) || depth > 100) return []; visited.add(id);
      const children = page.children.flatMap(child => visit(child, depth + 1)), source = byId.get(`note:${page.noteId}`);
      const sourceIds = unique([...(source ? [source.id] : []), ...children.flatMap(child => child.sourceIds)]);
      return sourceIds.length ? [{ id: `page:${book.id}:${id}`, title: page.title, detail: source?.unavailable, sourceIds, children }] : [];
    };
    const children = book.pages ? [...(book.homePageId ? [book.homePageId] : []), ...(book.rootPageIds ?? []), ...pages.keys()].flatMap(id => visit(id)) : book.noteIds.flatMap(id => { const source = byId.get(`note:${id}`); return source ? [leaf(source, `page:${book.id}:${id}`)] : []; });
    return { id: `book:${book.id}`, title: book.title, bookId: book.id, sourceIds: unique(children.flatMap(child => child.sourceIds)), children } as SourceNode;
  });
  const files = sources.filter(source => source.kind === "file"), visited = new Set<string>();
  const folderNodes = (parent: string | null, depth = 0): SourceNode[] => {
    if (depth > 100) return [];
    return catalogue.folders.filter(folder => folder.parentId === parent && !visited.has(folder.id)).sort((a, b) => a.name.localeCompare(b.name)).map(folder => {
      visited.add(folder.id);
      const children = [...folderNodes(folder.id, depth + 1), ...files.filter(source => source.imported && source.folderId === folder.id).map(source => leaf(source))];
      return { id: `folder:${folder.id}`, title: folder.name, folderId: folder.id, sourceIds: unique(children.flatMap(child => child.sourceIds)), children };
    });
  };
  const folders = folderNodes(null);
  for (const folder of catalogue.folders) if (!visited.has(folder.id)) folders.push(...folderNodes(folder.parentId));
  const library = [...folders, ...files.filter(source => !source.imported || !source.folderId || !visited.has(source.folderId)).map(source => leaf(source))];
  return { notes: sources.filter(source => source.locations.some(location => location.kind === "note")).map(source => leaf(source)), books, library };
}

export function filterSourceTree(nodes: SourceNode[], query: string): SourceNode[] {
  const term = query.trim().toLocaleLowerCase(); if (!term) return nodes;
  return nodes.flatMap(node => {
    if (`${node.title} ${node.detail ?? ""}`.toLocaleLowerCase().includes(term)) return [node];
    const children = filterSourceTree(node.children, query);
    return children.length ? [{ ...node, children }] : [];
  });
}

/** Subtree exceptions override inherited Book/folder/attachment selection and survive restarts. */
export function toggleSourceNode(catalogue: ChatSourceCatalogue, scope: KnowledgeScope, node: SourceNode, checked: boolean): KnowledgeScope {
  const target = new Set(node.sourceIds), next = structuredClone(scope);
  if (node.bookId) next.bookIds = checked ? unique([...next.bookIds, node.bookId]) : next.bookIds.filter(id => id !== node.bookId);
  if (node.folderId) {
    const folders = new Map(catalogue.folders.map(folder => [folder.id, folder.parentId]));
    const inside = (id: string | null) => { const seen = new Set<string>(); while (id && !seen.has(id)) { if (id === node.folderId) return true; seen.add(id); id = folders.get(id) ?? null; } return false; };
    next.folderIds = checked ? [...new Set([...next.folderIds, node.folderId])] : next.folderIds.filter(id => !inside(id));
  }
  for (const [kind, explicit, excluded] of [["note", "noteIds", "excludedNoteIds"], ["file", "fileIds", "excludedFileIds"]] as const) {
    const ids = catalogue.sources.filter(source => source.kind === kind && target.has(source.id)).map(source => source.entityId), set = new Set(ids);
    next[explicit] = checked ? node.bookId || node.folderId ? next[explicit] : unique([...next[explicit], ...ids]) : next[explicit].filter(id => !set.has(id));
    next[excluded] = checked ? (next[excluded] ?? []).filter(id => !set.has(id)) : unique([...(next[excluded] ?? []), ...ids]);
  }
  return next;
}
