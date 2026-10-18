// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AIChatStore, AISettingsStore } from "../electron/ai-storage";
import { AIService } from "../electron/ai-service";
import { AIClient } from "../electron/ai-client";
import { ChatGrounder, chooseEvidence } from "../electron/chat-grounding";
import { KnowledgeStore } from "../electron/knowledge-store";
import { knowledgeSnapshot } from "../electron/knowledge-sources";
import { keywordRanks, type RetrievalService } from "../electron/retrieval-service";
import { RetrievalClient } from "../electron/retrieval-client";
import { extractMarkdown } from "../src/shared/knowledgeText";
import { emptyKnowledgeScope, type KnowledgeHit } from "../src/shared/knowledge";
import { defaultAIProviders, type AIChat } from "../src/shared/ai";
import { CHAT_EVIDENCE_MAX_CHUNKS } from "../src/shared/grounding";
import { createNote } from "../src/shared/notes";
import type { AIUsageEvent } from "../src/shared/aiUsage";
const roots: string[] = [], stores: KnowledgeStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.stop(); for (const root of roots.splice(0)) { if (!root.startsWith(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-grounding-")) throw Error("Unsafe cleanup"); await fs.rm(root, { recursive: true, force: true }); } });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-grounding-")); roots.push(root);
  const notes = [createNote({ id: "a", title: "Paper A", content: "# Carbon policy\n\nCoal investment falls by 12 percent.\n\n# Methods\n\nPanel data.\n\n# Conclusion\n\nTransition risk matters." }), createNote({ id: "b", title: "Paper B", content: "# Carbon policy\n\nCoal investment falls by 7 percent.\n\n# Methods\n\nA simulation.\n\n# Conclusion\n\nResults vary by region." }), createNote({ id: "private", title: "Private unselected", content: "SecretOutsideSelection" })];
  const snapshot = async () => knowledgeSnapshot({ version: 2, notes, books: [] }, [], []);
  const store = new KnowledgeStore(root, snapshot, async () => { throw Error("No file"); }, { extract: async (_source, input, signal) => { signal.throwIfAborted(); return extractMarkdown(String(input)); }, idle() {} }); stores.push(store);
  const searches: string[][] = [];
  const retrieval = { stop: vi.fn(async () => {}), build: vi.fn(async () => {}), search: vi.fn(async (query: string, ids: string[]) => { searches.push(ids); const corpus = (await store.corpus()).filter(hit => ids.includes(hit.source.id)), ranks = await keywordRanks(corpus, query); return { hits: ranks.map(item => corpus[item.index]), warnings: [], mode: "keyword" }; }) } as unknown as RetrievalService;
  const grounder = new ChatGrounder(() => store, () => retrieval, async () => false);
  const chats = new AIChatStore(root), settings = new AISettingsStore(root, { available: () => true, encrypt: value => Buffer.from(value), decrypt: value => value.toString() });
  await settings.save({ ...defaultAIProviders()[0], apiKey: "fixture-key-private", models: [{ id: "fixture-model", name: "Fixture", purpose: "chat" }], defaultModel: "fixture-model" });
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: "A reports 12 percent [S1]. B differs [S2]." } }], usage: { prompt_tokens: 50, completion_tokens: 15, total_tokens: 65 } }), { headers: { "content-type": "application/json" } }));
  const usage: AIUsageEvent[] = [];
  const service = new AIService(settings, () => chats, new AIClient(fetcher, async event => { usage.push(event); }), () => {}, grounder), chat = await chats.create("siliconflow", "fixture-model");
  const settled = async () => { const deadline = Date.now() + 10_000; while (Date.now() < deadline) { const current = await chats.get(chat.id); if (current.messages.at(-1)?.status !== "streaming") return current; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error("Not settled"); };
  return { root, notes, store, searches, retrieval, grounder, chats, service, chat, fetcher, usage, settled };
}
it("prepares sources automatically, isolates the chat scope, persists evidence and opens stable citations after rename", async () => {
  const f = await fixture(); await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a", "b"] });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Compare the carbon investment findings and methods"); const chat = await f.settled(), reply = chat.messages.at(-1)!;
  expect(reply.status).toBe("complete"); expect(new Set(reply.grounding!.evidence.map(hit => hit.source.id))).toEqual(new Set(["note:a", "note:b"]));
  const body = JSON.parse(f.fetcher.mock.calls[0][1]!.body as string); expect(JSON.stringify(body)).not.toContain("SecretOutsideSelection"); expect(JSON.stringify(body)).toContain("12 percent"); expect(JSON.stringify(body)).toContain("7 percent"); expect(body.messages[1].content).toContain("untrusted reference data");
  expect((await new AIChatStore(f.root).get(chat.id)).messages.at(-1)!.grounding).toEqual(reply.grounding);
  const hit = reply.grounding!.evidence[0]; f.notes.find(note => note.id === hit.source.entityId)!.title = "Renamed paper";
  expect((await f.grounder.open(chat, reply.id, hit.label)).source.title).toBe("Renamed paper");
  f.notes.find(note => note.id === hit.source.entityId)!.content += "\nChanged content";
  await expect(f.grounder.open(chat, reply.id, hit.label)).rejects.toThrow("has changed");
  expect((await f.chats.get(chat.id)).messages.at(-1)!.grounding!.evidence[0].chunk.text).toBe(hit.chunk.text);
  await expect(f.grounder.open(chat, reply.id, "S999")).rejects.toThrow("not part");
});
it("does not search other cached sources after selection changes and refuses deleted-only scope without a Chat request", async () => {
  const f = await fixture(); await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a"] }); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Summarize this paper"); await f.settled();
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["b"] }); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Summarize this paper"); const second = await f.settled();
  expect(second.messages.at(-1)!.grounding!.sourceIds).toEqual(["note:b"]); expect((await f.store.corpus()).some(hit => hit.source.id === "note:a")).toBe(true);
  expect(JSON.stringify(JSON.parse(f.fetcher.mock.calls[1][1]!.body as string))).not.toContain("12 percent");
  f.notes.splice(f.notes.findIndex(note => note.id === "b"), 1); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "What did it find?"); const failed = await f.settled(); expect(failed.messages.at(-1)!.error).toContain("no longer available"); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("keeps ordinary Chat unchanged and stops source preparation before any Chat completion request", async () => {
  const f = await fixture(); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Hello"); await f.settled(); expect(f.searches).toEqual([]);
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a"] });
  const original = f.store.prepare.bind(f.store); f.store.prepare = vi.fn(async (scope, signal, progress) => { await new Promise<void>(resolve => { signal.addEventListener("abort", () => resolve(), { once: true }); }); signal.throwIfAborted(); return original(scope, signal, progress); });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Summarize the paper");
  await vi.waitFor(() => expect(f.store.prepare).toHaveBeenCalled()); await expect(f.service.setSources(f.chat.id, emptyKnowledgeScope())).rejects.toThrow("Stop the reply"); await f.service.stop(f.chat.id);
  expect((await f.settled()).messages.at(-1)!.status).toBe("stopped"); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("bounds broad evidence while covering each selected paper and reports unrecognized or missing citations", async () => {
  const f = await fixture(), chat: AIChat = { ...f.chat, sourceScope: { ...emptyKnowledgeScope(), noteIds: ["a", "b"] }, messages: [{ id: "question", role: "user", status: "complete", content: "Compare the conclusions", createdAt: new Date().toISOString() }] };
  const prepared = await f.grounder.prepare(chat, new AbortController().signal, () => {});
  expect(prepared.grounding.evidence.length).toBeLessThanOrEqual(CHAT_EVIDENCE_MAX_CHUNKS); expect(prepared.grounding.evidence.some(hit => hit.chunk.text.includes("region"))).toBe(true);
  await f.grounder.finish(prepared.grounding, "Unverifiable [S999]"); expect(prepared.grounding.warnings.join(" ")).toContain("unrecognized citation"); expect(prepared.grounding.warnings.join(" ")).toContain("did not supply valid");
  const long = Array.from({ length: 90 }, (_, i) => ({ ...prepared.grounding.evidence[0], chunk: { ...prepared.grounding.evidence[0].chunk, id: String(i) } }));
  const selected = chooseEvidence([...long, ...prepared.grounding.evidence.filter(hit => hit.source.id === "note:b")], [long], ["note:a", "note:b"], true); expect(new Set(selected.map(hit => hit.source.id)).size).toBe(2); expect(selected.length).toBeLessThanOrEqual(CHAT_EVIDENCE_MAX_CHUNKS);
});
it("retrieves each numbered item independently, keeps per-question candidates and reloads more than 24 saved excerpts", async () => {
  const f = await fixture();
  f.notes[0].content += "\n\n" + Array.from({ length: 35 }, (_, i) => `Paragraph ${i}: regional assumptions.`).join("\n\n");
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a", "b"] });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "1. Compare the carbon investment findings.\n2. Explain the methods and regional assumptions.");
  const chat = await f.settled(), evidence = chat.messages.at(-1)!.grounding!.evidence;
  expect(vi.mocked(f.retrieval.search).mock.calls.length).toBeLessThanOrEqual(4);
  expect(vi.mocked(f.retrieval.search).mock.calls.slice(0, 2).map(call => call[0])).toEqual(["Compare the carbon investment findings.", "Explain the methods and regional assumptions."]);
  const payload = JSON.parse(JSON.parse(f.fetcher.mock.calls.at(-1)![1]!.body as string).messages.find((item: { content: string }) => item.content.startsWith('{"selectedSources":')).content);
  expect(payload.questionEvidence).toHaveLength(2); expect(payload.questionEvidence.every((item: { citations: string[] }) => item.citations.length > 0)).toBe(true);
  expect(evidence.length).toBeGreaterThan(24);
  expect((await new AIChatStore(f.root).get(chat.id)).messages.at(-1)!.grounding!.evidence).toEqual(evidence);
});
it("bounds empty-result follow-ups, reports missing questions and keeps cancellation active between subquestions", async () => {
  const f = await fixture();
  vi.mocked(f.retrieval.search).mockResolvedValue({ hits: [], warnings: [], mode: "keyword" });
  const chat = { ...f.chat, sourceScope: { ...emptyKnowledgeScope(), noteIds: ["a"] }, messages: [{ id: "question", role: "user" as const, status: "complete" as const, content: "1. Missing methods? More details.\n2. Missing results? More details.\n3. Missing conclusions? More details.", createdAt: new Date().toISOString() }] };
  const prepared = await f.grounder.prepare(chat, new AbortController().signal, () => {});
  expect(f.retrieval.search).toHaveBeenCalledTimes(5); expect(prepared.grounding.warnings.join(" ")).toContain("Question 3: no matching");
  const controller = new AbortController(); vi.mocked(f.retrieval.search).mockClear().mockImplementation(async () => { controller.abort(); return { hits: [], warnings: [], mode: "keyword" }; });
  await expect(f.grounder.prepare(chat, controller.signal, () => {})).rejects.toThrow(); expect(f.retrieval.search).toHaveBeenCalledTimes(1);
});
it("resolves a brief follow-up from earlier evidence when the saved focus is empty and model checks are unavailable", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: ["a"] };
  const first: AIChat = { ...f.chat, sourceScope: scope, messages: [{ id: "q1", role: "user", content: "Explain the carbon investment finding", sourceScope: scope, status: "complete", createdAt: new Date().toISOString() }] };
  const prepared = await f.grounder.prepare(first, new AbortController().signal, () => {});
  expect(prepared.grounding.research!.focusSourceIds).toEqual([]);
  const next: AIChat = { ...first, messages: [...first.messages, { id: "a1", role: "assistant", content: "A previous answer is not evidence", status: "complete", sourceScope: scope, grounding: prepared.grounding, createdAt: new Date().toISOString() }, { id: "q2", role: "user", content: "Why does it happen?", status: "complete", sourceScope: scope, createdAt: new Date().toISOString() }] };
  await f.grounder.prepare(next, new AbortController().signal, () => {});
  const query = vi.mocked(f.retrieval.search).mock.calls.at(-1)![0];
  expect(query).toContain("Explain the carbon investment finding"); expect(query).toContain("Why does it happen?"); expect(query).not.toContain("A previous answer");
});
it("discovers role-specific OpenRouter catalogues without polluting Chat models or exposing keys", async () => {
  const urls: string[] = [], fetcher = vi.fn<typeof fetch>(async url => { urls.push(String(url)); return new Response(JSON.stringify({ data: [{ id: "embed:free", name: "Free embedding", architecture: { output_modalities: ["embeddings"] }, pricing: { prompt: "0", completion: "0" } }, { id: "rank:free", architecture: { output_modalities: ["rerank"] } }, { id: "chat", architecture: { output_modalities: ["text"] } }] })); });
  const client = new RetrievalClient(fetcher), connection = { provider: defaultAIProviders()[1], key: "fixture-secret", modelId: "", modelName: "" };
  expect((await client.models(connection, "embedding")).map(model => model.id)).toEqual(["embed:free"]); expect((await client.models(connection, "rerank")).map(model => model.id)).toEqual(["rank:free"]); expect(urls).toEqual(["https://openrouter.ai/api/v1/embeddings/models", "https://openrouter.ai/api/v1/models?output_modalities=rerank"]);
});
it("accepts and reloads more than twenty sources without leaking unselected writing", async () => {
  const f = await fixture();
  f.notes.push(...Array.from({ length: 25 }, (_, i) => createNote({ id: `extra-${i}`, title: `Evidence ${i}`, content: `Carbon policy finding ${i}: the effect differs by region.` })));
  const noteIds = f.notes.filter(note => note.id !== "private").map(note => note.id);
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Compare carbon policy findings.");
  const chat = await f.settled(), saved = await new AIChatStore(f.root).get(chat.id);
  expect(chat.messages.at(-1)!.status).toBe("complete");
  expect(saved.messages.at(-1)!.grounding!.sourceIds).toHaveLength(27);
  expect(saved.messages.at(-1)!.grounding).toEqual(chat.messages.at(-1)!.grounding);
  expect(JSON.stringify(f.fetcher.mock.calls)).not.toContain("SecretOutsideSelection");
});
it("uses the selected chat model for bounded planning/review, supplements a missed result and records every paid request", async () => {
  const f = await fixture();
  f.notes[0].content = "Alvarez. Facility losses.\n\n" + Array.from({ length: 45 }, (_, i) => `Facility result ${i}. Investment loss at plant level.`).join("\n\n");
  f.notes[1].content = "Bennett. Investor losses.\n\n" + Array.from({ length: 45 }, (_, i) => i === 35 ? "Aggregate present value is 1.73 trillion; this is investor wealth, not GDP." : `Investor method ${i}. Ownership assumptions differ.`).join("\n\n");
  vi.mocked(f.retrieval.search).mockImplementation(async (query, ids) => {
    const corpus = (await f.store.corpus()).filter(hit => ids!.includes(hit.source.id));
    return { hits: (query.includes("aggregate present value") ? corpus.filter(hit => hit.chunk.text.includes("1.73 trillion")) : corpus.slice(0, 6)).map(hit => ({ ...hit, score: 1, retrieval: "keyword" as const })), warnings: [], mode: "keyword" };
  });
  f.fetcher.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init!.body as string), prompt = body.messages[0].content;
    const content = prompt.startsWith("Plan evidence") ? JSON.stringify({ question: "Compare facility and investor loss definitions", sourceIds: ["note:a", "note:b"], compare: true, queries: [] }) : prompt.startsWith("Check whether") ? JSON.stringify({ sufficient: false, queries: [{ query: "aggregate present value investor wealth", sourceIds: ["note:b"] }] }) : "The retrieved metrics differ ［S1，S2］. 4821.6 - 3139.2 = 1672.4.";
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { headers: { "content-type": "application/json" } });
  });
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a", "b"] });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "这几篇文章的损失定义有什么不同？");
  const result = await f.settled(), reply = result.messages.at(-1)!;
  expect(reply.status).toBe("complete"); expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(JSON.parse(f.fetcher.mock.calls.at(-1)![1]!.body as string))).toContain("1.73 trillion");
  expect(reply.grounding!.research).toMatchObject({ modelChecks: 2, supplemented: true, review: "limited" });
  expect(reply.grounding!.warnings.some(text => text.includes("1682.4"))).toBe(true);
  expect(reply.grounding!.warnings.some(text => text.includes("did not supply valid"))).toBe(false);
  const starts = f.usage.filter(event => event.type === "start"); expect(starts).toHaveLength(3);
  expect(starts.every(event => event.type === "start" && event.request.modelId === "fixture-model" && event.request.purpose === "chat")).toBe(true);
  expect(JSON.stringify(f.fetcher.mock.calls)).not.toContain("SecretOutsideSelection");
  expect((await new AIChatStore(f.root).get(result.id)).messages.at(-1)!.grounding).toEqual(reply.grounding);
});
it("cancels during a model evidence review without starting a final answer", async () => {
  const f = await fixture(); f.notes[0].content += "\n\n" + Array.from({ length: 45 }, (_, i) => `Detailed method ${i}. Investment assumptions.`).join("\n\n");
  let reviewing = false;
  f.fetcher.mockImplementation(async (_url, init) => {
    const request = JSON.parse(init!.body as string);
    if (request.messages[0].content.startsWith("Check whether")) {
      reviewing = true; await new Promise<void>(resolve => init!.signal!.addEventListener("abort", () => resolve(), { once: true })); throw Error("aborted");
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: "Summarize methods", sourceIds: ["note:a"], compare: false, queries: [] }) } }] }), { headers: { "content-type": "application/json" } });
  });
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a"] }); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Compare these papers' definitions");
  await vi.waitFor(() => expect(reviewing).toBe(true)); await f.service.stop(f.chat.id);
  expect((await f.settled()).messages.at(-1)!.status).toBe("stopped"); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("skips paid planning/review for a resolved focused follow-up with usable coverage", async () => {
  const f = await fixture(); f.notes[0].content = "Alvarez. Investment losses.\n\n" + Array.from({ length: 45 }, (_, i) => `Result ${i}: total losses are ${i + 1}.2 billion CNY.`).join("\n\n");
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a"] });
  await f.service.send(f.chat.id, "siliconflow", "fixture-model", "Alvarez: total losses是多少？");
  const saved = await f.settled(); expect(saved.messages.at(-1)!.status).toBe("complete");
  expect(f.fetcher).toHaveBeenCalledTimes(1); expect(saved.messages.at(-1)!.grounding!.research).toMatchObject({ modelChecks: 0, review: "not-needed" });
  expect(JSON.stringify(f.fetcher.mock.calls)).toContain("unitEquivalents");
});

