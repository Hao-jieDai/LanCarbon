import { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { renderMystPreview, type PreviewDocument, type PreviewAssets } from "../preview/mystPreview";
import { assetReferences } from "../shared/assets";

interface MarkdownPreviewProps {
  content: string;
  visible: boolean;
  document?: PreviewDocument;
  documents?: PreviewDocument[];
  navigation?: { noteId: string; anchor: string; sequence: number } | null;
  onNavigate?(noteId: string, anchor: string): void;
  onNavigated?(): void;
}

export function renderSafeMystHtml(content: string) {
  return renderMystPreview({ id: "current", title: "Note", content });
}

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const { content, visible, document: current, documents, navigation, onNavigated } = props;
  const host = useRef<HTMLDivElement>(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [assets, setAssets] = useState<PreviewAssets>({});
  useEffect(() => {
    if (!visible || !window.notesDesktop?.assets) return;
    let canceled = false;
    const api = window.notesDesktop.assets;
    void (async () => {
      const result = await api.list(); const next: PreviewAssets = {};
      if (!result.ok) { if (!canceled) setLinkMessage(result.error); return; }
      const required = new Set(assetReferences(content).map(ref => ref.id));
      for (const item of result.assets.filter(a => required.has(a.id) && !a.missing)) {
        next[item.id] = {name:item.name};
        if (item.mime.startsWith("image/")) { const image = await api.image(item.id); if (image.ok) next[item.id].url = image.url; }
      }
      if (!canceled) setAssets(next);
    })().catch(error => { if (!canceled) setLinkMessage(String(error)); });
    return () => { canceled = true; };
  }, [content, visible]);
  // Do not parse or lay out mathematics on every keystroke while Edit is visible.
  const rendered = useMemo(() => visible ? renderMystPreview(current ?? { id: "current", title: "Note", content }, documents, assets) : null, [visible, current, documents, content, assets]);
  const scrollTo = (anchor: string) => {
    const target = anchor ? Array.from(host.current?.querySelectorAll<HTMLElement>("[id]") ?? []).find(node => node.id === anchor) : null;
    if (target) {
      let parent = target.parentElement;
      while (parent && parent !== host.current) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      target.scrollIntoView({ block: "start" });
    } else if (host.current) host.current.scrollTop = 0;
  };
  useEffect(() => {
    if (visible && navigation && navigation.noteId === current?.id && rendered) { scrollTo(navigation.anchor); onNavigated?.(); }
  }, [visible, navigation, current?.id, rendered, onNavigated]);
  return <div className="content-input markdown-preview" hidden={!visible} ref={host} aria-label="Rendered preview">
    {rendered?.error ? <div role="alert" className="preview-error"><strong>Preview unavailable</strong><p>{rendered.error}</p><p>Your source is unchanged. Return to Edit to correct it.</p></div> : <>
      {!!rendered?.warnings.length && <details className="preview-diagnostics"><summary>Preview notices ({rendered.warnings.length})</summary><ul>{rendered.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      {linkMessage && <p className="preview-link-message" role="status">{linkMessage}</p>}
      {!content.trim() ? <p>Nothing to preview yet.</p> : <div className="preview-body" onClick={event => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link) return;
        event.preventDefault();
        const resource = link.getAttribute("data-asset-id");
        if (resource && window.notesDesktop?.assets) { void window.notesDesktop.assets.saveCopy(resource).then(result => { if (!result.ok) setLinkMessage(result.error); }); return; }
        const noteId = link.getAttribute("data-preview-note");
        const anchor = link.getAttribute("data-preview-anchor") ?? "";
        if (noteId === (current?.id ?? "current")) { scrollTo(anchor); setLinkMessage(""); }
        else if (noteId && props.onNavigate) { props.onNavigate(noteId, anchor); setLinkMessage(""); }
        else if (link.hash && !noteId && !link.getAttribute("href")?.includes(":")) { scrollTo(decodeURIComponent(link.hash.slice(1))); }
        else setLinkMessage("External links are disabled in local preview. Open the exported website to follow them.");
      }} dangerouslySetInnerHTML={{ __html: rendered?.html ?? "" }} />}
    </>}
  </div>;
}
