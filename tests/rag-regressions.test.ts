// @vitest-environment node
import { expect, it } from "vitest";
import { localResearchPlan, readResearchPlan, planMessages } from "../electron/chat-plan";
import { chooseEvidence, evidenceKey } from "../electron/chat-evidence";
import { localEvidenceGroups } from "../electron/chat-context";
import { arithmeticWarnings } from "../electron/chat-checks";
import { quantityWarnings, unitDefinitionWarnings, resultCoverage } from "../electron/chat-quality";
import { alternateProfiles, paperProfiles, sourceCases } from "./fixtures/rag-regressions";
import type { KnowledgeHit } from "../src/shared/knowledge";

const hit = (id: string, text: string, sourceId = "note:manual"): KnowledgeHit => ({
  fingerprint: "a", source: { id: sourceId, entityId: sourceId, title: sourceId, kind: "note", format: "markdown", fingerprint: "a", locations: [], attachments: [], tags: [], systemManaged: false },
  chunk: { id, text, anchor: { kind: "markdown", line: 1, endLine: 3 } }
});

for (const sample of sourceCases) it(`preserves relevant candidates: ${sample.question}`, () => {
  const plan = localResearchPlan(sample.question, paperProfiles, sample.previous, sample.previousFocus);
  expect(plan.compare).toBe(sample.compare);
  expect(plan.sourceIds).toEqual(expect.arrayContaining(sample.expected));
  if (!sample.compare) { expect(plan.sourceIds).toEqual(sample.expected); expect(plan.question).toBe(sample.question); }
});

it("resolves a shared lowercase surname using a validated plan without forcing both papers into the answer", () => {
  const q = "再看li的钢铁那篇，方法是什么？", fallback = localResearchPlan(q, alternateProfiles, ["Discuss shipping."], ["file:shipping"]);
  expect(fallback.ambiguous).toBe(true); expect(fallback.question).not.toContain("Discuss shipping");
  const resolved = readResearchPlan(JSON.stringify({ question: "Steel manufacturing methodology", sourceIds: ["file:steel"], compare: false, queries: [] }), fallback, alternateProfiles, q)!;
  expect(resolved.sourceIds).toEqual(["file:steel"]);
  const unnamed = localResearchPlan("那另一篇钢铁研究呢？", alternateProfiles, ["Discuss shipping."], ["file:shipping"]);
  expect(unnamed.sourceIds).toEqual([]); expect(unnamed.ambiguous).toBe(true);
  const followup = localResearchPlan("所以它为什么有损失？", alternateProfiles, ["Discuss shipping."], ["file:shipping"]);
  expect(followup.sourceIds).toEqual(["file:shipping"]);
});

it("allows a comparison planner to narrow a candidate collection but preserves an explicit collection request", () => {
  const sample = sourceCases[1], fallback = localResearchPlan(sample.question, paperProfiles, sample.previous, sample.previousFocus);
  const output = JSON.stringify({ question: sample.question, sourceIds: sample.expected, compare: true, queries: [] });
  expect(readResearchPlan(output, fallback, paperProfiles, sample.question)!.sourceIds.sort()).toEqual([...sample.expected].sort());
  const all = localResearchPlan("这五篇的定义有什么不同？", paperProfiles, [], []);
  expect(readResearchPlan(output, all, paperProfiles)!.sourceIds).toHaveLength(5);
});

it("prioritizes named sources in a bounded catalogue even when a comparison selects thousands of papers", () => {
  const profiles = [...Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: `Item ${i}`, opening: "Unrelated text." })), ...paperProfiles];
  const question = "Mercure 的结论与其他文章矛盾吗？", fallback = localResearchPlan(question, profiles, [], []);
  const payload = JSON.parse(planMessages(question, profiles, [], [], fallback)[1].content);
  expect(payload.catalogue).toHaveLength(24); expect(payload.catalogue[0].id).toBe("file:macro");
});

it("recovers factual subparts locally despite semantic ranking dominated by generic overview passages", async () => {
  const limits = hit("limits", "每项上限为 PDF 500 页、EPUB 3,000 章、200 万字符及 2,000 个片段；文本缓存最多 100 MB。"),
    exporting = hit("export", "导出 Book 只包含本 Book 引用的资源，不会导出 Library 所有资源。"),
    noise = Array.from({ length: 90 }, (_, i) => hit(`noise-${i}`, "Book 页面可以在 Library 工作区操作。普通的页面操作说明，与当前资料文件的其他功能有关。"));
  const corpus = [...noise, limits, exporting, hit("private", "PDF 999 pages", "note:private")];
  const questions = ["每项资料的 PDF 页数、EPUB 章节数、字符数和片段数上限，以及文本缓存是多少？", "对含子页面的 Section 点击 Export PDF，是否把子页面和链接目标一起嵌入？默认 PDF 目录、纸型、背景是什么，暗色主题会使它变黑吗？导出 Book 源项目时能否选非空目录，是否带出 Library 里所有资源？"];
  const local = await localEvidenceGroups(corpus, questions, ["note:manual"], new AbortController().signal);
  const evidence = chooseEvidence(corpus, [...local, noise.slice(0, 20)], ["note:manual"], true, [], 12000);
  expect(evidence.some(h => h.chunk.id === "limits")).toBe(true); expect(evidence.some(h => h.chunk.id === "export")).toBe(true);
  expect(local[0].map(h => h.chunk.id)).toContain("limits"); expect(local[1].map(h => h.chunk.id)).toContain("export");
  expect(evidence.every(h => h.source.id === "note:manual")).toBe(true);
  const controller = new AbortController(); controller.abort(); await expect(localEvidenceGroups(corpus, questions, ["note:manual"], controller.signal)).rejects.toThrow();
});

it("retains fresh monetary evidence across follow-ups without trusting historical assistant prose or stale excerpts", () => {
  const exact = hit("exact", "Results: total stranded assets are CNY 339.03 billion.", "file:refinery");
  const noisy = Array.from({ length: 8 }, (_, i) => hit(`cost-${i}`, `Total investment cost and present value are CNY ${400 + i} billion.`, "file:refinery"));
  const old = { ...exact, label: "S1" }, invalid = { ...old, fingerprint: "outdated", chunk: { ...old.chunk, text: "A previous wrong value is 999 billion CNY." } };
  const groups = resultCoverage([...noisy, exact], ["file:refinery"], [old, invalid], "金额是多少？");
  const evidence = chooseEvidence([...noisy, exact], groups, ["file:refinery"], false, [], 9000);
  expect(evidence.map(evidenceKey)).toContain(evidenceKey(exact)); expect(evidence.some(h => h.chunk.text.includes("999"))).toBe(false);
});

it("distinguishes scientific intervals from equations and validates explicit unit definitions", () => {
  expect(arithmeticWarnings("18.9 万亿美元（16–21.7）；5.4 trillion (4.6–6.1); 3.7 trillion (3.2-4.2)")).toEqual([]);
  expect(arithmeticWarnings("差额为558.1亿元（3958.4 − 3390.3）")[0]).toContain("568.1");
  expect(arithmeticWarnings("16 - 21.7 = 18.9")).toHaveLength(1);
  expect(unitDefinitionWarnings("原文口径为 billion CNY，即亿元人民币")[0]).toContain("10 亿元人民币");
  expect(unitDefinitionWarnings("1 billion USD = 1 亿美元")).toHaveLength(1);
  expect(unitDefinitionWarnings("1 billion CNY = 10亿元人民币；2 billion CNY = 20亿元；billion USD means 十亿美元")).toEqual([]);
  expect(quantityWarnings("billion CNY，即亿元人民币", [])).toHaveLength(1);
});
