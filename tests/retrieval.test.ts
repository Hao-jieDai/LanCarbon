// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { AISettingsStore } from "../electron/ai-storage";
import { AIPriceStore, AIUsageStore } from "../electron/ai-usage";
import { RetrievalSettingsStore, validRetrievalSettings } from "../electron/retrieval-settings";
import { RetrievalCache } from "../electron/retrieval-cache";
import { RetrievalClient, normalizeVector, type RetrievalConnection } from "../electron/retrieval-client";
import { RetrievalService, keywordRanks, retrievalProfile } from "../electron/retrieval-service";
import { defaultRetrievalSettings, retrievalPriceProviders } from "../src/shared/retrieval";
import { defaultAIProviders } from "../src/shared/ai";
import type { KnowledgeHit } from "../src/shared/knowledge";
const roots: string[] = [], services: RetrievalService[] = [], caches: RetrievalCache[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.shutdown(); for (const cache of caches.splice(0)) cache.close(); for (const root of roots.splice(0)) { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith("lancarbon-retrieval-")) throw Error("Unsafe cleanup"); await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); } });
async function root() { const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-retrieval-")); roots.push(directory); return directory; }
const connection = (modelId = "BAAI/bge-m3"): RetrievalConnection => ({ provider: { ...defaultAIProviders()[0], hasKey: true }, key: "fixture-secret-12345", modelId, modelName: modelId });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const hit = (text: string, id = "paper", index = "0"): KnowledgeHit => ({ source: { id: `file:${id}`, entityId: id, kind: "file", format: "pdf", title: id, fingerprint: id + text, locations: [{ kind: "file", fileId: id, label: id }], tags: [], attachments: [], systemManaged: false }, chunk: { id: index, text, anchor: { kind: "pdf", page: 1 } }, fingerprint: id + text });
async function fixture() {
  const directory = await root(), cache = new RetrievalCache(directory); caches.push(cache); const settings = { ...defaultRetrievalSettings(), enabled: true, embedding: { mode: "reuse" as const, providerId: "siliconflow", modelId: "BAAI/bge-m3", modelName: "BGE" } };
  const state = { corpus: [hit("Climate investment and carbon policy.", "paper"), hit("A recipe for bread.", "recipe")], connection: connection() };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => { const request = JSON.parse(init!.body as string); if (String(url).endsWith("/rerank")) return json({ results: request.documents.map((_text: string, index: number) => ({ index, relevance_score: index === 0 ? 0.9 : 0.1 })), usage: { total_tokens: 8 } }); return json({ data: request.input.map((text: string, index: number) => ({ index, embedding: /Climate|carbon|气候/i.test(text) ? [1, 0] : [0, 1] })), usage: { prompt_tokens: 10, total_tokens: 10 } }); });
  const client = new RetrievalClient(fetcher), service = new RetrievalService(async () => settings, async () => state.connection, async () => state.corpus, cache, client); services.push(service);
  const settle = async () => { for (let i = 0; i < 300; i++) { const value = await service.status(); if (!value.running) return value; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error("Retrieval did not finish"); };
  return { directory, cache, settings, state, fetcher, client, service, settle };
}
it("stores independent retrieval settings and encrypted dedicated keys without changing Chat settings", async () => {
  const directory = await root(), codec = { available: () => true, encrypt: (value: string) => Buffer.from(value.split("").reverse().join("")), decrypt: (value: Buffer) => value.toString().split("").reverse().join("") }, chat = new AISettingsStore(directory, codec), dedicated = new AISettingsStore(directory, codec, "retrieval-");
  await chat.save({ ...defaultAIProviders()[0], apiKey: "chat-secret" }); const original = await fs.readFile(path.join(directory, "ai-settings.json")); const provider = (await dedicated.list())[0]; const publicValue = await dedicated.save({ ...provider, apiKey: "embedding-secret" }); expect(JSON.stringify(publicValue)).not.toContain("embedding-secret"); expect(publicValue[0].maskedKey).toBe("embe••••••••cret"); expect((await dedicated.connection(provider.id)).key).toBe("embedding-secret"); expect(await fs.readFile(path.join(directory, "ai-settings.json"))).toEqual(original);
  const store = new RetrievalSettingsStore(directory); expect((await store.get()).enabled).toBe(false); const settings = { ...defaultRetrievalSettings(), embedding: { mode: "custom" as const, providerId: provider.id, modelId: "BAAI/bge-m3", modelName: "BGE" } }; await store.save(settings); expect(await new RetrievalSettingsStore(directory).get()).toEqual(settings);
});
it("validates configuration roles and appends retrieval prices without mutating Chat model lists", () => {
  expect(() => validRetrievalSettings({ ...defaultRetrievalSettings(), enabled: true })).toThrow(); expect(() => validRetrievalSettings({ ...defaultRetrievalSettings(), embedding: { mode: "reuse", providerId: "retrieval-siliconflow", modelId: "x", modelName: "x" } })).toThrow(); const shared = defaultAIProviders(), settings = { ...defaultRetrievalSettings(), embedding: { mode: "reuse" as const, providerId: "siliconflow", modelId: "BAAI/bge-m3", modelName: "BGE" } }; const priced = retrievalPriceProviders(shared, [], settings); expect(priced[0].models[0].purpose).toBe("embedding"); expect(shared[0].models).toEqual([]);
});
it("normalizes finite vectors and rejects empty, zero and non-finite embeddings", () => { expect([...normalizeVector([3, 4])]).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]); for (const value of [[], [0, 0], [NaN, 1], [Infinity, 0], ["1", 0]]) expect(() => normalizeVector(value)).toThrow(); });
it("restores out-of-order embedding indices and tracks input-only usage and request-time costs", async () => {
  const directory = await root(), prices = new AIPriceStore(directory), usage = new AIUsageStore(directory, prices); await prices.save({ providerId: "siliconflow", baseUrl: connection().provider.baseUrl, modelId: connection().modelId, currency: "CNY", input: 0.07, output: 0 });
  const client = new RetrievalClient(vi.fn(async () => json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 20, total_tokens: 20 } })), event => usage.record(event)); const result = await client.embed(connection(), ["A", "B"], new AbortController().signal); expect([...result[0]]).toEqual([1, 0]); const record = (await usage.query({ purpose: "embedding" })).records[0]; expect(record).toMatchObject({ inputTokens: 20, outputTokens: 0, totalTokens: 20, purpose: "embedding", cost: { amount: 0.0000014, source: "estimated" } });
});
it("rejects incomplete or duplicated embedding indices instead of linking vectors to wrong passages", async () => {
  for (const data of [[{ index: 0, embedding: [1] }], [{ index: 0, embedding: [1] }, { index: 0, embedding: [1] }], [{ index: 0, embedding: [1] }, { index: 1, embedding: [1, 0] }]]) { const client = new RetrievalClient(vi.fn(async () => json({ data }))); await expect(client.embed(connection(), ["A", "B"], new AbortController().signal)).rejects.toThrow(); }
});
it("validates rerank indices and keeps the input candidate mapping", async () => {
  const client = new RetrievalClient(vi.fn(async () => json({ results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }] }))); expect((await client.rerank(connection("rerank"), "question", ["A", "B"], new AbortController().signal))[0].index).toBe(1);
  const invalid = new RetrievalClient(vi.fn(async () => json({ results: [{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 0 }] }))); await expect(invalid.rerank(connection(), "question", ["A", "B"], new AbortController().signal)).rejects.toThrow("indices");
});
it("records SiliconFlow rerank metadata tokens instead of treating usage as missing", async () => {
  const events: any[] = [], client = new RetrievalClient(vi.fn(async () => json({ results: [{ index: 0, relevance_score: 0.9 }], meta: { tokens: { input_tokens: 150, output_tokens: 10 }, billed_units: { search_units: 1 } } })), async event => { events.push(event); }); await client.rerank(connection("rerank"), "question", ["A"], new AbortController().signal); expect(events[1].usage).toMatchObject({ inputTokens: 150, outputTokens: 10, totalTokens: 160 });
});
it("redacts service keys and allows cancellation while an upstream rate limit is waiting", async () => {
  const key = connection().key, fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: key } }), { status: 401 })), client = new RetrievalClient(fetcher); await expect(client.embed(connection(), ["A"], new AbortController().signal)).rejects.toThrow("[API key hidden]"); expect(fetcher).toHaveBeenCalledTimes(1);
  const controller = new AbortController(), retry = new RetrievalClient(vi.fn(async () => { controller.abort(); return new Response("busy", { status: 429 }); })); await expect(retry.embed(connection(), ["A"], controller.signal)).rejects.toThrow("stopped");
});
it("persists SQLite vectors, isolates model profiles and rejects mixed dimensions", async () => {
  const directory = await root(), cache = new RetrievalCache(directory); caches.push(cache); const profile = retrievalProfile(connection()); await cache.put(profile, [{ key: "text", vector: normalizeVector([1, 0]) }]); cache.close(); const restored = new RetrievalCache(directory); caches.push(restored); expect([...(await restored.get(profile, "text"))!]).toEqual([1, 0]); expect(await restored.get(retrievalProfile(connection("other")), "text")).toBeUndefined(); await expect(restored.put(profile, [{ key: "new", vector: normalizeVector([1, 0, 0]) }])).rejects.toThrow("dimensions");
});
it("prepares only changed text and reuses vectors after rename, move and restart", async () => {
  const f = await fixture(); await f.service.build(); expect((await f.settle()).ready).toBe(2); expect(f.fetcher).toHaveBeenCalledTimes(1); f.state.corpus[0].source.title = "Renamed"; await f.service.build(); await f.settle(); expect(f.fetcher).toHaveBeenCalledTimes(1); f.state.corpus[0] = hit("Climate new evidence.", "paper"); await f.service.build(); await f.settle(); expect(f.fetcher).toHaveBeenCalledTimes(2); f.cache.close(); expect((await f.service.status()).ready).toBe(2);
});
it("retrieves cross-language semantic evidence and honors an explicit per-question source scope", async () => {
  const f = await fixture(); await f.service.build(); await f.settle(); const result = await f.service.search("气候变化如何影响投资？"); expect(result.mode).toBe("hybrid"); expect(result.hits[0].source.entityId).toBe("paper"); const scoped = await f.service.search("气候变化如何影响投资？", ["file:recipe"]); expect(scoped.hits.map(hit => hit.source.entityId)).toEqual(["recipe"]); expect((await f.service.search("question", [])).hits).toEqual([]);
});
it("uses BM25 keyword evidence without API calls while semantic retrieval is disabled", async () => {
  const f = await fixture(); f.settings.enabled = false; const result = await f.service.search("carbon policy"); expect(result.mode).toBe("keyword"); expect(result.hits[0].source.entityId).toBe("paper"); expect(f.fetcher).not.toHaveBeenCalled(); expect((await keywordRanks([hit("政策变化造成搁浅资产。"), hit("吃饭。", "other")], "搁浅资产"))[0].index).toBe(0);
});
it("marks rerank failure explicitly while retaining usable hybrid candidates", async () => {
  const f = await fixture(); await f.service.build(); await f.settle(); f.settings.rerankEnabled = true; f.fetcher.mockImplementationOnce(async (_url, init) => { const request = JSON.parse(init!.body as string); return json({ data: request.input.map((_text: string, index: number) => ({ index, embedding: [1, 0] })) }); }).mockImplementationOnce(async () => new Response("No access", { status: 403 })); const result = await f.service.search("climate"); expect(result.mode).toBe("hybrid"); expect(result.warnings.join(" ")).toContain("Reranking unavailable"); expect(result.hits[0].source.entityId).toBe("paper");
});
it("removes stale passages that change during remote query embedding", async () => {
  const f = await fixture(); await f.service.build(); await f.settle(); f.fetcher.mockImplementationOnce(async () => { f.state.corpus = [hit("A recipe for bread.", "recipe")]; return json({ data: [{ index: 0, embedding: [1, 0] }] }); }); const result = await f.service.search("climate"); expect(result.hits.every(hit => hit.source.entityId !== "paper")).toBe(true);
});
it("cancels late embedding batches and clears only derived vectors", async () => {
  const f = await fixture(); let release!: () => void; f.fetcher.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return json({ data: [{ index: 0, embedding: [1, 0] }, { index: 1, embedding: [0, 1] }] }); }); await f.service.build(); for (let i = 0; !release && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5)); const stopping = f.service.stop(); release(); await stopping; expect((await f.service.status()).ready).toBe(0); const original = JSON.stringify(f.state.corpus); await f.service.clear(); expect(JSON.stringify(f.state.corpus)).toBe(original); expect((await f.service.status()).ready).toBe(0);
});
it("preserves rerank order and multiple answers from one document regardless of selection or catalogue order", async () => {
  const f = await fixture(); f.settings.rerankEnabled = true;
  f.state.corpus = [...Array.from({ length: 35 }, (_, i) => hit("Climate policy background.", `noise-${i}`)), ...Array.from({ length: 10 }, (_, i) => hit(`Climate policy answer-${i}.`, "answer", String(i)))];
  f.fetcher.mockImplementation(async (_url, init) => {
    const request = JSON.parse(init!.body as string);
    return json({ results: request.documents.map((text: string, index: number) => ({ index, relevance_score: text.includes("answer-") ? 0.99 - Number(/answer-(\d+)/.exec(text)![1]) / 100 : 0.01 })) });
  });
  const ids = [...new Set(f.state.corpus.map(hit => hit.source.id))], first = await f.service.search("Climate policy", ids, 20);
  expect(first.hits[0].chunk.text).toContain("answer-0");
  expect(first.hits.slice(0, 10).every(hit => hit.source.id === "file:answer")).toBe(true);
  f.state.corpus.reverse();
  const second = await f.service.search("Climate policy", [...ids].reverse(), 20);
  expect(second.hits.map(hit => `${hit.source.id}:${hit.chunk.id}`)).toEqual(first.hits.map(hit => `${hit.source.id}:${hit.chunk.id}`));
  expect(f.fetcher.mock.calls.every(call => String(call[0]).endsWith("/rerank"))).toBe(true);
});
it("does not collapse identical table rows on different pages before ranking", async () => {
  const f = await fixture(); f.settings.enabled = false;
  const first = hit("Total investment | 20", "paper", "first"), second = hit("Total investment | 20", "paper", "second"); second.chunk.anchor.page = 2;
  f.state.corpus = [first, second];
  const results = await f.service.search("Total investment", ["file:paper"]);
  expect(results.hits.map(hit => hit.chunk.anchor.page).sort()).toEqual([1, 2]);
  expect(f.fetcher).not.toHaveBeenCalled();
});
