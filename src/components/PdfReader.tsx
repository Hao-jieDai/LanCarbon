import { ReaderAnnotations, type AnnotationReaderProps } from "./ReaderAnnotations";
import type { CitationTarget } from "../shared/grounding";
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFViewer, PDFLinkService, EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PdfSession, ReadingPosition } from "../shared/pdfReader";
import { ThemedSelect } from "./ThemedSelect";
import { attachOcrText } from "../pdf-ocr-text";
import { pdfTextNeedsOcr } from "../shared/ocr";
import "../generated/pdf-viewer.css";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
type Outline = Awaited<ReturnType<pdfjs.PDFDocumentProxy["getOutline"]>> | null;
function Thumbnail({ document, page, selected, onSelect }: { document: pdfjs.PDFDocumentProxy; page: number; selected: boolean; onSelect(): void }) {
  const host = useRef<HTMLButtonElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let render: pdfjs.RenderTask | undefined, generation = 0;
    const observer = new IntersectionObserver(entries => {
      const visible = entries[0]?.isIntersecting, current = ++generation; render?.cancel();
      if (!visible) { if (canvas.current) canvas.current.width = canvas.current.height = 0; return; }
      void document.getPage(page).then(pdfPage => {
        if (current !== generation || !canvas.current) return;
        const viewport = pdfPage.getViewport({ scale: 116 / pdfPage.getViewport({ scale: 1 }).width }), target = canvas.current;
        target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
        render = pdfPage.render({ canvas: target, viewport }); return render.promise;
      }).catch(() => { /* Closing or scrolling away cancels thumbnail work. */ });
    }, { rootMargin: "100px" });
    if (host.current) observer.observe(host.current);
    return () => { generation++; observer.disconnect(); render?.cancel(); };
  }, [document, page]);
  return <button ref={host} className={selected ? "pdf-thumbnail selected" : "pdf-thumbnail"} aria-label={`PDF thumbnail page ${page}`} aria-current={selected ? "page" : undefined} onClick={onSelect}><canvas ref={canvas}/><span>{page}</span></button>;
}
function OutlineItems({ items, link, depth = 0 }: { items: NonNullable<Outline>; link: PDFLinkService; depth?: number }) {
  if (depth > 12) return null;
  return <ul>{items.map((item, index) => <li key={index}><button disabled={!item.dest} onClick={() => { if (item.dest) void link.goToDestination(item.dest); }}>{item.title || "Untitled section"}</button>{!!item.items.length && <OutlineItems items={item.items} link={link} depth={depth + 1}/>}</li>)}</ul>;
}
export function PdfReader({ id, onClose, citation, ...annotationProps }: { id: string; onClose(): void; citation?: CitationTarget } & AnnotationReaderProps) {
  const root = useRef<HTMLElement>(null);
  const api = window.notesDesktop.reader!;
  const container = useRef<HTMLDivElement>(null), pages = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const engine = useRef<{ viewer: PDFViewer; link: PDFLinkService; bus: EventBus; document: pdfjs.PDFDocumentProxy } | null>(null);
  const sessionRef = useRef<PdfSession | null>(null), position = useRef<ReadingPosition | null>(null), saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [session, setSession] = useState<PdfSession>(), [document, setDocument] = useState<pdfjs.PDFDocumentProxy>();
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [page, setPage] = useState(1), [pageDraft, setPageDraft] = useState("1"), [zoom, setZoom] = useState("page-width");
  const [sidebar, setSidebar] = useState<"pages" | "outline" | "hidden">("hidden"), [outline, setOutline] = useState<Outline>(null);
  const [query, setQuery] = useState(""), [matches, setMatches] = useState(""), [revision, setRevision] = useState(0), [newVersion, setNewVersion] = useState(false);
  const [passwordNeeded, setPasswordNeeded] = useState(false), [password, setPassword] = useState(""), passwordCallback = useRef<((value: string) => void) | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false), [ocrMessage, setOcrMessage] = useState("");
  const ocrAdapter = useRef<ReturnType<typeof attachOcrText> | null>(null), findRef = useRef<import("pdfjs-dist/web/pdf_viewer.mjs").PDFFindController | null>(null), attempted = useRef(new Set<number>());
  const recognize = async (number?: number, force = false) => {
    const current = sessionRef.current; if (!current || !api.recognize || ocrBusy) return;
    setOcrBusy(true); setOcrMessage(number ? `OCR · Page ${number}` : "OCR · Preparing document…");
    try {
      const result = await api.recognize(current.token, number, force); if (sessionRef.current?.token !== current.token) return;
      if (!result.ok) throw Error(result.error);
      ocrAdapter.current?.refresh(); const active = engine.current;
      if (active) {
        findRef.current?.setDocument(null as unknown as pdfjs.PDFDocumentProxy); findRef.current?.setDocument(active.document);
        for (const index of number ? [number - 1] : Array.from({ length: active.document.numPages }, (_, i) => i)) active.viewer.getPageView(index)?.reset({ keepAnnotationLayer: true, keepAnnotationEditorLayer: true });
        active.viewer.update();
      }
      setOcrMessage(result.page ? result.page.text ? `Local OCR · Page ${result.page.page} · ${Math.round(result.page.confidence)}% confidence${result.page.reviewNotes?.length ? " · Check recognized text and decimal points against the original." : ""}` : `Page ${result.page.page}: no readable text found.` : result.message || "Local OCR complete. Search now includes recognized pages.");
      if (searchInput.current?.value) search(searchInput.current.value);
    } catch (error) { if (sessionRef.current?.token === current.token) setOcrMessage(error instanceof Error ? error.message : "OCR could not finish."); }
    finally { if (sessionRef.current?.token === current.token) setOcrBusy(false); }
  };
  const persist = async () => { clearTimeout(saveTimer.current); const current = sessionRef.current, saved = position.current; if (current && saved) { const result = await api.savePosition(current.readingId, saved); if (!result.ok) throw Error(result.error); } };
  useEffect(() => {
    let live = true, task: pdfjs.PDFDocumentLoadingTask | undefined, opened: PdfSession | undefined, viewer: PDFViewer | undefined, resize: ResizeObserver | undefined; let resizeFrame = 0;
    const abort = new AbortController();
    setReady(false); setError(""); setDocument(undefined); setOutline(null); setNewVersion(false); setPasswordNeeded(false); setQuery(""); setMatches(""); setOcrBusy(false); setOcrMessage(""); attempted.current.clear(); position.current = null;
    void (async () => {
      const result = await api.open(id); if (!result.ok) throw Error(result.error); opened = result.session;
      if (!live) { await api.release(opened.token); return; }
      sessionRef.current = opened; setSession(opened);
      const components = await import("pdfjs-dist/web/pdf_viewer.mjs"); if (!live || !container.current || !pages.current) return;
      const bus = new components.EventBus(), link = new components.PDFLinkService({ eventBus: bus, ignoreDestinationZoom: true }); link.externalLinkEnabled = false;
      const find = new components.PDFFindController({ eventBus: bus, linkService: link });
      findRef.current = find;
      viewer = new components.PDFViewer({ container: container.current, viewer: pages.current, eventBus: bus, linkService: link, findController: find, textLayerMode: 1, annotationMode: pdfjs.AnnotationMode.ENABLE, enableAutoLinking: false, enablePermissions: true, maxCanvasPixels: 8_388_608, ...{ abortSignal: abort.signal } });
      link.setViewer(viewer);
      class RangeTransport extends pdfjs.PDFDataRangeTransport {
        requestDataRange(begin: number, end: number) { void (async () => {
          if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > opened!.length) throw Error("Invalid PDF data range.");
          const bytes = new Uint8Array(end - begin);
          for (let offset = begin; offset < end; offset += 1048576) {
            if (!live) return;
            const result = await api.range(opened!.token, offset, Math.min(end, offset + 1048576));
            if (!result.ok) throw Error(result.error); bytes.set(result.bytes, offset - begin);
          }
          if (live) this.onDataRange(begin, bytes);
        })().catch(error => { if (live) { setError(String(error.message ?? error)); void task?.destroy(); } }); }
      }
      const transport = new RangeTransport(opened.length, new Uint8Array(opened.initial), opened.initial.length === opened.length);
      const assets = new URL("pdfjs/", window.location.href).href;
      task = pdfjs.getDocument({ range: transport, rangeChunkSize: 262144, disableAutoFetch: true, disableStream: true,  enableXfa: false, cMapUrl: assets + "cmaps/", cMapPacked: true, standardFontDataUrl: assets + "standard_fonts/", wasmUrl: assets + "wasm/", iccUrl: assets + "iccs/", useWorkerFetch: false });
      task.onPassword = (callback: (value: string) => void) => { if (live) { passwordCallback.current = callback; setPasswordNeeded(true); } };
      const pdf = await task.promise; if (!live) return;
      if (api.cachedOcr) ocrAdapter.current = attachOcrText(pdf, async number => { const result = await api.cachedOcr(opened!.token, number); return result.ok ? result.page : undefined; });
      if (pdf.numPages > 20_000) throw Error("This document exceeds the reader's 20,000-page limit. Use Open externally.");
      engine.current = { viewer, link, bus, document: pdf }; setDocument(pdf);
      const saved = opened.position;
      let initialized = false;
      bus.on("pagesinit", () => {
        if (!live || !viewer) return;
        viewer.currentScaleValue = saved?.zoom ?? "page-width"; setZoom(saved?.zoom ?? "page-width");
        if (saved) viewer.scrollPageIntoView({ pageNumber: Math.min(saved.page, pdf.numPages), destArray: [null, { name: "XYZ" }, saved.x, saved.y, null], ignoreDestinationZoom: true });
        initialized = true; setReady(true);
      });
      bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => { if (live) { setPage(pageNumber); setPageDraft(String(pageNumber)); } });
      bus.on("scalechanging", () => { if (live && viewer) setZoom(viewer.currentScaleValue); });
      bus.on("updateviewarea", ({ location }: { location: { pageNumber: number; left: number; top: number } }) => {
        if (!live || !initialized || !viewer) return;
        position.current = { page: location.pageNumber, x: location.left, y: location.top, zoom: viewer.currentScaleValue || "page-width" };
        clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { void persist().catch(error => { if (live) setNotice(error.message); }); }, 500);
      });
      bus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) => { if (live) setMatches(`${matchesCount.current} / ${matchesCount.total}`); });
      bus.on("updatefindcontrolstate", ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => { if (live) setMatches(state === 1 ? "No matches" : state === 3 ? "Searching…" : `${matchesCount.current} / ${matchesCount.total}`); });
      bus.on("pagerendered", ({ error }: { error?: Error }) => { if (live && error) setNotice("A page could not be rendered. Open externally to check the document."); });
      resize = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (!live || !initialized || !viewer || !container.current?.clientWidth || !container.current.clientHeight) return;
          const value = viewer.currentScaleValue;
          if (["page-width", "page-fit", "auto"].includes(value)) viewer.currentScaleValue = value;
        });
      });
      resize.observe(container.current);
      viewer.setDocument(pdf); link.setDocument(pdf); find.setDocument(pdf);
      const tree = await pdf.getOutline(); if (live) setOutline(tree);
    })().catch(error => { if (live) { setPasswordNeeded(false); setError(error.message ?? "Could not open this PDF."); } });
    return () => { live = false; clearTimeout(saveTimer.current); void persist().catch(() => undefined); resize?.disconnect(); cancelAnimationFrame(resizeFrame); abort.abort(); viewer?.setDocument(null); engine.current = null; findRef.current = null; ocrAdapter.current = null; passwordCallback.current = null; void task?.destroy(); if (opened) { void api.stopOcr?.(opened.token); void api.release(opened.token); } sessionRef.current = null; };
  }, [id, revision, api]);
  useEffect(() => api.onOcrProgress?.(value => { if (sessionRef.current?.token === value.token) setOcrMessage(value.message); }), [api]);
  useEffect(() => {
    if (!ready || ocrBusy || !api.recognize) return;
    let live = true; const timer = setTimeout(() => { void (async () => {
      const current = sessionRef.current, active = engine.current; if (!current || !active) return;
      const cached = await api.cachedOcr(current.token, page); if (!live) return;
      if (cached.ok && cached.page) { attempted.current.add(page); if (cached.page.text) setOcrMessage(`Local OCR · Page ${page} · ${Math.round(cached.page.confidence)}% confidence${cached.page.reviewNotes?.length ? " · Check recognized text and decimal points against the original." : ""}`); return; }
      if (attempted.current.has(page)) return;
      setOcrMessage("");
      const pdfPage = await active.document.getPage(page), text = await pdfPage.getTextContent(); if (!live) return;
      attempted.current.add(page);
      if (!pdfTextNeedsOcr(text.items.flatMap(item => "str" in item ? [item.str] : []).join(" "))) return;
      await recognize(page);
    })().catch(() => undefined); }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [ready, page, ocrBusy, api]);
  useEffect(() => window.notesDesktop.library?.onChanged?.(() => { void window.notesDesktop.library!.list().then(result => { const current = sessionRef.current; if (result.ok && current) { const latest = result.entries.find(entry => entry.id === current.readingId || entry.id === id || entry.assetId === id); if (latest) { setSession(previous => previous ? { ...previous, entry: { ...previous.entry, name: latest.name, location: latest.location } } : previous); if (latest.version !== current.entry.version) setNewVersion(true); } } }).catch(() => undefined); }), [id]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopImmediatePropagation(); searchInput.current?.focus(); searchInput.current?.select(); } }; window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); }, []);
  const jump = (value: number) => { const current = engine.current; if (current) current.viewer.currentPageNumber = Math.min(current.document.numPages, Math.max(1, value)); };
  const search = (text: string, again = false, previous = false) => engine.current?.bus.dispatch("find", { source: window, type: again ? "again" : "", query: text, phraseSearch: true, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => search(query), 200); return () => clearTimeout(timer); }, [query, ready]);
  useEffect(() => { if (!ready || !citation || citation.anchor.kind !== "pdf") return; jump(citation.anchor.page ?? 1); setNotice(`Cited passage · Page ${citation.anchor.page}`); }, [ready, citation?.requestId]);
  const close = () => { void persist().catch(() => undefined).finally(onClose); };
  const zoomOptions = [{ value: "page-width", label: "Fit width" }, { value: "page-fit", label: "Fit page" }, ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(value => ({ value: String(value), label: `${Math.round(value * 100)}%` }))];
  if (!zoomOptions.some(option => option.value === zoom)) zoomOptions.push({ value: zoom, label: `${Math.round(Number(zoom) * 100)}%` });
  return <section ref={root} className="editor-panel document-reader pdf-reader" aria-label="PDF reader">
    {session && ready && <ReaderAnnotations {...annotationProps} key={session.token} root={root} documentId={session.readingId} fingerprint={session.fingerprint} navigate={a => { if (a.anchor.kind === "pdf") jump(Math.min(...a.anchor.rects.map(r => r.page))); }}/>}

    <div className="pdf-reader-controls" data-translation-exclude>
      <button className="toolbar-text-button" aria-pressed={sidebar !== "hidden"} onClick={() => setSidebar(value => value === "hidden" ? "pages" : "hidden")}>Pages / Contents</button>
      <div className="pdf-page-controls"><button className="toolbar-text-button" aria-label="Previous PDF page" disabled={!ready || page <= 1} onClick={() => jump(page - 1)}>‹</button><form onSubmit={event => { event.preventDefault(); const value = Number(pageDraft); if (Number.isInteger(value)) jump(value); else setPageDraft(String(page)); }}><input aria-label="PDF page number" inputMode="numeric" value={pageDraft} disabled={!ready} onChange={event => setPageDraft(event.target.value)} onBlur={() => setPageDraft(String(page))}/><span>/ {document?.numPages ?? "—"}</span></form><button className="toolbar-text-button" aria-label="Next PDF page" disabled={!ready || page >= (document?.numPages ?? 0)} onClick={() => jump(page + 1)}>›</button></div>
      <ThemedSelect label="PDF zoom" value={zoom} options={zoomOptions} onChange={value => { if (engine.current) engine.current.viewer.currentScaleValue = value; }}/>
      <ThemedSelect action label="PDF OCR" placeholder="OCR" value="" options={[{ value: "page", label: "Recognize page" }, { value: "document", label: "Recognize PDF" }]} disabled={!ready || ocrBusy || !api.recognize} onChange={value => { if (value === "page") void recognize(page, true); if (value === "document") void recognize(); }}/>
      {ocrBusy && <button className="toolbar-text-button" onClick={() => { const current = sessionRef.current; if (current) void api.stopOcr(current.token); }}>Stop OCR</button>}
      <div className="reader-tools-end"><button className="toolbar-text-button" onClick={() => void window.notesDesktop.library!.open(id).then(result => { if (!result.ok) setNotice(result.error ?? "Could not open externally."); })}>Open externally</button><form className="pdf-find" onSubmit={event => { event.preventDefault(); search(query, true); }}><input ref={searchInput} aria-label="Find in PDF" placeholder="Find in PDF" value={query} onChange={event => setQuery(event.target.value)} disabled={!ready}/><span role="status">{query && matches}</span><button type="button" className="toolbar-text-button" aria-label="Previous PDF match" disabled={!query || !ready} onClick={() => search(query, true, true)}>↑</button><button className="toolbar-text-button" aria-label="Next PDF match" disabled={!query || !ready}>↓</button></form></div>
    </div>
    {newVersion && <div className="pdf-reader-notice" role="status">A newer file version is available.<button className="text-button" onClick={() => void persist().catch(() => undefined).finally(() => setRevision(value => value + 1))}>Reload latest version</button></div>}
    {notice && <p className="pdf-reader-notice" role="status">{notice}</p>}
    {ocrMessage && <p className="pdf-reader-notice" role="status">{ocrMessage}</p>}
    <div className="pdf-reader-body">
      {sidebar !== "hidden" && <aside className="pdf-reader-sidebar"><div className="pdf-sidebar-tabs"><button className="text-button" aria-pressed={sidebar === "pages"} onClick={() => setSidebar("pages")}>Pages</button><button className="text-button" aria-pressed={sidebar === "outline"} onClick={() => setSidebar("outline")}>Contents</button></div><div className="pdf-sidebar-scroll">{sidebar === "pages" && document ? Array.from({ length: document.numPages }, (_, index) => <Thumbnail key={index} document={document} page={index + 1} selected={page === index + 1} onSelect={() => jump(index + 1)}/>) : sidebar === "outline" && engine.current ? outline?.length ? <OutlineItems items={outline} link={engine.current.link}/> : <p>No document outline.</p> : null}</div></aside>}
      <div className="pdf-view-area"><div ref={container} className="pdf-scroll-container" tabIndex={0} aria-label="PDF pages"><div ref={pages} className="pdfViewer"/></div>
        {!ready && !error && !passwordNeeded && <p className="pdf-loading" role="status">Opening PDF…</p>}
        {error && <div className="pdf-reader-error" role="alert"><h2>PDF unavailable</h2><p>{error}</p><p>Your file is preserved. You can try Open externally.</p></div>}
        {passwordNeeded && <form className="pdf-password" onSubmit={event => { event.preventDefault(); const value = password; setPassword(""); setPasswordNeeded(false); passwordCallback.current?.(value); }} data-translation-exclude><h2>Password required</h2><label>PDF password<input autoFocus type="password" aria-label="PDF password" value={password} onChange={event => setPassword(event.target.value)}/></label><button className="toolbar-text-button">Open PDF</button><button type="button" className="text-button" onClick={close}>Cancel</button></form>}
      </div>
    </div><footer className="pdf-reader-footer"><span>{ready ? `Page ${page} of ${document?.numPages} · Version ${session?.entry.version ?? 1}` : "PDF reader"}</span><span>Local reading · Select text to use translation</span></footer>
  </section>;
}
