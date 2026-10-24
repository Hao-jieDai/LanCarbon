// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { AIChatStore, AISettingsStore } from "../electron/ai-storage";
import { AIClient } from "../electron/ai-client";
import { AIService } from "../electron/ai-service";
import { KnowledgeStore } from "../electron/knowledge-store";
import { knowledgeSnapshot } from "../electron/knowledge-sources";
import { ChatGrounder } from "../electron/chat-grounding";
import { PaperQAGrounder } from "../electron/paperqa-grounding";
import { emptyKnowledgeScope } from "../src/shared/knowledge";
import { defaultAIProviders, type AIChat } from "../src/shared/ai";
import { createNote } from "../src/shared/notes";
import { extractMarkdown } from "../src/shared/knowledgeText";
import type { PaperQACompiler } from "../electron/paperqa-bridge";
import type { RetrievalService } from "../electron/retrieval-service";
import type { AIUsageEvent } from "../src/shared/aiUsage";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); });
async function fixture(body = "Study includes adults and children. Follow-up excludes emergency admissions.") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-paperqa-test-"));
  const notes = [createNote({ id: "study", title: "Clinical scope", content: body }), createNote({ id: "transport", title: "Transport", content: "Passenger trips differ from unique passengers." }), createNote({ id: "private", title: "Private", content: "DO_NOT_SEND_PRIVATE_SOURCE" })];
  const snapshot = async () => knowledgeSnapshot({ version: 2, notes, books: [] }, [], []);
  const store = new KnowledgeStore(root, snapshot, async () => { throw Error(); }, { extract: async (_source, input) => extractMarkdown(String(input)), idle() {} });
  const retrieval = { stop: vi.fn(async () => {}), search: vi.fn(async () => { throw Error("Search forbidden"); }), build: vi.fn(async () => { throw Error("Embedding forbidden"); }) } as unknown as RetrievalService;
  const common = new ChatGrounder(() => store, () => retrieval, async () => true);
  const compile = vi.fn<PaperQACompiler>(async (question, evidence, signal) => { signal.throwIfAborted(); return { engine: "paperqa", version: "2026.8.12", labels: evidence.map(e => e.label), messages: [{ role: "system", content: "Use original sources." }, { role: "user", content: evidence.map(e => e.chunk.text).join("\n") + "\n" + question }] }; });
  const grounder = new PaperQAGrounder(() => store, common, compile, () => retrieval.stop());
  const chats = new AIChatStore(root), settings = new AISettingsStore(root, { available: () => true, encrypt: s => Buffer.from(s), decrypt: b => b.toString() });
  const model = "deepseek-ai/DeepSeek-V4.1-Flash";
  await settings.save({ ...defaultAIProviders()[0], apiKey: "mock-secret", models: [{ id: model, name: "Flash", purpose: "chat" }], defaultModel: model });
  const usage: AIUsageEvent[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Scope includes both groups [S1].", reasoning_content: "Checking source." }, finish_reason: "stop" }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } }), { headers: { "content-type": "application/json" } }));
  const service = new AIService(settings, () => chats, new AIClient(fetcher, async e => { usage.push(e); }), () => {}, grounder);
  const chat = await chats.create("siliconflow", model);
  await service.setSources(chat.id, { ...emptyKnowledgeScope(), noteIds: ["study"], includeAttachments: false });
  const settled = async () => { await vi.waitFor(async () => expect((await chats.get(chat.id)).messages.at(-1)?.status).not.toBe("streaming"), { timeout: 15000 }); return chats.get(chat.id); };
  cleanups.push(async () => { await service.shutdown(); await store.stop(); if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("lancarbon-paperqa-test-")) throw Error("Unsafe test cleanup"); await fs.rm(root, { recursive: true, force: true }); });
  return { root, notes, store, common, grounder, compile, retrieval, chats, settings, chat, model, service, fetcher, usage, settled };
}

it("sends all selected passages beyond the old evidence cap once, persists them and opens the original", async () => {
  const f = await fixture(Array.from({ length: 130 }, (_, i) => `## Section ${i}\n\n${'Clinical observation with qualifications. '.repeat(24)}END_${i}`).join("\n\n"));
  await f.service.send(f.chat.id, "siliconflow", f.model, "Compare scope and qualifications");
  const chat = await f.settled(), answer = chat.messages.at(-1)!;
  expect(answer.status).toBe("complete"); expect(answer.grounding?.mode).toBe("full-text"); expect(answer.grounding!.evidence.length).toBeGreaterThan(96);
  const request = JSON.parse(String(f.fetcher.mock.calls[0][1]?.body));
  expect(JSON.stringify(request)).toContain("END_129"); expect(JSON.stringify(request)).not.toContain("DO_NOT_SEND_PRIVATE_SOURCE");
  for (const hit of answer.grounding!.evidence) expect(JSON.stringify(request.messages)).toContain(JSON.stringify(hit.chunk.text).slice(1, -1));
  expect(f.fetcher).toHaveBeenCalledTimes(1); expect(f.retrieval.build).not.toHaveBeenCalled(); expect(f.retrieval.search).not.toHaveBeenCalled();
  expect(f.usage.filter(e => e.type === "start")).toHaveLength(1); expect(f.usage.at(-1)).toMatchObject({ type: "finish", status: "complete", usage: { totalTokens: 100 } });
  expect(answer.reasoning).toBe("Checking source.");
  expect((await new AIChatStore(f.root).get(chat.id)).messages.at(-1)?.grounding?.evidence).toEqual(answer.grounding?.evidence);
  expect((await f.common.open(chat, answer.id, "S1")).source.id).toBe("note:study");
});