it("persists a corrected cited amount without another API request and keeps original reasoning intact", async () => {
  const f = await fixture(); f.notes[0].content = "Results: the national total is CNY 28.4 billion.";
  f.fetcher.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: "全国损失为28.4亿元人民币 [S1]。", reasoning_content: "Original provider thinking stays unchanged." } }], usage: { prompt_tokens: 50, completion_tokens: 15 } }), { headers: { "content-type": "application/json" } }));
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["a"] }); await f.service.send(f.chat.id, "siliconflow", "fixture-model", "全国损失多少钱？");
  const chat = await f.settled(), reply = chat.messages.at(-1)!;
  expect(reply.content).toContain("284亿元人民币"); expect(reply.reasoning).toBe("Original provider thinking stays unchanged.");
  expect(reply.grounding!.warnings.some(w => w.startsWith("Unit corrected"))).toBe(true); expect(reply.grounding!.warnings.some(w => w.startsWith("Amount needs checking"))).toBe(false);
  expect(f.fetcher).toHaveBeenCalledTimes(1); expect((await f.chats.get(chat.id)).messages.at(-1)!.content).toBe(reply.content);
});

it("switches to a lowercase named paper instead of inheriting the old focus and keeps irrelevant diagnostics out of the model payload", async () => {
  const f = await fixture();
  f.notes[0].content = "Alvarez et al. Coal study.\n\n" + Array.from({ length: 40 }, (_, i) => `Coal retirement result ${i}.`).join("\n\n");
  f.notes[1].content = "Bennett et al. Refinery study.\n\n" + Array.from({ length: 40 }, (_, i) => `Refinery retrofit result ${i}.`).join("\n\n");
  const scope = { ...emptyKnowledgeScope(), noteIds: ["a", "b"] };
  const first: AIChat = { ...f.chat, sourceScope: scope, messages: [{ id: "q1", role: "user", content: "Alvarez 的煤电结果是什么？", sourceScope: scope, status: "complete", createdAt: new Date().toISOString() }] };
  const original = await f.grounder.prepare(first, new AbortController().signal, () => {});
  const next: AIChat = { ...first, messages: [...first.messages, { id: "a1", role: "assistant", content: "Old answer is not evidence: invented 999.", status: "complete", sourceScope: scope, grounding: original.grounding, createdAt: new Date().toISOString() }, { id: "q2", role: "user", content: "再看bennett炼油这篇。改造结果是什么？", sourceScope: scope, status: "complete", createdAt: new Date().toISOString() }] };
  const prepared = await f.grounder.prepare(next, new AbortController().signal, () => {}), payload = JSON.parse(prepared.messages[1].content);
  expect(prepared.grounding.research!.focusSourceIds).toEqual(["note:b"]);
  expect(prepared.grounding.evidence.every(hit => hit.source.id === "note:b")).toBe(true);
  expect(payload.selectedSources.map((source: any) => source.id)).toEqual(["note:b"]);
  expect(prepared.grounding.sourceIds).toEqual(["note:a", "note:b"]);
  expect(payload.coverageNotes).toBeUndefined(); expect(payload.sourcesWithoutExcerpts).toBeUndefined(); expect(payload.missingRelevantSources).toEqual([]);
  expect(prepared.grounding.warnings.some(warning => warning.includes("no excerpt"))).toBe(true);
  expect(prepared.messages.some(message => message.content.includes("invented 999"))).toBe(false);
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("retrieves both sides of a natural contradiction question even when the planning model omits an explicitly named source", async () => {
  const f = await fixture();
  f.notes[0].content = "Alvarez et al. Economy.\n\n" + Array.from({ length: 35 }, (_, i) => `GDP benefit result ${i}.`).join("\n\n");
  f.notes[1].content = "Bennett et al. Industry.\n\n" + Array.from({ length: 35 }, (_, i) => `Factory value loss result ${i}.`).join("\n\n");
  const scope = { ...emptyKnowledgeScope(), noteIds: ["a", "b"] }, question = "Alvarez 说经济受益，Bennett 却有工厂损失。这是不是矛盾？";
  const chat: AIChat = { ...f.chat, sourceScope: scope, messages: [{ id: "q", role: "user", content: question, sourceScope: scope, status: "complete", createdAt: new Date().toISOString() }] };
  const consult = vi.fn(async (_messages: Array<{ role: string; content: string }>, stage: "plan" | "review") => stage === "plan" ? JSON.stringify({ question, sourceIds: ["note:a"], compare: false, queries: [] }) : JSON.stringify({ sufficient: true, queries: [] }));
  const prepared = await f.grounder.prepare(chat, new AbortController().signal, () => {}, consult);
  expect(new Set(prepared.grounding.research!.focusSourceIds)).toEqual(new Set(["note:a", "note:b"]));
  expect(new Set(prepared.grounding.evidence.map(hit => hit.source.id))).toEqual(new Set(["note:a", "note:b"]));
  expect(consult).toHaveBeenCalledTimes(2); expect(f.fetcher).not.toHaveBeenCalled();
  expect(JSON.stringify(prepared.messages)).not.toContain("SecretOutsideSelection");
});
