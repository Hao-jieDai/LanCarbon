// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AISettingsStore, AIChatStore, type SecretCodec } from "../electron/ai-storage";
import { AIClient } from "../electron/ai-client";
import { AIService, conversationMessages } from "../electron/ai-service";
import { DEFAULT_AI_SYSTEM_PROMPT, defaultAIProviders, type AIChat, type AIProviderInput } from "../src/shared/ai";

let root: string;
const secret = "fixture-api-key-private";
const codec: SecretCodec = { available: () => true, encrypt: value => Buffer.from(value.split("").reverse().join("")), decrypt: bytes => bytes.toString().split("").reverse().join("") };
const config = (id = "siliconflow"): AIProviderInput => ({ ...defaultAIProviders().find(item => item.id === id)!, apiKey: secret, models: [{ id: id === "openrouter" ? "openai/gpt-6-luna" : "deepseek-ai/DeepSeek-V4-Pro", name: "Fixture model", purpose: "chat" }], defaultModel: "" });
const sse = (text = "Hello") => new Response(`: keepalive\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "Provided reasoning" } }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [], usage: { total_tokens: 9 } })}\r\n\r\ndata: [DONE]\r\n\r\n`, { headers: { "Content-Type": "text/event-stream" } });
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ai-unit-")); });
afterEach(async () => { vi.useRealTimers(); await fs.rm(root, { recursive: true, force: true }); });

