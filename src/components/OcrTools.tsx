import { useEffect, useState } from "react";
import type { OcrStats } from "../shared/ocr";
export function OcrTools() {
  const api = window.notesDesktop.reader, [stats, setStats] = useState<OcrStats>(), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [message, setMessage] = useState("");
  const refresh = async () => { const result = await api?.ocrStats?.(); if (result?.ok) setStats(result.stats); };
  useEffect(() => { void refresh(); }, [api]);
  return <details className="retrieval-tools retrieval-ocr-tools" onToggle={event => { if (event.currentTarget.open) void refresh(); }}><summary>Local OCR</summary>
    <p className="modal-help">English and Chinese scans are recognized on this computer. PDF reading and document questions share the recognized text. Use the reader's OCR menu to retry a page or prepare a PDF (up to 500 pages) for search. Check original numbers, tables and formulas when recognition is uncertain.</p>
    {stats && <p className="modal-help">{stats.pages} saved pages · {(stats.bytes / 1024 / 1024).toFixed(2)} / {stats.limitBytes / 1024 / 1024} MB</p>}
    <button className="quiet-button" disabled={busy || !api?.clearOcr} onClick={() => setConfirm(true)}>Clear OCR cache</button>
    {confirm && <div className="retrieval-clear-confirm" role="group" aria-label="Confirm clearing OCR cache"><p>Remove saved recognition text? Original PDFs, Notes, Books and chats are kept. Scanned pages will be recognized again when needed.</p><button className="quiet-button" disabled={busy} onClick={() => { setBusy(true); void api!.clearOcr().then(result => { if (!result.ok) throw Error(result.error); setConfirm(false); setMessage("OCR cache cleared."); return refresh(); }).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Confirm clear OCR cache</button><button className="quiet-button" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
