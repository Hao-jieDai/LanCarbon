import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyKnowledgeScope, selectedKnowledgeSources, type KnowledgeScope } from "../shared/knowledge";
import type { ChatSourceCatalogue } from "../shared/grounding";
import { filterSourceTree, sourceTree, toggleSourceNode, type SourceNode } from "../shared/chatSources";
import { ThemedSelect } from "./ThemedSelect";

function SelectionBox({ title, count, total, busy, onChange }: { title: string; count: number; total: number; busy: boolean; onChange(checked: boolean): void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = count > 0 && count < total; }, [count, total]);
  return <input ref={input} type="checkbox" aria-label={`Select ${title}`} aria-checked={count > 0 && count < total ? "mixed" : count === total && total > 0} checked={total > 0 && count === total} disabled={busy || !total} onChange={event => onChange(event.target.checked)}/>;
}

export function ChatSources({ catalogue, initial, onSave, onClose, onImport }: { catalogue: ChatSourceCatalogue; initial?: KnowledgeScope; onSave(scope: KnowledgeScope): Promise<void>; onClose(): void; onImport(scope: KnowledgeScope): Promise<void> }) {
  const [scope, setScope] = useState(() => structuredClone(initial ?? emptyKnowledgeScope())), [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ids = useMemo(() => selectedKnowledgeSources(catalogue, scope), [catalogue, scope]);
  const tree = useMemo(() => sourceTree(catalogue, scope.includeSystem), [catalogue, scope.includeSystem]);
  const searching = !!query.trim();
  const sections = (["notes", "books", "library"] as const).filter(key => kind === "all" || kind === key).map(key => ({ key, title: key === "notes" ? "Notes" : key === "books" ? "Books" : "Library", nodes: filterSourceTree(tree[key], query) }));
  const renderNode = (node: SourceNode, depth = 0) => {
    const branch = !!node.children.length || !!node.folderId || !!node.bookId, open = branch && (searching || expanded.has(node.id)), count = node.sourceIds.filter(id => ids.has(id)).length;
    const name = `${node.bookId ? "Book: " : node.folderId ? "Folder: " : ""}${node.title}`;
    return <li key={node.id}>
      <div className="chat-source-row" style={{ paddingLeft: `${10 + depth * 20}px` }}>
        {branch ? <button type="button" className="source-tree-toggle" aria-label={`${open ? "Collapse" : "Expand"} ${name}`} aria-expanded={open} disabled={busy} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{open ? "▾" : "▸"}</button> : <span className="source-tree-spacer"/>}
        <SelectionBox title={name} count={count} total={node.sourceIds.length} busy={busy} onChange={checked => setScope(previous => toggleSourceNode(catalogue, previous, node, checked))}/>
        <span className="source-tree-label"><strong>{node.title}</strong>{node.detail && <small title={node.detail}>{node.detail}</small>}</span>
        {branch && <small className="source-tree-count">{count ? `${count} / ` : ""}{node.sourceIds.length}</small>}
      </div>
      {open && <ul>{node.children.map(child => renderNode(child, depth + 1))}{!node.children.length && <li className="source-tree-empty">Empty folder</li>}</ul>}
    </li>;
  };
  return createPortal(<div className="modal-backdrop ai-panel" onKeyDown={event => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); } }}><section className="settings-modal chat-source-modal" role="dialog" aria-modal="true" aria-label="Choose chat sources"><header><h2>Chat sources</h2><button className="quiet-button" disabled={busy} onClick={onClose}>Cancel</button></header>
    <p>Choose documents, Notes or Book pages. Select a Book, chapter or folder to include its contents; individual items can be unchecked.</p>
    <div className="chat-source-filters"><input autoFocus aria-label="Find chat sources" placeholder="Find a title, Book or folder…" value={query} onChange={event => setQuery(event.target.value)}/><ThemedSelect label="Source type" value={kind} onChange={setKind} options={[{ value: "all", label: "All sources" }, { value: "library", label: "Library" }, { value: "notes", label: "Notes" }, { value: "books", label: "Books" }]}/><button className="quiet-button" disabled={busy} onClick={() => { setBusy(true); void onImport(scope).catch(error => setError(String(error.message ?? error))).finally(() => setBusy(false)); }}>Import PDF / EPUB</button></div>
    <div className="chat-source-options"><label><input type="checkbox" disabled={busy} checked={scope.includeAttachments} onChange={event => setScope(previous => ({ ...previous, includeAttachments: event.target.checked }))}/>Include linked attachments</label><label><input type="checkbox" disabled={busy} checked={scope.includeSystem} onChange={event => setScope(previous => ({ ...previous, includeSystem: event.target.checked }))}/>Show built-in content</label></div>
    <div className="chat-source-list">{sections.filter(section => section.nodes.length).map(section => <section key={section.key} aria-label={`${section.title} sources`}><h3>{section.title}</h3><ul>{section.nodes.map(node => renderNode(node))}</ul></section>)}{sections.every(section => !section.nodes.length) && <p>No matching sources.</p>}</div>
    {error && <p role="alert" className="ai-error">{error}</p>}
    <footer><span>{ids.size} sources selected</span><button className="quiet-button" disabled={busy} onClick={() => setScope(emptyKnowledgeScope())}>Clear selection</button><button className="primary-button" disabled={busy} onClick={() => { setBusy(true); setError(""); void onSave(ids.size ? scope : { ...emptyKnowledgeScope(), includeSystem: scope.includeSystem, includeAttachments: scope.includeAttachments }).catch(error => setError(String(error.message ?? error))).finally(() => setBusy(false)); }}>Use sources</button></footer>
  </section></div>, document.body);
}
