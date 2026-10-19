// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIClient } from "../electron/ai-client";
import { AIPriceStore, AIUsageStore } from "../electron/ai-usage";
import { defaultAIProviders } from "../src/shared/ai";
import { cnyUsageCost, DEFAULT_USD_TO_CNY, localUsageDay, parseAIUsage, priceKey, summarizeUsage, usageCost, type AIModelPrice, type AIUsageEvent, type AIUsageRequest } from "../src/shared/aiUsage";
import { calendarDays, HEATMAP_LEVELS, usageHeatLevel } from "../src/components/AIUsageHeatmap";

let root: string;
const provider = { ...defaultAIProviders()[1], models: [{ id: "fixture-model", name: "Fixture model", purpose: "chat" as const }] };
const request = (id: string, patch: Partial<AIUsageRequest> = {}): AIUsageRequest => ({ id, providerId: "others", providerName: "BigModel", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelId: "fixture-model", modelName: "Fixture model", purpose: "chat", attempt: 1, startedAt: "2026-10-14T06:00:00.000Z", ...patch });
const price: AIModelPrice = { providerId: "others", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelId: "fixture-model", currency: "CNY", input: 2, output: 8, cacheRead: 0.5, cacheWrite: 3, updatedAt: "2026-10-14T00:00:00Z" };
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-usage-unit-")); });
afterEach(async () => { vi.useRealTimers(); if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-usage-unit-")) throw new Error("Unexpected test cleanup path"); await fs.rm(root, { recursive: true, force: true }); });
const stream = (usage: unknown) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });

describe("token and cost accounting", () => {
  it("uses native totals, preserves zero costs and treats missing or invalid fields as unknown", () => {
    const data = parseAIUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 999, cost: 0, prompt_tokens_details: { cached_tokens: 60 }, completion_tokens_details: { reasoning_tokens: 20 } }, provider.baseUrl);
    expect(data).toMatchObject({ inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedTokens: 60, reasoningTokens: 20, reportedCost: 0, currency: "USD" });
    expect(usageCost(data)).toEqual({ amount: 0, currency: "USD", source: "reported" });
    expect(parseAIUsage({ prompt_tokens: -1, completion_tokens: "20", cost: -3 }, provider.baseUrl).inputTokens).toBeUndefined();
    expect(usageCost(parseAIUsage({}, provider.baseUrl))).toBeUndefined();
    expect(parseAIUsage({ cost: 1 }, "https://unknown.example/v1").reportedCost).toBeUndefined();
    expect(parseAIUsage({ cost: 1, currency: "CNY" }, "https://unknown.example/v1")).toMatchObject({ reportedCost: 1, currency: "CNY" });
  });
  it("handles cached inputs and reasoning without double-counting and snapshots estimates", () => {
    expect(usageCost({ inputTokens: 100, outputTokens: 50, cachedTokens: 60, cacheWriteTokens: 10, reasoningTokens: 20 }, price)).toEqual({ amount: 0.00052, currency: "CNY", source: "estimated" });
    expect(usageCost({ inputTokens: 20, outputTokens: 0 }, { ...price, input: 0, output: 0 })).toEqual({ amount: 0, currency: "CNY", source: "estimated" });
    expect(usageCost({ inputTokens: 10, outputTokens: 2, cachedTokens: 8, cacheWriteTokens: 8 }, price)).toBeUndefined();
    expect(usageCost({ inputTokens: 20 }, price)).toBeUndefined();
    expect(usageCost({ reportedCost: 0.5, currency: "USD", inputTokens: 1, outputTokens: 1 }, price)?.source).toBe("reported");
  });
  it("captures the final SSE usage chunk with no choices and does not sum cumulative chunks", async () => {
    const events: AIUsageEvent[] = [], client = new AIClient(vi.fn(async () => stream({ prompt_tokens: 10, completion_tokens: 5, cost: 0.001, prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 } })) as typeof fetch, async event => { events.push(event); });
    await client.complete(provider, "fixture-key", "fixture-model", [], new AbortController().signal, () => {});
    expect(events).toHaveLength(2); expect(events[0]).toMatchObject({ type: "start", request: { purpose: "chat", attempt: 1 } });
    expect(events[1]).toMatchObject({ type: "finish", status: "complete", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reportedCost: 0.001, cachedTokens: 3, reasoningTokens: 2 } });
    expect(JSON.stringify(events)).not.toContain("fixture-key");
  });
  it("captures non-streaming JSON responses and classifies connection tests separately", async () => {
    const events: AIUsageEvent[] = [], client = new AIClient(vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }], usage: { input_tokens: 3, output_tokens: 2 } }), { headers: { "content-type": "application/json" } })) as typeof fetch, async event => { events.push(event); });
    await client.complete(provider, "fixture-key", "fixture-model", [], new AbortController().signal, () => {}, true);
    expect(events[0]).toMatchObject({ request: { purpose: "test" } }); expect(events[1]).toMatchObject({ usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
  });
  it("records each retry once and keeps unreported failed attempts unknown", async () => {
    vi.useFakeTimers(); const events: AIUsageEvent[] = [];
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":{"message":"busy"}}', { status: 429, headers: { "Retry-After": "1" } })).mockResolvedValueOnce(stream({ prompt_tokens: 4, completion_tokens: 1, cost: 0.00001 }));
    const work = new AIClient(fetcher, async event => { events.push(event); }).complete(provider, "fixture-key", "fixture-model", [], new AbortController().signal, () => {});
    await vi.advanceTimersByTimeAsync(1100); await work;
    expect(events.filter(event => event.type === "start").map(event => event.request.attempt)).toEqual([1, 2]);
    expect(events[1]).toMatchObject({ status: "error", usage: {} }); expect(events[3]).toMatchObject({ status: "complete" });
  });
  it("persists stopped requests while leaving their missing costs unknown", async () => {
    const events: AIUsageEvent[] = [], controller = new AbortController();
    const fetcher = vi.fn(async (_input, init) => new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')); init?.signal?.addEventListener("abort", () => stream.error(new Error("aborted")), { once: true }); } }), { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
    await expect(new AIClient(fetcher, async event => { events.push(event); }).complete(provider, "fixture-key", "fixture-model", [], controller.signal, () => controller.abort())).rejects.toThrow("Generation stopped");
    expect(events[1]).toMatchObject({ status: "stopped", usage: {} });
  });
  it("does not prevent chat when usage storage fails", async () => {
    await expect(new AIClient(vi.fn(async () => stream({})) as typeof fetch, async () => { throw new Error("disk unavailable"); }).complete(provider, "fixture-key", "fixture-model", [], new AbortController().signal, () => {})).resolves.toBeUndefined();
  });
});

