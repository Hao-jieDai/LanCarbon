import { mapCitations, type ChatEvidence } from "../src/shared/grounding";
interface Amount { raw: string; start: number; values: number[]; factor: number; currency: string; digits: string[] }
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
/** Bind each amount to its own sentence/table row and nearest citation group.
 * A citation after sentence punctuation still belongs to the preceding sentence. */
function claimLabels(paragraph: string, claim: Amount): Set<string> {
  let start = 0, end = paragraph.length;
  for (const boundary of paragraph.matchAll(/[。！？\n!?]|(?<!\d)\.|\.(?!\d)/gu)) {
    const at = boundary.index!;
    if (at < claim.start) start = at + 1;
    else if (at >= claim.start + claim.raw.length) {
      end = at + 1;
      const trailing = paragraph.slice(end).match(/^[ \t]*(?:\[S\d+\][ \t]*)+/u);
      if (trailing) end += trailing[0].length;
      break;
    }
  }
  const groups = [...paragraph.slice(start, end).matchAll(/\[S\d+\](?:[ \t,，]*\[S\d+\])*/gu)];
  const following = groups.find(group => start + group.index! >= claim.start + claim.raw.length);
  const group = following ?? groups.at(-1);
  return new Set(group ? [...group[0].matchAll(/\[(S\d+)\]/gu)].map(match => match[1]) : []);
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
    return part.split(/(\n\s*\n)/u).map(paragraph => {
      let output = paragraph;
      for (const claim of amounts(paragraph).reverse()) {
        const suffix = paragraph.slice(claim.start + claim.raw.length).split(/[。！？\n]/u, 1)[0];
        if (!/[亿万]/u.test(claim.raw) || corrections.length >= 12 || hypotheticalAt(paragraph, claim.start) || /^[ \t]*[（(]\s*(?:假设|假定|示例|hypothetical)/iu.test(suffix)) continue;
        const labels = claimLabels(paragraph, claim);
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
        if (replacement !== claim.raw) { output = output.slice(0, claim.start) + replacement + output.slice(claim.start + claim.raw.length); corrections.push(`Unit corrected using [${source.label}]: ${claim.raw.trim()} → ${replacement.trim()}.`); }
      }
      return output;
    }).join("");
  }).join("");
  return { text: result, corrections };
}
