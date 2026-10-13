import { useEffect, useMemo, useState } from "react";
import { resourceUsages, type Asset } from "../shared/assets";
import type { Book, Note } from "../shared/types";

export function LibraryWorkspace({ notes, books, selectedId, onSelect, onOpenSidebar }: { notes: Note[]; books: Book[]; selectedId: string | null; onSelect(id: string): void; onOpenSidebar(): void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    if (!window.notesDesktop.assets) { setLoading(false); return; }
    void window.notesDesktop.assets.list().then(result => {
      if (disposed) return;
      if (result.ok) setAssets(result.assets); else setError(result.error);
    }).catch(error => { if (!disposed) setError(String(error)); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);
  const usages = useMemo(() => resourceUsages(notes, books), [notes, books]);
  const visible = assets.filter(asset => asset.name.toLowerCase().includes(query.toLowerCase()));
  const selected = assets.find(asset => asset.id === selectedId);
  const saveCopy = async (asset: Asset) => {
    setError("");
    try { const result = await window.notesDesktop.assets!.saveCopy(asset.id); if (!result.ok) setError(result.error); }
    catch (error) { setError(String(error)); }
  };
  return <section className="editor-panel foundation-panel" aria-label="Library workspace">
    <header className="editor-toolbar"><button className="icon-button mobile-menu" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Library</span>{window.notesDesktop.foundation && <button className="toolbar-text-button" onClick={() => void window.notesDesktop.foundation!.openLibrary().then(result => { if (!result.ok) setError(result.error); }).catch(error => setError(String(error)))}>Open Library folder</button>}</header>
    <article className="foundation-content library-content"><p className="foundation-eyebrow">LIBRARY</p><h1>Your source materials</h1><p className="foundation-description">Browse your existing managed resources. PDF and EPUB import and reading will be added in a later update.</p>
      <label className="library-search">Find an existing resource<input aria-label="Find Library resource" value={query} onChange={event => setQuery(event.target.value)} placeholder="File name" /></label>
      {error && <p role="alert" className="foundation-error">{error}</p>}
      <div className="library-heading"><h2>Existing resources</h2><span>{assets.length} files</span></div>
      {loading ? <p role="status">Loading resources…</p> : <div className="library-resource-list">{visible.map(asset => <button key={asset.id} className={`library-resource ${asset.id === selectedId ? "selected" : ""}`} aria-pressed={asset.id === selectedId} onClick={() => onSelect(asset.id)}><span className="library-file-kind">{asset.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span><span><strong>{asset.name}</strong><small>{(asset.size / 1024).toFixed(1)} KB · {asset.mime.startsWith("image/") ? "Image" : "Attachment"}{asset.missing ? " · Missing file" : ""}</small></span><span>{usages.filter(usage => usage.id === asset.id).length} references</span></button>)}{!visible.length && <p className="library-empty">{query ? "No matching resources." : "No existing resources. Attachments added while writing will appear here."}</p>}</div>}
      {selected && <div className="foundation-card library-detail"><h2>{selected.name}</h2><p>Existing resources keep their current storage and links.</p><button className="toolbar-text-button" disabled={selected.missing} onClick={() => void saveCopy(selected)}>Save a copy</button><ul>{usages.filter(usage => usage.id === selected.id).map((usage, index) => <li key={index}>{usage.location} / {usage.title}{usage.line ? ` · line ${usage.line}` : ""}</li>)}</ul></div>}
    </article>
  </section>;
}
