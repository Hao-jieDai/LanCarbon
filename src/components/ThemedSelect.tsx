import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface SelectOption { value: string; label: string; disabled?: boolean }
interface Props {
  label: string; value: string; options: SelectOption[]; onChange(value: string): void;
  placeholder?: string; editable?: boolean; action?: boolean; disabled?: boolean; className?: string; title?: string;
}

/** Application-owned popup, including inside native dialogs. No OS select UI. */
export function ThemedSelect({ label, value, options, onChange, placeholder, editable = false, action = false, disabled, className = "", title }: Props) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [filter, setFilter] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 160, maxHeight: 260 });
  const typeahead = useRef({ text: "", time: 0 });
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const available = editable && filter ? options.filter(option => option.label.toLowerCase().includes(filter.toLowerCase())) : options;
  const show = (last = false) => {
    if (disabled) return;
    setFilter("");
    const selected = options.findIndex(option => option.value === value && !option.disabled);
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    setActive(last ? enabled[enabled.length - 1] ?? -1 : selected >= 0 ? selected : enabled[0] ?? -1);
    setOpen(true);
    document.dispatchEvent(new CustomEvent("lancarbon-dropdown-open", { detail: id }));
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    const another = (event: Event) => { if ((event as CustomEvent).detail !== id) setOpen(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("lancarbon-dropdown-open", another);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("lancarbon-dropdown-open", another); };
  }, [id]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = host.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 176), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
      const limit = action ? 360 : 280;
      const height = Math.min(limit, (available.length || 1) * 35 + 10), up = below < height && above > below;
      const maxHeight = Math.max(50, Math.min(limit, up ? above : below));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: up ? Math.max(8, rect.top - Math.min(height, maxHeight) - 6) : rect.bottom + 6, width, maxHeight });
    };
    place();
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
    window.addEventListener("resize", place); document.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", scroll, true); };
  }, [open, available.length, action]);
  useEffect(() => { if (open) popup.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" }); }, [open, active]);
  const choose = (index: number) => { const option = available[index]; if (!option || option.disabled) return; setOpen(false); setFilter(""); onChange(option.value); };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Enter" || (!editable && event.key === " ")) {
      event.preventDefault(); event.stopPropagation(); if (!open) show(); else if (active >= 0) choose(active); else setOpen(false); return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && (!editable || open || event.key.startsWith("Arrow"))) {
      event.preventDefault(); event.stopPropagation();
      if (!open) { show(event.key === "ArrowUp" || event.key === "End"); return; }
      const enabled = available.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
      if (!enabled.length) return;
      const current = enabled.indexOf(active);
      const index = current < 0 && event.key === "ArrowUp" ? 0 : current;
      setActive(event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1] : enabled[(index + (event.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length]);
    } else if (!editable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); const now = Date.now();
      const text = (now - typeahead.current.time < 700 ? typeahead.current.text : "") + event.key.toLowerCase(); typeahead.current = { text, time: now };
      if (!open) show(); setActive(options.findIndex(option => !option.disabled && option.label.toLowerCase().startsWith(text)));
    }
  };
  const aria = { "aria-label": label, "aria-expanded": open, "aria-controls": open ? id : undefined, "aria-haspopup": action ? "menu" as const : "listbox" as const, "aria-activedescendant": open && active >= 0 ? `${id}-${active}` : undefined };
  return <div ref={host} className={`themed-select ${editable ? "themed-select-editable" : ""} ${className}`} onBlur={event => { if (!host.current?.contains(event.relatedTarget as Node) && !popup.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>
    {editable ? <input spellCheck={false} autoCorrect="off" autoCapitalize="off" {...aria} role="combobox" aria-autocomplete="list" disabled={disabled} value={value} placeholder={placeholder} autoComplete="off" onFocus={() => show()} onClick={() => { if (!open) show(); }} onKeyDown={keyDown} onChange={event => { if (!open) show(); onChange(event.target.value); setFilter(event.target.value); setActive(-1); }} /> :
      <button {...aria} type="button" role={action ? undefined : "combobox"} disabled={disabled} className="themed-select-trigger" title={title ?? label} onKeyDown={keyDown} onClick={() => open ? setOpen(false) : show()}>
        <span>{options.find(option => option.value === value)?.label ?? placeholder ?? label}</span><span className="select-chevron" aria-hidden="true">⌄</span>
      </button>}
    {editable && <span className="select-chevron" aria-hidden="true">⌄</span>}
    {open && createPortal(<div ref={popup} id={id} role={action ? "menu" : "listbox"} aria-label={`${label} options`} className="themed-select-popup" style={position} onMouseDown={event => event.preventDefault()}>
      {available.map((option, index) => <div key={option.value} id={`${id}-${index}`} role={action ? "menuitem" : "option"} aria-selected={action ? undefined : option.value === value} aria-disabled={option.disabled || undefined} data-index={index} className={`themed-select-option ${index === active ? "is-active" : ""}`} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={event => { event.stopPropagation(); choose(index); }}>
        <span>{option.label}</span>{!action && option.value === value && <span aria-hidden="true">✓</span>}
      </div>)}
      {!available.length && <div className="select-empty">Use a custom language name.</div>}
    </div>, host.current?.closest("dialog") ?? document.body)}
  </div>;
}
