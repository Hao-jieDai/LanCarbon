import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "../shared/types";
import { applyDraft, openDraft, runCommand, type Command, type PanelDraft, type PanelKind } from "../editor/markdownTools";
import { FormattingToolbar } from "./FormattingToolbar";
import { MarkdownInsertDialog } from "./MarkdownInsertDialog";
import { AssetPanel } from "./AssetPanel";
import { assetMarkdown, MAX_ASSET_BYTES, MAX_IMAGE_BYTES, type Asset } from "../shared/assets";
import type { Note, Book } from "../shared/types";
import { ImageSettingsDialog } from "./ImageSettingsDialog";
import { BibliographyPanel } from "./BibliographyPanel";

interface MarkdownEditorProps {
  bibliographyBook?: Book;
  onBibliographyBookChange?(book:Book):void;
  resourceNotes?: Note[];
  resourceBooks?: Book[];
  onResourcesChanged?(workspace: import("../shared/types").WorkspaceFile): void;
  beforeResourceChange?(): Promise<void>;
  value: string;
  theme: Theme;
  visible?: boolean;
  onChange(value: string): void;
}

const lightHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#8f5155", fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "#9b5c60", textDecoration: "underline" },
  { tag: [tags.emphasis, tags.strong], color: "#74464a" },
  { tag: [tags.monospace, tags.meta], color: "#786164" },
  { tag: tags.quote, color: "#8a7476", fontStyle: "italic" },
  { tag: [tags.keyword, tags.atom], color: "#9f5d61" },
  { tag: tags.comment, color: "#9b8789" }
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#dda9a9", fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "#d3a0a0", textDecoration: "underline" },
  { tag: [tags.emphasis, tags.strong], color: "#e2bebe" },
  { tag: [tags.monospace, tags.meta], color: "#c7acad" },
  { tag: tags.quote, color: "#ad9597", fontStyle: "italic" },
  { tag: [tags.keyword, tags.atom], color: "#d99d9f" },
  { tag: tags.comment, color: "#987f81" }
]);

function editorTheme(theme: Theme) {
  const dark = theme === "dark";
  return [
    EditorView.theme({
      "&": {
        height: "100%",
        color: "var(--input-copy)",
        backgroundColor: "transparent",
        fontFamily: "var(--serif)",
        fontSize: "16px"
      },
      ".cm-scroller": { overflow: "auto", fontFamily: "inherit", lineHeight: "2" },
      ".cm-content": { minHeight: "100%", padding: "0 0 30px", caretColor: "var(--accent-light)" },
      ".cm-line": { padding: "0 10px" },
      ".cm-gutters": {
        minWidth: "42px",
        color: "var(--footer-copy)",
        backgroundColor: "transparent",
        border: "0"
      },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 4px" },
      ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(178, 119, 119, .08)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection) !important" },
      "&.cm-focused": { outline: "none" },
      "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent-light)" },
      ".cm-placeholder": { color: "var(--placeholder)", fontStyle: "normal" },
      ".cm-panels, .cm-tooltip": { color: "var(--ink)", backgroundColor: "var(--surface)", borderColor: "var(--line)" },
      ".cm-searchMatch": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent)" }
    }, { dark }),
    syntaxHighlighting(dark ? darkHighlight : lightHighlight)
  ];
}

