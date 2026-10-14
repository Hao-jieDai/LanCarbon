import { aiModelName, type AIModel, type AIProvider } from "../src/shared/ai";

export function redactAIError(error: unknown, key = ""): string {
  let text = error instanceof Error ? error.message : String(error);
  if (key) text = text.split(key).join("[API key hidden]");
  return text.replace(/Bearer\s+[^\s"']+/gi, "Bearer [hidden]").replace(/sk-[\w-]{8,}/g, "[API key hidden]").slice(0, 700);
}
function statusError(status: number, detail: string): Error {
  const label = status === 401 ? "API key rejected" : status === 402 ? "Insufficient account balance or key spending limit" : status === 403 ? "Account or model access denied" : status === 404 ? "API address or model not found" : status === 429 ? "Rate limit reached; try again later" : status >= 500 ? "AI service temporarily unavailable" : "AI request rejected";
  return new Error(`${label} (HTTP ${status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
}
export class AIClient {
  constructor(private readonly fetcher: typeof fetch) {}
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
  async complete(provider: AIProvider, key: string, modelId: string, messages: Array<{ role: string; content: string }>, signal: AbortSignal, onDelta: (content: string, reasoning: string) => void, test = false): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    let timedOut = false;
    let timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    const overall = setTimeout(() => { timedOut = true; controller.abort(); }, 600_000);
    const touch = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000); };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await this.fetcher(`${provider.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(provider.kind === "openrouter" ? { "X-OpenRouter-Title": "LanCarbon" } : {}) }, redirect: "error", signal: controller.signal, body: JSON.stringify({ model: modelId, messages, stream: true, ...(test ? { max_tokens: 128, ...(provider.kind === "siliconflow" && modelId.includes("DeepSeek-V4") ? { enable_thinking: false } : {}) } : {}) }) });
      if (!response.ok) throw statusError(response.status, await response.text());
      touch();
      let received = false, finished = false;
      const consume = (data: unknown) => {
        const item = data as { error?: { message?: string } | string; message?: string; choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: string }> };
        if (item.error) throw new Error(typeof item.error === "string" ? item.error : item.error.message || "The service reported a streaming error");
        const choice = item.choices?.[0]; if (!choice) return;
        const delta = choice.delta ?? choice.message;
        const content = typeof delta?.content === "string" ? delta.content : "";
        const reason = delta && "reasoning" in delta ? delta.reasoning : undefined;
        const reasoning = typeof delta?.reasoning_content === "string" ? delta.reasoning_content : typeof reason === "string" ? reason : "";
        if (content || reasoning) { received = true; onDelta(content, reasoning); }
        if (choice.finish_reason === "error") throw new Error("The AI service interrupted this response");
        if (choice.finish_reason) finished = true;
      };
      if ((response.headers.get("content-type") ?? "").includes("application/json")) { consume(await response.json()); finished = true; }
      else {
        if (!response.body) throw new Error("The AI service returned an empty response");
        reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "", data: string[] = [], done = false;
        const line = (value: string) => { if (value === "") { const event = data.join("\n"); data = []; if (!event) return; if (event === "[DONE]") { finished = true; done = true; return; } consume(JSON.parse(event)); } else if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /, "")); };
        while (!done) { const chunk = await reader.read(); if (chunk.done) break; touch(); buffer += decoder.decode(chunk.value, { stream: true }); if (buffer.length > 2_000_000) throw new Error("Invalid oversized streaming event"); let end: number; while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end).replace(/\r$/, "")); buffer = buffer.slice(end + 1); if (done) break; } }
        buffer += decoder.decode(); if (buffer) line(buffer.replace(/\r$/, "")); line("");
      }
      if (!received) throw new Error("The model returned no text. Check that this is a chat model and retry.");
      if (!finished) throw new Error("The connection ended before the response finished. Partial text was saved; you can retry.");
    } catch (error) {
      if (signal.aborted) throw new Error("Generation stopped");
      if (timedOut) throw new Error("The AI service timed out. Check your computer's network and retry.");
      const detail = redactAIError(error, key);
      throw new Error(/fetch failed|ERR_|ENOTFOUND|ECONN|network/i.test(detail) ? `Connection failed. Check your computer's network or system proxy and retry. ${detail}` : detail);
    } finally { clearTimeout(timer); clearTimeout(overall); signal.removeEventListener("abort", abort); await reader?.cancel().catch(() => undefined); }
  }
}
