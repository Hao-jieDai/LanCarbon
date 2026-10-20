import type { KnowledgeHit } from "../src/shared/knowledge";
import { keywordRanks } from "./retrieval-service";
import { bibliography, bibliographyQuestion } from "./chat-quality";
import { evidenceKey } from "./chat-evidence";
import { citedLabels, type ChatGrounding } from "../src/shared/grounding";

/** Table transformations retain the original passages actually cited last turn.
 * Historical generated values are never copied into the evidence payload. */
export function followupEvidenceGroups(corpus: KnowledgeHit[], previous: { content: string; grounding?: ChatGrounding }, sourceIds: string[]): KnowledgeHit[][] {
  const allowed = new Set(sourceIds), current = new Map(corpus.filter(hit => allowed.has(hit.source.id)).map(hit => [evidenceKey(hit), hit]));
  const cited = citedLabels(previous.content), seen = new Set<string>(), result: KnowledgeHit[][] = [];
  for (const label of cited) {
    const saved = previous.grounding?.evidence.find(hit => hit.label === label);
    const fresh = saved && current.get(evidenceKey(saved));
    if (!fresh || fresh.fingerprint !== saved!.fingerprint || fresh.chunk.text !== saved!.chunk.text || seen.has(evidenceKey(fresh))) continue;
    seen.add(evidenceKey(fresh)); result.push([fresh]);
    if (result.length >= 16) break;
  }
  return result;
}

/** Local lexical checks complement semantic ranking without making additional API requests.
 * Keep one group per user question so a small factual subpart is not crowded out by an overview.
 * These are candidates, not assertions that a question is answered. */
export async function localEvidenceGroups(corpus: KnowledgeHit[], questions: string[], sourceIds: string[], signal: AbortSignal): Promise<KnowledgeHit[][]> {
  const allowed = new Set(sourceIds), includeReferences = questions.some(question => bibliographyQuestion.test(question));
  const available = corpus.filter(hit => allowed.has(hit.source.id) && (includeReferences || !bibliography(hit)));
  const result: KnowledgeHit[][] = []; let checks = 0;
  for (const question of questions) {
    const sentences = question.split(/[?？;；]/u).map(part => part.trim()).filter(part => part.length >= 10);
    const clauses = sentences.flatMap(sentence => sentence.split(/[，,]/u)).map(part => part.trim()).filter(part => part.length >= 12);
    const ordered = [question, sentences[0], sentences.at(-1), ...sentences.slice(1, -1), ...clauses.reverse()].filter((part): part is string => !!part);
    const queries = [...new Set(ordered)].slice(0, Math.min(6, Math.floor(48 / Math.max(1, questions.length))));
    const rankedGroups: KnowledgeHit[][] = [], found = new Map<string, KnowledgeHit>();
    for (const query of queries) {
      if (checks++ >= 48) break;
      signal.throwIfAborted();
      const ranked = await keywordRanks(available, query, signal);
      rankedGroups.push(ranked.slice(0, query === question ? 3 : 2).map(({ index }) => available[index]));
    }
    // Reserve each subpart's best hit before a longer overview gets its second or third candidate.
    for (let depth = 0; depth < 3; depth++) for (const group of rankedGroups) if (group[depth]) found.set(evidenceKey(group[depth]), group[depth]);
    result.push([...found.values()]);
  }
  return result;
}
