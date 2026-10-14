import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { localUsageDay } from "../shared/aiUsage";
import { ThemedSelect } from "./ThemedSelect";

const dateString = (date: Date) => date.toISOString().slice(0, 10);
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && dateString(date) === value;
}
export function monthCells(month: string): string[] {
  const first = new Date(month + "-01T12:00:00Z");
  first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setUTCDate(first.getUTCDate() + index); return dateString(date); });
}
interface Props { label: string; value: string; onChange(value: string): void; min?: string; max?: string; required?: boolean; disabled?: boolean }
export function DatePicker({ label, value, onChange, min = "1900-01-01", max = "9999-12-31", required = false, disabled = false }: Props) {
  const id = useId(), host = useRef<HTMLDivElement>(null), popup = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value);
  const [month, setMonth] = useState((value || localUsageDay()).slice(0, 7));
  const [focusDate, setFocusDate] = useState(value || localUsageDay());
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const allowed = (date: string) => validCalendarDate(date) && date >= min && date <= max;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => setFocusDate(current => current.slice(0, 7) === month ? current : month + "-01"), [month]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const close = (focus = false) => { setOpen(false); setDraft(value); if (focus) input.current?.focus(); };
  const show = () => {
    if (disabled) return;
    const date = allowed(value) ? value : localUsageDay() < min ? min : localUsageDay() > max ? max : localUsageDay();
    setMonth(date.slice(0, 7)); setFocusDate(date); setOpen(true);
    document.dispatchEvent(new CustomEvent("lancarbon-date-open", { detail: id }));
    document.dispatchEvent(new CustomEvent("lancarbon-dropdown-open", { detail: id }));
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    const another = (event: Event) => { if ((event as CustomEvent).detail !== id) setOpen(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("lancarbon-date-open", another);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("lancarbon-date-open", another); };
  }, [open, id]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => { const rect = host.current!.getBoundingClientRect(), height = popup.current?.getBoundingClientRect().height ?? 340; setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - 308)), top: Math.max(8, rect.bottom + height + 12 > innerHeight ? rect.top - height - 6 : rect.bottom + 6) }); };
    place(); const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
    window.addEventListener("resize", place); document.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", scroll, true); };
  }, [open, month]);
  const select = (date: string) => { if (!allowed(date)) return; onChange(date); setDraft(date); setOpen(false); input.current?.focus(); };
  const changeMonth = (offset: number) => { const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + offset); const next = dateString(date).slice(0, 7); if (next >= min.slice(0, 7) && next <= max.slice(0, 7)) setMonth(next); };
  const gridKey = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault(); const next = new Date(date + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + offset); const target = dateString(next);
    if (!allowed(target)) return;
    setMonth(target.slice(0, 7)); setFocusDate(target);
    requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus());
  };
  const calendarYear = Number(month.slice(0, 4)), years = [...new Set([calendarYear, ...Array.from({ length: 31 }, (_, index) => new Date().getFullYear() - 15 + index)])].filter(year => year >= Number(min.slice(0, 4)) && year <= Number(max.slice(0, 4))).sort((a, b) => a - b);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); } };
  return <div className="date-picker" ref={host} onKeyDown={keyDown}>
    <input ref={input} aria-label={label} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={draft} placeholder="YYYY-MM-DD" maxLength={10} disabled={disabled} aria-invalid={!!draft && !allowed(draft)} onChange={event => { const date = event.target.value; setDraft(date); if (allowed(date) || (!date && !required)) onChange(date); }} onBlur={() => { if (!allowed(draft) && (draft || required)) setDraft(value); }} onKeyDown={event => { if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); show(); } }}/>
    <button type="button" className="date-picker-toggle" aria-label={`Open ${label} calendar`} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => open ? close() : show()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg></button>
    {open && createPortal(<dialog open id={id} ref={popup} className="date-picker-popup" aria-label={`${label} calendar`} style={position} onKeyDown={keyDown}>
      <header><button type="button" className="icon-button" aria-label="Previous month" disabled={month <= min.slice(0, 7)} onClick={() => changeMonth(-1)}>‹</button>
        <ThemedSelect label={`${label} month`} value={month.slice(5)} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, "0"), label: new Date(Date.UTC(2026, index, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) }))} onChange={next => setMonth(month.slice(0, 4) + "-" + next)}/>
        <ThemedSelect label={`${label} year`} value={month.slice(0, 4)} options={years.map(year => ({ value: String(year), label: String(year) }))} onChange={next => setMonth(next + "-" + month.slice(5))}/>
        <button type="button" className="icon-button" aria-label="Next month" disabled={month >= max.slice(0, 7)} onClick={() => changeMonth(1)}>›</button></header>
      <div className="date-picker-weekdays">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(day => <span key={day}>{day}</span>)}</div>
      <div role="grid" aria-label="Calendar days" className="date-picker-days">{monthCells(month).map(date => <button type="button" role="gridcell" aria-label={date} aria-selected={date === value} aria-current={date === localUsageDay() ? "date" : undefined} data-date={date} key={date} disabled={!allowed(date)} tabIndex={date === focusDate ? 0 : -1} className={date.slice(0, 7) !== month ? "outside-month" : ""} onKeyDown={event => gridKey(event, date)} onClick={() => select(date)}>{Number(date.slice(8))}</button>)}</div>
      <footer>{!required && <button type="button" className="text-button" onClick={() => { onChange(""); setDraft(""); setOpen(false); input.current?.focus(); }}>Clear</button>}<button type="button" className="text-button" disabled={!allowed(localUsageDay())} onClick={() => select(localUsageDay())}>Today</button></footer>
    </dialog>, host.current?.closest("dialog") ?? document.body)}
  </div>;
}
