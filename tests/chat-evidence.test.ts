// @vitest-environment node
import { expect, it } from "vitest";
import { chooseEvidence, documentQuestions, evidenceTokens } from "../electron/chat-evidence";
import { CHAT_EVIDENCE_MAX_CHUNKS } from "../src/shared/grounding";
import type { KnowledgeHit } from "../src/shared/knowledge";
import { followupEvidenceGroups, referencedTableShape, tableTransformRequirement } from "../electron/chat-context";

it("keeps table rows when two are emphasised and allows only explicit subsets or removal", () => {
  const rows=["Transport", "Agriculture", "Housing"];
  for(const question of ["把表换成人民币，保留交通和农业两项", "Convert this table, retaining Transport and Agriculture", "不要只保留两行，换算整张表"]){
    expect(tableTransformRequirement(question,rows)).toContain("KEEP ALL 3 DATA ROWS");
    expect(tableTransformRequirement(question,rows)).toContain('"Housing"');
  }
  for(const question of ["只保留交通和农业两行", "Keep only Agriculture", "去掉住房这一行", "Exclude Housing"]){
    expect(tableTransformRequirement(question,rows)).toContain("explicit subset/removal");
    expect(tableTransformRequirement(question,rows)).not.toContain("KEEP ALL");
  }
});

function passage(index: number, source = "paper"): KnowledgeHit {
  return { source: { id: `file:${source}`, entityId: source, kind: "file", title: source, format: "pdf", locations: [], attachments: [], tags: [], systemManaged: false, fingerprint: "a".repeat(64) }, fingerprint: "a".repeat(64), chunk: { id: String(index), text: `Passage ${index}. ` + "Background context. ".repeat(45), anchor: { kind: "pdf", page: Math.floor(index / 5) + 1 } } };
}
it.each([
  ["clinical", "Recovery is defined as sustained symptom resolution; the control receives standard care."],
  ["transport", "Delay is measured as excess journey time relative to the uncongested baseline."],
])("retains both %s operational definitions before optional results and neighbours", (topic, definition) => {
  const a = Array.from({ length: 15 }, (_, i) => passage(i, topic + "-a"));
  const b = Array.from({ length: 15 }, (_, i) => passage(i, topic + "-b"));
  a[12].chunk.text = definition;
  b[12].chunk.text = "The comparison uses a different observation period. " + definition;
  const primary = [a.slice(5, 8), b.slice(5, 8)], methods = [[a[12]], [b[12]]];
  const budget = evidenceTokens(a[5]) * 4;
  const selected = chooseEvidence([...a, ...b], [...methods, ...primary], [a[0].source.id, b[0].source.id], true,
    [a[0].source.id, b[0].source.id], budget, false, primary, methods);
  for (const hit of [a[5], b[5], a[12], b[12]]) expect(selected.some(x => x.source.id === hit.source.id && x.chunk.id === hit.chunk.id)).toBe(true);
  expect(selected.reduce((n, h) => n + evidenceTokens(h), 0)).toBeLessThanOrEqual(budget);
});
it.each(["clinical", "transport"])("reserves a named comparison source before optional %s neighbours exhaust the budget", topic => {
  const a = Array.from({ length: 12 }, (_, i) => passage(i, topic));
  const b = passage(0, "comparison");
  const primary = [a.slice(5, 8)];
  const selected = chooseEvidence([...a, b], [a.slice(5, 10), [b]], [a[0].source.id, b.source.id], true,
    [a[0].source.id, b.source.id], evidenceTokens(a[0]) * 3, false, primary);
  expect(selected.some(hit => hit.source.id === b.source.id)).toBe(true);
  expect(selected.some(hit => hit.source.id === a[0].source.id && hit.chunk.id === "5")).toBe(true);
  expect(selected.reduce((sum, hit) => sum + evidenceTokens(hit), 0)).toBeLessThanOrEqual(evidenceTokens(a[0]) * 3);
});

it("applies scope, freshness and bibliography guards to protected method evidence", () => {
  const corpus = Array.from({ length: 20 }, (_, i) => passage(i));
  const hidden = passage(0, "unselected"), stale = { ...corpus[15], fingerprint: "b".repeat(64) };
  const changed = { ...corpus[16], chunk: { ...corpus[16].chunk, text: "Obsolete definition" } };
  corpus[17].chunk.text = "References\nSmith, A. (2020). A research report. Journal of Studies.";
  const selected = chooseEvidence([...corpus, hidden], [[corpus[5]]], ["file:paper"], true, ["file:paper"],
    evidenceTokens(corpus[5]) * 2, false, [[corpus[5]]], [[hidden], [stale], [changed], [corpus[17]], [corpus[18]]]);
  expect(selected.map(h => h.chunk.id)).toEqual(["5", "18"]);
  expect(selected.every(h => h.source.id === "file:paper")).toBe(true);
});

