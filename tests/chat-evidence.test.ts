// @vitest-environment node
import { expect, it } from "vitest";
import { chooseEvidence, documentQuestions, evidenceTokens } from "../electron/chat-evidence";
import { CHAT_EVIDENCE_MAX_CHUNKS } from "../src/shared/grounding";
import type { KnowledgeHit } from "../src/shared/knowledge";

function passage(index: number, source = "paper"): KnowledgeHit {
  return { source: { id: `file:${source}`, entityId: source, kind: "file", title: source, format: "pdf", locations: [], attachments: [], tags: [], systemManaged: false, fingerprint: "a".repeat(64) }, fingerprint: "a".repeat(64), chunk: { id: String(index), text: `Passage ${index}. ` + "Background context. ".repeat(45), anchor: { kind: "pdf", page: Math.floor(index / 5) + 1 } } };
}
it("splits numbered Chinese/English questions without treating decimals as list markers or dropping later items", () => {
  const text = "请根据资料逐项回答并引用。\n\n1. **研究范围**\n多少座设施？折现率是多少？\n\n2. **技术路径**\n是否静态选择？\n\n3. **地区差异**\n两省有何不同？";
  expect(documentQuestions(text)).toEqual(["**研究范围**\n多少座设施？折现率是多少？", "**技术路径**\n是否静态选择？", "**地区差异**\n两省有何不同？"]);
  expect(documentQuestions("1. What is the rate? 2. What is the cost?")).toEqual(["What is the rate?", "What is the cost?"]);
  expect(documentQuestions("Is the rate 4.66%? Is the total 3.25 billion?")).toHaveLength(2);
  expect(documentQuestions("范围是什么？折现率是多少？")).toHaveLength(2);
  const many = documentQuestions(Array.from({ length: 12 }, (_, i) => `${i + 1}. question-${i + 1}`).join("\n"));
  expect(many).toHaveLength(12); expect(many.join("\n")).toContain("question-12");
});
it("protects late questions and table continuations with many irrelevant sources", () => {
  const answer = Array.from({ length: 12 }, (_, i) => passage(i, "answer"));
  answer[6].chunk.text = "| Path | Label |\n| first-observation.md | sample-observation |";
  answer[7].chunk.text = "| 02-practice/index.md | sample-practice |";
  const noise = Array.from({ length: 40 }, (_, i) => passage(0, `noise-${i}`));
  const groups = [[answer[0]], [answer[3]], [answer[6]], [answer[10]]];
  const selected = chooseEvidence([...noise, ...answer], groups, [...noise.map(hit => hit.source.id), "file:answer"], false);
  for (const group of groups) expect(selected.some(hit => hit.chunk.id === group[0].chunk.id && hit.source.id === "file:answer")).toBe(true);
  expect(selected.some(hit => hit.chunk.text.includes("sample-practice"))).toBe(true);
  expect(selected.every(hit => hit.source.id === "file:answer")).toBe(true);
});
it("retains a short paper completely for a six-part question even when the reranker misses the crucial pages", () => {
  const corpus = Array.from({ length: 61 }, (_, index) => passage(index));
  corpus[31].chunk.text = "The two regions have different stranded asset totals and technology shares.";
  corpus[44].chunk.text = "The technology choice remains static for each facility.";
  const groups = Array.from({ length: 6 }, () => corpus.slice(0, 20));
  const selected = chooseEvidence(corpus, groups, ["file:paper"], true);
  expect(selected).toHaveLength(61);
  expect(selected.some(hit => hit.chunk.id === "31")).toBe(true); expect(selected.some(hit => hit.chunk.id === "44")).toBe(true);
  expect(new Set(selected.map(hit => hit.label)).size).toBe(61);
});
it("reserves relevant evidence for each question and selected document before overview sampling", () => {
  const corpus = [...Array.from({ length: 300 }, (_, i) => passage(i)), ...Array.from({ length: 100 }, (_, i) => passage(i, "second"))];
  const groups = [corpus.slice(170, 190), corpus.slice(230, 250), corpus.slice(330, 350)];
  const selected = chooseEvidence(corpus, groups, ["file:paper", "file:second"], true);
  for (const group of groups) for (const hit of group.slice(0, 4)) expect(selected.some(item => item.source.id === hit.source.id && item.chunk.id === hit.chunk.id)).toBe(true);
  expect(selected.length).toBeLessThanOrEqual(CHAT_EVIDENCE_MAX_CHUNKS);
  expect(selected.reduce((sum, hit) => sum + evidenceTokens(hit), 0)).toBeLessThanOrEqual(21_000);
});
it("includes neighbouring text with original anchors, excludes unselected sources and rejects stale ranked passages", () => {
  const corpus = Array.from({ length: 300 }, (_, index) => passage(index));
  const neighbour = corpus[102]; neighbour.chunk.text = "The currency and assumptions are explained in this continuation.";
  const outside = passage(102, "private"), stale = { ...corpus[110], chunk: { ...corpus[110].chunk, text: "Outdated facts" } };
  const selected = chooseEvidence([...corpus, outside], [[corpus[101], stale, outside]], ["file:paper"], false);
  expect(selected.some(hit => hit.chunk.id === "102")).toBe(true);
  expect(selected.find(hit => hit.chunk.id === "102")!.chunk).toEqual(neighbour.chunk);
  expect(selected.every(hit => hit.source.id === "file:paper")).toBe(true);
  expect(selected.some(hit => hit.chunk.text === "Outdated facts")).toBe(false);
});
