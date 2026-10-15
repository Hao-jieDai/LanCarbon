import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resourceUsages, type ResourceUsage } from "../shared/assets";
import { materialEntry, type LibraryCollection, type LibraryEntry, type LibraryFormat, type LibraryImportResult } from "../shared/library";
import type { Book, Note } from "../shared/types";
import { ResourceRenameDialog } from "./ResourceRenameDialog";
import { ThemedSelect } from "./ThemedSelect";

const typeLabels: Record<LibraryFormat, string> = { pdf: "PDF", epub: "EPUB", image: "Image", attachment: "Attachment" };
const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
export function LibraryWorkspace({ notes, books, collection, onCollectionChange, selectedId, onSelect, onNavigate, onOpenSidebar }: {
  notes: Note[]; books: Book[]; collection: LibraryCollection; onCollectionChange(value: LibraryCollection): void;
  selectedId: string | null; onSelect(id: string): void; onNavigate(usage: ResourceUsage): void; onOpenSidebar(): void;
}) {
  const api = window.notesDesktop.library;
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [query, setQuery] = useState(""), [format, setFormat] = useState("all"), [sort, setSort] = useState("created");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [failures, setFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [loading, setLoading] = useState(true), [importing, setImporting] = useState(false), [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<LibraryEntry | null>(null);
  const importLock = useRef(false), dragDepth = useRef(0);
  const reload = useCallback(async () => {
    if (api) { const result = await api.list(); if (!result.ok) throw Error(result.error); return result.entries; }
    if (!window.notesDesktop.assets) return [];
    const result = await window.notesDesktop.assets.list(); if (!result.ok) throw Error(result.error); return result.assets.map(materialEntry);
  }, [api]);
  useEffect(() => {
    let disposed = false;
    void reload().then(entries => { if (!disposed) setEntries(entries); }).catch(error => { if (!disposed) setError(String(error)); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [reload]);
  const usages = useMemo(() => resourceUsages(notes, books), [notes, books]);
  const usageMap = useMemo(() => { const map = new Map<string, ResourceUsage[]>(); for (const usage of usages) { const group = map.get(usage.id) ?? []; group.push(usage); map.set(usage.id, group); } return map; }, [usages]);
  const collected = entries.filter(entry => collection === "all" || entry.source === (collection === "imports" ? "import" : "existing-resource"));
  const visible = collected.filter(entry => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (format === "all" || entry.format === format)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, undefined, { numeric: true }) : b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
  const selected = collected.find(entry => entry.id === selectedId);
  const selectedUsages = selected ? usageMap.get(selected.id) ?? [] : [];
  const action = async (request: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    try { const result = await request(); if (!result.ok) setError(result.error ?? "Unable to complete this action"); }
    catch (error) { setError(String(error)); }
  };
  const importDocuments = async (request: () => Promise<LibraryImportResult>) => {
    if (importLock.current) return;
    importLock.current = true; setImporting(true); setError(""); setNotice(""); setFailures([]);
    try {
      const result = await request();
      if (!result.ok) { if (!result.canceled) setError(result.error); return; }
      const { items, failures } = result.batch;
      setFailures(failures); setEntries(await reload());
      const counts = { imported: 0, existing: 0, repaired: 0 }; for (const item of items) counts[item.status]++;
      setNotice([counts.imported && `${counts.imported} imported`, counts.existing && `${counts.existing} already in Library`, counts.repaired && `${counts.repaired} repaired`].filter(Boolean).join(" · ") + (items.length ? "." : ""));
      const last = items.at(-1)?.entry;
      if (last) { onCollectionChange(last.source === "import" ? "imports" : "materials"); onSelect(last.id); setQuery(""); setFormat("all"); }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { importLock.current = false; setImporting(false); }
  };
  const open = (entry: LibraryEntry) => { if (api && !entry.missing && ["pdf", "epub"].includes(entry.format)) void action(() => api.open(entry.id)); };
  return <section className={`editor-panel foundation-panel library-workspace${dragging ? " library-dragging" : ""}`} aria-label="Library workspace"
    onDragEnter={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); dragDepth.current++; setDragging(true); } }}
    onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = importing ? "none" : "copy"; } }}
    onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
    onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); const files = Array.from(event.dataTransfer.files); if (files.length && api) void importDocuments(() => api.importFiles(files)); }}>
    <header className="editor-toolbar"><button className="icon-button mobile-menu" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Library</span><div className="library-toolbar-actions">{window.notesDesktop.foundation && <button className="toolbar-text-button" onClick={() => void action(() => window.notesDesktop.foundation!.openLibrary())}>Open Library folder</button>}<button className="library-import-button" disabled={!api || importing || loading} onClick={() => api && void importDocuments(() => api.choose())}>{importing ? "Importing…" : "Import PDF / EPUB"}</button></div></header>
    <article className="foundation-content library-content">
      <div className="library-overview"><p className="foundation-eyebrow">LIBRARY</p><h1>{collection === "imports" ? "Imported documents" : "Your source materials"}</h1><p className="foundation-description">{collection === "materials" ? "Images and attachments used in your Notes and Books." : "PDF and EPUB originals, saved locally."} Open uses your default app.</p></div>
      <div className="library-filters"><label className="library-search">Find a resource<input type="search" aria-label="Find Library resource" value={query} onChange={event => setQuery(event.target.value)} placeholder="File name" /></label><label>File type<ThemedSelect label="Library file type" value={format} options={[{ value: "all", label: "All types" }, ...Object.entries(typeLabels).map(([value, label]) => ({ value, label }))]} onChange={setFormat}/></label><label>Sort by<ThemedSelect label="Sort Library" value={sort} options={[{ value: "created", label: "Date added" }, { value: "name", label: "Name (A–Z)" }]} onChange={setSort}/></label></div>
      {error && <p role="alert" className="foundation-error">{error}</p>}
      {notice && <p role="status" className="library-import-notice">{notice}</p>}
      {failures.length > 0 && <div role="alert" className="library-import-failures"><strong>{failures.length} file{failures.length === 1 ? "" : "s"} could not be imported</strong>{failures.map((failure, index) => <p key={index}>{failure.name}: {failure.error}</p>)}</div>}
      {selected && <section className="library-detail" aria-label="Selected resource">
        <div className="library-detail-heading"><h2 title={selected.name}>{selected.name}</h2>{api && ["pdf", "epub"].includes(selected.format) && <button className="toolbar-text-button" disabled={selected.missing} title="Open with your default app" onClick={() => open(selected)}>Open</button>}<button className="toolbar-text-button" disabled={selected.missing} onClick={() => void action(() => api ? api.saveCopy(selected.id) : window.notesDesktop.assets!.saveCopy(selected.id))}>Save a copy</button></div>
        <p className="library-resource-meta">{selected.source === "import" ? "Imports" : "Source materials"} · {typeLabels[selected.format]} · {sizeLabel(selected.size)} · Added {new Date(selected.createdAt).toLocaleDateString()}</p>
        <div className="library-reference-list">{selectedUsages.map((usage, index) => <button key={index} className="library-reference" onClick={() => onNavigate(usage)}>{usage.location} / {usage.title}{usage.line ? ` · line ${usage.line}` : ""}<span aria-hidden="true">↗</span></button>)}{!selectedUsages.length && <p>No current references.</p>}</div>
      </section>}
      <div className="library-heading"><h2>{collection === "imports" ? "Imports" : collection === "materials" ? "Source materials" : "All files"}</h2><span>{query || format !== "all" ? `${visible.length} of ` : ""}{collected.length} files</span></div>
      <div className="library-column-heading" aria-hidden="true"><span>File name</span><span className="library-type">Type</span><span>Size</span><span>References</span><span>Actions</span></div>
      <div className="library-resource-list" role="region" aria-label="Library files">{loading ? <p role="status">Loading resources…</p> : visible.map(entry => <div className={`library-resource ${entry.id === selectedId ? "selected" : ""}`} key={entry.id} onClick={() => onSelect(entry.id)} onDoubleClick={event => { if (!(event.target as Element).closest(".library-row-actions")) open(entry); }}>
        <button className="library-select" aria-label={entry.name} aria-pressed={entry.id === selectedId} title={entry.name} onClick={() => onSelect(entry.id)}><span className="library-file-kind" aria-hidden="true">{entry.name.split(".").pop()?.toUpperCase().slice(0, 6) ?? "FILE"}</span><strong>{entry.name}</strong>{entry.missing && <span className="library-missing">Missing</span>}</button>
        <span className="library-type">{typeLabels[entry.format]}</span><span>{sizeLabel(entry.size)}</span><span>{usageMap.get(entry.id)?.length ?? 0}</span>
        <div className="library-row-actions">{api && ["pdf", "epub"].includes(entry.format) && <button disabled={entry.missing} aria-label={`Open ${entry.name}`} title="Open with your default app" onClick={event => { event.stopPropagation(); open(entry); }}>Open</button>}<button disabled={entry.missing || !api && !window.notesDesktop.assets?.reveal} aria-label={`Open folder for ${entry.name}`} title="Open containing folder" onClick={event => { event.stopPropagation(); void action(() => api ? api.reveal(entry.id) : window.notesDesktop.assets!.reveal!(entry.id)); }}>Folder</button><button disabled={entry.systemManaged || !api && !window.notesDesktop.assets?.rename} aria-label={`Rename ${entry.name}`} title={entry.systemManaged ? "Built-in tutorial resource" : "Rename resource"} onClick={event => { event.stopPropagation(); onSelect(entry.id); setRenaming(entry); }}>Rename</button></div>
      </div>)}{!loading && !visible.length && <div className="library-empty">{query || format !== "all" ? "No matching resources." : collection === "materials" ? "Attachments and images added while writing appear here." : "Import PDF or EPUB documents, or drop them here."}</div>}</div>
      <p className="library-drop-hint">Drop PDF / EPUB files here · Up to 20 files, 100 MB each · Local copies</p>
    </article>
    {dragging && <div className="library-drop-overlay" aria-hidden="true"><strong>Import to Library</strong><span>Drop PDF or EPUB documents</span></div>}
    {renaming && <ResourceRenameDialog asset={renaming} onClose={() => setRenaming(null)} onSave={async name => {
      if (api) { const result = await api.rename(renaming.id, name); if (!result.ok) throw Error(result.error); setEntries(current => current.map(entry => entry.id === result.entry.id ? result.entry : entry)); }
      else { const result = await window.notesDesktop.assets!.rename!(renaming.id, name); if (!result.ok) throw Error(result.error); setEntries(current => current.map(entry => entry.id === result.asset.id ? materialEntry({ ...entry, ...result.asset }) : entry)); }
      setRenaming(null);
    }} />}
  </section>;
}
