import type { ChatEvidence } from "../src/shared/grounding";
import type { KnowledgeHit } from "../src/shared/knowledge";

interface FocusPassage { sourceId: string; chunkId: string; fingerprint: string; quote: string }
export interface EvidenceFocus { aspect: string; passages: FocusPassage[] }
// Normalize layout and font ligatures only; never normalize superscripts or numbers.
const readable = (text: string) => text.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/\s+/g, " ").trim();

/** Stable IDs keep the auxiliary response small; source text is never rewritten by it. */
export function reviewAspects(question: string) {
  return question.split(/[?？;；。]/u).map(text => text.trim()).filter(Boolean).slice(0, 16).map((text, index) => ({ id: `Q${index + 1}`, text: text.slice(0, 350) }));
}
export function reviewPassages(hit: ChatEvidence) {
  const text = readable(hit.chunk.text), passages: Array<{ id: string; text: string }> = [];
  let start = 0;
  while (start < text.length && passages.length < 8) {
    let end = Math.min(start + 360, text.length);
    if (end < text.length) {
      const boundaries = [...text.slice(start + 100, end).matchAll(/[。！？;；!?]|(?<!\d)\.|\.(?!\d)/gu)];
      const last = boundaries.at(-1);
      if (last) end = start + 100 + last.index! + last[0].length;
      else { const space = text.lastIndexOf(" ", end); if (space > start + 100) end = space; }
    }
    passages.push({ id: `${hit.label}:P${passages.length + 1}`, text: text.slice(start, end).trim() });
    start = end;
    while (text[start] === " ") start++;
  }
  return passages;
}

/** Accept selected original passage IDs, never auxiliary prose, amounts or quotations. */
export function readEvidenceFocus(value: unknown, question: string, evidence: ChatEvidence[], allowed: Set<string>): EvidenceFocus[] {
  if (!Array.isArray(value)) return [];
  const aspects = new Map(reviewAspects(question).map(item => [item.id, item.text]));
  const original = new Map(evidence.filter(hit => allowed.has(hit.source.id)).flatMap(hit => reviewPassages(hit).map(part => [part.id, { hit, quote: part.text }] as const)));
  const result: EvidenceFocus[] = []; let characters = 0;
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item.aspectId !== "string" || !aspects.has(item.aspectId) || !Array.isArray(item.passageIds)) continue;
    const passages: FocusPassage[] = [];
    for (const id of [...new Set(item.passageIds.slice(0, 3))]) {
      const part = typeof id === "string" ? original.get(id) : undefined;
      if (!part || characters + part.quote.length > 4000) continue;
      passages.push({ sourceId: part.hit.source.id, chunkId: part.hit.chunk.id, fingerprint: part.hit.fingerprint, quote: part.quote }); characters += part.quote.length;
    }
    if (passages.length) result.push({ aspect: aspects.get(item.aspectId)!, passages });
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
