import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { folderLocation, orderedFolders, type LibraryBatchResult, type LibraryEntry, type LibraryFolder, type ResourceVersion } from "../shared/library";
import { ThemedSelect } from "./ThemedSelect";
const folderOptions = (folders: LibraryFolder[]) => [{ value: "", label: "Imports" }, ...orderedFolders(folders).map(folder => ({ value: folder.id, label: folderLocation(folders, folder.id) }))];
export function LibraryBatchMoveDialog({ entries, folders, onClose, onMoved }: { entries: LibraryEntry[]; folders: LibraryFolder[]; onClose(): void; onMoved(batch: LibraryBatchResult): Promise<void> }) {
  const [target, setTarget] = useState(""), [keepBoth, setKeepBoth] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return createPortal(<div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label="Move selected Library files" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }} onSubmit={event => {
    event.preventDefault(); setBusy(true); setError("");
    void window.notesDesktop.library!.moveMany(entries.map(entry => entry.id), target || null, keepBoth).then(async result => { if (!result.ok) throw Error(result.error); await onMoved(result.batch); }).catch(error => setError(error.message)).finally(() => setBusy(false));
  }}><header><h2>Move {entries.length} files</h2><button type="button" disabled={busy} className="icon-button" aria-label="Close batch move" onClick={onClose}>×</button></header>
    <label>Destination<ThemedSelect label="Batch move destination" value={target} disabled={busy} options={folderOptions(folders.filter(folder => !folder.missing))} onChange={setTarget}/></label>
    <label className="library-keep-both"><input type="checkbox" checked={keepBoth} disabled={busy} onChange={event => setKeepBoth(event.target.checked)}/>Keep both when names match</label>
    <p className="modal-help">Files with matching names are numbered. All versions, writing references and reading positions are retained.</p>
    {error && <p role="alert">{error}</p>}<footer><button autoFocus type="button" className="text-button modal-button" disabled={busy} onClick={onClose}>Cancel</button><button className="new-note compact" disabled={busy} type="submit">{busy ? "Moving…" : "Move selected files"}</button></footer>
  </form></div>, document.body);
}
export function LibraryFolderDialog({ folders, parentId, folder, onClose, onCreated }: { folders: LibraryFolder[]; parentId: string | null; folder?: LibraryFolder; onClose(): void; onCreated(folder: LibraryFolder): Promise<void> }) {
  const [name, setName] = useState(folder?.name ?? ""), [parent, setParent] = useState(parentId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return createPortal(<div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label={folder ? "Rename Library folder" : "New Library folder"} onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }} onSubmit={event => { event.preventDefault(); setBusy(true); setError(""); void (async () => { const result = folder ? await window.notesDesktop.library!.renameFolder(folder.id, name) : await window.notesDesktop.library!.createFolder(name, parent || null); if (!result.ok) throw Error(result.error); await onCreated(result.folder); })().catch(error => setError(String(error.message ?? error))).finally(() => setBusy(false)); }}>
    <header><h2>{folder ? "Rename folder" : "New folder"}</h2><button type="button" className="icon-button" disabled={busy} aria-label={folder ? "Close rename folder" : "Close new folder"} onClick={onClose}>×</button></header>
    <label>Folder name<input autoFocus aria-label="Library folder name" value={name} maxLength={80} onChange={event => setName(event.target.value)}/></label>
    {!folder && <label>Parent folder<ThemedSelect label="Parent Library folder" value={parent} options={folderOptions(folders)} onChange={setParent}/></label>}
    {error && <p role="alert">{error}</p>}<footer><button type="button" className="text-button modal-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="new-note compact" disabled={busy || !name.trim()}>{busy ? "Saving…" : folder ? "Save folder name" : "Create folder"}</button></footer>
  </form></div>, document.body);
}
export function LibraryMoveDialog({ entry, folders, initialTarget, onClose, onMoved }: { entry: LibraryEntry; folders: LibraryFolder[]; initialTarget?: string | null; onClose(): void; onMoved(entry: LibraryEntry): Promise<void> }) {
  const [target, setTarget] = useState(initialTarget === undefined ? entry.folderId ?? "" : initialTarget ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [suggested, setSuggested] = useState("");
  const save = async (keepBoth = false) => {
    setBusy(true); setError(""); setSuggested("");
    try { const result = await window.notesDesktop.library!.move(entry.id, target || null, keepBoth); if (!result.ok) { setError(result.error); setSuggested(result.suggestedName ?? ""); return; } await onMoved(result.entry); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  return createPortal(<div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label="Move Library file" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }} onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2>Move file</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close move file" onClick={onClose}>×</button></header><p className="modal-help">{entry.name}<br/>{entry.location}</p>
    <label>Destination<ThemedSelect label="Move to Library folder" value={target} options={folderOptions(folders)} onChange={value => { setTarget(value); setError(""); setSuggested(""); }}/></label>
    <p className="modal-help">Existing writing links and all versions stay with this document.</p>{error && <p role="alert">{error}</p>}
    <footer><button type="button" className="text-button modal-button" disabled={busy} onClick={onClose}>Cancel</button>{suggested ? <button type="button" className="new-note compact" disabled={busy} onClick={() => void save(true)}>Keep both as {suggested}</button> : <button type="submit" className="new-note compact" disabled={busy || target === (entry.folderId ?? "")}>{busy ? "Moving…" : "Move file"}</button>}</footer>
  </form></div>, document.body);
}
export function LibraryVersionsDialog({ entry, onClose }: { entry: LibraryEntry; onClose(): void }) {
  const [versions, setVersions] = useState<ResourceVersion[]>([]), [error, setError] = useState("");
  useEffect(() => { let live = true; const refresh = async () => { const result = await window.notesDesktop.library!.versions(entry.id); if (!live) return; if (result.ok) setVersions(result.versions); else setError(result.error); }; void refresh().catch(error => { if (live) setError(String(error)); }); const unsubscribe = window.notesDesktop.library!.onChanged?.(() => { void refresh().catch(error => { if (live) setError(String(error)); }); }); return () => { live = false; unsubscribe?.(); }; }, [entry.id]);
  return createPortal(<div className="modal-backdrop"><section className="settings-modal library-versions-modal" role="dialog" aria-modal="true" aria-label="Library file versions" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <header><h2>File versions</h2><button autoFocus type="button" className="icon-button" aria-label="Close file versions" onClick={onClose}>×</button></header><p className="modal-help">{entry.name}<br/>External saves update the current version. Earlier versions stay available locally.</p>
    {error && <p role="alert">{error}</p>}<div className="library-versions-list">{[...versions].reverse().map(version => <div className="library-version-row" key={version.version}><div><strong>Version {version.version}{version.version === versions.at(-1)?.version ? " · Current" : ""}</strong><small>{new Date(version.createdAt).toLocaleString()} · {(version.size / 1024).toFixed(1)} KB</small></div><button className="toolbar-text-button" onClick={() => void window.notesDesktop.library!.saveCopy(entry.id, version.version).then(result => { if (!result.ok) setError(result.error ?? "Could not save this version."); }).catch(error => setError(String(error)))}>Save version {version.version}</button></div>)}</div>
  </section></div>, document.body);
}

export function LibraryDeleteFolderDialog({ folder, folders, onClose, onDeleted }: { folder: LibraryFolder; folders: LibraryFolder[]; onClose(): void; onDeleted(parentId: string | null): Promise<void> }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return createPortal(<div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label="Delete Library folder" onKeyDown={event=>{if(event.key==="Escape"&&!busy)onClose();}} onSubmit={event=>{event.preventDefault();setBusy(true);setError("");void window.notesDesktop.library!.deleteFolder(folder.id).then(async result=>{if(!result.ok)throw Error(result.error);await onDeleted(result.parentId);}).catch(error=>setError(error.message)).finally(()=>setBusy(false));}}>
    <header><h2>Delete folder</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close delete folder" onClick={onClose}>×</button></header>
    <p>Delete “{folder.name}”?</p><p className="modal-help">Files and subfolders will move to <strong>{folderLocation(folders,folder.parentId)}</strong>. Names already in use will be numbered. No files will be deleted.</p>
    {error&&<p role="alert">{error}</p>}<footer><button autoFocus type="button" className="text-button modal-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="new-note compact" disabled={busy}>{busy?"Deleting…":"Delete folder"}</button></footer>
  </form></div>,document.body);
}