it("keeps a complete small multi-document selection when it fits rather than dropping unranked conditions", () => {
  const corpus = Array.from({length:5}, (_, doc) => Array.from({length:6}, (_, i) => passage(i, `short-${doc}`))).flat();
  const sources = [...new Set(corpus.map(hit => hit.source.id))];
  const groups = sources.map(id => corpus.filter(hit => hit.source.id === id).slice(0, 1));
  const selected = chooseEvidence(corpus, groups, sources, true, sources, 18000);
  expect(selected).toHaveLength(corpus.length);
  expect(selected.map(hit => hit.source.id + ":" + hit.chunk.id).sort()).toEqual(corpus.map(hit => hit.source.id + ":" + hit.chunk.id).sort());
});
it.each(["clinical", "materials"])("reserves a direct %s finding and its context before automatic background groups", source => {
  const corpus = Array.from({length: 70}, (_, i) => passage(i, source));
  corpus[49].chunk.text = source === "clinical" ? "Treatment improves recovery but not mortality; these are distinct outcomes." : "Recovered material reduces energy demand, while upfront capital costs rise.";
  corpus[50].chunk.text = "This result applies to the measured group. The following paragraph compares total expenditure with annual income.";
  const primary = [[corpus[50], corpus[52], corpus[55]]];
  const helpers = Array.from({length: 18}, (_, i) => [corpus[i], corpus[i + 1]]);
  const selected = chooseEvidence(corpus, [...helpers, ...primary], [`file:${source}`], false, [`file:${source}`], 2200, false, primary);
  expect(selected.some(h => h.chunk.id === "50")).toBe(true);
  expect(selected.some(h => h.chunk.id === "49")).toBe(true);
  expect(selected.reduce((sum, h) => sum + evidenceTokens(h), 0)).toBeLessThanOrEqual(2200);
  const stale = {...corpus[49], fingerprint: "b".repeat(64)};
  expect(chooseEvidence(corpus, helpers, [`file:${source}`], false, [], 2200, false, [[stale, passage(0, "private")]]).every(h => h.source.id === `file:${source}` && h.chunk.id !== "49")).toBe(true);
});
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
it("keeps identical text at distinct source locations so table rows retain their own context and citations", () => {
  const first = passage(0), second = passage(10);
  first.chunk.text = second.chunk.text = "Total | 20";
  const selected = chooseEvidence([first, second], [[first], [second]], [first.source.id], false);
  expect(selected.map(hit => hit.chunk.anchor.page)).toEqual([1, 3]);
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

it("reserves cited fresh originals for a table follow-up before distracting monetary overview matches", () => {
  const corpus = Array.from({ length: 80 }, (_, i) => passage(i, "transport"));
  corpus[64].chunk.text = "Regional rail exposure is US$38 billion; municipal transit exposure is US$26 billion.";
  corpus[70].chunk.text = "Insurance-sector upper-bound exposure is US$94 billion.";
  const privateHit = passage(0, "private");
  const evidence = [{ ...corpus[64], label: "S7" }, { ...corpus[70], label: "S9" }, { ...corpus[0], label: "S1" }, { ...privateHit, label: "S10" }];
  const previous = { content: "Invented generated amount 99999. Table [S7][S9][S10].", grounding: { evidence } as any };
  const kept = followupEvidenceGroups([...corpus, privateHit], previous, ["file:transport"]);
  const selected = chooseEvidence(corpus, [...kept, ...Array.from({ length: 12 }, () => corpus.slice(0, 20))], ["file:transport"], false, ["file:transport"], 2200);
  expect(selected.map(hit => hit.chunk.id)).toEqual(expect.arrayContaining(["64", "70"]));
  expect(kept.flat().map(hit => hit.chunk.id)).toEqual(["64", "70"]);
  expect(JSON.stringify(selected)).not.toContain("99999"); expect(selected.every(hit => hit.source.id === "file:transport")).toBe(true);
  const changed = corpus.map(hit => hit.chunk.id === "64" ? { ...hit, fingerprint: "b".repeat(64) } : hit.chunk.id === "70" ? { ...hit, chunk: { ...hit.chunk, text: "Revised text" } } : hit);
  expect(followupEvidenceGroups(changed, previous, ["file:transport"])).toEqual([]);
  expect(followupEvidenceGroups([], previous, ["file:transport"])).toEqual([]);
});

it("carries the referenced table's row labels without reusing generated numeric cells", () => {
  const text = "| Old | Value |\n|---|---|\n| Earlier | 123 |\n\n| Category | USD yi |\n|---|---|\n| Public operators [S7] | 99999 |\n| Insurers | 88888 |";
  expect(referencedTableShape(text)).toEqual({ columns: ["Category", "USD yi"], rows: ["Public operators", "Insurers"] });
  expect(JSON.stringify(referencedTableShape(text))).not.toContain("99999");
  expect(referencedTableShape("No table is present.")).toBeUndefined();
});