describe("AI settings and conversations", () => {
  it("applies academic LaTeX output rules to existing custom settings without changing saved preferences or Thinking", async () => {
    const settings = new AISettingsStore(root, codec); await settings.save(config()); await settings.savePreferences("Use brief Chinese explanations.");
    const before = await fs.readFile(path.join(root, "ai-settings.json"));
    const store = new AIChatStore(root), fetcher = vi.fn().mockImplementation(async () => sse("Formula \\(x_i^2\\).\n\n\\[y=\\frac{a}{b}\\]"));
    const service = new AIService(settings, () => store, new AIClient(fetcher), () => {}), chat = await store.create("siliconflow", config().models[0].id);
    await service.send(chat.id, "siliconflow", config().models[0].id, "Give a formula.");
    await vi.waitFor(async () => expect((await store.get(chat.id)).messages.at(-1)?.status).toBe("complete"));
    const system = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content;
    expect(system).toContain("Use brief Chinese explanations."); expect(system).toContain("metaphors"); expect(system).toContain("LaTeX");
    const reply = (await store.get(chat.id)).messages.at(-1)!; expect(reply.content).toContain("$x_i^2$"); expect(reply.content).toContain("$$\ny=\\frac{a}{b}\n$$"); expect(reply.reasoning).toBe("Provided reasoning");
    expect(await fs.readFile(path.join(root, "ai-settings.json"))).toEqual(before); expect(fetcher).toHaveBeenCalledTimes(1); await service.shutdown();
  });
  it("encrypts keys, keeps them out of public records, preserves blank keys and supports re-entry on another Windows account", async () => {
    const store = new AISettingsStore(root, codec); const saved = await store.save(config());
    expect(saved[0].hasKey).toBe(true); expect(JSON.stringify(saved)).not.toContain(secret);
    expect(saved[0].maskedKey).toBe("fixt••••••••vate");
    expect(await fs.readFile(path.join(root, "ai-settings.json"), "utf8")).not.toContain(secret);
    expect((await store.connection("siliconflow")).key).toBe(secret);
    await store.save({ ...config(), apiKey: undefined }); expect((await store.connection("siliconflow")).key).toBe(secret);
    const moved = new AISettingsStore(root, { ...codec, decrypt: () => { throw new Error("Wrong account"); } });
    await expect(moved.connection("siliconflow")).rejects.toThrow("Enter it again");
    await store.save({ ...config(), apiKey: undefined, clearKey: true }); expect((await store.list())[0].hasKey).toBe(false);
  });
  it("upgrades legacy keys to masked public views and preserves shared guidelines and other providers when removing a key", async () => {
    const store = new AISettingsStore(root, codec); await store.save(config()); await store.save(config("openrouter"));
    const filename = path.join(root, "ai-settings.json"), legacy = JSON.parse(await fs.readFile(filename, "utf8")); delete legacy.systemPrompt; await fs.writeFile(filename, JSON.stringify(legacy));
    expect(await store.preferences()).toBe(DEFAULT_AI_SYSTEM_PROMPT);
    await store.savePreferences("专业、中立，不使用 emoji。"); await store.save({ ...config(), apiKey: undefined });
    expect(await new AISettingsStore(root, codec).preferences()).toContain("专业");
    const cleared = await store.clearKey("siliconflow"); expect(cleared[0]).toMatchObject({ hasKey: false, models: config().models }); expect(cleared[0].maskedKey).toBeUndefined();
    expect((await store.connection("openrouter")).key).toBe(secret); expect(await store.preferences()).toContain("专业");
    await expect(store.savePreferences("x".repeat(12001))).rejects.toThrow("response guidelines");
    expect(JSON.stringify(await store.list())).not.toContain(secret);
    await store.save({ ...config(), apiKey: "tiny" }); expect((await store.list())[0].maskedKey).toBe("••••••••");
  });
  it("refuses plaintext fallback, malformed endpoints and unsupported formats without overwriting saved settings", async () => {
    await expect(new AISettingsStore(root, { ...codec, available: () => false }).save(config())).rejects.toThrow("key was not saved");
    const store = new AISettingsStore(root, codec);
    for (const baseUrl of ["https://example.com/v1/chat/completions", "http://example.com/v1", "https://user:pass@example.com/v1", "https://example.com/v1?key=secret"]) await expect(store.save({ ...config("others"), baseUrl })).rejects.toThrow();
    const raw = JSON.stringify({ version: 20, providers: [] }); await fs.writeFile(path.join(root, "ai-settings.json"), raw);
    await expect(store.save(config())).rejects.toThrow("Unsupported"); expect(await fs.readFile(path.join(root, "ai-settings.json"), "utf8")).toBe(raw);
  });
  it("keeps chat data separate and recovers interrupted replies after restarting", async () => {
    const store = new AIChatStore(root), chat = await store.create("siliconflow", "model");
    await Promise.all([store.rename(chat.id, "My conversation"), store.update(chat.id, item => { item.messages.push({ id: "fixture-reply", role: "assistant", content: "Partial reply", status: "streaming", createdAt: "today" }); })]);
    const restored = await new AIChatStore(root).get(chat.id); expect(restored.title).toBe("My conversation"); expect(restored.messages[0]).toMatchObject({ content: "Partial reply", status: "stopped" });
    expect(await fs.stat(path.join(root, "notes.json")).catch(() => null)).toBeNull();
  });
});
describe("provider adapters and durable streaming", () => {
  it("uses each official endpoint and exact model ID, handles reasoning and usage frames without adding unsupported generation parameters", async () => {
    for (const id of ["siliconflow", "openrouter"]) {
      const settings = new AISettingsStore(root, codec); await settings.save(config(id)); const { provider, key } = await settings.connection(id);
      const fetcher = vi.fn().mockResolvedValue(sse()); const deltas: string[] = [];
      await new AIClient(fetcher).complete(provider, key, provider.defaultModel, [{ role: "user", content: "Test" }], new AbortController().signal, (text, reason) => deltas.push(text, reason));
      expect(fetcher).toHaveBeenCalledWith(`${provider.baseUrl}/chat/completions`, expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ Authorization: `Bearer ${secret}` }) }));
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ model: provider.defaultModel, messages: [{ role: "user", content: "Test" }], stream: true }); expect(deltas.join("")).toContain("Provided reasoningHello");
    }
  });
  it("decodes fragmented UTF-8 SSE and rejects truncated streams and errors without leaking the key", async () => {
    const settings = new AISettingsStore(root, codec); await settings.save(config()); const { provider, key } = await settings.connection("siliconflow");
    const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }); let output = "";
    await new AIClient(vi.fn().mockResolvedValue(new Response(stream))).complete(provider, key, "model", [], new AbortController().signal, text => output += text); expect(output).toBe("你好");
    await expect(new AIClient(vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'))).complete(provider, key, "model", [], new AbortController().signal, () => {})).rejects.toThrow("before the response finished");
    try { await new AIClient(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: `Rejected ${secret}` } }), { status: 401 }))).complete(provider, key, "model", [], new AbortController().signal, () => {}); throw new Error("Expected rejection"); } catch (error) { expect(String(error)).toContain("API key rejected"); expect(String(error)).not.toContain(secret); }
  });
  it("filters retrieval-only models and permits manual configuration when model discovery is unavailable", async () => {
    const settings = new AISettingsStore(root, codec); await settings.save(config("openrouter")); const { provider, key } = await settings.connection("openrouter");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "openai/gpt-6-luna", name: "GPT-6 Luna", architecture: { output_modalities: ["text"] } }, { id: "embed-model", architecture: { output_modalities: ["embeddings"] } }] })));
    expect(await new AIClient(fetcher).models(provider, key)).toHaveLength(1);
    expect((await settings.list()).find(item => item.id === provider.id)?.models).toHaveLength(1);
  });
  it("stops and persists partial output, retries the same user turn and sends history when switching services", async () => {
    const settings = new AISettingsStore(root, codec); await settings.save(config()); await settings.save(config("openrouter")); const store = new AIChatStore(root), events: AIChat[] = [];
    let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
    const fetcher = vi.fn().mockImplementationOnce(async (_url, init: RequestInit) => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')); init.signal!.addEventListener("abort", () => controller.error(new Error("Aborted"))); started(); } }))).mockImplementation(async () => sse("Complete reply"));
    const service = new AIService(settings, () => store, new AIClient(fetcher), chat => events.push(chat));
    const chat = await store.create("siliconflow", config().models[0].id); await service.send(chat.id, "siliconflow", config().models[0].id, "Remember 42"); await ready; await vi.waitFor(() => expect(events.at(-1)?.messages.at(-1)?.content).toBe("partial")); await service.stop(chat.id);
    expect((await store.get(chat.id)).messages.at(-1)).toMatchObject({ status: "stopped", content: "partial" });
    await service.send(chat.id, "openrouter", config("openrouter").models[0].id, "", true);
    await vi.waitFor(async () => expect((await store.get(chat.id)).messages.at(-1)?.status).toBe("complete"));
    expect((await store.get(chat.id)).messages.filter(message => message.role === "user")).toHaveLength(1);
    await service.send(chat.id, "openrouter", config("openrouter").models[0].id, "What number?"); await vi.waitFor(async () => expect((await store.get(chat.id)).messages.at(-1)?.status).toBe("complete"));
    const payload = JSON.parse(fetcher.mock.calls.at(-1)![1].body as string); expect(payload.messages[0]).toMatchObject({ role: "system" }); expect(payload.messages[0].content).toContain("openai/gpt-6-luna");
    expect(payload.messages.slice(1)).toEqual([{ role: "user", content: "Remember 42" }, { role: "assistant", content: "Complete reply" }, { role: "user", content: "What number?" }]); expect(events.at(-1)?.messages.at(-1)?.providerName).toBe("OpenRouter");
    await service.shutdown();
  });
});

