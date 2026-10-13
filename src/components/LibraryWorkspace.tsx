import { useEffect, useMemo, useState } from "react";
import { resourceUsages, type Asset, type ResourceUsage } from "../shared/assets";
import type { Book, Note } from "../shared/types";
import { ResourceRenameDialog } from "./ResourceRenameDialog";

export function LibraryWorkspace({ notes, books, selectedId, onSelect, onNavigate, onOpenSidebar }: { notes: Note[]; books: Book[]; selectedId: string | null; onSelect(id: string): void; onNavigate(usage: ResourceUsage): void; onOpenSidebar(): void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<Asset | null>(null);
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
  const visible = assets.filter(asset => asset.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = assets.find(asset => asset.id === selectedId);
  const selectedUsages = usages.filter(usage => usage.id === selectedId);
  const action = async (request: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    try { const result = await request(); if (!result.ok) setError(result.error ?? "Unable to complete this action"); }
    catch (error) { setError(String(error)); }
  };
  return <section className="editor-panel foundation-panel" aria-label="Library workspace">
    <header className="editor-toolbar"><button className="icon-button mobile-menu" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Library</span>{window.notesDesktop.foundation && <button className="toolbar-text-button" onClick={() => void action(() => window.notesDesktop.foundation!.openLibrary())}>Open Library folder</button>}</header>
    <article className="foundation-content library-content">
      <div className="library-overview"><p className="foundation-eyebrow">LIBRARY</p><h1>Your source materials</h1><p className="foundation-description">Browse your managed images and attachments. PDF and EPUB reading will be added in a later update.</p></div>
      <label className="library-search">Find a resource<input type="search" aria-label="Find Library resource" value={query} onChange={event => setQuery(event.target.value)} placeholder="File name" /></label>
      {error && <p role="alert" className="foundation-error">{error}</p>}
      {selected && <section className="library-detail" aria-label="Selected resource">
        <div className="library-detail-heading"><h2 title={selected.name}>{selected.name}</h2><button className="toolbar-text-button" disabled={selected.missing} onClick={() => void action(() => window.notesDesktop.assets!.saveCopy(selected.id))}>Save a copy</button></div>
        <div className="library-reference-list">{selectedUsages.map((usage, index) => <button key={index} className="library-reference" onClick={() => onNavigate(usage)}>{usage.location} / {usage.title}{usage.line ? ` · line ${usage.line}` : ""}<span aria-hidden="true">↗</span></button>)}{!selectedUsages.length && <p>No current references.</p>}</div>
      </section>}
      <div className="library-heading"><h2>Existing resources</h2><span>{query ? `${visible.length} of ` : ""}{assets.length} files</span></div>
      <div className="library-column-heading" aria-hidden="true"><span>File name</span><span className="library-type">Type</span><span>Size</span><span>References</span><span>Actions</span></div>
      <div className="library-resource-list" role="region" aria-label="Library files">{loading ? <p role="status">Loading resources…</p> : visible.map(asset => <div className={`library-resource ${asset.id === selectedId ? "selected" : ""}`} key={asset.id} onClick={() => onSelect(asset.id)}>
        <button className="library-select" aria-label={asset.name} aria-pressed={asset.id === selectedId} title={asset.name} onClick={() => onSelect(asset.id)}><span className="library-file-kind" aria-hidden="true">{asset.name.split(".").pop()?.toUpperCase().slice(0, 6) ?? "FILE"}</span><strong>{asset.name}</strong>{asset.missing && <span className="library-missing">Missing</span>}</button>
        <span className="library-type">{asset.mime.startsWith("image/") ? "Image" : "Attachment"}</span><span>{(asset.size / 1024).toFixed(1)} KB</span><span>{usages.filter(usage => usage.id === asset.id).length}</span>
        <div className="library-row-actions"><button disabled={asset.missing || !window.notesDesktop.assets?.reveal} aria-label={`Open folder for ${asset.name}`} title="Open containing folder" onClick={event => { event.stopPropagation(); void action(() => window.notesDesktop.assets!.reveal!(asset.id)); }}>Folder</button><button disabled={asset.systemManaged || !window.notesDesktop.assets?.rename} aria-label={`Rename ${asset.name}`} title={asset.systemManaged ? "Built-in tutorial resource" : "Rename resource"} onClick={event => { event.stopPropagation(); onSelect(asset.id); setRenaming(asset); }}>Rename</button></div>
      </div>)}{!loading && !visible.length && <p className="library-empty">{query ? "No matching resources." : "No resources. Attachments added while writing will appear here."}</p>}</div>
    </article>
    {renaming && <ResourceRenameDialog asset={renaming} onClose={() => setRenaming(null)} onSave={async name => {
      const result = await window.notesDesktop.assets!.rename!(renaming.id, name);
      if (!result.ok) throw new Error(result.error);
      setAssets(current => current.map(asset => asset.id === result.asset.id ? { ...asset, ...result.asset } : asset));
      setRenaming(null);
    }} />}
  </section>;
}
