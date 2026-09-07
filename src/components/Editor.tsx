import { useEffect, useState } from "react";
import { getStats, parseTags } from "../shared/notes";
import type { Note, Book, SaveState, Theme } from "../shared/types";
import { DeleteIcon, PinIcon } from "./Icons";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import type { PreviewDocument } from "../preview/mystPreview";

interface EditorProps {
  bibliographyBook?: Book;
  onBibliographyBookChange?(book:Book):void;
  resourceNotes?: Note[];
  resourceBooks?: Book[];
  onResourcesChanged?(workspace: import("../shared/types").WorkspaceFile): void;
  beforeResourceChange?(): Promise<void>;
  note: Note | null;
  saveState: SaveState;
  theme: Theme;
  viewMode: "edit" | "preview";
  onViewModeChange(mode: "edit" | "preview"): void;
  previewDocuments?: PreviewDocument[];
  previewNavigation?: { noteId: string; anchor: string; sequence: number } | null;
  onPreviewNavigate?(noteId: string, anchor: string): void;
  onPreviewNavigated?(): void;
  bookContext?: { isHome: boolean };
  booksAvailable?: boolean;
  onChange(patch: Partial<Pick<Note, "title" | "content" | "tags">>): void;
  onNew(): void;
  onPin(): void;
  onDelete(): void;
  onAddToBook?(): void;
  onRemoveFromBook?(): void;
  onPageProperties?(): void;
  onOpenSidebar(): void;
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" });
}

const statusCopy: Record<SaveState, string> = {
  saved: "All changes saved",
  saving: "Saving…",
  error: "Save failed — edit again to retry"
};

export function Editor(props: EditorProps) {
  const stats = getStats(props.note?.content ?? "");
  const [tagsDraft, setTagsDraft] = useState("");
  const { viewMode, onViewModeChange: setViewMode } = props;

  useEffect(() => {
    setTagsDraft(props.note?.tags.join(", ") ?? "");
  }, [props.note?.id]);

  return (
    <section className="editor-panel">
      <header className="editor-toolbar">
        <button className="icon-button mobile-menu" aria-label="Open notes list" onClick={props.onOpenSidebar}>☰</button>
        <div className="editor-toolbar-left">
          <div className={`save-status ${props.saveState === "error" ? "error" : ""}`} role="status"><i className="status-dot" />{statusCopy[props.saveState]}</div>
          {props.note && <div className="view-mode-switch" aria-label="Editor view">
            <button aria-pressed={viewMode === "edit"} onClick={() => setViewMode("edit")}>Edit</button>
            <button aria-pressed={viewMode === "preview"} onClick={() => setViewMode("preview")}>Preview</button>
          </div>}
        </div>
        <div className="toolbar-actions">
          {props.onAddToBook && <button className="toolbar-text-button" disabled={!props.note || !props.booksAvailable} onClick={props.onAddToBook}>Add to Book</button>}
          {props.onPageProperties && <button className="toolbar-text-button" onClick={props.onPageProperties}>Page Properties</button>}
          {props.onRemoveFromBook && <button className="toolbar-text-button" disabled={props.bookContext?.isHome} onClick={props.onRemoveFromBook}>Remove from Book</button>}
          <button className={`icon-button ${props.note?.pinned ? "active" : ""}`} disabled={!props.note} aria-label={props.note?.pinned ? "Unpin note" : "Pin note"} title={props.note?.pinned ? "Unpin note" : "Pin note"} onClick={props.onPin}><PinIcon /></button>
          <button className="icon-button danger" disabled={!props.note} aria-label="Delete note" title="Delete note" onClick={props.onDelete}><DeleteIcon /></button>
        </div>
      </header>

      {props.note ? (
        <article className="editor" spellCheck={false}>
          <div className="date-line">{longDate(props.note.updatedAt)}</div>
          <input spellCheck={false} autoCorrect="off" autoCapitalize="off" className="title-input" aria-label="Note title" placeholder="Untitled Note" maxLength={120} value={props.note.title} onChange={event => props.onChange({ title: event.target.value })} />
          <div className="accent-line" />
          <MarkdownEditor bibliographyBook={props.bibliographyBook} onBibliographyBookChange={props.onBibliographyBookChange} onResourcesChanged={props.onResourcesChanged} key={props.note.id} resourceNotes={props.resourceNotes} resourceBooks={props.resourceBooks} beforeResourceChange={props.beforeResourceChange} value={props.note.content} theme={props.theme} visible={viewMode === "edit"} onChange={content => props.onChange({ content })} />
          <MarkdownPreview content={props.note.content} visible={viewMode === "preview"} document={props.previewDocuments?.find(doc => doc.id === props.note?.id)} documents={props.previewDocuments} navigation={props.previewNavigation} onNavigate={props.onPreviewNavigate} onNavigated={props.onPreviewNavigated} />
          <div className="tag-area"><span className="tag-prefix">#</span><input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Tags" placeholder="Add tags, separated by commas" value={tagsDraft} onChange={event => { setTagsDraft(event.target.value); props.onChange({ tags: parseTags(event.target.value) }); }} /></div>
        </article>
      ) : (
        <div className="empty-editor">
          <div className="empty-illustration" aria-hidden="true">✦</div><h2>Capture the moment</h2><p>Select a note or create a new one to start writing.</p>
          <button className="new-note compact" onClick={props.onNew}>＋ New Note</button>
        </div>
      )}

      <footer className="editor-footer"><span>{stats.chars} chars · {stats.lines} lines</span><span>Autosave</span></footer>
    </section>
  );
}
