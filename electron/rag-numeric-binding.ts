/** Offline diagnostic prototype. No production imports or answer rewriting.
 * A numeric match proves neither entity attribution nor scientific entailment. */
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { MONEY_SCALES, moneyAmounts } from "./chat-money";

export interface NumericSource {
  citation: string; sourceId: string; fingerprint: string; chunkId: string;
  text: string; anchor: unknown; valid: boolean; needsReview?: boolean;
}
export interface NumericRecord {
  id: string; citation: string; sourceId: string; fingerprint: string; chunkId: string;
  anchor: unknown; quote: string; start: number; end: number; raw: string;
  digits: string[]; scale: number; currency: "CNY" | "USD" | null;
  currencySymbol: "$" | null;
  semanticAttribution: "unverified";
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Exact rational arithmetic: do not use float rounding to accept a wrong amount.
function decimal(value: string): [bigint, bigint] {
  assert(/^[+−-]?\d+(?:,\d{3})*(?:\.\d+)?$/u.test(value) && value.length <= 80, "Invalid decimal");
  const cleaned = value.replace(/,/g, "").replace("−", "-");
  const places = cleaned.split(".")[1]?.length ?? 0;
  return [BigInt(cleaned.replace(".", "")), 10n ** BigInt(places)];
}

export function numericRecords(sources: readonly NumericSource[]): NumericRecord[] {
  const labels = new Set<string>(), versions = new Map<string, string>();
  const records: NumericRecord[] = [];
  for (const source of sources) {
    assert(source.valid && !source.needsReview && source.fingerprint && source.sourceId && source.chunkId, "Unverified source");
    assert(/^S\d+$/u.test(source.citation) && !labels.has(source.citation), "Invalid or duplicate label");
    assert(source.text.length <= 100_000 && source.anchor != null, "Missing or oversized provenance");
    assert(!versions.has(source.sourceId) || versions.get(source.sourceId) === source.fingerprint, "Mixed source versions");
    labels.add(source.citation); versions.set(source.sourceId, source.fingerprint);
    const explicit = moneyAmounts(source.text);
    const add = (start: number, end: number, digits: string[], scale: number, currency: NumericRecord["currency"], symbol: "$" | null) => {
      digits.forEach(decimal);
      const record = { citation: source.citation, sourceId: source.sourceId, fingerprint: source.fingerprint, chunkId: source.chunkId,
        anchor: structuredClone(source.anchor), quote: source.text, start, end, raw: source.text.slice(start, end), digits, scale, currency,
        currencySymbol: symbol, semanticAttribution: "unverified" as const };
      records.push({ id: hash(record), ...record });
    };
    for (const amount of explicit) {
      const start = amount.sharedSpan?.start ?? amount.start;
      const end = amount.sharedSpan ? start + amount.sharedSpan.length : amount.start + amount.raw.length;
      add(start, end, amount.digits, amount.factor, amount.currency, null);
    }
    // Bare $ has usable magnitude but unresolved currency. Never promote to USD.
    // Keep the entire source excerpt, so CAD/AUD qualifiers remain visible.
    const pattern = /\$\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:to|[-–—])\s*\$?\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?))?\s*(million|billion|trillion)\b/giu;
    for (const match of source.text.matchAll(pattern)) {
      const start = match.index!, end = start + match[0].length;
      if (explicit.some(a => (a.sharedSpan?.start ?? a.start) < end && (a.sharedSpan ? a.sharedSpan.start + a.sharedSpan.length : a.start + a.raw.length) > start)) continue;
      // Math-delimited values are not a currency declaration.
      if (/^\s*\$/u.test(source.text.slice(end))) continue;
      add(start, end, [match[1], ...(match[2] ? [match[2]] : [])], MONEY_SCALES[match[3].toLowerCase()], null, "$");
    }
  }
  return records;
}

export function checkNumericUse(sources: readonly NumericSource[], use: {
  recordId: string; values: string[]; scale: string; currency: "CNY" | "USD" | null;
}) {
  // Rebuild from current originals: stale IDs or edited quotes cannot be reused.
  const record = numericRecords(sources).find(item => item.id === use.recordId);
  assert(record, "Unknown or stale numeric record");
  const factor = MONEY_SCALES[use.scale]; assert(factor, "Unsupported scale");
  const magnitudeMatches = record.digits.length === use.values.length && record.digits.every((original, i) => {
    const [a, ad] = decimal(original), [b, bd] = decimal(use.values[i]);
    return a * BigInt(record.scale) * bd === b * BigInt(factor) * ad;
  });
  const currencyStatus = record.currency === null || use.currency === null ? "unresolved" : record.currency === use.currency ? "matched" : "conflict";
  return { recordId: record.id, magnitudeMatches, currencyStatus, semanticAttribution: "unverified" as const,
    answerVerified: false as const, quote: record.quote, raw: record.raw, anchor: record.anchor };
}
