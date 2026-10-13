import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Asset } from "../shared/assets";

export function ResourceRenameDialog({ asset, onClose, onSave }: { asset: Asset; onClose(): void; onSave(name: string): Promise<void> }) {
  const [name, setName] = useState(asset.name), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const end = asset.name.lastIndexOf("."); input.current?.setSelectionRange(0, end > 0 ? end : asset.name.length); }, [asset.name]);
  return createPortal(<div className="modal-backdrop"><form className="settings-modal compact-modal" aria-label="Rename resource" onKeyDown={event => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); } }} onSubmit={event => { event.preventDefault(); setBusy(true); setError(""); void onSave(name).catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false)); }}>
    <header><h2>Rename resource</h2><button type="button" className="icon-button" aria-label="Close rename resource" disabled={busy} onClick={onClose}>×</button></header>
    <label>File name<input autoFocus ref={input} aria-label="Resource name" value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label>
    <p className="modal-help">Keep the file extension. Existing writing links remain valid.</p>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" className="text-button modal-button" disabled={busy} onClick={onClose}>Cancel</button><button className="new-note compact" disabled={busy} type="submit">{busy ? "Saving…" : "Save name"}</button></footer>
  </form></div>, document.body);
}
