// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AISettingsStore, AIChatStore, type SecretCodec } from "../electron/ai-storage";
import { AIClient } from "../electron/ai-client";
import { AIService } from "../electron/ai-service";
import { defaultAIProviders, type AIChat, type AIProviderInput } from "../src/shared/ai";

let root: string;
const secret = "fixture-api-key-private";
const codec: SecretCodec = { available: () => true, encrypt: value => Buffer.from(value.split("").reverse().join("")), decrypt: bytes => bytes.toString().split("").reverse().join("") };
const config = (id = "siliconflow"): AIProviderInput => ({ ...defaultAIProviders().find(item => item.id === id)!, apiKey: secret, models: [{ id: id === "openrouter" ? "openai/gpt-6-luna" : "deepseek-ai/DeepSeek-V4-Pro", name: "Fixture model", purpose: "chat" }], defaultModel: "" });
const sse = (text = "Hello") => new Response(`: keepalive\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "Provided reasoning" } }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [], usage: { total_tokens: 9 } })}\r\n\r\ndata: [DONE]\r\n\r\n`, { headers: { "Content-Type": "text/event-stream" } });
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ai-unit-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("AI settings and conversations", () => {
  it("encrypts keys, keeps them out of public records, preserves blank keys and supports re-entry on another Windows account", async () => {
    const store = new AISettingsStore(root, codec); const saved = await store.save(config());
    expect(saved[0].hasKey).toBe(true); expect(JSON.stringify(saved)).not.toContain(secret);
    expect(await fs.readFile(path.join(root, "ai-settings.json"), "utf8")).not.toContain(secret);
    expect((await store.connection("siliconflow")).key).toBe(secret);
    await store.save({ ...config(), apiKey: undefined }); expect((await store.connection("siliconflow")).key).toBe(secret);
    const moved = new AISettingsStore(root, { ...codec, decrypt: () => { throw new Error("Wrong account"); } });
    await expect(moved.connection("siliconflow")).rejects.toThrow("Enter it again");
    await store.save({ ...config(), apiKey: undefined, clearKey: true }); expect((await store.list())[0].hasKey).toBe(false);
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
    const chat = await store.create("siliconflow", config().models[0].id); await service.send(chat.id, "siliconflow", config().models[0].id, "Remember 42"); await ready; await service.stop(chat.id);
    expect((await store.get(chat.id)).messages.at(-1)).toMatchObject({ status: "stopped", content: "partial" });
    await service.send(chat.id, "openrouter", config("openrouter").models[0].id, "", true);
    await vi.waitFor(async () => expect((await store.get(chat.id)).messages.at(-1)?.status).toBe("complete"));
    expect((await store.get(chat.id)).messages.filter(message => message.role === "user")).toHaveLength(1);
    await service.send(chat.id, "openrouter", config("openrouter").models[0].id, "What number?"); await vi.waitFor(async () => expect((await store.get(chat.id)).messages.at(-1)?.status).toBe("complete"));
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).messages).toEqual([{ role: "user", content: "Remember 42" }, { role: "assistant", content: "Complete reply" }, { role: "user", content: "What number?" }]); expect(events.at(-1)?.messages.at(-1)?.providerName).toBe("OpenRouter");
    await service.shutdown();
  });
});