export function MarkdownEditor({ value, theme, visible = true, onChange, resourceNotes = [], resourceBooks = [], beforeResourceChange, onResourcesChanged,bibliographyBook,onBibliographyBookChange }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const themeCompartmentRef = useRef(new Compartment());
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<PanelDraft | null>(null);
  const [message, setMessage] = useState("");
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imageSettings,setImageSettings]=useState<{source:string;cursor:number}|null>(null);
  const [citationsOpen,setCitationsOpen]=useState(false);
  const insertAssets = (items: Asset[], expected = viewRef.current) => {
    if (!items.length || !expected || viewRef.current !== expected) return;
    expected.dispatch(expected.state.replaceSelection(items.map(assetMarkdown).join("\n\n")));
    expected.focus(); setResourcesOpen(false);
  };
  const chooseAssets = async (imageOnly: boolean) => {
    const expected = viewRef.current;
    setImporting(true); setMessage("");
    try {
      await beforeResourceChange?.();
      const result = await window.notesDesktop.assets!.choose(imageOnly);
      if (result.ok) insertAssets(result.assets,expected); else if (!result.canceled) setMessage(result.error);
    } catch (error) { setMessage(String(error)); } finally { setImporting(false); }
  };
  const importFiles = async (files: File[], imageOnly: boolean) => {
    const expected = viewRef.current;
    setImporting(true); setMessage("");
    try {
      await beforeResourceChange?.();
      if (files.length > 20) throw new Error("Import up to 20 files at a time");
      const imported: Asset[] = [];
      for (const file of files) {
        if (file.size > (imageOnly ? MAX_IMAGE_BYTES : MAX_ASSET_BYTES)) throw new Error("File too large (images: 20 MB; attachments: 100 MB)");
        const base64 = await new Promise<string>((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Could not read file")); reader.readAsDataURL(file);
        });
        const result = await window.notesDesktop.assets!.import(file.name || "Screenshot.png",base64,imageOnly);
        if (!result.ok) { if(result.canceled)continue;throw new Error(result.error); }
        imported.push(result.asset);
      }
      insertAssets(imported,expected);
    } catch (error) { setMessage(String(error)); } finally { setImporting(false); }
  };
  const command = (value: Command) => {
    if (viewRef.current) setMessage(runCommand(viewRef.current, value) ?? "");
  };
  const panel = (kind: PanelKind) => {
    if (!viewRef.current) return;
    if (kind === "keyboard" && !viewRef.current.state.selection.main.empty) { command("kbd"); return; }
    try { setDraft(openDraft(viewRef.current, kind)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "This panel could not be opened."); }
  };
  const closePanel = () => { setDraft(null); requestAnimationFrame(() => viewRef.current?.focus()); };

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage }),
          Prec.highest(keymap.of([
            { key: "Mod-z", run: () => { command("undo"); return true; } },
            { key: "Mod-Shift-z", run: () => { command("redo"); return true; } },
            { key: "Mod-b", run: () => { command("bold"); return true; } },
            { key: "Mod-i", run: () => { command("italic"); return true; } },
            { key: "Mod-k", run: () => { panel("link"); return true; }, preventDefault: true, stopPropagation: true }
          ])),
          keymap.of([indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Note content", spellcheck: "false", translate: "no" }),
          placeholder("Start writing here…"),
          themeCompartmentRef.current.of(editorTheme(theme)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) setRevision(value => value + 1);
          })
        ]
      })
    });
    viewRef.current = view;
    setEditorView(view);
    return () => { viewRef.current = null; view.destroy(); };
    // The editor belongs to one note. External value/theme changes are handled
    // by the focused effects below without recreating selection or undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartmentRef.current.reconfigure(editorTheme(theme)) });
  }, [theme]);

  useEffect(() => { if (visible) viewRef.current?.requestMeasure(); else { setDraft(null); setImageSettings(null); setResourcesOpen(false); setCitationsOpen(false); setMessage(""); } }, [visible]);

  return <div className="markdown-workspace" hidden={!visible}
    onPasteCapture={event => {
      if (!window.notesDesktop?.assets || !event.clipboardData.files.length) return;
      const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault(); event.stopPropagation(); if (!importing) void importFiles(files,true);
    }}
    onDragOver={event => { if (window.notesDesktop?.assets && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDropCapture={event => {
      if (!window.notesDesktop?.assets || !event.dataTransfer.files.length) return;
      event.preventDefault(); event.stopPropagation(); if (!importing) void importFiles(Array.from(event.dataTransfer.files),false);
    }}>
    {visible && window.notesDesktop?.assets && <div className="asset-toolbar" aria-label="Attachments">
      <button disabled={importing} onClick={() => void chooseAssets(true)}>Insert image</button>
      <button disabled={importing} onClick={()=>{const view=viewRef.current;if(view)setImageSettings({source:view.state.doc.toString(),cursor:view.state.selection.main.head});}}>Image settings</button>
      <button disabled={importing} onClick={() => void chooseAssets(false)}>Attach file</button>
      <button disabled={importing} onClick={() => setResourcesOpen(true)}>Resources</button>
      {bibliographyBook&&<button disabled={importing} onClick={()=>setCitationsOpen(true)}>Citations</button>}
      <span>{importing ? "Importing…" : "Drop files or paste a screenshot into the editor"}</span>
    </div>}
    {visible && <FormattingToolbar view={editorView} revision={revision} onCommand={command} onPanel={panel} />}
    {message && <div className="format-notice" role="status"><span>{message}</span><button type="button" aria-label="Dismiss formatting notice" onClick={() => setMessage("")}>×</button></div>}
    <div className="content-input markdown-editor" ref={hostRef} />
    {visible && resourcesOpen && <AssetPanel onResourcesChanged={onResourcesChanged} notes={resourceNotes} books={resourceBooks} beforeChange={beforeResourceChange} onInsert={asset => insertAssets([asset])} onClose={() => setResourcesOpen(false)} />}
    {visible&&citationsOpen&&bibliographyBook&&onBibliographyBookChange&&<BibliographyPanel book={bibliographyBook} notes={resourceNotes} beforeChange={beforeResourceChange} onBookChange={onBibliographyBookChange} onClose={()=>setCitationsOpen(false)} onInsert={text=>{const view=viewRef.current;if(!view)return;const range=view.state.selection.main;view.dispatch({changes:{from:range.from,to:range.to,insert:text},selection:{anchor:range.from+text.length}});view.focus();}}/>}
    {visible && imageSettings && <ImageSettingsDialog source={imageSettings.source} cursor={imageSettings.cursor} onClose={()=>setImageSettings(null)} onApply={(image,replacement)=>{
      const view=viewRef.current;if(!view||view.state.doc.toString()!==imageSettings.source)return "The source changed. Reopen Image settings.";
      const before=imageSettings.source.slice(0,image.from),after=imageSettings.source.slice(image.to);
      const insert=(before&&!before.endsWith("\n\n")?"\n\n":"")+replacement+(after&&!after.startsWith("\n\n")?"\n\n":"");
      view.dispatch({changes:{from:image.from,to:image.to,insert}});setImageSettings(null);view.focus();
    }}/>}
    {visible && draft && <MarkdownInsertDialog initial={draft} onClose={closePanel} onApply={(next, remove) => {
      if (!viewRef.current) return "The editor is closed.";
      const error = applyDraft(viewRef.current, next, remove);
      if (!error) closePanel();
      return error;
    }} />}
  </div>;
}
