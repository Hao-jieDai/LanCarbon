import katex from "katex";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { admonitionOptions, directiveOptions, emptyTable, isDirectiveKind, type AdmonitionKind, type PanelDraft, type PanelKind, type TableData } from "../editor/markdownTools";
import { ThemedSelect } from "./ThemedSelect";

interface Props { initial: PanelDraft; onApply(draft: PanelDraft, removeLink?: boolean): string | null; onClose(): void }
const names = { link: "Link", code: "Code block", table: "Table", math: "Math", abbr: "Abbreviation", keyboard: "Keyboard", ...Object.fromEntries(directiveOptions.map(option => [option.value, option.label])) } as Record<PanelKind, string>;
const templates: [string, string, string][] = [
  ["Fraction", "\\frac{a}{b}", "a"], ["Root", "\\sqrt{x}", "x"], ["Superscript", "x^{2}", "2"], ["Subscript", "x_{i}", "i"], ["Scripts", "x_{i}^{2}", "i"],
  ["Sum", "\\sum_{i=1}^{n} x_i", "n"], ["Integral", "\\int_{a}^{b} f(x)\\,dx", "a"], ["Brackets", "\\left( x \\right)", "x"],
  ["Aligned equations", "\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}", "a"],
  ["α", "\\alpha ", ""], ["β", "\\beta ", ""], ["γ", "\\gamma ", ""], ["Δ", "\\Delta ", ""], ["θ", "\\theta ", ""], ["π", "\\pi ", ""],
  ["≤", "\\leq ", ""], ["≥", "\\geq ", ""], ["≠", "\\neq ", ""], ["×", "\\times ", ""], ["∞", "\\infty ", ""]
];

