/** Offline diagnostic prototype. No production imports or answer rewriting.
 * A numeric match proves neither entity attribution nor scientific entailment. */
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { MONEY_SCALES, moneyAmounts } from "./chat-money";
import { monetaryBlocks, monetaryLabels, moneyClaimAmounts } from "./chat-claims";

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

/** Candidate discovery, not automatic attribution or repair. A citation may
 * contain several entities; even a unique numerical candidate is not proof. */
export function inspectNumericAnswer(answer: string, sources: readonly NumericSource[]) {
  const records = numericRecords(sources);
  const known = new Set(sources.map(source => source.citation));
  return monetaryBlocks(answer).flatMap(block => moneyClaimAmounts(block).map(amount => {
    const labels = [...monetaryLabels(block, amount.start, amount.raw.length)];
    const unknownLabels = labels.filter(label => !known.has(label));
    const citedRecords = records.filter(record => labels.includes(record.citation));
    const candidates = citedRecords.flatMap(record => {
      if (record.currency && record.currency !== amount.currency || record.digits.length !== amount.digits.length) return [];
      // Search only exact powers of ten, preserving sign and every range endpoint.
      // This is a diagnostic signature, not permission to change the answer.
      const exponent = Array.from({ length: 13 }, (_, i) => i - 6).find(power => record.digits.every((original, i) => {
        const [a, ad] = decimal(original), [b, bd] = decimal(amount.digits[i]);
        const left = a * BigInt(record.scale) * bd;
        const right = b * BigInt(amount.factor) * ad;
        if (left === 0n || right === 0n) return power === 0 && left === right;
        return power >= 0 ? left * 10n ** BigInt(power) === right : left === right * 10n ** BigInt(-power);
      }));
      return exponent === undefined ? [] : [{ recordId: record.id, citation: record.citation, sourceId: record.sourceId,
        raw: record.raw, quote: record.quote, anchor: record.anchor, exponent,
        currencyStatus: record.currency === null ? "unresolved" as const : "matched" as const }];
    });
    const status = !labels.length ? "uncited" : unknownLabels.length ? "unknown-citation" : candidates.length > 1 ? "ambiguous"
      : candidates.length === 0 ? "no-numeric-candidate" : candidates[0].exponent === 0 ? "numeric-candidate" : "possible-scale-error";
    return { start: block.start + amount.start, raw: amount.raw, labels, unknownLabels, status, candidates,
      citedRecordCount: citedRecords.length, semanticAttribution: "unverified" as const, answerVerified: false as const };
  }));
}
