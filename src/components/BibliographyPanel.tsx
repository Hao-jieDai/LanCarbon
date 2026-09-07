import { useMemo,useState } from "react";
import { createPortal } from "react-dom";
import { bibliographyEntries,citationText,validateBookCitations } from "../shared/bibliography";
import type { BibliographySource,Book,Note } from "../shared/types";
export function BibliographyPanel({book,notes,onBookChange,onInsert,onClose,beforeChange}:{book:Book;notes:Note[];onBookChange(book:Book):void;onInsert(value:string):void;onClose():void;beforeChange?():Promise<void>}){
 const [query,setQuery]=useState(""),[selected,setSelected]=useState<string[]>([]),[style,setStyle]=useState("parenthetical"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const entries=useMemo(()=>bibliographyEntries(book),[book]),duplicates=new Set(entries.filter((e,i)=>entries.findIndex(x=>x.key.toLowerCase()===e.key.toLowerCase())!==i).map(e=>e.key.toLowerCase()));
 const visible=entries.filter(e=>[e.key,e.title,e.authors.join(" "),e.year].join(" ").toLowerCase().includes(query.toLowerCase()));
 const validation=validateBookCitations(book,notes);
 const updateSources=(bibliography:BibliographySource[])=>onBookChange({...book,settings:{...book.settings,bibliography},updatedAt:new Date().toISOString()});
 const add=async()=>{setBusy(true);setError("");try{await beforeChange?.();const result=await window.notesDesktop.assets!.chooseBibliography();if(!result.ok){if(!result.canceled)setError(result.error);return;}const all=[...(book.settings.bibliography??[]).filter(x=>x.assetId!==result.source.assetId),result.source];const keys=new Set<string>();for(const entry of all.flatMap(x=>x.entries)){const key=entry.key.toLowerCase();if(keys.has(key))throw new Error(`Duplicate citation key across libraries: ${entry.key}`);keys.add(key);}updateSources(all);}catch(e){setError(String(e));}finally{setBusy(false);}};
 const insert=()=>{if(!selected.length)return;onInsert(style==="narrative"&&selected.length===1?`@${selected[0]}`:`[${selected.map(key=>`@${key}`).join("; ")}]`);onClose();};
 return createPortal(<div className="modal-backdrop"><section className="settings-modal bibliography-panel" role="dialog" aria-modal="true" aria-label="Citations" onKeyDown={e=>{if(e.key==="Escape"&&!busy)onClose();}}><header><h2>Citations</h2><button aria-label="Close citations" disabled={busy} onClick={onClose}>×</button></header>
  <div className="asset-actions"><button onClick={()=>void add()} disabled={busy}>{busy?"Importing…":"Import .bib"}</button><span>{book.settings.bibliography?.length??0} libraries · {entries.length} references</span></div>
  {!!book.settings.bibliography?.length&&<div className="bibliography-sources">{book.settings.bibliography.map(source=><span key={source.assetId}>{source.name} ({source.entries.length}) <button aria-label={`Remove ${source.name} from Book`} onClick={()=>updateSources(book.settings.bibliography!.filter(x=>x.assetId!==source.assetId))}>Remove</button></span>)}</div>}
  <label>Find a reference<input autoFocus aria-label="Find a reference" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Author, title, year or citation key"/></label>
  <label>Citation style<select aria-label="Citation style" value={style} onChange={e=>setStyle(e.target.value)}><option value="parenthetical">Parenthetical — (Author, year)</option><option value="narrative" disabled={selected.length>1}>Narrative — Author (year)</option></select></label>
  {error&&<p role="alert">{error}</p>}{duplicates.size>0&&<p role="alert">Duplicate citation keys must be resolved before export.</p>}
  <details className={validation.length?"citation-validation-error":"citation-validation-ok"} open={validation.length>0}><summary>{validation.length?`Book validation: ${validation.length} issue${validation.length===1?"":"s"}`:"Book validation passed"}</summary>{validation.length>0&&<ul>{validation.map(item=><li key={item}>{item}</li>)}</ul>}</details>
  <div className="bibliography-list">{visible.map(entry=><label key={`${entry.key}-${entry.title}`} className="bibliography-entry"><input type="checkbox" checked={selected.includes(entry.key)} onChange={e=>setSelected(e.target.checked?[...selected,entry.key]:selected.filter(key=>key!==entry.key))}/><span><strong>{entry.title}</strong><small>{citationText(entry)} · @{entry.key}</small></span></label>)}{!visible.length&&<p>No matching references.</p>}</div>
  <footer><button onClick={onClose}>Cancel</button><button disabled={!selected.length||duplicates.size>0} onClick={insert}>Insert citation ({selected.length})</button></footer>
 </section></div>,document.body);
}
