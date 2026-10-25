import type { ChatEvidence, QuantityCheck } from "../src/shared/grounding";
import { quantityCatalogue, renderQuantities, type SourceQuantity } from "./chat-quantities";

// Normalize PDF layout only. Never repair digits, punctuation, currency or scale.
const layout = (text: string) => text.replace(/(?<=[A-Za-z])[-\u00ad][^\S\r\n]*\r?\n[^\S\r\n]*(?=[A-Za-z])/gu, "").replace(/\u00ad/gu, "").replace(/\s+/gu, " ").trim();
export function calculationContext(evidence: ChatEvidence[]) {
  const quantities = quantityCatalogue(evidence);
  return {
    quantities,
    sources: evidence.map(hit => ({ label: hit.label, text: layout(hit.chunk.text), review: Boolean(hit.chunk.anchor.needsReview), values: quantities.filter(q => q.label === hit.label).map(q => { const prefix = hit.chunk.text.slice(0, q.start), normalized = layout(prefix); return { q, start: normalized.length + (normalized && /\s$/u.test(prefix) ? 1 : 0), text: layout(q.raw) }; }) })),
  };
}
type Context = ReturnType<typeof calculationContext>;
export function calculationInstructions(): string {
  return `Monetary calculation protocol v3. Direct restatements retain original source amounts, units and citations in ordinary prose. No numeric catalogue or amount IDs are used. For a necessary calculation, copy each operand's exact original amount text and its existing source citation label. Select operands from the full source, with comparable entity, scenario, period and price basis; prior answers are not evidence.\n` +
    `Use {{calc:{"op":"qty","a":{"source":"S1","quote":"EUR 27 million"},"unit":"亿"}}} for unit conversion; {{calc:{"op":"diff","a":{"source":"S1","quote":"EUR 27 million"},"b":{"source":"S2","quote":"EUR 18 million"},"unit":"million"}}} for a minus b; or {{calc:{"op":"pct","a":{"source":"S1","quote":"EUR 27 million"},"b":{"source":"S2","quote":"EUR 18 million"}}}} for (a-b)/a*100. These are syntax examples only, not evidence. UNIT is base, thousand, million, billion, trillion, 千, 万, 百万, 千万, 亿, 十亿 or 万亿. Use JSON strings; copy the original amount, not its translation or a nearby number.\n` +
    `The app matches the quoted amount uniquely within the cited source and calculates locally after this single answer. It retains the original amount alongside a successful calculation. Do not append another currency or unit, or put calculation syntax in code/LaTeX. If the source currency, scale or operand is ambiguous, simply retain original amounts with citations; do not invent them. No currency exchange or cross-study aggregation is supported. Calculation checks concern arithmetic only, not the correctness of a claim. Keep protocol details out of answer prose.`;
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));

export function renderCalculations(text: string, context: Context, partial = false): { text: string; check: QuantityCheck } {
  const issues: string[] = [], bindings: NonNullable<QuantityCheck["bindings"]> = [];
  let resolved = 0, count = 0;
  const issue = (message: string) => { if (issues.length < 12 && !issues.includes(message)) issues.push(message); };
  const code = [...text.matchAll(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*(?:`|$)/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length }));
  const evaluate = (payload: string) => {
    const originals: string[] = [];
    try {
      if (++count > 1000 || payload.length > 4000) throw Error("Too many or oversized calculations");
      const input: unknown = JSON.parse(payload);
      if (!object(input) || !keys(input, ["op", "a", "b", "unit"]) || !["qty", "diff", "pct"].includes(String(input.op))) throw Error("Invalid calculation format");
      const operand = (value: unknown): SourceQuantity | undefined => {
        if (!object(value) || !keys(value, ["source", "quote"]) || typeof value.source !== "string" || !/^S[1-9]\d{0,2}$/.test(value.source) || typeof value.quote !== "string" || !value.quote.trim() || value.quote.length > 160) throw Error("Invalid source quotation");
        const sources = context.sources.filter(s => s.label === value.source);
        if (sources.length !== 1 || sources[0].review) throw Error("Source quotation is unavailable or needs review");
        const source = sources[0], quote = layout(value.quote), start = source.text.indexOf(quote);
        if (start < 0) throw Error("Quoted amount does not match the cited source");
        // Keep verified original text even if its occurrence or unit is ambiguous.
        originals.push(`${quote} [${source.label}]`);
        if (source.text.indexOf(quote, start + 1) >= 0) return;
        const found = source.values.filter(v => v.start === start && v.text === quote);
        return found.length === 1 ? found[0].q : undefined;
      };
      const a = operand(input.a), b = input.op !== "qty" ? operand(input.b) : undefined;
      if (!a || (input.op !== "qty" && !b)) throw Error("The original amount has no unique, explicit currency and scale binding");
      if ((input.op === "qty" && input.b !== undefined) || (input.op === "pct" && input.unit !== undefined) || (input.op !== "pct" && (typeof input.unit !== "string" || !/^(base|thousand|million|billion|trillion|千|万|百万|千万|亿|十亿|万亿)$/.test(input.unit)))) throw Error("Invalid calculation unit or operands");
      // Only app-resolved offsets reach the legacy exact arithmetic engine.
      const token = `{{${input.op}:${a.id}${b ? ":" + b.id : ""}${input.op === "pct" ? "" : "|" + input.unit}}}`;
      const result = renderQuantities(token, context.quantities, false, 2);
      if (result.check.status !== "checked") throw Error(result.check.issues[0] ?? "Calculation unavailable");
      resolved++;
      if (!partial) bindings.push(...(result.check.bindings ?? []));
      const original = input.op === "qty" ? originals[0] : originals.join("; ");
      return `${original} (${result.text})`;
    } catch (error) {
      issue(`${(error as Error).message}. Original amounts are retained where matched; no calculated result was substituted.`);
      return [...new Set(originals)].join("; ");
    }
  };
  let output = "", cursor = 0;
  const markers = /\{\{calc:/g;
  for (const match of text.matchAll(markers)) {
    const start = match.index!;
    if (start < cursor || code.some(c => start >= c.start && start < c.end)) continue;
    output += text.slice(cursor, start);
    const body = start + match[0].length;
    let depth = 0, quoted = false, escape = false, end = -1;
    for (let i = body; i < Math.min(text.length, body + 4001); i++) {
      const char = text[i];
      if (quoted) { if (escape) escape = false; else if (char === "\\") escape = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth <= 0) { end = i + 1; break; }
    }
    if (end >= 0 && text.slice(end, end + 2) === "}}") {
      output += evaluate(text.slice(body, end)); cursor = end + 2;
    } else {
      const close = text.indexOf("}}", body);
      cursor = close >= 0 ? close + 2 : text.length;
      if (!partial) issue("Incomplete or invalid calculation syntax; no calculated result was inserted.");
    }
  }
  output += text.slice(cursor);
  if (partial) output = output.replace(/\{(?:\{(?:c(?:a(?:l(?:c)?)?)?)?)?$/u, "");
  else output = output.replace(/\{\{c(?:a(?:l(?:c)?)?)?$/u, () => { issue("Incomplete calculation syntax; no calculated result was inserted."); return ""; });
  return { text: output, check: { version: 1, resolved, status: issues.length ? "needs-review" : resolved ? "checked" : "not-checked", issues, ...(bindings.length ? { bindings } : {}) } };
}