describe("local usage ledger", () => {
  it("persists usage independently, keeps currencies and services separate, and retains price snapshots", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await prices.save(price); await store.record({ type: "start", request: request("first") });
    await prices.save({ ...price, input: 99, output: 99 });
    await store.record({ type: "finish", id: "first", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
    await store.record({ type: "start", request: request("second", { providerId: "openrouter", providerName: "OpenRouter", baseUrl: provider.baseUrl, purpose: "test" }) });
    await store.record({ type: "finish", id: "second", completedAt: "2026-10-14T06:02:00Z", status: "complete", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reportedCost: 0.02, currency: "USD" } });
    const result = await new AIUsageStore(root, new AIPriceStore(root)).query();
    expect(result.summary).toMatchObject({ requests: 2, inputTokens: 110, outputTokens: 55, totalTokens: 165, unknownCosts: 0 });
    expect(result.summary.costs.find(value => value.currency === "CNY")).toMatchObject({ reported: 0, estimated: 0.0006, reportedRequests: 0, estimatedRequests: 1 });
    expect(result.summary.costs.find(value => value.currency === "USD")).toMatchObject({ reported: 0.02, estimated: 0, reportedRequests: 1, estimatedRequests: 0 });
    expect(result.records.find(record => record.id === "first")?.price?.input).toBe(2);
    expect(result.groups).toHaveLength(2); expect((await store.query({ providerId: "others", purpose: "chat" })).summary.requests).toBe(1);
    expect(await fs.stat(path.join(root, "notes.json")).catch(() => null)).toBeNull();
  });
  it("marks unfinished requests as interrupted after restart and preserves valid entries around torn writes", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await store.record({ type: "start", request: request("interrupted") });
    expect((await store.query()).records[0].status).toBe("pending");
    const directory = path.join(root, "Research", "Usage"), file = path.join(directory, (await fs.readdir(directory))[0]);
    await fs.appendFile(file, '{"torn":');
    await store.record({ type: "start", request: request("next") });
    await store.record({ type: "finish", id: "next", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: {} });
    const result = await new AIUsageStore(root, prices).query();
    expect(result.summary.requests).toBe(2); expect(result.records.find(record => record.id === "interrupted")?.status).toBe("interrupted"); expect(result.warning).toContain("incomplete"); expect(result.summary.unknownCosts).toBe(2);
  });
  it("does not backfill history after prices are added and rejects invalid rates and date ranges", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await store.record({ type: "start", request: request("unpriced") });
    await store.record({ type: "finish", id: "unpriced", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
    await prices.save({ ...price, input: 0, output: 0 });
    expect((await store.query()).records[0].cost).toBeUndefined();
    await expect(prices.save({ ...price, input: -1 })).rejects.toThrow("non-negative");
    await expect(store.query({ from: "2026-02-31" })).rejects.toThrow("valid date");
    await expect(store.query({ from: "2026-10-15", to: "2026-10-14" })).rejects.toThrow("valid date");
    expect(priceKey(price)).not.toBe(priceKey({ ...price, baseUrl: "https://other.example/v1" }));
  });
  it("paginates records while summary totals still include every matching request", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    for (let index = 0; index < 53; index++) {
      await store.record({ type: "start", request: request(`request-${index}`) });
      await store.record({ type: "finish", id: `request-${index}`, completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
    }
    const result = await store.query({ page: 6 }); expect(result.records).toHaveLength(3); expect(result.pageSize).toBe(10); expect(result.summary.totalTokens).toBe(106); expect(result.totalRecords).toBe(53);
    expect(result.activity.reduce((sum, day) => sum + day.summary.totalTokens, 0)).toBe(106);
    expect(result.activity.flatMap(day => day.hours).reduce((sum, hour) => sum + hour.summary.requests, 0)).toBe(53);
  });
  it("automatically prunes removed models and services without changing completed or in-flight historical prices", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await prices.save(price); await prices.save({ ...price, modelId: "keep-model" });
    await store.record({ type: "start", request: request("in-flight") });
    const remaining = await prices.retain([{ ...price, modelId: "keep-model" }]);
    expect(remaining.map(value => value.modelId)).toEqual(["keep-model"]);
    await store.record({ type: "finish", id: "in-flight", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
    await prices.retain([]);
    const restarted = await new AIUsageStore(root, new AIPriceStore(root)).query();
    expect(await prices.list()).toEqual([]);
    expect(restarted.records[0].price?.input).toBe(2); expect(restarted.records[0].cost?.amount).toBe(0.0006);
    expect(restarted.summary.unknownCosts).toBe(0);
  });
  it("migrates legacy prices and persists a display rate without repricing original charges", async () => {
    await fs.writeFile(path.join(root, "ai-pricing.json"), JSON.stringify({ version: 1, prices: [price] }));
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    expect(await prices.exchangeRate()).toBe(DEFAULT_USD_TO_CNY);
    await store.record({ type: "start", request: request("usd") });
    await store.record({ type: "finish", id: "usd", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, reportedCost: 0.1, currency: "USD" } });
    const before = await store.query(); expect(cnyUsageCost(before.summary, before.usdToCny)).toBeCloseTo(0.7);
    await prices.saveExchangeRate(6.5); await prices.save({ ...price, input: 90 });
    const after = await new AIUsageStore(root, new AIPriceStore(root)).query();
    expect(after.usdToCny).toBe(6.5); expect(cnyUsageCost(after.summary, after.usdToCny)).toBeCloseTo(0.65);
    expect(after.records).toEqual(before.records); expect(after.records[0].cost?.currency).toBe("USD");
    for (const invalid of [0, -7, Infinity, NaN, 1_000_001]) await expect(prices.saveExchangeRate(invalid)).rejects.toThrow("positive");
    expect(await prices.exchangeRate()).toBe(6.5);
    await prices.retain([]); expect(await prices.exchangeRate()).toBe(6.5);
  });
  it("aggregates local days and hours across midnight, respects filters, and preserves zero versus unknown costs", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    for (const [index, time, purpose, tokens, cost] of [
      [0, new Date(2026, 9, 13, 23, 15), "chat", 15, 0],
      [1, new Date(2026, 9, 14, 0, 5), "test", 30, 0.02],
      [2, new Date(2026, 9, 14, 9, 0), "chat", undefined, undefined]
    ] as const) {
      await store.record({ type: "start", request: request(String(index), { startedAt: time.toISOString(), purpose }) });
      await store.record({ type: "finish", id: String(index), completedAt: time.toISOString(), status: "complete", usage: { ...(tokens === undefined ? {} : { inputTokens: tokens, outputTokens: 0, totalTokens: tokens }), ...(cost === undefined ? {} : { reportedCost: cost, currency: "USD" }) } });
    }
    const result = await store.query(); expect(result.activity.map(value => value.day)).toEqual(["2026-10-13", "2026-10-14"]);
    expect(result.activity[0].hours[0]).toMatchObject({ hour: 23, summary: { totalTokens: 15, unknownCosts: 0 } });
    expect(cnyUsageCost(result.activity[0].summary, 7)).toBe(0);
    expect(result.activity[1].hours.find(value => value.hour === 9)?.summary.unknownCosts).toBe(1);
    expect(cnyUsageCost(result.activity[1].hours.find(value => value.hour === 9)!.summary, 7)).toBeUndefined();
    const filtered = await store.query({ from: localUsageDay(new Date(2026, 9, 14)), purpose: "test" });
    expect(filtered.activity).toHaveLength(1); expect(filtered.activity[0].summary.totalTokens).toBe(30);
    expect(filtered.activity[0].hours.map(value => value.hour)).toEqual([0]);
  });
  it("builds bounded leap-year calendars with Monday-first padding and no duplicate dates", () => {
    const leap = calendarDays("2024-01-01", "2024-12-31").filter(Boolean);
    expect(leap).toHaveLength(366); expect(leap).toContain("2024-02-29"); expect(new Set(leap).size).toBe(366);
    const sunday = calendarDays("2026-10-11", "2026-10-11"); expect(sunday.slice(0, 6)).toEqual(Array(6).fill(null)); expect(sunday[6]).toBe("2026-10-11");
    expect(calendarDays("2026-10-15", "2026-10-14")).toEqual([]);
  });
  it("distinguishes eight positive token bands and zero despite a high-volume outlier", () => {
    const volumes = [3, 15, 63, 255, 1023, 4095, 16383, 65535];
    expect(HEATMAP_LEVELS).toBe(8);
    expect(volumes.map(value => usageHeatLevel(value, volumes.at(-1)!))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(usageHeatLevel(0, 65535)).toBe(0); expect(usageHeatLevel(0, 0)).toBe(0);
    expect(usageHeatLevel(1, 65535)).toBeGreaterThan(0);
  });
  it("rejects corrupted negative usage instead of presenting false totals", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await store.record({ type: "start", request: request("bad") });
    await store.record({ type: "finish", id: "bad", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: -10 } });
    const result = await store.query(); expect(result.summary.inputTokens).toBe(0); expect(result.warning).toBeTruthy();
    expect(summarizeUsage(result.records).summary.unknownTokens).toBe(1);
  });
  it("rotates local logs without deleting earlier records", async () => {
    const prices = new AIPriceStore(root), store = new AIUsageStore(root, prices);
    await store.record({ type: "start", request: request("earlier") });
    await store.record({ type: "finish", id: "earlier", completedAt: "2026-10-14T06:01:00Z", status: "complete", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
    const directory = path.join(root, "Research", "Usage"), file = path.join(directory, (await fs.readdir(directory))[0]);
    await fs.appendFile(file, " ".repeat(4_000_000) + "\n");
    await store.record({ type: "start", request: request("later") });
    await store.record({ type: "finish", id: "later", completedAt: "2026-10-14T06:02:00Z", status: "complete", usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } });
    expect(await fs.readdir(directory)).toHaveLength(2);
    expect((await store.query()).summary).toMatchObject({ requests: 2, totalTokens: 5 });
  });
});
