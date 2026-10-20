import type { KnowledgeHit } from "../src/shared/knowledge";
import { citedLabels, type ChatEvidence } from "../src/shared/grounding";
import { chineseListAmounts, isolatedFigureAmount, monetaryBlocks, monetaryLabels, parenthesizedMoney, sharedScaleAmounts } from "./chat-claims";

/** Conservative bibliography detection; citations in ordinary prose are not a bibliography. */
export function bibliography(hit: KnowledgeHit): boolean {
  const text = hit.chunk.text;
  const dois = text.match(/(?:doi\s*\.|https?:\/\/doi|10\.\s*\d{4,9}\s*\/)/giu) ?? [];
  const entries = text.match(/(?:^|\n)\s*(?:\d{1,3}[.)]?\s+)?[A-Z][\p{L}'’-]+,\s*(?:[A-Z]\.|[A-Z][\p{L}'’-]+,)/gmu) ?? [];
  const datedEntries = text.match(/\(\d{4}[a-z]?\)\s*\./giu) ?? [], links = text.match(/https?:\s*\/\//giu) ?? [];
  return dois.length >= 3 || entries.length >= 3 || (datedEntries.length >= 2 && links.length >= 2) || (/^\s*(?:references|bibliography|参考文献)\s*\n/iu.test(text) && (dois.length > 0 || entries.length > 0));
}
export const bibliographyQuestion = /参考文献|文献列表|bibliograph|reference list|cited (?:work|paper)|引用了哪些/iu;
export const quantityQuestion = /金额|多少钱|少了多少|多了多少|差多少|减少多少|总(?:额|损失|量)|(?:损失|费用|成本).{0,25}(?:换算|比较|合|严重)|(?:amount|total|how much|monetary|billion|trillion|million|currency|人民币|亿元|万亿|美元|\bCNY\b|\bUSD\b)/iu;
const money = /(?:\d[\d,.]*\s*(?:万亿|亿|百万|千亿|billion|trillion|million)|(?:CNY|USD|RMB|US\$)\s*[\d,.]+|[\d,.]+\s*(?:CNY|USD|RMB))/iu;

/** Fresh original passages, never historical assistant claims. Useful when an abstract ranking misses result tables. */
export function resultCoverage(corpus: KnowledgeHit[], sourceIds: string[], previous: ChatEvidence[], question: string): KnowledgeHit[][] {
  if (!quantityQuestion.test(question)) return [];
  const current = new Map(corpus.map(hit => [`${hit.source.id}:${hit.chunk.id}`, hit]));
  return sourceIds.slice(0, 8).map(id => {
    const candidates = corpus.filter(hit => hit.source.id === id && !bibliography(hit) && money.test(hit.chunk.text));
    const score = (hit: KnowledgeHit) => {
      const text = hit.chunk.text;
      return (/total|aggregate|national|sum up|amount to|present value|合计|总额|全国/iu.test(text) ? 4 : 0) +
        (/stranded|loss|搁浅|损失/iu.test(text) ? 3 : 0) +
        (/stranded.{0,65}(?:total|sum up|amount to)|(?:total|aggregate).{0,65}stranded/iu.test(text) ? 4 : 0) +
        (/result|conclusion|结果|结论/iu.test((hit.chunk.anchor.heading ?? "") + text.slice(0, 100)) ? 2 : 0);
    };
    const remembered = previous.flatMap(hit => {
      const fresh = current.get(`${hit.source.id}:${hit.chunk.id}`);
      return fresh && fresh.source.id === id && fresh.fingerprint === hit.fingerprint && fresh.chunk.text === hit.chunk.text && !bibliography(fresh) && money.test(fresh.chunk.text) ? [fresh] : [];
    }).sort((a, b) => score(b) - score(a));
    const result = [...remembered.slice(0, 3), ...candidates.sort((a, b) => score(b) - score(a)).slice(0, 4)];
    // Remembering an introduction must not outrank this paper's current totals.
    return [...new Map(result.map(hit => [`${hit.source.id}:${hit.chunk.id}`, hit])).values()].sort((a, b) => score(b) - score(a));
  }).filter(group => group.length);
}