it("retains completed same-selection turns, re-reads edits and removes earlier scope from the prompt", async () => {
  const f = await fixture();
  await f.service.send(f.chat.id, "siliconflow", f.model, "Who was included?"); await f.settled();
  f.notes[0].content = "New source revision: only adolescents are included.";
  await f.service.send(f.chat.id, "siliconflow", f.model, "Has this changed?"); const edited = await f.settled();
  const request = JSON.parse(String(f.fetcher.mock.calls[1][1]?.body));
  expect(request.messages.some((m: any) => m.role === "user" && m.content === "Who was included?")).toBe(true);
  expect(request.messages.at(-1).content).toContain("only adolescents"); expect(request.messages.at(-1).content).not.toContain("adults and children");
  await expect(f.common.open(edited, edited.messages[1].id, "S1")).rejects.toThrow("changed");
  await f.service.setSources(f.chat.id, { ...emptyKnowledgeScope(), noteIds: ["transport"], includeAttachments: false });
  await f.service.send(f.chat.id, "siliconflow", f.model, "What is counted?"); await f.settled();
  const changed = JSON.parse(String(f.fetcher.mock.calls[2][1]?.body));
  expect(JSON.stringify(changed)).toContain("Passenger trips"); expect(JSON.stringify(changed)).not.toContain("adolescents"); expect(JSON.stringify(changed)).not.toContain("Who was included?");
});

it("blocks oversized or incomplete selections and removed files before any model call", async () => {
  const f = await fixture("A".repeat(501000));
  await f.service.send(f.chat.id, "siliconflow", f.model, "Summarize"); let reply = (await f.settled()).messages.at(-1)!;
  expect(reply.status).toBe("error"); expect(reply.error).toMatch(/limit|ready/); expect(f.fetcher).not.toHaveBeenCalled();
  f.notes.splice(0, 1);
  await f.service.send(f.chat.id, "siliconflow", f.model, "Try again"); reply = (await f.settled()).messages.at(-1)!;
  expect(reply.error).toMatch(/missing|selected/); expect(f.fetcher).not.toHaveBeenCalled();
});

it("does not silently fall back when the native runtime fails or when cancelled", async () => {
  const f = await fixture(); f.compile.mockRejectedValueOnce(Error("Runtime unavailable"));
  await f.service.send(f.chat.id, "siliconflow", f.model, "Scope?"); expect((await f.settled()).messages.at(-1)?.error).toContain("Runtime unavailable");
  expect(f.fetcher).not.toHaveBeenCalled();
  f.compile.mockImplementationOnce(async (_q, _e, signal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(Error("stopped")), { once: true }); }));
  await f.service.send(f.chat.id, "siliconflow", f.model, "Scope again?");
  await vi.waitFor(() => expect(f.compile).toHaveBeenCalledTimes(2)); await f.service.stop(f.chat.id);
  expect((await f.settled()).messages.at(-1)?.status).toBe("stopped"); expect(f.fetcher).not.toHaveBeenCalled();
});

it("rejects a source revision during native preparation before sending stale text", async () => {
  const f = await fixture();
  const original = f.compile.getMockImplementation()!;
  f.compile.mockImplementationOnce(async (...args) => { const output = await original(...args); f.notes[0].content = "Revised during preparation"; return output; });
  await f.service.send(f.chat.id, "siliconflow", f.model, "Scope?");
  expect((await f.settled()).messages.at(-1)?.error).toContain("changed"); expect(f.fetcher).not.toHaveBeenCalled();
});

it("preserves the generated text without legacy repairs while retaining citation validation", async () => {
  const f = await fixture("Costs are USD 2 billion for the transport scenario.");
  await f.service.send(f.chat.id, "siliconflow", f.model, "Costs?");
  const grounding = (await f.settled()).messages.at(-1)!.grounding!;
  const generated = "Costs are 2 billion USD, or 2 亿美元 [S1]. An unknown source [S998].";
  expect(await f.grounder.finish(grounding, generated)).toBe(generated);
  expect(grounding.warnings).toEqual(["The reply contains an unrecognized citation. Only the saved evidence entries below can be opened."]);
});
