import { randomUUID } from "node:crypto";
import { aiModelName, type AIModel, type AIProvider } from "../src/shared/ai";
import { parseAIUsage, type AIReportedUsage, type AIUsageEvent } from "../src/shared/aiUsage";
import type { RetrievalRole } from "../src/shared/retrieval";
import { redactAIError } from "./ai-client";
export interface RetrievalConnection { provider: AIProvider; key: string; modelId: string; modelName: string }
class RequestFailure extends Error { constructor(message: string, readonly status: number, readonly retryAfter?: number) { super(message); } }
export function normalizeVector(value: unknown): Float32Array {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8192 || value.some(n => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e15)) throw Error("The embedding API returned an invalid vector.");
  const norm = Math.hypot(...value); if (!norm) throw Error("The embedding API returned a zero vector.");
  return Float32Array.from(value.map(n => n / norm));
}
function delay(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => { if (signal.aborted) { reject(Error("Retrieval stopped.")); return; } const abort = () => { clearTimeout(timer); reject(Error("Retrieval stopped.")); }; const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms); signal.addEventListener("abort", abort, { once: true }); }); }
async function body(response: Response): Promise<string> {
  const limit = 32 * 1024 * 1024; if (Number(response.headers.get("content-length")) > limit) throw Error("The retrieval API response is too large.");
  if (!response.body) return ""; const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > limit) throw Error("The retrieval API response is too large."); chunks.push(chunk.value); } return Buffer.concat(chunks).toString("utf8"); } finally { await reader.cancel().catch(() => undefined); }
}
export class RetrievalClient {
  constructor(private readonly fetcher: typeof fetch, private readonly observe: (event: AIUsageEvent) => Promise<void> = async () => {}) {}
  private async track(event: AIUsageEvent) { try { await this.observe(event); } catch { /* The shared usage observer reports persistence failures. */ } }
  async models(connection: RetrievalConnection, role: RetrievalRole): Promise<AIModel[]> {
    const provider = connection.provider, suffix = provider.kind === "openrouter" ? role === "embedding" ? "/embeddings/models" : "/models?output_modalities=rerank" : provider.kind === "siliconflow" ? `/models?sub_type=${role}` : "/models";
    try {
      const response = await this.fetcher(provider.baseUrl + suffix, { headers: { Authorization: `Bearer ${connection.key}` }, redirect: "error", signal: AbortSignal.timeout(45_000) }), raw = await body(response);
      if (!response.ok) throw Error(`Model catalogue failed (HTTP ${response.status}). Enter a model ID manually or retry.`);
      const value = JSON.parse(raw); if (!Array.isArray(value.data)) throw Error("The service did not return a compatible model catalogue.");
      const models = new Map<string, AIModel>();
      for (const item of value.data) {
        const modalities = item.architecture?.output_modalities;
        if (Array.isArray(modalities) && !modalities.includes(role === "embedding" ? "embeddings" : "rerank")) continue;
        if (typeof item.id !== "string" || !item.id || item.id.length > 256 || /\s/.test(item.id)) continue;
        const free = item.pricing && item.pricing.prompt !== undefined && Number(item.pricing.prompt) === 0 && ["completion", "request"].every(key => item.pricing[key] === undefined || Number(item.pricing[key]) === 0);
        models.set(item.id, { id: item.id, name: `${typeof item.name === "string" ? item.name.slice(0, 90) : aiModelName(item.id)}${free ? " · Free" : ""}`, purpose: role });
      }
      return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) { throw Error(redactAIError(error, connection.key)); }
  }
  private async request<T>(connection: RetrievalConnection, role: RetrievalRole, payload: object, signal: AbortSignal, decode: (value: any) => T): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const id = randomUUID(), timeout = AbortSignal.timeout(90_000), combined = AbortSignal.any([signal, timeout]); let usage: AIReportedUsage = {}, status: "complete" | "stopped" | "error" = "error", failure: unknown;
      if (signal.aborted) throw Error("Retrieval stopped.");
      await this.track({ type: "start", request: { id, startedAt: new Date().toISOString(), providerId: connection.provider.id, providerName: connection.provider.name, baseUrl: connection.provider.baseUrl, modelId: connection.modelId, modelName: connection.modelName, purpose: role, attempt } });
      try {
        const response = await this.fetcher(`${connection.provider.baseUrl}/${role === "embedding" ? "embeddings" : "rerank"}`, { method: "POST", headers: { Authorization: `Bearer ${connection.key}`, "Content-Type": "application/json", ...(connection.provider.kind === "openrouter" ? { "X-OpenRouter-Title": "LanCarbon" } : {}) }, redirect: "error", signal: combined, body: JSON.stringify({ model: connection.modelId, ...payload }) });
        const raw = await body(response); let value: any; try { value = JSON.parse(raw); } catch { if (response.ok) throw Error("The retrieval API did not return JSON."); }
        usage = parseAIUsage(value?.usage ?? value?.meta?.tokens ?? value?.meta?.billed_units, connection.provider.baseUrl);
        usage.outputTokens ??= 0;
        if (usage.inputTokens === undefined && usage.totalTokens !== undefined && usage.totalTokens >= usage.outputTokens) usage.inputTokens = usage.totalTokens - usage.outputTokens;
        if (usage.inputTokens !== undefined) usage.totalTokens = usage.inputTokens + usage.outputTokens;
        if (!response.ok) { const seconds = Number(response.headers.get("retry-after")); throw new RequestFailure(`Retrieval request failed (HTTP ${response.status}): ${typeof value?.error?.message === "string" ? value.error.message.slice(0, 400) : "Check service access, model ID, quota and network."}`, response.status, Number.isFinite(seconds) && seconds > 0 ? seconds : undefined); }
        if (value?.error) throw Error(typeof value.error.message === "string" ? value.error.message : "The retrieval service returned an error.");
        const result = decode(value); status = "complete"; return result;
      } catch (error) { failure = error; if (signal.aborted) status = "stopped"; }
      finally { await this.track({ type: "finish", id, completedAt: new Date().toISOString(), status, usage }); }
      if (signal.aborted) throw Error("Retrieval stopped.");
      if (timeout.aborted) throw Error("The retrieval service timed out. Check the connection and retry.");
      if (failure instanceof RequestFailure && [429, 500, 502, 503, 504].includes(failure.status) && attempt < 3 && (failure.retryAfter ?? 0) <= 30) { await delay((failure.retryAfter ?? attempt * 2) * 1000, signal); continue; }
      throw Error(redactAIError(failure, connection.key));
    }
  }
  async embed(connection: RetrievalConnection, texts: string[], signal: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length || texts.length > 16 || texts.some(text => typeof text !== "string" || !text.trim() || text.length > 4000)) throw Error("Invalid embedding input.");
    return this.request(connection, "embedding", { input: texts, encoding_format: "float" }, signal, value => {
      if (!Array.isArray(value.data) || value.data.length !== texts.length) throw Error("The embedding API returned an incomplete batch.");
      const indexed = value.data.some((item: any) => item?.index !== undefined), vectors = new Array<Float32Array>(texts.length);
      value.data.forEach((item: any, position: number) => { const index = indexed ? item?.index : position; if (!Number.isInteger(index) || index < 0 || index >= texts.length || vectors[index]) throw Error("The embedding API returned invalid input indices."); vectors[index] = normalizeVector(item.embedding); });
      if (vectors.some(vector => vector.length !== vectors[0].length)) throw Error("The embedding API returned inconsistent vector dimensions."); return vectors;
    });
  }
  async rerank(connection: RetrievalConnection, query: string, documents: string[], signal: AbortSignal): Promise<Array<{ index: number; score: number }>> {
    if (!query.trim() || query.length > 1500 || !documents.length || documents.length > 60 || documents.some(text => text.length > 1200)) throw Error("Invalid reranking input.");
    return this.request(connection, "rerank", { query, documents, top_n: documents.length, ...(connection.provider.kind === "openrouter" ? {} : { return_documents: false }) }, signal, value => {
      const results = value.results ?? value.data, seen = new Set<number>();
      if (!Array.isArray(results) || results.length !== documents.length) throw Error("The rerank API returned an incomplete candidate list.");
      return results.map((item: any) => { if (!item || !Number.isInteger(item.index) || item.index < 0 || item.index >= documents.length || seen.has(item.index) || typeof item.relevance_score !== "number" || !Number.isFinite(item.relevance_score)) throw Error("The rerank API returned invalid candidate indices or scores."); seen.add(item.index); return { index: item.index, score: item.relevance_score }; }).sort((a: any, b: any) => b.score - a.score);
    });
  }
}
