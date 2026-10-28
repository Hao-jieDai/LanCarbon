import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorView } from "@codemirror/view";
import { appendTranslationText, normalizeTranslationText, type TranslationResult } from "../shared/translation";

const EXCLUDED = '[data-translation-exclude],.ai-saved-key,[hidden]';
export function translationSelection(origin: Element | null): string {
  if (!origin || origin.closest(EXCLUDED)) return "";
  const input = origin.closest("input,textarea") as HTMLInputElement | HTMLTextAreaElement | null;
  if (input) {
    if (input instanceof HTMLInputElement && !["text", "search", "tel"].includes(input.type)) return "";
    if (/api.*(?:key|address)|saved api key/i.test(input.getAttribute("aria-label") ?? "")) return "";
    const start = input.selectionStart, end = input.selectionEnd;
    return start !== null && end !== null && start !== end ? input.value.slice(start, end) : "";
  }
  const editor = origin.closest(".cm-editor") as HTMLElement | null;
  if (editor) { const view = EditorView.findFromDOM(editor); if (!view) return ""; return view.state.selection.ranges.filter(range => !range.empty).map(range => view.state.doc.sliceString(range.from, range.to)).join("\n"); }
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return "";
  const element = (node: Node | null) => node instanceof Element ? node : node?.parentElement;
  if (element(selection.anchorNode)?.closest(EXCLUDED) || element(selection.focusNode)?.closest(EXCLUDED)) return "";
  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(origin)) return "";
  return selection.toString();
}
type Position = { x: number; y: number };
export function TranslationWidget({ scope, onSettings }: { scope: string; onSettings(): void }) {
  const api = window.notesDesktop.translation;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [enabled, setEnabled] = useState(false), [toggling, setToggling] = useState(false);
  const [source, setSource] = useState(""), [result, setResult] = useState<TranslationResult>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const continuousRef = useRef(false), sourceRef = useRef("");
  const changeContinuous = useCallback((value: boolean) => { continuousRef.current = value; setContinuous(value); }, []);
  const [position, setPosition] = useState<Position | null>(() => { try { const value = JSON.parse(localStorage.getItem("lancarbon.translation.position") ?? "null"); return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null; } catch { return null; } });
  const panel = useRef<HTMLElement | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), request = useRef(""), revision = useRef(0), fingerprint = useRef(""), lastText = useRef("");
  const interrupt = useCallback(() => { clearTimeout(timer.current); revision.current++; const id = request.current; request.current = ""; lastText.current = ""; setBusy(false); if (id) void api?.cancel(id); }, [api]);
  const clearPassage = useCallback(() => { interrupt(); sourceRef.current = ""; setSource(""); setResult(undefined); setError(""); }, [interrupt]);
  const clamp = useCallback((value: Position): Position => { const rect = panel.current?.getBoundingClientRect(); return { x: Math.max(12, Math.min(value.x, innerWidth - (rect?.width ?? 320) - 12)), y: Math.max(12, Math.min(value.y, innerHeight - (rect?.height ?? 300) - 40)) }; }, []);
  useEffect(() => { setSlot(document.getElementById("translation-toggle-slot")); }, []);
  useEffect(() => {
    if (!api) return;
    let live = true, load = 0;
    const refresh = async () => { const ticket = ++load; const value = await api.settings(); if (!live || ticket !== load) return; if (!value.ok) { setError(value.error); return; } const next = JSON.stringify(value.settings); if (fingerprint.current && fingerprint.current !== next) { clearPassage(); } fingerprint.current = next; setEnabled(value.enabled); };
    void refresh().catch(() => { if (live) setError("Could not load translation settings."); });
    const unsubscribe = api.onChanged(() => { void refresh().catch(() => { if (live) setError("Could not reload translation settings."); }); });
    return () => { live = false; unsubscribe(); interrupt(); };
  }, [api, interrupt, clearPassage]);
  useEffect(() => { clearPassage(); changeContinuous(false); }, [scope, clearPassage, changeContinuous]);
  useEffect(() => api?.onProgress(value => { if (value.id === request.current) setResult(value.result); }), [api]);
  useEffect(() => { if (!busy) return; const start = Date.now(); setElapsed(0); const clock = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000); return () => clearInterval(clock); }, [busy, source]);
  const translate = useCallback(async (text: string) => {
    if (!api) return;
    interrupt(); lastText.current = text;
    const ticket = revision.current, id = crypto.randomUUID();
    request.current = id; setSource(text); setResult(undefined); setError(""); setElapsed(0); setBusy(true);
    try { const value = await api.translate(id, text); if (ticket !== revision.current) return; if (!value.ok) throw Error(value.error); setResult(value.result); }
    catch (error) { if (ticket === revision.current) { lastText.current = ""; setError(error instanceof Error ? error.message : String(error)); } }
    finally { if (ticket === revision.current) { request.current = ""; setBusy(false); } }
  }, [api, interrupt]);
  const toggle = useCallback(async () => {
    if (!api || toggling) return;
    clearPassage(); changeContinuous(false); setToggling(true);
    try { const value = await api.setEnabled(!enabled); if (!value.ok) throw Error(value.error); setEnabled(value.enabled); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setToggling(false); }
  }, [api, enabled, toggling, clearPassage, changeContinuous]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.ctrlKey && event.altKey && !event.shiftKey && event.key.toLowerCase() === "t" && !event.repeat && !event.isComposing) { event.preventDefault(); void toggle(); } }; document.addEventListener("keydown", shortcut); return () => document.removeEventListener("keydown", shortcut); }, [toggle]);
  useEffect(() => {
    if (!enabled || !api) return;
    let pointer = false, origin: Element | null = null, gestureAt = 0, gesture = 0, captured = "";
    const schedule = (target: Element | null) => {
      if (!target || target.closest(EXCLUDED)) return;
      const raw = translationSelection(target);
      if (!raw.trim()) return;
      let text: string;
      const capture = `${gesture}:${raw}`;
      if (capture === captured) return;
      try {
        text = normalizeTranslationText(raw);
        if (/^(?:https?:\/\/|sk-[\w-]+$)|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return;
        if (continuousRef.current) text = appendTranslationText(sourceRef.current, text);
      }
      catch (error) { if (/[A-Za-z]/.test(raw)) { setError(error instanceof Error ? error.message : String(error)); } return; }
      captured = capture;
      if (text === lastText.current) return;
      interrupt(); lastText.current = text; sourceRef.current = text; setSource(text); setResult(undefined); setError("");
      const ticket = revision.current;
      timer.current = setTimeout(() => {
        if (ticket !== revision.current) return;
        void translate(text);
      }, 400);
    };
    const down = (event: PointerEvent) => { const target = event.target instanceof Element ? event.target : null; if (!target || target.closest(EXCLUDED) || target.closest("button,select,a")) { origin = null; return; } pointer = true; origin = target; gesture++; gestureAt = Date.now(); };
    const up = () => { pointer = false; if (origin) { const target = origin; setTimeout(() => schedule(target), 0); } };
    const selection = () => { if (!pointer && Date.now() - gestureAt < 1000) schedule(origin ?? document.activeElement); };
    const keyup = (event: KeyboardEvent) => { if (event.isComposing || !(event.shiftKey && /^(Arrow|Home|End|Page)/.test(event.key)) && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a")) return; origin = event.target instanceof Element ? event.target : null; gesture++; gestureAt = Date.now(); schedule(origin); };
    const shortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,[contenteditable="true"],.cm-editor,[data-translation-exclude]')) return;
      const selection = window.getSelection(), anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      if (!element?.closest('.pdf-reader .textLayer') || !sourceRef.current) return;
      event.preventDefault(); changeContinuous(!continuousRef.current);
    };
    document.addEventListener("keydown", shortcut);
    document.addEventListener("pointerdown", down); document.addEventListener("mouseup", up); document.addEventListener("selectionchange", selection); document.addEventListener("keyup", keyup);
    return () => { document.removeEventListener("keydown", shortcut); document.removeEventListener("pointerdown", down); document.removeEventListener("mouseup", up); document.removeEventListener("selectionchange", selection); document.removeEventListener("keyup", keyup); origin = null; interrupt(); };
  }, [enabled, api, interrupt, translate, changeContinuous]);
  useEffect(() => { const resize = () => setPosition(value => value ? clamp(value) : value); window.addEventListener("resize", resize); if (enabled) resize(); return () => window.removeEventListener("resize", resize); }, [enabled, clamp]);
  useEffect(() => { if (enabled) setPosition(value => value ? clamp(value) : value); }, [enabled, source, result, error, busy, clamp]);
  if (!api) return null;
  const drag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("button") || event.button !== 0 || !panel.current) return;
    event.preventDefault(); const rect = panel.current.getBoundingClientRect(), start = { x: event.clientX, y: event.clientY }; const header = event.currentTarget; header.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => { const value = clamp({ x: rect.left + next.clientX - start.x, y: rect.top + next.clientY - start.y }); setPosition(value); try { localStorage.setItem("lancarbon.translation.position", JSON.stringify(value)); } catch { /* Position is optional when local storage is unavailable. */ } };
    const done = () => { header.removeEventListener("pointermove", move); header.removeEventListener("pointerup", done); header.removeEventListener("pointercancel", done); };
    header.addEventListener("pointermove", move); header.addEventListener("pointerup", done); header.addEventListener("pointercancel", done);
  };
  return <>{slot && createPortal(<div className="translation-toggle-row" data-translation-exclude><button className="text-button" aria-label="Toggle translation" aria-pressed={enabled} aria-keyshortcuts="Control+Alt+T" title="Toggle translation (Ctrl+Alt+T)" disabled={toggling} onClick={() => void toggle()}>{enabled ? "Translation on" : "Translate"}</button><kbd>Ctrl Alt T</kbd></div>, slot)}
    {enabled && <section ref={panel} className="translation-window" role="region" aria-label="Selection translation" data-translation-exclude style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
      <header onPointerDown={drag}><strong>Translation</strong><div><button className="text-button" onClick={onSettings}>Settings</button><button className="icon-button" aria-label="Turn off translation" onClick={() => void toggle()}>×</button></div></header>
      <div className="translation-continuous"><label><input type="checkbox" checked={continuous} onChange={event => changeContinuous(event.target.checked)}/>Continuous translation</label><button className="text-button" onClick={clearPassage} disabled={!source && !error}>New passage</button></div>
      {continuous && <p className="translation-append-hint">Select more text to append, including on the next PDF page. Each addition translates the combined passage. Z toggles this mode while selecting PDF text.</p>}
      {!source && !error && <p className="translation-empty">Select an English word, phrase or short passage.</p>}
      {source && <div key={source} className="translation-source" tabIndex={0} aria-label="Selected English">{source}</div>}
      {busy && <div className="translation-progress"><p role="status">{result?.text ? "Translating…" : elapsed >= 15 ? "Still waiting for the translation service…" : "Waiting for translation…"} {elapsed}s</p><button className="text-button" onClick={() => { interrupt(); setError("Translation stopped. Partial text is not saved."); }}>Stop</button></div>}{result && <><div className="translation-result" tabIndex={0} aria-label="Chinese translation">{result.text}</div><p className="translation-model">{result.cached ? "Saved result · " : ""}{result.providerName} · {result.modelName}</p></>}
      {error && <p role="alert" className="translation-error">{error}</p>}
      {error && source && !busy && <button className="text-button" onClick={() => void translate(source)}>Retry translation</button>}
    </section>}
    {!enabled && error && <div className="translation-toggle-error" role="alert">{error}</div>}
  </>;
}
