import { mapCitations, type ChatEvidence } from "../src/shared/grounding";
import { monetaryBlocks, monetaryLabels, tableCells, type ClaimBlock } from "./chat-claims";
interface Amount { raw: string; start: number; values: number[]; factor: number; currency: string; digits: string[]; chineseHeader?: boolean }
const factors: Record<string, number> = { trillion: 1e12, billion: 1e9, million: 1e6, 万亿: 1e12, 千亿: 1e11, 百亿: 1e10, 亿: 1e8, 百万: 1e6, 万: 1e4 };
function amounts(text: string): Amount[] {
  // Numeric-only inline math is formatting, not a different amount. Keep offsets and
  // original delimiters so a repair changes digits only, including copied/exported LaTeX.
  const readable = text.replace(/(?<!\\)\$([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\$/gu, (_match, digits: string) => ` ${digits} `);
  const expression = /(?:(CNY|RMB|USD|US\\?\$)\s*)?([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:to|[-–—~～至])\s*(?:CNY|RMB|USD|US\\?\$)?\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?))?\s*(trillion|billion|million|万亿|千亿|百亿|百万|亿|万)\s*(CNY|RMB|USD|US\\?\$|美元|人民币|元(?:人民币)?|dollars)?/giu;
  return [...readable.matchAll(expression)].flatMap(match => {
    const currencyText = ((match[1] ?? "") + (match[5] ?? "")).replaceAll("\\", ""), currency = /CNY|RMB|人民币|^元$/iu.test(currencyText) ? "CNY" : /USD|US\$|美元|dollars/iu.test(currencyText) ? "USD" : "";
    return currency ? [{ raw: text.slice(match.index!, match.index! + match[0].length), start: match.index!, values: [match[2], ...(match[3] ? [match[3]] : [])].map(s => Number(s.replace(/,/g, "").replace("−", "-"))), digits: [match[2], ...(match[3] ? [match[3]] : [])], factor: factors[match[4].toLowerCase()], currency }] : [];
  });
}

/** A numeric-only table cell may declare its monetary unit once in its column header. */
function blockAmounts(block: ClaimBlock): Amount[] {
  const result = amounts(block.text);
  if (!block.table) return result;
  const cells = tableCells(block.text);
  if (cells.length !== block.table.headers.length) return result;
  const trimmed = block.text.trim();
  let at = block.text.indexOf(trimmed) + (trimmed.startsWith("|") ? 1 : 0);
  for (const [i, cell] of cells.entries()) {
    const header = block.table.headers[i];
    const currency = /CNY|RMB|人民币|亿元|万元/iu.test(header) ? "CNY" : /USD|US\\?\$|美元/iu.test(header) ? "USD" : "";
    const unit = header.match(/trillion|billion|million|万亿|千亿|百亿|百万|亿|万/iu)?.[0].toLowerCase();
    const number = cell.match(/^\s*(?:\*\*|\$)?([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\*\*|\$)?\s*(?:\[S\d+\]\s*)*$/u);
    if (currency && unit && number) result.push({ raw: number[1], start: at + cell.indexOf(number[1]), values: [Number(number[1].replace(/,/g, "").replace("−", "-"))], factor: factors[unit], currency, digits: [number[1]], chineseHeader: /[亿万]/u.test(unit) });
    at += cell.length + 1;
  }
  return result.sort((a, b) => a.start - b.start);
}
/** Protect invented examples, not a paper's reported modelling assumptions or factual enumerations. */
function hypotheticalAt(paragraph: string, position: number): boolean {
  let hypothetical = false;
  const prefix = paragraph.slice(0, position);
  const events = /假设|假定|假如|如果|示例|例如(?=\s*(?:一[家位名座个项]|某[家个一]))|\bassum(?:e|ing)\b|\bsuppos(?:e|ing)\b|\bhypothetical\b|\bfor example\s*,?\s*(?:a|an|one)\b|(?:原文|报告|论文|研究|作者).{0,12}(?:显示|报告|估计|指出|发现)|(?:the study|the report|the paper|authors?)\s+(?:reports?|estimates?|finds?|shows?)/giu;
  for (const event of prefix.matchAll(events)) {
    const before = prefix.slice(Math.max(0, event.index! - 45), event.index!);
    const after = prefix.slice(event.index! + event[0].length);
    const reported = /(?:本文|论文|研究|模型|情景|作者|原文)(?:中|的)?(?:所)?\s*$|(?:model|study|paper|authors?)(?:\s+is)?\s*$/iu.test(before)
      || /(?:在|基于)[^。！？;\n]{0,35}$/u.test(before) && /^[^。！？;\n]{0,60}(?:下|条件下)[，,]?/u.test(after) && !/一[家位名座个项]|某[家个一]|假想|示例/u.test(before + after);
    if (/^(?:原文|报告|论文|研究|作者|the |authors?)/iu.test(event[0])) hypothetical = false;
    else if (/^(?:假[设定]|assuming)$/iu.test(event[0]) && reported) continue;
    else hypothetical = true;
  }
  return hypothetical;
}
/** Correct only an exact cited amount/range with an unambiguous scale. Never infer scenarios, FX or missing data. */
export function repairCitedUnits(text: string, evidence: ChatEvidence[]): { text: string; corrections: string[] } {
  const corrections: string[] = [];
  const normalized = mapCitations(text);
  const result = normalized.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    let output = part;
    for (const block of monetaryBlocks(part).reverse()) {
      const paragraph = block.text;
      for (const claim of blockAmounts(block).reverse()) {
        const suffix = paragraph.slice(claim.start + claim.raw.length).split(/[。！？\n]/u, 1)[0];
        if (!(claim.chineseHeader || /[亿万]/u.test(claim.raw)) || corrections.length >= 24 || hypotheticalAt(paragraph, claim.start) || /^[ \t]*[（(]\s*(?:假设|假定|示例|hypothetical)/iu.test(suffix)) continue;
        const labels = monetaryLabels(block, claim.start, claim.raw.length);
        if (block.table && !/\[S\d+\]/u.test(paragraph) && new Set(evidence.filter(hit => labels.has(hit.label)).map(hit => hit.source.id)).size !== 1) continue;
        // Low-confidence OCR is not an authoritative basis for silently changing a value.
        const originals = evidence.filter(hit => labels.has(hit.label) && (hit.chunk.anchor.method !== "ocr" || !hit.chunk.anchor.needsReview && (hit.chunk.anchor.confidence ?? 0) >= 80)).flatMap(hit => amounts(hit.chunk.text).map(amount => ({ ...amount, label: hit.label })));
        const compatible = originals.filter(item => item.currency === claim.currency && item.values.length === claim.values.length);
        if (compatible.some(item => item.values.every((value, i) => Math.abs(value * item.factor - claim.values[i] * claim.factor) <= Math.max(0.005 * claim.factor, Math.abs(value * item.factor) * 1e-8)))) continue;
        const matching = compatible.filter(item => item.values.every((value, i) => value === claim.values[i]));
        if (!matching.length || new Set(matching.map(item => item.factor)).size !== 1 || matching[0].factor === claim.factor) continue;
        const source = matching[0], ratio = source.factor / claim.factor;
        // Keep the reader's target unit; compute its number outside the language model.
        let replacement = claim.raw, offset = 0;
        for (const [i, digits] of claim.digits.entries()) { const start = replacement.indexOf(digits, offset); if (start < 0) break; const value = Number((claim.values[i] * ratio).toPrecision(12)).toString(); replacement = replacement.slice(0, start) + value + replacement.slice(start + digits.length); offset = start + value.length; }
        const at = block.start + claim.start;
        if (replacement !== claim.raw) { output = output.slice(0, at) + replacement + output.slice(at + claim.raw.length); corrections.push(`Unit corrected using [${source.label}]: ${claim.raw.trim()} → ${replacement.trim()}${claim.chineseHeader ? ` (table unit: ${claim.currency}, factor ${claim.factor})` : ""}.`); }
      }
    }
    return repairTableConversions(output, evidence, corrections);
  }).join("");
  return { text: result, corrections };
}

/** Symbolic USD -> CNY table columns use a fixed, unassigned e (CNY/USD).
 * Only compute from an exact cited original, never from another generated value alone. */
function repairTableConversions(text: string, evidence: ChatEvidence[], corrections: string[]): string {
  let output = text;
  for (const block of monetaryBlocks(text).reverse()) {
    if (!block.table || hypotheticalAt(block.text, block.text.length)) continue;
    const cells = tableCells(block.text), headers = block.table.headers;
    if (cells.length !== headers.length) continue;
    const target = headers.findIndex(header => /人民币|\bCNY\b|\bRMB\b/iu.test(header));
    if (target < 0 || !/亿元/u.test(cells[target])) continue;
    const sourceCells = blockAmounts(block).filter(amount => amount.currency === "USD");
    const coefficients = [...cells[target].matchAll(/([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:\\times\s*|\*\s*)?e\b/gu)];
    if (sourceCells.length !== coefficients.length || !sourceCells.length || sourceCells.some(amount => amount.values.length !== 1)) continue;
    const labels = monetaryLabels(block, 0, block.text.length);
    const hits = evidence.filter(hit => labels.has(hit.label) && (hit.chunk.anchor.method !== "ocr" || !hit.chunk.anchor.needsReview && (hit.chunk.anchor.confidence ?? 0) >= 80));
    if (!/\[S\d+\]/u.test(block.text) && new Set(hits.map(hit => hit.source.id)).size !== 1) continue;
    const originals = hits.flatMap(hit => amounts(hit.chunk.text));
    if (!sourceCells.every(amount => originals.some(original => original.currency === "USD" && original.values.length === 1 && Math.abs(original.values[0] * original.factor - amount.values[0] * amount.factor) < Math.max(1, Math.abs(amount.values[0] * amount.factor) * 1e-8)))) continue;
    let cell = cells[target];
    for (let i = coefficients.length - 1; i >= 0; i--) {
      const coefficient = coefficients[i], expected = Number((sourceCells[i].values[0] * sourceCells[i].factor / 1e8).toPrecision(12));
      const actual = Number(coefficient[1].replace(/,/g, "").replace("−", "-"));
      if (actual === expected || corrections.length >= 24) continue;
      cell = cell.slice(0, coefficient.index!) + coefficient[0].replace(coefficient[1], String(expected)) + cell.slice(coefficient.index! + coefficient[0].length);
      corrections.push(`Unit corrected using cited table original: ${coefficient[0]} → ${expected}e (亿元人民币; e CNY/USD).`);
    }
    if (cell === cells[target]) continue;
    // Locate this particular column even if two cells contain identical text.
    const trimmed = block.text.trim(), prefix = trimmed.startsWith("|") ? 1 : 0;
    const at = block.start + block.text.indexOf(trimmed) + prefix + cells.slice(0, target).reduce((size, value) => size + value.length + 1, 0);
    output = output.slice(0, at) + cell + output.slice(at + cells[target].length);
  }
  return output;
}
