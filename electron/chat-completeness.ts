import type { KnowledgeHit } from "../src/shared/knowledge";
import type { AnswerTask } from "./chat-answer-plan";
import { bibliography } from "./chat-quality";

/** Source scope is original text, never an inferred sector classification. */
export function scopeCoverage(corpus: KnowledgeHit[], ids: string[], question: string, task: AnswerTask): KnowledgeHit[][] {
  if (task === "ranking" || !(["definition", "comparison", "writing"].includes(task) || /行业|部门|范围|各篇|几篇|\b(?:sector|scope|industr|studies|compar)/iu.test(question))) return [];
  return ids.slice(0, 12).flatMap(id => {
    const candidates = corpus.filter(hit => hit.source.id === id && !bibliography(hit)).slice(0, 120);
    const ranked = candidates.map((hit, index) => {
      const text = hit.chunk.text.replace(/\s+/g, " ");
      const describesStudy = /(?:we|this study|our (?:study|analysis)).{0,100}(?:cover|includ|analys|assess|focus|use|investigat|model)|研究对象|研究范围|本文.{0,35}(?:研究|评估|涵盖)/iu.test(text);
      const scopeHeading = /(?:scope|study area|data set|dataset|study population|supply model|研究范围|研究对象|样本范围)/iu.test((hit.chunk.anchor.heading ?? "") + " " + text.slice(0, 130));
      const enumeration = /(?:\bfor\b|\bof\b|cover|includ|compris|supply|研究|包括|涵盖)[^.!?。！？]{0,140}[,，][^.!?。！？]{0,100}(?:\band\b|以及|和|及|与)/iu.test(text);
      const populationList = /\b(?:supply|production|population|sample|assets?|facilities|sectors?|industries|resources?)\b[^.!?]{0,65}\b(?:of|for|includes?|covers?)\b[^.!?]{0,100},[^.!?]{0,80}\band\b/iu.test(text);
      const frontMatter = /\b(?:Department|University|Correspondence|Author contributions)\b|作者单位|通讯作者/iu.test(text.slice(0, 250));
      return { hit, populationList, score: (describesStudy ? 5 : 0) + (scopeHeading ? 6 : 0) + (enumeration ? 4 : 0) + (populationList ? 12 : 0) - (frontMatter ? 8 : 0) - index / 1000 };
    }).sort((a, b) => b.score - a.score);
    if (!ranked.length) return [];
    const population = ranked.find(item => item.populationList);
    return [[...new Map([ranked[0].hit, ...(population ? [population.hit] : [])].map(hit => [hit.chunk.id, hit])).values()]];
  });
}

/** Retrieve a same-document, explicitly scaled amount when a selected excerpt omits its scale.
 * These remain separate original excerpts; equal numbers alone never prove equal metrics. */
export function unitCompanions(corpus: KnowledgeHit[], groups: KnowledgeHit[][], ids: string[]): KnowledgeHit[][] {
  const allowed = new Set(ids), selected = new Set(groups.flat().map(hit => `${hit.source.id}:${hit.chunk.id}`)), found = new Map<string, KnowledgeHit>();
  const seeds = [...new Map(groups.flatMap(group => group.slice(0, 2)).filter(hit => allowed.has(hit.source.id)).map(hit => [`${hit.source.id}:${hit.chunk.id}`, hit])).values()].slice(0, 48);
  const amount = /(?:\b(USD|CNY|RMB|EUR)\s*|\b(US)\$\s*|(?<![\w\\])\$\s*)(\d[\d,]*(?:\.\d+)?)/giu;
  const scale = /^\s*(?:trillion|billion|million|bn\b|mn\b|万亿|十亿|亿元|百万|万元)/iu;
  const unresolved = new Set<string>();
  const keyFor = (hit: KnowledgeHit, currency: string, number: string) => JSON.stringify([hit.source.id, hit.fingerprint, currency, number]);
  for (const seed of seeds) for (const match of seed.chunk.text.matchAll(amount)) {
    if (scale.test(seed.chunk.text.slice(match.index! + match[0].length))) continue;
    const number = match[3].replaceAll(",", ""), currency = match[1] === "RMB" ? "CNY" : match[1] ?? "USD";
    if (number.length <= 16 && unresolved.size < 16) unresolved.add(keyFor(seed, currency, number));
  }
  if (!unresolved.size) return [];
  // Scan the selected corpus once even when many excerpts repeat an incomplete amount.
  for (const candidate of corpus) {
    const key = `${candidate.source.id}:${candidate.chunk.id}`;
    if (!allowed.has(candidate.source.id) || selected.has(key) || bibliography(candidate) || candidate.chunk.anchor.needsReview || candidate.chunk.anchor.method === "ocr" && (candidate.chunk.anchor.confidence ?? 0) < 80) continue;
    for (const other of candidate.chunk.text.matchAll(amount)) {
      const target = keyFor(candidate, other[1] === "RMB" ? "CNY" : other[1] ?? "USD", other[3].replaceAll(",", ""));
      if (!unresolved.has(target) || !scale.test(candidate.chunk.text.slice(other.index! + other[0].length))) continue;
      found.set(key, candidate); unresolved.delete(target); break;
    }
    if (found.size >= 4 || !unresolved.size) break;
  }
  return [...found.values()].map(hit => [hit]);
}
