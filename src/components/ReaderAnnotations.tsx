import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { WorkspaceFile } from "../shared/types";
import { annotationColors, annotationLocation, sortAnnotations, type AnnotationColor, type AnnotationDraft, type AnnotationKind, type ReadingAnnotation } from "../shared/annotations";
import { annotationGeometry, captureAnnotation, type AnnotationChapter, type AnnotationGeometry, type AnnotationSelection } from "../annotation-geometry";

export interface AnnotationReaderProps { panelTarget?: HTMLElement | null; rightOpen?: boolean; onRightOpen?(open: boolean): void; annotationId?: string; beforeExport(): Promise<void>; onNoteExported(workspace: WorkspaceFile, noteId: string): void }
interface Props extends AnnotationReaderProps {
  root: RefObject<HTMLElement | null>; documentId: string; fingerprint: string; chapter?: AnnotationChapter;
  navigate(annotation: ReadingAnnotation): void;
}
export function ReaderAnnotations({ root, documentId, fingerprint, chapter, navigate, annotationId, beforeExport, onNoteExported, panelTarget, rightOpen, onRightOpen }: Props) {
  const api = window.notesDesktop.annotations!;
  const [items, setItems] = useState<ReadingAnnotation[]>([]), [loaded, setLoaded] = useState(false), [localPanel, setLocalPanel] = useState(false), [error, setError] = useState("");
  const panel = rightOpen ?? localPanel;
  const setPanel = (open: boolean) => { if (onRightOpen) onRightOpen(open); else setLocalPanel(open); };
  const [selection, setSelection] = useState<AnnotationSelection>(), [editing, setEditing] = useState<{ draft: AnnotationDraft; id?: string }>();
  const [kind, setKind] = useState<AnnotationKind>("highlight"), [color, setColor] = useState<AnnotationColor>("yellow"), [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState<string[]>([]), [exporting, setExporting] = useState<"all" | "selected">(), [previousExports, setPreviousExports] = useState(0);
  const [geometry, setGeometry] = useState<AnnotationGeometry[]>([]), [focus, setFocus] = useState<string>();
  const focusApplied = useRef(""), requestApplied = useRef(""), geometryRef = useRef(geometry); geometryRef.current = geometry;
  const sourceChanged = useRef(false), [changed, setChanged] = useState(false);
  const refresh = useCallback(async () => {
    const result = await api.list(documentId); if (!result.ok) throw Error(result.error);
    setItems(sortAnnotations(result.collection.annotations)); setPreviousExports(result.exports.length); setLoaded(true);
    sourceChanged.current = result.fingerprint !== fingerprint; setChanged(sourceChanged.current);
  }, [api, documentId, fingerprint]);
  useEffect(() => { let live = true; setLoaded(false); setItems([]); void refresh().catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [refresh]);
  useEffect(() => window.notesDesktop.library?.onChanged?.(() => { void refresh().catch(e => setError(e.message)); }), [refresh]);
  const openEdit = useCallback((a: ReadingAnnotation) => {
    if (a.fingerprint !== fingerprint || sourceChanged.current) { setError("This annotation belongs to a different file version. Its excerpt is preserved; it cannot be placed or edited on this version."); setPanel(true); }
    setSelection(undefined); setEditing({ draft: a, id: a.id }); setKind(a.kind); setColor(a.color); setComment(a.comment);
  }, [fingerprint]);
  useEffect(() => {
    const host = root.current; if (!host) return;
    const select = (event: MouseEvent | KeyboardEvent) => {
      if ((event.target as Element)?.closest?.("[data-translation-exclude],.pdf-reader-controls,.reader-annotation-ui")) return;
      if (editing || exporting || !loaded || sourceChanged.current) return;
      const value = captureAnnotation(host, chapter); setSelection(value);
      if (!value && event instanceof MouseEvent && window.getSelection()?.isCollapsed) {
        const hit = geometryRef.current.find(g => { const r = g.host.getBoundingClientRect(); return event.clientX >= r.left + g.x && event.clientX <= r.left + g.x + g.width && event.clientY >= r.top + g.y && event.clientY <= r.top + g.y + g.height; });
        const annotation = hit && items.find(a => a.id === hit.id); if (annotation) openEdit(annotation);
      }
    };
    host.addEventListener("mouseup", select); host.addEventListener("keyup", select);
    const selectionChanged = () => { if (!editing && !exporting) setSelection(sourceChanged.current ? undefined : captureAnnotation(host, chapter)); };
    document.addEventListener("selectionchange", selectionChanged);
    return () => { host.removeEventListener("mouseup", select); host.removeEventListener("keyup", select); document.removeEventListener("selectionchange", selectionChanged); };
  }, [root, chapter?.path, editing, exporting, loaded, items, openEdit]);
  useEffect(() => {
    const host = root.current; if (!host) return; let frame = 0, disposed = false;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      if (disposed) return;
      setGeometry(items.filter(a => a.fingerprint === fingerprint && !changed).flatMap(a => annotationGeometry(host, a, chapter)));
    }); };
    const observer = new MutationObserver(records => { if (records.some(r => !(r.target as Element).closest?.(".reader-annotation-layer") && (r.type !== "childList" || !Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(n => n instanceof Element && n.classList.contains("reader-annotation-layer"))))) update(); });
    observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
    const resize = new ResizeObserver(update); resize.observe(host); const prose = host.querySelector(".epub-prose"); if (prose) resize.observe(prose);
    host.addEventListener("load", update, true); update();
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); host.removeEventListener("load", update, true); };
  }, [root, items, fingerprint, changed, chapter?.path]);
  const go = (a: ReadingAnnotation) => {
    setSelection(undefined); setPanel(true);
    if (a.fingerprint !== fingerprint || sourceChanged.current) { setError("The original file version has changed. The saved excerpt is available below; its old location will not be applied to this version."); return; }
    setError(""); focusApplied.current = ""; setFocus(a.id); navigate(a);
  };
  useEffect(() => {
    if (!annotationId || !loaded || requestApplied.current === annotationId) return;
    requestApplied.current = annotationId; const a = items.find(item => item.id === annotationId);
    if (a) go(a); else { setPanel(true); setError("This annotation has been deleted. The exported Note still preserves its excerpt and location."); }
  }, [annotationId, loaded, items]);
  useEffect(() => {
    if (!focus || focusApplied.current === focus) return;
    const g = geometry.find(item => item.id === focus); if (!g) return;
    const mark = g.host.querySelector<HTMLElement>(`[data-reading-annotation="${focus}"]`);
    if (mark) { mark.scrollIntoView({ block: "center", inline: "nearest" }); focusApplied.current = focus; }
  }, [focus, geometry]);
  useEffect(() => { setSelection(undefined); }, [chapter?.path, changed]);
  const start = (next: AnnotationKind) => {
    if (!selection || !loaded || changed || busy || editing || exporting) return; setEditing({ draft: { quote: selection.quote, anchor: selection.anchor, fingerprint, kind: next, color, comment: "" } }); setKind(next); setComment(""); setSelection(undefined); window.getSelection()?.removeAllRanges();
  };
  const save = async () => {
    if (!editing || busy) return; setBusy(true); setError("");
    try { const result = await api.save(documentId, { ...editing.draft, kind, color, comment }, editing.id); if (!result.ok) throw Error(result.error); await refresh(); setEditing(undefined); setPanel(true); setFocus(result.annotation.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (busy) return; setBusy(true); setError("");
    try { const result = await api.remove(documentId, id); if (!result.ok) throw Error(result.error); await refresh(); setSelected(values => values.filter(value => value !== id)); setEditing(undefined); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const exportNote = async () => {
    if (!exporting || busy) return; setBusy(true); setError("");
    try { await beforeExport(); const result = await api.exportNote(documentId, exporting === "all" ? undefined : selected); if (!result.ok) throw Error(result.error); setExporting(undefined); onNoteExported(result.workspace, result.noteId); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!editing && !exporting) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); setEditing(undefined); setExporting(undefined); }
      if (event.key === "Tab") {
        const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('.reader-annotation-dialog button:not(:disabled), .reader-annotation-dialog textarea, .reader-annotation-dialog select') ?? []);
        const first = nodes[0], last = nodes.at(-1); if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", key, true); if (exporting) root.current?.querySelector<HTMLElement>('.reader-annotation-dialog button')?.focus();
    return () => { window.removeEventListener("keydown", key, true); previous?.focus(); };
  }, [!!editing, !!exporting, busy]);
  // PDF.js and EPUB HTML own their DOM. Recreate an empty, non-selectable overlay
  // after their layout changes instead of keeping React children in that DOM.
  useLayoutEffect(() => {
    const groups = new Map<HTMLElement, AnnotationGeometry[]>();
    for (const g of geometry) { const values = groups.get(g.host) ?? []; values.push(g); groups.set(g.host, values); }
    const layers: HTMLElement[] = [];
    for (const [host, values] of groups) {
      if (!host.isConnected) continue;
      const layer = document.createElement("div"); layer.className = "reader-annotation-layer"; layer.setAttribute("aria-hidden", "true");
      for (const g of values) {
        const a = items.find(item => item.id === g.id); if (!a) continue;
        const mark = document.createElement("div"); mark.dataset.readingAnnotation = g.id;
        mark.className = "reader-annotation-mark " + a.kind + (focus === a.id ? " focused" : "");
        Object.assign(mark.style, { left: g.x + "px", top: g.y + "px", width: g.width + "px", height: g.height + "px", backgroundColor: a.kind === "highlight" ? annotationColors[a.color] : "", borderBottomColor: annotationColors[a.color] });
        layer.append(mark);
      }
      host.append(layer); layers.push(layer);
    }
    return () => layers.forEach(layer => layer.remove());
  }, [geometry, items, focus]);
  return <>
    {root.current?.querySelector('[data-annotation-toggle]') && createPortal(<button className="toolbar-text-button" aria-pressed={panel} onClick={() => { setPanel(!panel); setSelection(undefined); }}>Annotations{loaded ? ` (${items.length})` : ""}</button>, root.current.querySelector('[data-annotation-toggle]')!)}
    {root.current?.querySelector('[data-annotation-tools]') && createPortal(<div className="reader-annotation-tools" role="toolbar" aria-label="Annotate selection" onMouseDown={event => event.preventDefault()}>{(["highlight", "underline", "comment"] as const).map(value => <button key={value} className="toolbar-text-button" disabled={!selection || !loaded || changed || busy || !!editing || !!exporting} title={changed ? "Reload the changed file before annotating" : "Select text, then add an annotation"} onClick={() => start(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>, root.current.querySelector('[data-annotation-tools]')!)}
    {changed && <div className="reader-annotation-error" role="status">File changed — reload the reader to annotate.</div>}
    {error && <div className="reader-annotation-error reader-annotation-ui" role="alert" data-translation-exclude>{error}<button onClick={() => setError("")} aria-label="Dismiss annotation message">×</button></div>}
    {panel && createPortal(<aside className="reader-annotation-panel reader-annotation-ui" style={panelTarget ? undefined : {top: (root.current?.querySelector<HTMLElement>(".pdf-reader-body")?.offsetTop ?? 85) + 8}} aria-label="Reading annotations" data-translation-exclude><header><strong>Annotations</strong><button aria-label="Close annotations" onClick={() => setPanel(false)}>×</button></header><div className="reader-annotation-actions"><button disabled={!items.length || busy} onClick={() => setExporting("all")}>Export all to Note</button><button disabled={!selected.length || busy} onClick={() => setExporting("selected")}>Export selected ({selected.length})</button></div><p className="reader-annotation-help">Saved locally. Locations refer to PDF file pages or EPUB chapters.</p><div className="reader-annotation-list">{!items.length && <p>No annotations yet. Select a passage to get started.</p>}{items.map(a => <article key={a.id} className={focus === a.id ? "selected" : ""}><div className="reader-annotation-item-heading"><label><input type="checkbox" aria-label={`Select annotation ${annotationLocation(a)}`} checked={selected.includes(a.id)} onChange={event => setSelected(values => event.target.checked ? [...values, a.id] : values.filter(id => id !== a.id))}/><span>{a.kind} · {a.color}</span></label><button onClick={() => openEdit(a)}>Edit</button></div><button className="reader-annotation-location" onClick={() => go(a)}>{annotationLocation(a)}</button>{a.fingerprint !== fingerprint && <p className="reader-annotation-stale">Earlier file version · Location unavailable</p>}<blockquote>{a.quote}</blockquote>{a.comment && <p className="reader-annotation-comment">{a.comment}</p>}</article>)}</div></aside>, panelTarget ?? root.current!)}
    {editing && <div className="modal-backdrop reader-annotation-ui" data-translation-exclude><section className="reader-annotation-dialog" role="dialog" aria-modal="true" aria-label={editing.id ? "Edit annotation" : "New annotation"}><h2>{editing.id ? "Edit annotation" : "New annotation"}</h2><blockquote>{editing.draft.quote}</blockquote><label>Mark<select aria-label="Annotation style" value={kind} onChange={event => setKind(event.target.value as AnnotationKind)}><option value="highlight">Highlight</option><option value="underline">Underline</option><option value="comment">Comment only</option></select></label><label>Color<select aria-label="Annotation color" value={color} onChange={event => setColor(event.target.value as AnnotationColor)}>{Object.keys(annotationColors).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>My comment<textarea autoFocus aria-label="Annotation comment" maxLength={20000} value={comment} onChange={event => setComment(event.target.value)} placeholder="Optional for highlights and underlines"/></label>{error && <p role="alert">{error}</p>}<div className="reader-annotation-actions">{editing.id && <button disabled={busy} onClick={() => void remove(editing.id!)}>Delete annotation</button>}<button disabled={busy} onClick={() => setEditing(undefined)}>Cancel</button><button disabled={busy || changed || editing.draft.fingerprint !== fingerprint || kind === "comment" && !comment.trim()} onClick={() => void save()}>Save annotation</button></div></section></div>}
    {exporting && <div className="modal-backdrop reader-annotation-ui" data-translation-exclude><section className="reader-annotation-dialog" role="dialog" aria-modal="true" aria-label="Export annotations"><h2>Export annotations to Note</h2><p>Export {exporting === "all" ? items.length : selected.length} annotations with excerpts, comments, locations and return links.</p>{previousExports > 0 && <p><strong>This document has already been exported.</strong> Your existing Notes will be kept. This creates a new Note.</p>}<p>The Note is an editable snapshot. Later annotation changes do not update it.</p>{error && <p role="alert">{error}</p>}<div className="reader-annotation-actions"><button disabled={busy} onClick={() => setExporting(undefined)}>Cancel</button><button disabled={busy} onClick={() => void exportNote()}>Create new Note</button></div></section></div>}
  </>;
}
