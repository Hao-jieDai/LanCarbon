import { CHAT_EVIDENCE_MAX_CHUNKS, type ChatEvidence } from "../src/shared/grounding";
import type { KnowledgeHit } from "../src/shared/knowledge";
import { bibliography } from "./chat-quality";

/** Split explicit question lists locally; keep every item, even when the request budget is reached. */
export function documentQuestions(question: string): string[] {
  const markers = [...question.matchAll(/(?:^|\n|[；;]|\s(?=\d{1,2}[.)、．](?!\d)))\s*(?:\d{1,2}[.)、．](?!\d)|[（(]\d{1,2}[）)]|[一二三四五六七八九十]+[、.)．]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/gu)];
  let parts = markers.length > 1
    ? markers.map((marker, index) => question.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? question.length).trim())
    : question.split(/(?<=[?？])\s*/u).map(text => text.trim());
  parts = parts.filter(Boolean);
  if (parts.length > 16) parts = [...parts.slice(0, 15), parts.slice(15).join("\n")];
  return parts.length ? parts : [question];
}

// A conservative text estimate plus per-entry metadata. This is a context budget, not billed usage.
export function evidenceTokens(hit: KnowledgeHit): number {
  const text = hit.chunk.text, wide = (text.match(/[^\x00-\x7F]/gu) ?? []).length;
  return Math.ceil((text.length - wide) / 3 + wide) + 100;
}
export const evidenceKey = (hit: KnowledgeHit) => `${hit.source.id}:${hit.chunk.id}`;

function adjacent(a: KnowledgeHit, b: KnowledgeHit): boolean {
  if (a.source.id !== b.source.id || a.chunk.anchor.kind !== b.chunk.anchor.kind) return false;
  const x = a.chunk.anchor, y = b.chunk.anchor;
  if (x.kind === "pdf") return Math.abs((x.page ?? 0) - (y.page ?? 0)) <= 1;
  if (x.kind === "epub") return x.chapter === y.chapter && Math.abs((x.paragraph ?? 0) - (y.paragraph ?? 0)) <= 1;
  return Math.max((x.line ?? 0) - (y.endLine ?? 0), (y.line ?? 0) - (x.endLine ?? 0)) <= 4;
}

/** Relevant evidence is reserved per question before adding neighbours or overview context. */
export function chooseEvidence(corpus: KnowledgeHit[], groups: KnowledgeHit[][], sourceIds: string[], broad: boolean, requiredSourceIds: string[] = [], limitTokens = 30_000, includeBibliography = false): ChatEvidence[] {
  const allowed = new Set(sourceIds), current = new Map(corpus.filter(hit => allowed.has(hit.source.id)).map(hit => [evidenceKey(hit), hit]));
  const valid = (hit: KnowledgeHit) => { const latest = current.get(evidenceKey(hit)); return latest?.fingerprint === hit.fingerprint && latest.chunk.text === hit.chunk.text && (includeBibliography || !bibliography(latest)) ? latest : undefined; };
  const ranked = groups.map(group => group.flatMap(hit => { const latest = valid(hit); return latest ? [latest] : []; }));
  const budget = Math.min(30_000, limitTokens, (broad ? 12_000 : 6_000) + Math.max(0, groups.length - 1) * 4_000 + Math.min(8, Math.max(0, sourceIds.length - 1)) * 1_000);
  const result: KnowledgeHit[] = [], seen = new Set<string>(), texts = new Set<string>(); let tokens = 0;
  const add = (hit?: KnowledgeHit) => {
    if (!hit || (!includeBibliography && bibliography(hit))) return;
    const textKey = `${hit.source.id}:${JSON.stringify(hit.chunk.anchor)}:${hit.chunk.text.replace(/\s+/g, " ").trim()}`;
    if (seen.has(evidenceKey(hit)) || texts.has(textKey) || result.length >= CHAT_EVIDENCE_MAX_CHUNKS || tokens + evidenceTokens(hit) > budget) return;
    result.push(hit); seen.add(evidenceKey(hit)); texts.add(textKey); tokens += evidenceTokens(hit);
  };
  // Reserve matches for EVERY question before any source coverage or neighbours.
  // Source count must not turn this into one arbitrary passage per source.
  for (let depth = 0; depth < 6; depth++) for (const group of ranked) add(group[depth]);

  // Reserve direct, source-specific retrieval before neighbour expansion can consume the budget.
  const direct = new Map<string, Map<string, KnowledgeHit>>();
  for (const group of ranked) for (const hit of group) { const items = direct.get(hit.source.id) ?? new Map<string, KnowledgeHit>(); items.set(evidenceKey(hit), hit); direct.set(hit.source.id, items); }
  const reserved = requiredSourceIds.map(id => [...(direct.get(id)?.values() ?? [])]);
  for (let depth = 0; depth < 4; depth++) for (const candidates of reserved) add(candidates[depth]);

  const sources = new Map<string, KnowledgeHit[]>();
  for (const hit of current.values()) { const siblings = sources.get(hit.source.id) ?? []; siblings.push(hit); sources.set(hit.source.id, siblings); }
  // A short selected corpus can fit completely. Retain it instead of sampling away important details.
  const all = [...current.values()];
  if (sourceIds.length <= 3 && (broad || groups.length > 1) && all.length <= CHAT_EVIDENCE_MAX_CHUNKS && all.reduce((sum, hit) => sum + evidenceTokens(hit), 0) <= budget) {
    all.forEach(add);
  } else {
    // Bound neighbour expansion and keep original text/anchors intact for exact citations.
    for (const group of ranked) for (const hit of group.slice(0, 2)) {
      const siblings = sources.get(hit.source.id)!, index = siblings.findIndex(item => item.chunk.id === hit.chunk.id);
      for (const neighbour of [siblings[index - 1], siblings[index + 1]]) if (neighbour && adjacent(hit, neighbour)) add(neighbour);
      // A table may span several chunks. Keep its nearby continuation/heading
      // instead of replacing exact values with an unrelated source introduction.
      if (/\|.*\||\btable\b|表\s*\d/iu.test(hit.chunk.text)) for (const offset of [-2, 2]) {
        const neighbour = siblings[index + offset], middle = siblings[index + Math.sign(offset)];
        if (neighbour && middle && adjacent(hit, middle) && adjacent(middle, neighbour)) add(neighbour);
      }
    }
    for (let depth = 6; depth < Math.max(0, ...ranked.map(group => group.length)); depth++) for (const group of ranked) add(group[depth]);
    // Overview sampling is last and bounded. It never displaces direct answers.
    if (broad) for (const [, siblings] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
      add(siblings[0]);
      for (const hit of siblings.filter(item => /method|result|conclusion|discussion|limitation|方法|结果|结论|局限/i.test((item.chunk.anchor.heading ?? "") + " " + item.chunk.text.slice(0, 100))).slice(0, 2)) add(hit);
      // The last page is often a bibliography; it is not an overview of the paper.
    }
  }
  return result.map((hit, index) => ({ ...hit, label: `S${index + 1}` }));
}
