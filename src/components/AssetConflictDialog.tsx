import { useEffect, useRef, useState } from "react";
import type { AssetConflictChoice, AssetConflictRequest } from "../shared/assets";

export function AssetConflictDialog({ request, onChoice }: { request: AssetConflictRequest; onChoice(choice: AssetConflictChoice): Promise<void> }) {
  const host = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = previousFocus.current;
    const dialog = host.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
        else document.querySelector<HTMLElement>(".markdown-workspace:not([hidden]) .cm-content")?.focus();
      });
    };
  }, []);
  const choose = async (value: AssetConflictChoice) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await onChoice(value); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not resolve the resource conflict"); setBusy(false); }
  };
  return <dialog ref={host} className="insert-dialog asset-conflict-dialog" aria-label="A resource with this name already exists" onCancel={event => { event.preventDefault(); void choose("cancel"); }}>
    <header><h2>A resource with this name already exists</h2></header>
    <div className="asset-conflict-content">
      <p><strong>{request.incoming.name}</strong></p>
      <p>Existing: {(request.existing.size / 1024).toFixed(1)} KB<br />Incoming: {(request.incoming.size / 1024).toFixed(1)} KB</p>
      <p>Replace updates this shared resource in ALL {request.uses.length} references. Keep both gives the new resource a numbered name.</p>
      {request.uses.length > 0 && <ul>{request.uses.map((use, index) => <li key={index}>{use.location} / {use.title}{use.line ? ` — line ${use.line}` : ""}</li>)}</ul>}
      {error && <p role="alert">{error}</p>}
    </div>
    <footer><button type="button" disabled={busy} onClick={() => void choose("replace")}>Replace existing</button><button type="button" disabled={busy} onClick={() => void choose("keep")}>Keep both</button><button type="button" autoFocus disabled={busy} onClick={() => void choose("cancel")}>Cancel</button></footer>
  </dialog>;
}
