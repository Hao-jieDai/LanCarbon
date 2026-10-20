import { aiModelName, type AIModel, type AIProvider } from "../src/shared/ai";
import { randomUUID } from "node:crypto";
import { parseAIUsage, type AIReportedUsage, type AIUsageEvent, type AIUsagePurpose } from "../src/shared/aiUsage";
export interface AICompletionOptions { purpose?: AIUsagePurpose; maxTokens?: number; temperature?: number; disableThinking?: boolean; thinkingBudget?: number; responseFormat?: "json_object"; timeoutMs?: number; maxRetries?: number; onFinish?(reason: string): void }

export function redactAIError(error: unknown, key = ""): string {
  let text = error instanceof Error ? error.message : String(error);
  if (key) text = text.split(key).join("[API key hidden]");
  return text.replace(/Bearer\s+[^\s"']+/gi, "Bearer [hidden]").replace(/sk-[\w-]{8,}/g, "[API key hidden]").slice(0, 700);
}
class AIRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) { super(message); }
}
function retrySeconds(value: unknown): number | undefined { const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN; return Number.isFinite(number) && number >= 0 ? number : undefined; }
function statusError(status: number, detail: string, headers?: Headers): AIRequestError {
  let error: any; try { error = JSON.parse(detail).error; } catch { /* Some compatible services return plain text. */ }
  const metadata = error?.metadata ?? {};
  const label = status === 401 ? "API key rejected" : status === 402 ? "Insufficient account balance or key spending limit" : status === 403 ? "Account or model access denied" : status === 404 ? "API address or model not found" : status === 429 ? "Rate limit reached; try again later" : status >= 500 ? "AI service temporarily unavailable" : "AI request rejected";
  const provider = typeof metadata.provider_name === "string" ? metadata.provider_name.slice(0, 60) : "The AI service";
  const message = metadata.limit_source === "upstream_provider_shared_pool" ? `${provider} is temporarily busy (HTTP ${status}). OpenRouter's shared provider pool is rate-limited. Try later or choose another model.` : `${label} (HTTP ${status})${detail ? `: ${(typeof error?.message === "string" ? error.message : detail).slice(0, 500)}` : ""}`;
  const header = headers?.get("retry-after");
  let retryAfter = retrySeconds(header) ?? retrySeconds(metadata.retry_after_seconds) ?? retrySeconds(metadata.headers?.["Retry-After"]);
  if (retryAfter === undefined && header) { const date = Date.parse(header); if (Number.isFinite(date)) retryAfter = Math.max(0, (date - Date.now()) / 1000); }
  return new AIRequestError(message, status, retryAfter);
}
function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export class AIClient {
  constructor(private readonly fetcher: typeof fetch, private readonly observeUsage?: (event: AIUsageEvent) => Promise<void>) {}
  private async track(event: AIUsageEvent): Promise<void> {
    try { await this.observeUsage?.(event); } catch { /* The observer reports storage failures without interrupting a model request. */ }
  }
  async models(provider: AIProvider, key: string): Promise<AIModel[]> {
    try {
      const url = `${provider.baseUrl}/models${provider.kind === "siliconflow" ? "?sub_type=chat" : ""}`;
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(45_000), redirect: "error" });
      const body = await response.text(); if (!response.ok) throw statusError(response.status, body); if (body.length > 10_000_000) throw new Error("The model list is too large");
      const value = JSON.parse(body); if (!Array.isArray(value.data)) throw new Error("The service did not return a compatible model list. You can add a model ID manually.");
      const models = new Map<string, AIModel>();
      for (const item of value.data) {
        const outputs = item.architecture?.output_modalities;
        if (outputs && (!outputs.includes("text") || outputs.includes("embeddings") || outputs.includes("rerank"))) continue;
        if (typeof item.id === "string" && item.id.length <= 256 && !/\s/.test(item.id) && item.id) models.set(item.id, { id: item.id, name: typeof item.name === "string" ? item.name.slice(0, 100) : aiModelName(item.id), purpose: "chat" });
      }
      return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) { throw new Error(redactAIError(error, key)); }
  }
  async complete(provider: AIProvider, key: string, modelId: string, messages: Array<{ role: string; content: string }>, signal: AbortSignal, onDelta: (content: string, reasoning: string) => void, test = false, onProgress: (message: string) => void = () => {}, options: AICompletionOptions = {}): Promise<void> {
    if (options.thinkingBudget !== undefined && (!Number.isInteger(options.thinkingBudget) || options.thinkingBudget < 128 || options.thinkingBudget > 32768)) throw Error("Invalid thinking budget");
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    let received = false, timedOut = false;
    const overall = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 600_000);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await this.completeAttempt(provider, key, modelId, messages, controller.signal, (content, reasoning) => { received = true; onProgress(""); onDelta(content, reasoning); }, test, attempt + 1, options);
          onProgress(""); return;
        } catch (error) {
          const delay = error instanceof AIRequestError ? error.retryAfter ?? (attempt === 0 ? 5 : 15) : 0;
          if (!(error instanceof AIRequestError) || ![429, 500, 502, 503, 504].includes(error.status) || received || attempt >= (options.maxRetries ?? 2) || controller.signal.aborted || delay > 120) throw error;
          onProgress(`Upstream service busy. Retrying ${attempt + 1}/2 in ${Math.max(1, Math.ceil(delay))}s…`);
          await waitForRetry(Math.max(1, delay) * 1000, controller.signal);
        }
      }
    } catch (error) {
      if (signal.aborted) throw new Error(test ? "Connection test stopped." : "Generation stopped");
      if (timedOut) throw new Error("The AI service timed out. Please retry later.");
      throw new Error(redactAIError(error, key));
    } finally { clearTimeout(overall); signal.removeEventListener("abort", abort); }
  }
  private async completeAttempt(provider: AIProvider, key: string, modelId: string, messages: Array<{ role: string; content: string }>, signal: AbortSignal, onDelta: (content: string, reasoning: string) => void, test = false, attempt = 1, options: AICompletionOptions = {}): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    let timedOut = false;
    let timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    const overall = setTimeout(() => { timedOut = true; controller.abort(); }, 600_000);
    const touch = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000); };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const requestId = randomUUID();
    let usage: AIReportedUsage = {}, status: "complete" | "stopped" | "error" = "error";
    const captureUsage = (value: unknown) => {
      const parsed = parseAIUsage(value, provider.baseUrl);
      for (const [key, value] of Object.entries(parsed)) if (value !== undefined) (usage as Record<string, unknown>)[key] = value;
      if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) usage.totalTokens = usage.inputTokens + usage.outputTokens;
    };
    await this.track({ type: "start", request: { id: requestId, startedAt: new Date().toISOString(), providerId: provider.id, providerName: provider.name, baseUrl: provider.baseUrl, modelId, modelName: provider.models.find(model => model.id === modelId)?.name ?? aiModelName(modelId), purpose: options.purpose ?? (test ? "test" : "chat"), attempt } });
    try {
      const response = await this.fetcher(`${provider.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(provider.kind === "openrouter" ? { "X-OpenRouter-Title": "LanCarbon" } : {}) }, redirect: "error", signal: controller.signal, body: JSON.stringify({ model: modelId, messages, stream: true, ...(test ? { max_tokens: 128 } : {}), ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}), ...(options.temperature !== undefined ? { temperature: options.temperature } : {}), ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}), ...(options.thinkingBudget !== undefined && provider.kind === "siliconflow" && /DeepSeek-V(?:3\.[12]|4)/.test(modelId) && !options.disableThinking ? { thinking_budget: options.thinkingBudget } : {}), ...((test || options.disableThinking) && provider.kind === "siliconflow" && /DeepSeek-V[34]/.test(modelId) ? { enable_thinking: false } : {}) }) });
      if (!response.ok) { const detail = await response.text(); try { captureUsage(JSON.parse(detail).usage); } catch { /* Plain-text service errors have no usage metadata. */ } throw statusError(response.status, detail, response.headers); }
      touch();
      let received = false, finished = false, finishReason = "";
      const consume = (data: unknown) => {
        const item = data as { usage?: unknown; error?: { message?: string; code?: number; metadata?: object } | string; message?: string; choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: string }> };
        captureUsage(item.usage);
        if (item.error) throw statusError(typeof item.error === "object" && typeof item.error.code === "number" ? item.error.code : 500, JSON.stringify({ error: typeof item.error === "string" ? { message: item.error } : item.error }));
        const choice = item.choices?.[0]; if (!choice) return;
        const delta = choice.delta ?? choice.message;
        const content = typeof delta?.content === "string" ? delta.content : "";
        const reason = delta && "reasoning" in delta ? delta.reasoning : undefined;
        const reasoning = typeof delta?.reasoning_content === "string" ? delta.reasoning_content : typeof reason === "string" ? reason : "";
        if (content || reasoning) { if (content) received = true; onDelta(content, reasoning); }
        // Read the remaining usage frame before reporting a truncated/filtered reply.
        if (choice.finish_reason) { finishReason = choice.finish_reason; finished = true; }
      };
      if ((response.headers.get("content-type") ?? "").includes("application/json")) { consume(await response.json()); finished = true; }
      else {
        if (!response.body) throw new Error("The AI service returned an empty response");
        reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "", data: string[] = [], done = false;
        const line = (value: string) => { if (value === "") { const event = data.join("\n"); data = []; if (!event) return; if (event === "[DONE]") { finished = true; done = true; return; } consume(JSON.parse(event)); } else if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /, "")); };
        while (!done) { const chunk = await reader.read(); if (chunk.done) break; touch(); buffer += decoder.decode(chunk.value, { stream: true }); if (buffer.length > 2_000_000) throw new Error("Invalid oversized streaming event"); let end: number; while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end).replace(/\r$/, "")); buffer = buffer.slice(end + 1); if (done) break; } }
        buffer += decoder.decode(); if (buffer) line(buffer.replace(/\r$/, "")); line("");
      }
      options.onFinish?.(finishReason || "done");
      if (/^(?:length|max_tokens|max_output_tokens)$/iu.test(finishReason)) throw new Error("The model reached its output limit before finishing. Partial text was saved; retry the reply or ask a shorter question.");
      if (finishReason === "content_filter") throw new Error("The AI service filtered this response before it finished. Partial text was saved.");
      if (/^(?:error|tool_calls|function_call)$/iu.test(finishReason)) throw new Error("The AI service did not finish a text answer. Partial text was saved; you can retry.");
      if (!received) throw new Error("The model returned no answer text. Check that this is a chat model and retry.");
      if (!finished) throw new Error("The connection ended before the response finished. Partial text was saved; you can retry.");
      status = "complete";
    } catch (error) {
      if (signal.aborted) status = "stopped";
      if (signal.aborted) throw new Error("Generation stopped");
      if (timedOut) throw new Error("The AI service timed out. Check your computer's network and retry.");
      const detail = redactAIError(error, key);
      if (error instanceof AIRequestError) throw new AIRequestError(detail, error.status, error.retryAfter);
      throw new Error(/fetch failed|ERR_|ENOTFOUND|ECONN|network/i.test(detail) ? `Connection failed. Check your computer's network or system proxy and retry. ${detail}` : detail);
    } finally { clearTimeout(timer); clearTimeout(overall); signal.removeEventListener("abort", abort); await reader?.cancel().catch(() => undefined); await this.track({ type: "finish", id: requestId, completedAt: new Date().toISOString(), status, usage }); }
  }
}
