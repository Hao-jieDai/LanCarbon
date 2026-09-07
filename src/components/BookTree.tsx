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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ pageId: string; placement: Placement } | null>(null);
  const pointerDrag = useRef<PointerDrag | null>(null);
  const dropHintRef = useRef<typeof dropHint>(null);
  const suppressClick = useRef(false);
  const treeRef = useRef<HTMLUListElement>(null);
  const noteById = new Map(notes.map(note => [note.id, note]));

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
    const placement = dropHint?.pageId === pageId ? dropHint.placement : null;
    return <li key={pageId} className={`book-tree-item ${draggedId === pageId ? "dragging" : ""}`} data-book-page-id={pageId}>
      <div className={`tree-drop-indicator ${placement === "before" ? "active" : ""}`} data-drop-position="before" />
      <button className={`book-page-row ${activePageId === pageId ? "active" : ""} ${placement === "inside" ? "drop-inside" : ""}`} style={{ paddingLeft: `${12 + depth * 16}px` }} onPointerDown={event => startDrag(event, pageId)} onClick={() => selectPage(pageId)}>
        <span aria-hidden="true">{page.children.length ? "▾" : "·"}</span><span>{note?.title.trim() || "Untitled Page"}</span>{!page.showInToc && <small title="Hidden from the table of contents">Hidden</small>}
      </button>
      <div className={`tree-drop-indicator ${placement === "after" ? "active" : ""}`} data-drop-position="after" />
      {page.children.length > 0 && <ul>{page.children.map(child => renderPage(child, depth + 1))}</ul>}
    </li>;
  };
  return <ul ref={treeRef} className="book-tree" aria-label="Book contents tree">{book.rootPageIds.map(id => renderPage(id, 0))}</ul>;
}
