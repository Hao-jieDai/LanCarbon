import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Book, Note } from "../shared/types";

interface BookTreeProps {
  book: Book;
  notes: Note[];
  activePageId: string | null;
  onSelect(pageId: string): void;
  onMove(pageId: string, targetId: string, placement: "before" | "inside" | "after"): void;
}

type Placement = "before" | "inside" | "after";
interface PointerDrag { pageId: string; pointerId: number; startX: number; startY: number; started: boolean; }

export function BookTree({ book, notes, activePageId, onSelect, onMove }: BookTreeProps) {
  // A different Book gets its own persisted view, including when a caller reuses this component.
  return <BookContents key={book.id} book={book} notes={notes} activePageId={activePageId} onSelect={onSelect} onMove={onMove} />;
}

function BookContents({ book, notes, activePageId, onSelect, onMove }: BookTreeProps) {
  const foldKey = `lancarbon-book-folds-v1:${book.id}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(foldKey) ?? "[]");
      return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && Boolean(book.pages[id]?.children.length)) : []);
    } catch { return new Set(); }
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ pageId: string; placement: Placement } | null>(null);
  const pointerDrag = useRef<PointerDrag | null>(null);
  const dropHintRef = useRef<typeof dropHint>(null);
  const suppressClick = useRef(false);
  const treeRef = useRef<HTMLUListElement>(null);
  const noteById = new Map(notes.map(note => [note.id, note]));

  useEffect(() => {
    const parents = new Map(Object.values(book.pages).flatMap(page => page.children.map(child => [child, page.id] as const)));
    const ancestors = new Set<string>();
    let parent = activePageId ? parents.get(activePageId) : undefined;
    while (parent && !ancestors.has(parent)) { ancestors.add(parent); parent = parents.get(parent); }
    setCollapsed(previous => {
      const next = new Set([...previous].filter(id => book.pages[id]?.children.length && !ancestors.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [activePageId, book.pages]);

  useEffect(() => {
    try { localStorage.setItem(foldKey, JSON.stringify([...collapsed])); } catch { /* optional view preference */ }
  }, [foldKey, collapsed]);

  const toggleBranch = (pageId: string) => {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(pageId)) next.delete(pageId); else next.add(pageId);
      return next;
    });
  };

  useEffect(() => {
    const clearDrag = () => {
      pointerDrag.current = null;
      dropHintRef.current = null;
      setDraggedId(null);
      setDropHint(null);
      document.body.classList.remove("book-dragging");
    };
    const handleMove = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        drag.started = true;
        suppressClick.current = true;
        setDraggedId(drag.pageId);
        document.body.classList.add("book-dragging");
      }
      event.preventDefault();
      const list = treeRef.current?.closest<HTMLElement>(".note-list");
      if (list) {
        const bounds = list.getBoundingClientRect();
        if (event.clientY < bounds.top + 28) list.scrollBy?.({ top: -18 });
        else if (event.clientY > bounds.bottom - 28) list.scrollBy?.({ top: 18 });
      }
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const item = element?.closest<HTMLElement>("[data-book-page-id]");
      const targetId = item?.dataset.bookPageId;
      if (!targetId || targetId === drag.pageId) {
        dropHintRef.current = null;
        setDropHint(null);
        return;
      }
      const row = item.querySelector<HTMLElement>(".book-page-row");
      if (!row) return;
      const bounds = row.getBoundingClientRect();
      const relativeY = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5;
      const placement: Placement = relativeY < 0.28 ? "before" : relativeY > 0.72 ? "after" : "inside";
      const hint = { pageId: targetId, placement };
      dropHintRef.current = hint;
      setDropHint(hint);
    };
    const handleEnd = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const target = dropHintRef.current;
      if (drag.started && target) onMove(drag.pageId, target.pageId, target.placement);
      clearDrag();
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      document.body.classList.remove("book-dragging");
    };
  }, [onMove]);

  const startDrag = (event: ReactPointerEvent, pageId: string) => {
    if (pageId === book.homePageId || event.button !== 0) return;
    pointerDrag.current = { pageId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, started: false };
  };
  const selectPage = (pageId: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onSelect(pageId);
  };
  const renderPage = (pageId: string, depth: number) => {
    const page = book.pages[pageId];
    if (!page) return null;
    const note = noteById.get(page.noteId);
    const title = note?.title.trim() || "Untitled Page";
    const expanded = !collapsed.has(pageId);
    const placement = dropHint?.pageId === pageId ? dropHint.placement : null;
    return <li key={pageId} className={`book-tree-item ${draggedId === pageId ? "dragging" : ""}`} data-book-page-id={pageId}>
      <div className={`tree-drop-indicator ${placement === "before" ? "active" : ""}`} data-drop-position="before" />
      <div className={`book-tree-row ${activePageId === pageId ? "active" : ""} ${placement === "inside" ? "drop-inside" : ""}`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
        {page.children.length ? <button className="book-fold-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`} aria-expanded={expanded} onClick={() => toggleBranch(pageId)}>{expanded ? "▾" : "▸"}</button> : <span className="book-leaf-mark" aria-hidden="true">·</span>}
        <button className="book-page-row" onPointerDown={event => startDrag(event, pageId)} onClick={() => selectPage(pageId)} aria-current={activePageId === pageId ? "page" : undefined}>
          <span>{title}</span>{!page.showInToc && <small title="Hidden from the table of contents">Hidden</small>}
        </button>
      </div>
      <div className={`tree-drop-indicator ${placement === "after" ? "active" : ""}`} data-drop-position="after" />
      {page.children.length > 0 && expanded && <ul>{page.children.map(child => renderPage(child, depth + 1))}</ul>}
    </li>;
  };
  return <ul ref={treeRef} className="book-tree" aria-label="Book contents tree">{book.rootPageIds.map(id => renderPage(id, 0))}</ul>;
}