interface Amount { original: string; start: number; value: number; factor: number; currency: "CNY" | "USD"; context: string; sharedChinese?: boolean }
function amounts(text: string): Amount[] {
  const result: Amount[] = [];
  const expression = /(?:(CNY|RMB|USD|US\\?\$)\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*(trillion|billion|million|万亿|千亿|百亿|亿|百万|万)[ \t]*(CNY|RMB|USD|US\\?\$|美元|人民币|元|dollars)?/giu;
  for (const match of text.matchAll(expression)) {
    const currencyText = ((match[1] ?? "") + (match[4] ?? "")).replaceAll("\\", "");
    const currency = /CNY|RMB|人民币|^元$/iu.test(currencyText) ? "CNY" : /USD|US\$|美元|dollars/iu.test(currencyText) ? "USD" : undefined;
    if (!currency) continue; // Bare numbers may be counts, energy or emissions, not money.
    const unit = match[3].toLowerCase(), factor = ({ trillion: 1e12, billion: 1e9, million: 1e6, 万亿: 1e12, 千亿: 1e11, 百亿: 1e10, 亿: 1e8, 百万: 1e6, 万: 1e4 } as Record<string, number>)[unit];
    result.push({ original: match[0], start: match.index!, value: Number(match[2].replace(/,/g, "")), factor, currency, context: text.slice(Math.max(0, match.index! - 110), match.index! + match[0].length + 110).replace(/\s+/g, " ") });
  }
  for (const item of sharedScaleAmounts(text)) {
    if (!result.some(value => value.start === item.start && value.value === item.value && value.factor === item.factor)) result.push({ original: item.original, start: item.start, value: item.value, factor: item.factor, currency: item.currency, context: text.slice(Math.max(0, item.spanStart - 110), item.spanStart + item.spanLength + 110).replace(/\s+/g, " ") });
  }
  for (const item of [...chineseListAmounts(text), ...parenthesizedMoney(text)]) {
    if (!result.some(value => item.start >= value.start && item.start < value.start + value.original.length)) result.push({ original: item.raw, start: item.start, value: item.value, factor: item.factor, currency: item.currency, sharedChinese: !/[()（）]/u.test(item.raw), context: text.slice(Math.max(0, item.start - 110), item.start + item.raw.length + 110).replace(/\s+/g, " ") });
  }
  return result.sort((a, b) => a.start - b.start);
}
/** Deterministic unit equivalents alongside verbatim context; no inferred scenario/metric associations. */
export function quantityNotes(hit: KnowledgeHit, includeContext = true, convertToCny = false): string[] {
  return amounts(hit.chunk.text).filter(item => item.factor >= 1e6).slice(0, convertToCny ? 8 : 3).map(item => {
    const value = Number((item.value * item.factor / 1e8).toPrecision(12));
    return `${item.original.trim()} = ${value} ${item.currency === "CNY" ? "亿元人民币" : "亿美元"}.${convertToCny && item.currency === "USD" ? ` CNY = ${value} × e 亿元人民币 (e CNY/USD; symbolic).` : ""}${includeContext ? ` Original context: ${item.context}` : ""}`;
  });
}
/** Flag only exact-mantissa, same-currency scale conflicts in cited passages. Never silently rewrite scientific claims. */
export function quantityWarnings(text: string, evidence: ChatEvidence[]): string[] {
  const warnings = new Set<string>();
  const plain = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  // Keep decimal points intact, and include a sentence-final citation in the same claim window.
  for (const originalBlock of monetaryBlocks(plain)) {
    const block = { ...originalBlock, text: originalBlock.text.replace(/\*\*/g, "") };
    const paragraph = block.text;
    for (const claim of amounts(paragraph)) {
      // Two English amounts sharing digits may describe different entities or scenarios.
      // A scale-translation check cannot assert that those amounts must be equal.
      if (!claim.sharedChinese && !/[亿万]/u.test(claim.original)) continue;
      const labels = monetaryLabels(block, claim.start, claim.original.length);
      const originals = evidence.filter(hit => labels.has(hit.label)).flatMap(hit => amounts(hit.chunk.text).filter(item => !isolatedFigureAmount(hit.chunk.text, item.start, item.original.length)).map(item => ({ ...item, label: hit.label })));
      const compatible = originals.filter(item => item.currency === claim.currency);
      const actual = claim.value * claim.factor;
      if (compatible.some(item => Math.abs(item.value * item.factor - actual) <= Math.max(0.005 * claim.factor, actual * 0.001))) continue;
      const sameDigits = compatible.filter(item => item.value === claim.value && item.factor !== claim.factor);
      if (!sameDigits.length || new Set(sameDigits.map(item => item.factor)).size > 1) continue;
      const original = sameDigits[0];
      warnings.add(`Amount needs checking: ${claim.original} conflicts with [${original.label}] ${original.original} (= ${Number((original.value * original.factor / 1e8).toPrecision(12))} ${original.currency === "CNY" ? "亿元人民币" : "亿美元"}). Verify the quantity and scenario; this check does not rewrite the reply.`);
      if (warnings.size >= 5) return [...warnings];
    }
  }
  return [...warnings, ...unitDefinitionWarnings(plain)].slice(0, 5);
}

/** Check explicit English-to-Chinese unit definitions, not prose about different quantities. */
export function unitDefinitionWarnings(text: string): string[] {
  const warnings = new Set<string>();
  const pattern = /\b(?:(\d+(?:\.\d+)?|one)\s+)?(billion|million|trillion)\s*(CNY|RMB|USD|US\$)\s*[，,:：（(]*\s*(?:即|也就是|等于|=|means)\s*(?:(\d+(?:\.\d+)?|一|十|百|千)\s*)?(万亿|十亿|亿|百万|万)\s*(人民币|美元|元)/giu;
  for (const match of text.replace(/```[\s\S]*?```|`[^`\n]*`/g, "").matchAll(pattern)) {
    const fromCurrency = /CNY|RMB/i.test(match[3]) ? "CNY" : "USD", toCurrency = match[6] === "美元" ? "USD" : "CNY";
    if (fromCurrency !== toCurrency) continue; // An FX claim needs an explicit exchange rate, not this check.
    const prefix = match[4] ? ({ 一: 1, 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[match[4]] ?? Number(match[4]) : 1;
    const factor = ({ 万亿: 1e12, 十亿: 1e9, 亿: 1e8, 百万: 1e6, 万: 1e4 } as Record<string, number>)[match[5]];
    const expected = ({ billion: 1e9, million: 1e6, trillion: 1e12 } as Record<string, number>)[match[2].toLowerCase()], value = !match[1] || /^one$/i.test(match[1]) ? 1 : Number(match[1]);
    if (Number.isFinite(prefix) && Math.abs(prefix * factor - expected * value) > 0.000001) warnings.add(`Amount needs checking: ${match[0]}. 1 ${match[2]} ${match[3]} = ${expected / 1e8} ${fromCurrency === "CNY" ? "亿元人民币" : "亿美元"}. Check the unit definition against the displayed amounts.`);
  }
  return [...warnings].slice(0, 3);
}

function scenarioLevels(text: string): string[] {
  const levels = new Set<string>();
  for (const [level, pattern] of [
    ["medium", /\b(?:medium|moderate)(?:\s+expectations?)?\s+(?:realignment|scenario)|(?:中等|中度|适中)(?:预期)?(?:重估|重置|调整|情景)|\b(?:medium|moderate)[”"’']?\s*情景/iu],
    ["severe", /\bsevere(?:\s+expectations?)?\s+(?:realignment|scenario)|严重(?:预期)?(?:重估|重置|调整|情景)|\bsevere[”"’']?\s*情景/iu],
    ["mild", /\bmild(?:\s+expectations?)?\s+(?:realignment|scenario)|温和(?:预期)?(?:重估|重置|调整|情景)|\bmild[”"’']?\s*情景/iu]
  ] as const) if (pattern.test(text)) levels.add(level);
  return [...levels];
}
/** Only flag an explicit contradictory scenario label tied to the same cited monetary value. */
export function scenarioWarnings(text: string, evidence: ChatEvidence[]): string[] {
  const warnings = new Set<string>();
  for (const paragraph of text.replace(/```[\s\S]*?```|`[^`\n]*`/g, "").replace(/\*\*/g, "").split(/\n\s*\n/u)) {
    const levels = scenarioLevels(paragraph); if (levels.length !== 1) continue;
    const labels = citedLabels(paragraph), citedSources = new Set(evidence.filter(hit => labels.has(hit.label)).map(hit => hit.source.id));
    const cited = evidence.filter(hit => citedSources.has(hit.source.id));
    for (const claim of amounts(paragraph)) {
      const originals = cited.flatMap(hit => {
        const values = amounts(hit.chunk.text);
        return values.filter(item => item.currency === claim.currency && Math.abs(item.value * item.factor - claim.value * claim.factor) <= claim.factor * 0.005).map(item => {
          // A sole monetary result can be qualified earlier in its own passage (e.g. a Methods paragraph).
          const context = values.length === 1 ? hit.chunk.text.replace(/\s+/g, " ") : item.context;
          return { ...item, context, label: hit.label, levels: scenarioLevels(context) };
        });
      });
      const known = originals.filter(item => item.levels.length === 1);
      if (!known.length || new Set(known.flatMap(item => item.levels)).size !== 1 || known.some(item => item.levels[0] === levels[0])) continue;
      const original = known[0];
      warnings.add(`Scenario needs checking: ${claim.original} is described as ${levels[0]}, but [${original.label}] ties this amount to ${original.levels[0]}. Original context: ${original.context}`);
      if (warnings.size >= 3) return [...warnings];
    }
  }
  return [...warnings];
}
