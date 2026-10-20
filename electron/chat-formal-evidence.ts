import type { KnowledgeHit } from "../src/shared/knowledge";
import { retrievalTerms } from "./retrieval-service";
import { bibliography } from "./chat-quality";
import { DEFINITION_REQUEST as definitionRequest, FORMULA_REQUEST as formulaRequest, definitionScore } from "./chat-answer-plan";
import { evidenceKey } from "./chat-evidence";

const definitionText = /\b(?:defined? as|defin(?:e|ition)|operationali[sz]\w*|quantif\w*|measur\w*|calculated? (?:as|using)|where\b|denotes?|represents?)|定义|计算为|计算方法|表示|其中/iu;
const symbols = /[=≔≡∝]|\\(?:frac|sum|prod)\b|[∑∏]/u;
// Bilingual metric vocabulary, not study-specific answers. Used only to rank original text.
const metricTerms = [
  /损失|搁浅|\bloss(?:es)?\b|\blost\b|\bstrand\w*/iu,
  /成本|费用|\bcosts?\b|\bexpenses?\b/iu,
  /风险|\brisks?\b|\bhazards?\b/iu,
  /利润|\bprofits?\b/iu,
  /净现值|\bNPV\b|net present value/iu,
  /排放|\bemissions?\b/iu,
  /效率|\befficien/iu,
  /产率|收率|\byield\b/iu,
  /准确率|精确率|\baccuracy\b|\bprecision\b/iu,
  /召回率|\brecall\b/iu,
  /概率|\bprobabilit/iu,
  /强度|\bintensit/iu,
  /误差|\berrors?\b/iu
];
const generic = new Set("formula formulas formulae equation equations latex define definition mathematical expression calculation calculate paper study write show explain please using use what how this that the a an and or of for is in to as with".split(" "));
export interface FormalEvidenceGroup { questionIndex: number; hits: KnowledgeHit[] }
function terms(text: string) { return new Set(retrievalTerms(text).filter(term => !generic.has(term) && !/^\d+$/.test(term))); }
function near(a: KnowledgeHit, b: KnowledgeHit) {
  const x = a.chunk.anchor, y = b.chunk.anchor;
  if (x.kind !== y.kind) return false;
  if (x.kind === "pdf") return x.page === y.page;
  if (x.kind === "epub") return x.chapter === y.chapter && Math.abs((x.paragraph ?? 0) - (y.paragraph ?? 0)) <= 1;
  return Math.max((x.line ?? 0) - (y.endLine ?? 0), (y.line ?? 0) - (x.endLine ?? 0)) <= 6;
}

/** Preserve formula/definition subparts even when a mixed question is classified as a mechanism.
 * No model calls, reconstructed equations or invented values. Each group contains original chunks. */
export async function formalEvidenceGroups(corpus: KnowledgeHit[], questions: string[], sourceIds: string[], signal: AbortSignal): Promise<FormalEvidenceGroup[]> {
  const requests = questions.flatMap((question, questionIndex) => {
    const clauses = question.split(/[?？;；。]|[,，](?=.{0,45}(?:公式|计算式|定义|LaTeX|formula|equation|defin))/iu).map(part => part.trim()).filter(Boolean);
    return clauses.flatMap(text => formulaRequest.test(text) ? [{ text, formula: true, questionIndex }] : definitionRequest.test(text) ? [{ text, formula: false, questionIndex }] : []);
  }).slice(0, 16);
  if (!requests.length) return [];
  const allowed = new Set(sourceIds.slice(0, 12)), sources = new Map<string, KnowledgeHit[]>();
  for (const [index, hit] of corpus.entries()) {
    if (index % 128 === 0) { signal.throwIfAborted(); await new Promise<void>(resolve => setImmediate(resolve)); }
    if (!allowed.has(hit.source.id) || bibliography(hit)) continue;
    const items = sources.get(hit.source.id) ?? []; items.push(hit); sources.set(hit.source.id, items);
  }
  const groups: FormalEvidenceGroup[] = [];
  for (const request of requests) {
    const wanted = terms(request.text), metrics = metricTerms.filter(pattern => pattern.test(request.text));
    for (const items of sources.values()) {
      const ranked: Array<{ hit: KnowledgeHit; neighbours: KnowledgeHit[]; score: number }> = [];
      for (const [index, hit] of items.entries()) {
        if (index % 128 === 0) { signal.throwIfAborted(); await new Promise<void>(resolve => setImmediate(resolve)); }
        const neighbours = [items[index - 2], items[index - 1], items[index + 1], items[index + 2]].filter((other): other is KnowledgeHit => !!other && near(hit, other));
        const text = hit.chunk.text.replace(/\s+/g, " "), context = [text, ...neighbours.map(other => other.chunk.text)].join(" ");
        const equation = symbols.test(text), definition = definitionText.test(text);
        if (request.formula ? !equation && !definition : !definition) continue;
        const contextTerms = terms(context), matches = [...wanted].filter(term => contextTerms.has(term)).length;
        const metricMatches = metrics.filter(pattern => pattern.test(context)).length;
        // A cost equation is not evidence for a requested risk definition merely because it is mathematical.
        if (metrics.length && !metricMatches) continue;
        const heading = hit.chunk.anchor.heading ?? "";
        const pointerOnly = /supplement|appendix|补充材料|附录/iu.test(text) && !equation;
        const score = (request.formula ? 0 : definitionScore(text)) + metricMatches * 8 + Math.min(8, matches) + (equation ? request.formula ? 9 : 1 : 0) + (definition ? 4 : 0) + (/method|defin|formula|equation|方法|定义|公式/iu.test(heading) ? 2 : 0) - (pointerOnly ? 5 : 0);
        ranked.push({ hit, neighbours, score });
      }
      ranked.sort((a, b) => b.score - a.score);
      if (!ranked.length) continue;
      const first = ranked[0], chosen = new Map([[evidenceKey(first.hit), first.hit]]);
      // A definition/variable paragraph may precede a formula or continue after the page's equation.
      for (const item of [ranked.find(item => item !== first && symbols.test(item.hit.chunk.text) && near(first.hit, item.hit))?.hit, ranked.find(item => definitionText.test(item.hit.chunk.text) && near(first.hit, item.hit))?.hit, ...first.neighbours]) {
        if (item && (definitionText.test(item.chunk.text) || symbols.test(item.chunk.text))) chosen.set(evidenceKey(item), item);
        if (chosen.size >= 4) break;
      }
      groups.push({ questionIndex: request.questionIndex, hits: [...chosen.values()] });
    }
  }
  return groups;
}
