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
import { createNote } from "../src/shared/notes";
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
  const service = new AIService(settings, () => chats, new AIClient(fetcher), () => {}, grounder), chat = await chats.create("siliconflow", "fixture-model");
  const settled = async () => { for (let i = 0; i < 300; i++) { const current = await chats.get(chat.id); if (current.messages.at(-1)?.status !== "streaming") return current; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error("Not settled"); };
  return { root, notes, store, searches, retrieval, grounder, chats, service, chat, fetcher, settled };
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
  expect(prepared.grounding.evidence.length).toBeLessThanOrEqual(24); expect(prepared.grounding.evidence.some(hit => hit.chunk.text.includes("region"))).toBe(true);
  await f.grounder.finish(prepared.grounding, "Unverifiable [S999]"); expect(prepared.grounding.warnings.join(" ")).toContain("unrecognized citation"); expect(prepared.grounding.warnings.join(" ")).toContain("did not supply valid");
  const long = Array.from({ length: 90 }, (_, i) => ({ ...prepared.grounding.evidence[0], chunk: { ...prepared.grounding.evidence[0].chunk, id: String(i) } }));
  const selected = chooseEvidence([...long, ...prepared.grounding.evidence.filter(hit => hit.source.id === "note:b")], long, ["note:a", "note:b"], true); expect(new Set(selected.map(hit => hit.source.id)).size).toBe(2); expect(selected.length).toBeLessThanOrEqual(24);
});
it("discovers role-specific OpenRouter catalogues without polluting Chat models or exposing keys", async () => {
  const urls: string[] = [], fetcher = vi.fn<typeof fetch>(async url => { urls.push(String(url)); return new Response(JSON.stringify({ data: [{ id: "embed:free", name: "Free embedding", architecture: { output_modalities: ["embeddings"] }, pricing: { prompt: "0", completion: "0" } }, { id: "rank:free", architecture: { output_modalities: ["rerank"] } }, { id: "chat", architecture: { output_modalities: ["text"] } }] })); });
  const client = new RetrievalClient(fetcher), connection = { provider: defaultAIProviders()[1], key: "fixture-secret", modelId: "", modelName: "" };
  expect((await client.models(connection, "embedding")).map(model => model.id)).toEqual(["embed:free"]); expect((await client.models(connection, "rerank")).map(model => model.id)).toEqual(["rank:free"]); expect(urls).toEqual(["https://openrouter.ai/api/v1/embeddings/models", "https://openrouter.ai/api/v1/models?output_modalities=rerank"]);
});
