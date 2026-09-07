import { redoDepth, undoDepth } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { directiveOptions, type Command, type PanelKind } from "../editor/markdownTools";
import { ThemedSelect, type SelectOption } from "./ThemedSelect";

interface Props { view: EditorView | null; revision: number; onCommand(command: Command): void; onPanel(kind: PanelKind): void }
const extraFormats: [Command, string, ReactNode][] = [["underline", "Underline", <u>U</u>], ["delete", "Strikethrough", <s>S</s>], ["sup", "Superscript", <span>x<sup>2</sup></span>], ["sub", "Subscript", <span>x<sub>2</sub></span>], ["separator", "Divider", "―"]];
const inlinePanels: [PanelKind, string][] = [["abbr", "Abbr"], ["keyboard", "Keyboard"]];

export function FormattingToolbar({ view, revision, onCommand, onPanel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let disposed = false;
    const measure = () => {
      if (disposed || !element.clientWidth) return;
      const style = getComputedStyle(element), gap = parseFloat(style.columnGap) || 0;
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const controls = [...element.querySelectorAll<HTMLElement>("[data-format-item]")];
      const widths = new Map(controls.map(control => [control.dataset.formatItem!, control.getBoundingClientRect().width + (parseFloat(getComputedStyle(control).marginLeft) || 0)]));
      const visible = new Set(widths.keys()); visible.delete("overflow");
      const total = () => [...visible].reduce((sum, id) => sum + widths.get(id)!, 0) + Math.max(0, visible.size - 1) * gap;
      const hidden: string[] = [];
      if (total() > available) {
        visible.add("overflow");
        // Remove individual controls, keeping the writing basics and Directives available.
        for (const id of ["keyboard", "abbr", "align", "separator", "redo", "undo", "code", "link", "quote", "lists", "sub", "sup", "delete", "underline"]) {
          if (total() <= available) break;
          visible.delete(id); hidden.push(id);
        }
        // Fill any remaining space with smaller controls that fit.
        for (const id of [...hidden].reverse()) {
          visible.add(id);
          if (total() <= available) hidden.splice(hidden.indexOf(id), 1);
          else visible.delete(id);
        }
      }
      setCollapsed(previous => previous.join() === hidden.join() ? previous : hidden);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll<HTMLElement>("[data-format-item]").forEach(control => observer.observe(control));
    measure();
    void document.fonts?.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
  }, []);
  const selection = view?.state.selection.main;
  const selectedLines = selection && view ? view.state.doc.sliceString(view.state.doc.lineAt(selection.from).from, view.state.doc.lineAt(selection.to > selection.from && view.state.doc.sliceString(selection.to - 1, selection.to) === "\n" ? selection.to - 1 : selection.to).to).split("\n") : [""];
  const headings = selectedLines.map(line => /^(?:\s*>\s*)*\s*(#{1,6})\s/.exec(line)?.[1].length ?? 0);
  const heading = headings.every(level => level === headings[0]) ? String(headings[0]) : "mixed";
  const active = (name: "StrongEmphasis" | "Emphasis" | "Blockquote"): boolean | "mixed" => {
    if (!view || !selection) return false;
    let covered = 0;
    syntaxTree(view.state).iterate({ from: selection.from, to: selection.to, enter(node) {
      if (node.name === name) {
        if (selection.empty && node.from < selection.from && node.to > selection.to) covered = 1;
        else covered += Math.max(0, Math.min(node.to, selection.to) - Math.max(node.from, selection.from));
      }
    } });
    return covered ? selection.empty || covered >= selection.to - selection.from ? true : "mixed" : false;
  };
  const button = (label: string, symbol: ReactNode, action: () => void, pressed?: boolean | "mixed", disabled = false, hint = label) => <button type="button" className="format-button" aria-label={label} aria-pressed={pressed} disabled={!view || disabled} title={hint} onMouseDown={event => event.preventDefault()} onClick={action}>{symbol}</button>;
  const dispatch = (value: string) => value.startsWith("panel:") ? onPanel(value.slice(6) as PanelKind) : onCommand(value as Command);
  const menu = (id: string, label: string, options: SelectOption[], placeholder?: string) => <ThemedSelect action label={label} value="" options={options} placeholder={placeholder} onChange={dispatch} disabled={!view || collapsed.includes(id) || (id === "overflow" && !collapsed.length)} />;
  const listOptions = [{ value: "bullet", label: "Bulleted list" }, { value: "ordered", label: "Numbered list" }, { value: "indent", label: "Increase indent" }, { value: "outdent", label: "Decrease indent" }];
  const codeOptions = [{ value: "inlineCode", label: "Inline code" }, { value: "panel:code", label: "Code block" }];
  const alignOptions = [{ value: "alignLeft", label: "Align left" }, { value: "alignCenter", label: "Align center" }, { value: "alignRight", label: "Align right" }];
  const item = (id: string, content: ReactNode, options: SelectOption[] = [], divider = false) => ({ id, content, options, divider });
  const commandItem = (id: Command, label: string, symbol: ReactNode, pressed?: boolean | "mixed", disabled = false, hint = label) => item(id, button(label, symbol, () => onCommand(id), pressed, disabled, hint), [{ value: id, label, disabled }]);
  const panelItem = (id: PanelKind, label: string) => item(id, button(label, label, () => onPanel(id)), [{ value: "panel:" + id, label }]);
  const items = [
    commandItem("undo", "Undo", "↶", undefined, !view || !undoDepth(view.state), "Undo · Ctrl+Z"),
    commandItem("redo", "Redo", "↷", undefined, !view || !redoDepth(view.state), "Redo · Ctrl+Shift+Z"),
    item("heading", <ThemedSelect className="format-heading" label="Paragraph style" value={heading} options={[{ value: "mixed", label: "Mixed", disabled: true }, { value: "0", label: "Paragraph" }, ...[1, 2, 3, 4, 5, 6].map(level => ({ value: String(level), label: "Heading " + level }))]} onChange={value => onCommand(("heading" + value) as Command)} title="Set the heading level of the current or selected lines" disabled={!view} />, [], true),
    { ...commandItem("bold", "Bold", <strong>B</strong>, active("StrongEmphasis"), false, "Bold · Ctrl+B · Click again to remove"), divider: true },
    commandItem("italic", "Italic", <em>I</em>, active("Emphasis"), false, "Italic · Ctrl+I · Click again to remove"),
    ...extraFormats.slice(0, 4).map(([id, label, symbol]) => commandItem(id, label, symbol)),
    item("align", menu("align", "Align", alignOptions), alignOptions),
    ...inlinePanels.map(([id, label]) => panelItem(id, label)),
    item("lists", menu("lists", "Lists", listOptions), listOptions, true),
    commandItem("quote", "Quote", "❞", active("Blockquote")),
    panelItem("link", "Link"),
    item("code", menu("code", "Code", codeOptions), codeOptions),
    { ...panelItem("table", "Table"), content: button("Table", "▦ Table", () => onPanel("table")), divider: true },
    { ...panelItem("math", "Math"), content: button("Math", "ƒ Math", () => onPanel("math")) },
    commandItem("separator", "Divider", "―"),
    item("directives", menu("directives", "Directives", directiveOptions.map(({ value, label }) => ({ value: "panel:" + value, label }))), [], true)
  ];
  const more = items.filter(control => collapsed.includes(control.id)).flatMap(control => control.options);
  items.push(item("overflow", menu("overflow", "More tools", more, "⋯")));
  return <div className="format-toolbar" role="group" aria-label="Formatting toolbar" ref={host} data-revision={revision} onKeyDown={event => { if (event.key === "Escape") { view?.focus(); event.stopPropagation(); } }}>
    {items.map(control => {
      const hidden = control.id === "overflow" ? !collapsed.length : collapsed.includes(control.id);
      return <span key={control.id} data-format-item={control.id} data-collapsed={hidden || undefined} aria-hidden={hidden || undefined} inert={hidden} className={"format-item" + (control.divider ? " format-item-divider" : "")}>{control.content}</span>;
    })}
  </div>;
}
