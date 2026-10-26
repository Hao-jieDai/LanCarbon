// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AISettingsStore, type SecretCodec } from "../electron/ai-storage";
import { AIClient } from "../electron/ai-client";
import { defaultAIProviders } from "../src/shared/ai";
import { usageCost } from "../src/shared/aiUsage";

let root: string;
const codec: SecretCodec = { available: () => true, encrypt: text => Buffer.from(text.split("").reverse().join("")), decrypt: bytes => bytes.toString().split("").reverse().join("") };
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-deepseek-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it.each(["", "translation-", "retrieval-"])("adds the preset to legacy %s settings without changing existing connections or keys", async namespace => {
  const filename = path.join(root, namespace === "retrieval-" ? "retrieval-connections.json" : namespace ? "translation-connections.json" : "ai-settings.json");
  const providers = defaultAIProviders().filter(p => p.kind !== "deepseek").map(({ hasKey, ...p }) => ({ ...p, id: namespace + p.id, encryptedKey: Buffer.from("yek-erutxif").toString("base64") }));
  const legacy = JSON.stringify({ version: 1, providers, systemPrompt: "My existing guidelines" });
  await fs.writeFile(filename, legacy);
  const store = new AISettingsStore(root, codec, namespace);
  expect(await store.list()).toHaveLength(4);
  expect(await fs.readFile(filename, "utf8")).toBe(legacy);
  expect((await store.connection(namespace + "siliconflow")).key).toBe("fixture-key");
  const preset = (await store.list()).find(p => p.kind === "deepseek")!;
  await store.save({ ...preset, apiKey: "new-fixture-key", models: [{ id: "deepseek-flash", name: "Flash", purpose: "chat" }], defaultModel: "deepseek-flash" });
  const stored = JSON.parse(await fs.readFile(filename, "utf8"));
  expect(stored.providers.filter((p: { kind: string }) => p.kind !== "deepseek")).toEqual(providers);
  expect(stored.systemPrompt).toBe("My existing guidelines");
  expect((await new AISettingsStore(root, codec, namespace).connection(preset.id)).key).toBe("new-fixture-key");
  await store.clearKey(preset.id);
  expect((await store.connection(namespace + "openrouter")).key).toBe("fixture-key");
});

it("discovers official model IDs and separates Chat thinking from short tests and translation", async () => {
  const provider = defaultAIProviders().find(p => p.kind === "deepseek")!;
  const events: any[] = [];
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith("/models")
    ? new Response(JSON.stringify({ data: [{ id: "deepseek-flash", name: "DeepSeek Flash", output_modalities: ["text"] }] }))
    : new Response('data: {"choices":[{"delta":{"reasoning_content":"Reasoning"}}]}\n\ndata: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":60}}\n\ndata: [DONE]\n\n'));
  const client = new AIClient(fetcher as typeof fetch, async event => { events.push(event); });
  expect(await client.models(provider, "fixture-key")).toEqual([{ id: "deepseek-flash", name: "DeepSeek Flash", purpose: "chat" }]);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.deepseek.com/models");
  for (const mode of ["chat", "test", "translation"]) {
    const deltas: string[] = [];
    await client.complete(provider, "fixture-key", "deepseek-flash", [{ role: "user", content: "Hello" }], new AbortController().signal, (text, reason) => deltas.push(text, reason), mode === "test", undefined, { disableThinking: mode === "translation", thinkingBudget: 8192 });
    const [url, init] = fetcher.mock.calls.at(-1)!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(init!.body as string);
    expect(body.thinking).toEqual(mode === "chat" ? undefined : { type: "disabled" });
    expect(body).not.toHaveProperty("enable_thinking");
    expect(body).not.toHaveProperty("thinking_budget");
    expect(deltas.join("")).toBe("ReasoningOK");
    expect(events.at(-1)).toMatchObject({ status: "complete", usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 60, totalTokens: 120 } });
  }
  const usage = events.at(-1).usage;
  expect(usageCost(usage, { providerId: "deepseek", baseUrl: provider.baseUrl, modelId: "deepseek-flash", currency: "CNY", input: 2, output: 3, cacheRead: 1, updatedAt: "2026-10-26" })?.amount).toBeCloseTo(0.0002);
});
