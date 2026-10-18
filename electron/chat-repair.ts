import { citedLabels, mapCitations, type ChatEvidence } from "../src/shared/grounding";
interface Amount { raw: string; start: number; values: number[]; factor: number; currency: string; digits: string[] }
const factors: Record<string, number> = { trillion: 1e12, billion: 1e9, million: 1e6, 万亿: 1e12, 千亿: 1e11, 百亿: 1e10, 亿: 1e8, 百万: 1e6, 万: 1e4 };
function amounts(text: string): Amount[] {
  const expression = /(?:(CNY|RMB|USD|US\$)\s*)?([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:to|[-–—~～至])\s*(?:CNY|RMB|USD|US\$)?\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?))?\s*(trillion|billion|million|万亿|千亿|百亿|百万|亿|万)\s*(CNY|RMB|USD|US\$|美元|人民币|元|dollars)?/giu;
  return [...text.matchAll(expression)].flatMap(match => {
    const currencyText = (match[1] ?? "") + (match[5] ?? ""), currency = /CNY|RMB|人民币|^元$/iu.test(currencyText) ? "CNY" : /USD|US\$|美元|dollars/iu.test(currencyText) ? "USD" : "";
    return currency ? [{ raw: match[0], start: match.index!, values: [match[2], ...(match[3] ? [match[3]] : [])].map(s => Number(s.replace(/,/g, "").replace("−", "-"))), digits: [match[2], ...(match[3] ? [match[3]] : [])], factor: factors[match[4].toLowerCase()], currency }] : [];
  });
}
/** Correct only an exact cited amount/range with an unambiguous scale. Never infer scenarios, FX or missing data. */
export function repairCitedUnits(text: string, evidence: ChatEvidence[]): { text: string; corrections: string[] } {
  const corrections: string[] = [];
  const normalized = mapCitations(text);
  const result = normalized.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    return part.split(/(\n\s*\n)/u).map(paragraph => {
      if (/假设|示例|例如|hypothetical|for example|suppose/iu.test(paragraph)) return paragraph;
      const labels = citedLabels(paragraph), cited = evidence.filter(hit => labels.has(hit.label));
      // Low-confidence OCR is not an authoritative basis for silently changing a value.
      const originals = cited.filter(hit => hit.chunk.anchor.method !== "ocr" || !hit.chunk.anchor.needsReview && (hit.chunk.anchor.confidence ?? 0) >= 80).flatMap(hit => amounts(hit.chunk.text).map(amount => ({ ...amount, label: hit.label })));
      let output = paragraph;
      for (const claim of amounts(paragraph).reverse()) {
        if (!/[亿万]/u.test(claim.raw) || corrections.length >= 12) continue;
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