function TableEditor({ value, onChange }: { value: TableData; onChange(value: TableData): void }) {
  const [active, setActive] = useState({ row: 1, column: 0 });
  const columns = value.align.length, dataRows = value.rows.length - 1;
  const resize = (newColumns: number, newRows: number) => {
    const next = emptyTable(newColumns, newRows);
    next.rows = next.rows.map((row, r) => row.map((_cell, c) => value.rows[r]?.[c] ?? ""));
    next.align = next.align.map((_a, c) => value.align[c] ?? "default");
    onChange(next); setActive({ row: Math.min(active.row, newRows), column: Math.min(active.column, newColumns - 1) });
  };
  const addRow = () => { const rows = value.rows.map(row => [...row]); rows.splice(active.row + 1, 0, Array(columns).fill("")); onChange({ ...value, rows }); setActive({ ...active, row: active.row + 1 }); };
  const addColumn = () => { const align = [...value.align]; align.splice(active.column + 1, 0, "default"); onChange({ align, rows: value.rows.map(row => { const cells = [...row]; cells.splice(active.column + 1, 0, ""); return cells; }) }); setActive({ ...active, column: active.column + 1 }); };
  return <>
    <div className="insert-field-row">
      <label>Columns<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Table columns" type="number" min="1" max="20" value={columns} onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= 20) resize(n, dataRows); }} /></label>
      <label>Data rows (excluding header)<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Table data rows" type="number" min="1" max="100" value={dataRows} onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= 100) resize(columns, n); }} /></label>
    </div>
    <p className="modal-help">Fill in the cells using plain text or Markdown. Tab / Shift+Tab moves between cells. Row and column actions use the selected cell. Changes are saved only after Apply.</p>
    <div className="table-draft-scroll"><table className="table-draft"><thead><tr><th scope="col">Alignment</th>{value.align.map((align, c) => <th key={c}><ThemedSelect label={`Column ${c + 1} alignment`} value={align} options={[{ value: "default", label: "Default" }, { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} onChange={next => onChange({ ...value, align: value.align.map((a, i) => i === c ? next as TableData["align"][number] : a) })} /></th>)}</tr></thead><tbody>{value.rows.map((row, r) => <tr key={r}><th scope="row">{r === 0 ? "Header" : r}</th>{row.map((cell, c) => <td key={c}><input spellCheck={false} autoCorrect="off" autoCapitalize="off" className={active.row === r && active.column === c ? "active-cell" : ""} aria-label={r === 0 ? `Header ${c + 1}` : `Row ${r}, column ${c + 1}`} value={cell} onFocus={() => setActive({ row: r, column: c })} onChange={event => onChange({ ...value, rows: value.rows.map((cells, i) => i === r ? cells.map((text, j) => j === c ? event.target.value : text) : cells) })} /></td>)}</tr>)}</tbody></table></div>
    <div className="insert-actions">
      <button type="button" disabled={dataRows >= 100} onClick={addRow}>Insert row below</button>
      <button type="button" disabled={active.row === 0 || dataRows <= 1} onClick={() => { onChange({ ...value, rows: value.rows.filter((_r, i) => i !== active.row) }); setActive({ ...active, row: Math.max(1, active.row - 1) }); }}>Delete row</button>
      <button type="button" disabled={columns >= 20} onClick={addColumn}>Insert column right</button>
      <button type="button" disabled={columns <= 1} onClick={() => { onChange({ rows: value.rows.map(row => row.filter((_c, i) => i !== active.column)), align: value.align.filter((_a, i) => i !== active.column) }); setActive({ ...active, column: Math.max(0, active.column - 1) }); }}>Delete column</button>
    </div>
  </>;
}

export function MarkdownInsertDialog({ initial, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [matrix, setMatrix] = useState({ rows: 2, columns: 2 });
  const dialog = useRef<HTMLDialogElement>(null), formula = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ from: draft.text.length, to: draft.text.length });
  const titleId = useId();
  const patch = (next: Partial<PanelDraft>) => { setDraft(current => ({ ...current, ...next })); setError(""); };
  useEffect(() => {
    const element = dialog.current!;
    if (element.showModal) element.showModal(); else element.setAttribute("open", "");
    element.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    return () => { if (element.close) element.close(); };
  }, []);
  const preview = useMemo(() => {
    if (draft.kind !== "math" || !draft.text.trim()) return { html: "", error: "" };
    try { return { html: katex.renderToString(draft.text, { displayMode: draft.display, throwOnError: true, trust: false, strict: "error", maxExpand: 500, maxSize: 20, output: "htmlAndMathml" }), error: "" }; }
    catch (problem) { return { html: "", error: problem instanceof Error ? problem.message : "This formula could not be parsed." }; }
  }, [draft.kind, draft.text, draft.display]);
  const insertTemplate = (text: string, placeholder: string) => {
    const { from, to } = selection.current;
    const offset = placeholder ? text.indexOf(placeholder, text.startsWith("\\begin") ? text.indexOf("\n") : text.indexOf("{") + 1) : text.length;
    const start = from + Math.max(0, offset), end = start + placeholder.length;
    patch({ text: draft.text.slice(0, from) + text + draft.text.slice(to), display: draft.display || text.includes("\n") });
    selection.current = { from: start, to: end };
    requestAnimationFrame(() => { formula.current?.focus(); formula.current?.setSelectionRange(start, end); });
  };
  const apply = (removeLink = false) => {
    if (draft.kind === "math" && preview.error) { setError("Please correct the formula using the preview message before applying."); return; }
    const message = onApply(draft, removeLink); if (message) setError(message);
  };
  return createPortal(<dialog className={`insert-dialog ${draft.kind === "table" || draft.kind === "math" ? "insert-dialog-wide" : ""}`} ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
    if (event.key === "Tab") {
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? []);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    }
  }}>
    <form className="insert-form" spellCheck={false} onSubmit={event => { event.preventDefault(); apply(); }}>
      <header><div><p className="insert-eyebrow">{initial.existing ? "Edit content" : "Insert content"}</p><h2 id={titleId}>{names[draft.kind]}</h2></div><button type="button" className="insert-close" aria-label="Close panel" title="Cancel · Esc" onClick={onClose}>×</button></header>
      {draft.kind === "table" && <TableEditor value={draft.table} onChange={table => patch({ table })} />}
      {draft.kind === "link" && <>
        <label>Link text<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Link text" value={draft.text} onChange={event => patch({ text: event.target.value })} /></label>
        <label>URL<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Link URL" placeholder="https://example.com" value={draft.url} onChange={event => patch({ url: event.target.value })} /></label>
        <p className="modal-help">Links are saved in your note. External navigation remains disabled in local preview.</p>
      </>}
      {draft.kind === "code" && <label>Code language<ThemedSelect editable label="Code language" placeholder="Plain text, or enter a language" value={draft.language} options={[{ value: "", label: "Plain text" }, ...["python", "javascript", "typescript", "json", "html", "css", "bash", "sql", "yaml", "r", "cpp", "java"].map(value => ({ value, label: value }))]} onChange={language => patch({ language })} /></label>}
      {draft.kind === "abbr" && <>
        <label>Abbreviation<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Abbreviation text" placeholder="IPCC" value={draft.text} onChange={event => patch({ text: event.target.value })} /></label>
        <label>Full meaning<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Full meaning" placeholder="Intergovernmental Panel on Climate Change" value={draft.explanation} onChange={event => patch({ explanation: event.target.value })} /></label>
        <p className="modal-help">The abbreviation appears in your note. Hover over it in Preview to see its full meaning.</p>
      </>}
      {draft.kind === "keyboard" && <>
        <label>Keyboard shortcut<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Keyboard shortcut" placeholder="Ctrl+F" value={draft.text} onChange={event => patch({ text: event.target.value })} /></label>
        <p className="modal-help">Displays a key combination in the note. It does not assign or run a shortcut.</p>
      </>}
      {isDirectiveKind(draft.kind) && <>
        {draft.kind === "nested" && <label>Outer block type<ThemedSelect label="Outer block type" value={draft.outerKind} options={[...admonitionOptions]} onChange={value => patch({ outerKind: value as AdmonitionKind })} /></label>}
        <label>{draft.kind === "nested" ? "Outer title" : "Title"}{["note", "tip", "important", "warning", "caution"].includes(draft.kind) || (draft.kind === "nested" && draft.outerKind !== "admonition") ? " (optional)" : ""}<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label={draft.kind === "dropdown" ? "Dropdown title" : "Block title"} value={draft.title} onChange={event => patch({ title: event.target.value })} /></label>
        {draft.kind === "initiallyOpen" && <p className="modal-help">This block starts expanded. Readers can click its title to collapse it.</p>}
        {draft.kind === "dropdown" && <p className="modal-help">This block starts collapsed. Readers can click its title to expand it.</p>}
      </>}
      {draft.kind === "math" && <>
        <label>Display mode<ThemedSelect label="Math display" value={draft.display ? "block" : "inline"} options={[{ value: "inline", label: "Inline" }, { value: "block", label: "Display" }]} onChange={value => patch({ display: value === "block" })} /></label>
        <div className="formula-templates" aria-label="Math templates">{templates.map(([name, value, placeholder]) => <button type="button" key={name} title={`Insert ${name}`} onClick={() => insertTemplate(value, placeholder)}>{name}</button>)}</div>
        <div className="matrix-tools"><span>Matrix</span><label>Rows<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Matrix rows" type="number" min="1" max="10" value={matrix.rows} onChange={event => setMatrix({ ...matrix, rows: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} /></label><label>Columns<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Matrix columns" type="number" min="1" max="10" value={matrix.columns} onChange={event => setMatrix({ ...matrix, columns: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} /></label><button type="button" onClick={() => insertTemplate(`\\begin{bmatrix}\n${Array.from({ length: matrix.rows }, () => Array(matrix.columns).fill("0").join(" & ")).join(" \\\\\n")}\n\\end{bmatrix}`, "0")}>Insert matrix</button></div>
        <label>Formula<textarea spellCheck={false} autoCorrect="off" autoCapitalize="off" ref={formula} aria-label="Formula" className="source-field" rows={4} placeholder="For example, E=mc^2, or choose a template above" value={draft.text} onSelect={event => { selection.current = { from: event.currentTarget.selectionStart, to: event.currentTarget.selectionEnd }; }} onChange={event => patch({ text: event.target.value })} /></label>
        <p className="modal-help">Enter the formula without surrounding dollar signs. Templates select the part to replace.</p>
        <div className="formula-preview" aria-label="Math preview">{preview.html ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p>{preview.error ? "Check the message below to preview this formula." : "Your formula preview appears here"}</p>}</div>
        {preview.error && <p className="insert-error" role="status">{preview.error}</p>}
      </>}
      {(draft.kind === "code" || isDirectiveKind(draft.kind)) && <label>{draft.kind === "code" ? "Code content" : draft.kind === "nested" ? "Outer content" : "Content"}<textarea spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label={draft.kind === "code" ? "Code content" : "Block content"} className={draft.kind === "code" ? "source-field" : ""} rows={draft.kind === "nested" ? 3 : 7} value={draft.text} onChange={event => patch({ text: event.target.value })} /></label>}
      {draft.kind === "nested" && <fieldset className="nested-block-fields"><legend>Inner block</legend>
        <label>Inner block type<ThemedSelect label="Inner block type" value={draft.innerKind} options={[...admonitionOptions]} onChange={value => patch({ innerKind: value as AdmonitionKind })} /></label>
        <label>Inner title{draft.innerKind !== "admonition" ? " (optional)" : ""}<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Inner title" value={draft.innerTitle} onChange={event => patch({ innerTitle: event.target.value })} /></label>
        <label>Inner content<textarea spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Inner content" rows={3} value={draft.innerText} onChange={event => patch({ innerText: event.target.value })} /></label>
      </fieldset>}
      {error && <p className="insert-error" role="alert">{error}</p>}
      <footer>{draft.kind === "link" && draft.existing && <button type="button" className="insert-remove" onClick={() => apply(true)}>Remove link</button>}<button type="button" onClick={onClose}>Cancel</button><button type="submit" className="insert-primary">Apply</button></footer>
    </form>
  </dialog>, document.body);
}
