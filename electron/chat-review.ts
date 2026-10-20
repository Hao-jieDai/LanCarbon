import type { ChatEvidence } from "../src/shared/grounding";
import type { KnowledgeHit } from "../src/shared/knowledge";

interface FocusPassage { sourceId: string; chunkId: string; fingerprint: string; quote: string }
export interface EvidenceFocus { aspect: string; passages: FocusPassage[] }
// Normalize layout and font ligatures only; never normalize superscripts or numbers.
const readable = (text: string) => text.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/\s+/g, " ").trim();

/** Accept original quotations, not an auxiliary model's values or factual summaries. */
export function readEvidenceFocus(value: unknown, question: string, evidence: ChatEvidence[], allowed: Set<string>): EvidenceFocus[] {
  if (!Array.isArray(value)) return [];
  const result: EvidenceFocus[] = []; let characters = 0;
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item.aspect !== "string" || item.aspect.length < 2 || item.aspect.length > 160 || !question.includes(item.aspect) || !Array.isArray(item.passages)) continue;
    const passages: FocusPassage[] = [];
    for (const part of item.passages.slice(0, 2)) {
      if (!part || typeof part.sourceId !== "string" || !allowed.has(part.sourceId) || typeof part.citation !== "string" || typeof part.quote !== "string") continue;
      const hit = evidence.find(hit => hit.source.id === part.sourceId && hit.label === part.citation);
      const quote = readable(part.quote);
      if (!hit || quote.length < 12 || quote.length > 420 || characters + quote.length > 4000 || !readable(hit.chunk.text).includes(quote)) continue;
      passages.push({ sourceId: hit.source.id, chunkId: hit.chunk.id, fingerprint: hit.fingerprint, quote }); characters += quote.length;
    }
    if (passages.length) result.push({ aspect: item.aspect, passages });
  }
  return result;
}

/** Revalidate after supplements/reselection; citation labels may have changed. */
export function focusEvidenceGroups(focus: EvidenceFocus[], corpus: KnowledgeHit[]): KnowledgeHit[][] {
  const current = new Map(corpus.map(hit => [`${hit.source.id}:${hit.chunk.id}`, hit]));
  return focus.map(item => item.passages.flatMap(part => {
    const hit = current.get(`${part.sourceId}:${part.chunkId}`);
    return hit?.fingerprint === part.fingerprint && readable(hit.chunk.text).includes(part.quote) ? [hit] : [];
  })).filter(group => group.length);
}

export function renderEvidenceFocus(focus: EvidenceFocus[], evidence: ChatEvidence[]) {
  return focus.flatMap(item => {
    const passages = item.passages.flatMap(part => {
      const hit = evidence.find(hit => hit.source.id === part.sourceId && hit.chunk.id === part.chunkId && hit.fingerprint === part.fingerprint && readable(hit.chunk.text).includes(part.quote));
      return hit ? [{ citation: hit.label, sourceId: hit.source.id, quote: part.quote }] : [];
    });
    return passages.length ? [{ aspect: item.aspect, passages }] : [];
  });
}
