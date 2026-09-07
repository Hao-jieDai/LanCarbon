import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { resourceUsages, type Asset } from "../shared/assets";
import type { Book, Note } from "../shared/types";

export function AssetPanel({notes,books,onInsert,onClose,beforeChange,onResourcesChanged}:{notes:Note[];books:Book[];onInsert(asset:Asset):void;onClose():void;onResourcesChanged?(workspace: import("../shared/types").WorkspaceFile):void;beforeChange?():Promise<void>}) {
  const [assets,setAssets]=useState<Asset[]>([]),[query,setQuery]=useState(""),[scope,setScope]=useState("all"),[error,setError]=useState("");
  const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false);
  const refresh=async()=>{const result=await window.notesDesktop.assets!.list();if(result.ok)setAssets(result.assets);else setError(result.error);};
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
  const refs=resourceUsages(notes,books);
  const bookNoteIds=new Set(books.flatMap(b=>Object.values(b.pages).map(p=>p.noteId)));
  const visible=assets.filter(a=>{
    if(!a.name.toLowerCase().includes(query.toLowerCase()))return false;
    const uses=refs.filter(r=>r.id===a.id);
    if(scope==="all")return true;
    if(scope==="unused")return uses.length===0;
    return uses.some(r=>scope==="notes"?!r.bookId:scope==="books"?!!r.bookId:scope.startsWith("book:")?r.bookId===scope.slice(5):r.noteId===scope.slice(5));
  });
  const remove=async(ids:string[])=>{
    setBusy(true);setError("");
    try {await beforeChange?.();const result=await window.notesDesktop.assets!.remove(ids);if(!result.ok)setError(result.error);else if(result.removed){setSelected([]);if(result.workspace)onResourcesChanged?.(result.workspace);}await refresh();}
    catch(e){setError(String(e));}finally{setBusy(false);}
  };
  return createPortal(<div className="modal-backdrop"><section className="settings-modal asset-panel" role="dialog" aria-modal="true" aria-label="Resources" onKeyDown={e=>{if(e.key==="Escape"&&!busy){e.stopPropagation();onClose();}}}>
    <div className="asset-panel-heading"><h2>Resources</h2><button autoFocus disabled={busy} onClick={onClose} aria-label="Close resources">×</button></div>
    <label>Find a resource<input aria-label="Find a resource" value={query} onChange={e=>{setQuery(e.target.value);setSelected([]);}} placeholder="File name"/></label>
    <label>Show resources<select aria-label="Resource scope" value={scope} onChange={e=>{setScope(e.target.value);setSelected([]);}}>
      <option value="all">All resources</option><option value="unused">Unreferenced</option>
      <optgroup label="Notes"><option value="notes">All ordinary notes</option>{notes.filter(n=>!bookNoteIds.has(n.id)).map(n=><option key={n.id} value={`note:${n.id}`}>{n.title||"Untitled Note"}</option>)}</optgroup>
      <optgroup label="Books"><option value="books">All Books</option>{books.map(b=><option key={b.id} value={`book:${b.id}`}>{b.settings.title}</option>)}</optgroup>
    </select></label>
    <div className="asset-actions"><label className="asset-select-all"><input type="checkbox" aria-label="Select all visible resources" disabled={busy||!visible.length} checked={!!visible.length&&visible.every(a=>selected.includes(a.id))} onChange={e=>setSelected(e.target.checked?visible.map(a=>a.id):[])}/>Select visible ({visible.length})</label><button disabled={busy||!selected.length} onClick={()=>void remove(selected)}>Delete selected ({selected.length})</button></div>
    <p className="modal-help">Deleting removes the managed copy and its references from all Notes and Books. Confirmation lists references across ALL Notes and Books, including those outside this filter. Removing a Markdown link alone keeps the file.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="asset-list">{visible.map(asset=>{
      const uses=refs.filter(r=>r.id===asset.id);
      return <article className="asset-row" key={asset.id}>
        <label className="asset-select-all"><input type="checkbox" aria-label={`Select ${asset.name}`} disabled={busy} checked={selected.includes(asset.id)} onChange={e=>setSelected(e.target.checked?[...selected,asset.id]:selected.filter(id=>id!==asset.id))}/><strong>{asset.name}</strong></label>
        <small>{asset.mime.startsWith("image/")?"Image":"Attachment"} · {(asset.size/1024).toFixed(1)} KB{asset.missing?" · Missing file":""}</small>
        <div className="asset-actions"><button disabled={busy||asset.missing} onClick={()=>onInsert(asset)}>Insert</button><button disabled={busy||asset.missing} onClick={()=>void window.notesDesktop.assets!.saveCopy(asset.id).then(r=>{if(!r.ok)setError(r.error);})}>Save a copy</button><button className="danger-text" disabled={busy} onClick={()=>void remove([asset.id])}>Delete</button></div>
        <details><summary>{uses.length?`${uses.length} reference${uses.length===1?"":"s"} (all locations)`:"Not referenced"}</summary><ul>{uses.map((ref,i)=><li key={i}>{ref.location} / {ref.title}{ref.line?` — line ${ref.line}`:""}</li>)}</ul></details>
      </article>;
    })}{!visible.length&&<p>No matching resources.</p>}</div>
  </section></div>,document.body);
}