describe("model switching and bounded retries", () => {
  it("marks other-model answers as reference material while retaining user questions and current-model continuity", async () => {
    const store = new AIChatStore(root), chat = await store.create("siliconflow", "deepseek-ai/DeepSeek-V4-Pro");
    chat.messages = [
      { id: "user-1", role: "user", content: "你是谁？", status: "complete", createdAt: "today" },
      { id: "reply-1", role: "assistant", content: "我是 DeepSeek。", providerId: "siliconflow", modelId: "deepseek-ai/DeepSeek-V4-Pro", providerName: "SiliconFlow", status: "complete", createdAt: "today" },
      { id: "user-2", role: "user", content: "什么是搁浅资产？", status: "complete", createdAt: "today" },
      { id: "reply-2", role: "assistant", content: "Earlier definition", providerId: "openrouter", modelId: "mistralai/mistral-small-2603", status: "complete", createdAt: "today" },
      { id: "user-3", role: "user", content: "什么是搁浅资产？", status: "complete", createdAt: "today" }
    ];
    const messages = conversationMessages(chat, defaultAIProviders()[1], "meta-llama/llama-4-maverick", "Professional; no emoji.");
    expect(messages[0].content).toContain("meta-llama/llama-4-maverick"); expect(messages[0].content).toContain("Professional; no emoji.");
    expect(messages.filter(message => message.role === "assistant")).toHaveLength(0);
    expect(messages[2]).toMatchObject({ role: "user" }); expect(messages[2].content).toContain("SiliconFlow / deepseek-ai/DeepSeek-V4-Pro"); expect(messages[2].content).toContain("我是 DeepSeek。");
    expect(messages.at(-1)?.content).toBe("什么是搁浅资产？");
    expect(messages.some(message => message.content.includes("Earlier definition"))).toBe(false);
    expect(conversationMessages(chat, defaultAIProviders()[1], "mistralai/mistral-small-2603", "").filter(message => message.role === "assistant")).toEqual([{ role: "assistant", content: "Earlier definition" }]);
    expect(chat.messages[1].content).toBe("我是 DeepSeek。");
  });
  it("honors Retry-After for a shared-pool 429 and retries the same model and payload only twice", async () => {
    vi.useFakeTimers();
    const limited = () => new Response(JSON.stringify({ error: { message: "Provider returned error", metadata: { provider_name: "Mistral", limit_source: "upstream_provider_shared_pool" } } }), { status: 429, headers: { "Retry-After": "60" } });
    const fetcher = vi.fn().mockImplementationOnce(async () => limited()).mockImplementationOnce(async () => limited()).mockImplementation(async () => sse("Recovered"));
    const progress: string[] = [], output: string[] = [];
    const result = new AIClient(fetcher).complete(defaultAIProviders()[1], secret, "mistralai/mistral-small-2603", [{ role: "user", content: "Hello" }], new AbortController().signal, text => output.push(text), false, text => progress.push(text));
    await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1); expect(progress[0]).toContain("1/2 in 60s");
    await vi.advanceTimersByTimeAsync(59_999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000); await result; expect(fetcher).toHaveBeenCalledTimes(3); expect(output.join("")).toBe("Recovered");
    expect(new Set(fetcher.mock.calls.map(call => call[1].body)).size).toBe(1);
  });
  it("exhausts bounded retries with a concise supplier error and cancels during a wait without another call", async () => {
    vi.useFakeTimers();
    const limited = () => new Response(JSON.stringify({ error: { message: secret, metadata: { provider_name: "DeepInfra", limit_source: "upstream_provider_shared_pool", retry_after_seconds: 1 } } }), { status: 429 });
    const fetcher = vi.fn().mockImplementation(async () => limited()), client = new AIClient(fetcher);
    const outcome = client.complete(defaultAIProviders()[1], secret, "model", [], new AbortController().signal, () => {}).catch(error => error);
    await vi.advanceTimersByTimeAsync(2000); const error = await outcome; expect(fetcher).toHaveBeenCalledTimes(3); expect(error.message).toContain("shared provider pool"); expect(error.message).not.toContain(secret);
    const controller = new AbortController(); const canceled = client.complete(defaultAIProviders()[1], secret, "model", [], controller.signal, () => {}, true).catch(error => error);
    await vi.advanceTimersByTimeAsync(0); controller.abort(); expect((await canceled).message).toBe("Connection test stopped.");
    await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("never replays partial content or reasoning, retries an SSE error before output, and leaves account errors untouched", async () => {
    vi.useFakeTimers();
    const frame = JSON.stringify({ error: { code: 429, message: "busy", metadata: { retry_after_seconds: 1 } } });
    for (const delta of [{ content: "partial" }, { reasoning: "thinking" }]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: ${frame}\n\n`));
      await expect(new AIClient(fetcher).complete(defaultAIProviders()[1], secret, "model", [], new AbortController().signal, () => {})).rejects.toThrow("HTTP 429"); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const early = vi.fn().mockResolvedValueOnce(new Response(`data: ${frame}\n\n`)).mockResolvedValueOnce(sse());
    const recovered = new AIClient(early).complete(defaultAIProviders()[1], secret, "model", [], new AbortController().signal, () => {}); await vi.advanceTimersByTimeAsync(1000); await recovered; expect(early).toHaveBeenCalledTimes(2);
    for (const status of [401, 402, 403, 404]) { const fetcher = vi.fn().mockResolvedValue(new Response("blocked", { status })); await expect(new AIClient(fetcher).complete(defaultAIProviders()[1], secret, "model", [], new AbortController().signal, () => {})).rejects.toThrow(`HTTP ${status}`); expect(fetcher).toHaveBeenCalledTimes(1); }
  });
});
