export type AIProviderKind = "siliconflow" | "openrouter" | "others";
// Retrieval roles are reserved for the later RAG phase; this release exposes chat only.
export type AIModelPurpose = "chat" | "embedding" | "rerank";
export interface AIModel { id: string; name: string; purpose: AIModelPurpose }
export interface AIProvider { id: string; kind: AIProviderKind; name: string; baseUrl: string; models: AIModel[]; defaultModel: string; hasKey: boolean }
export interface AIProviderInput { id: string; kind: AIProviderKind; name: string; baseUrl: string; models: AIModel[]; defaultModel: string; apiKey?: string; clearKey?: boolean }
export interface AIMessage { id: string; role: "user" | "assistant"; content: string; reasoning?: string; status: "complete" | "streaming" | "stopped" | "error"; providerId?: string; providerName?: string; modelId?: string; modelName?: string; error?: string; createdAt: string }
export interface AIChat { id: string; title: string; providerId: string; modelId: string; messages: AIMessage[]; createdAt: string; updatedAt: string }
export type AIResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface AIDesktopApi {
  providers(): Promise<AIResult<{ providers: AIProvider[] }>>;
  saveProvider(input: AIProviderInput): Promise<AIResult<{ providers: AIProvider[] }>>;
  removeProvider(id: string): Promise<AIResult<{ providers: AIProvider[] }>>;
  models(id: string): Promise<AIResult<{ models: AIModel[] }>>;
  test(id: string, modelId: string): Promise<AIResult<{ message: string }>>;
  chats(): Promise<AIResult<{ chats: AIChat[] }>>;
  createChat(providerId: string, modelId: string): Promise<AIResult<{ chat: AIChat }>>;
  renameChat(id: string, title: string): Promise<AIResult<{ chat: AIChat }>>;
  deleteChat(id: string): Promise<AIResult<object>>;
  send(id: string, providerId: string, modelId: string, text: string, retry?: boolean): Promise<AIResult<{ chat: AIChat }>>;
  stop(id: string): Promise<AIResult<object>>;
  onChat(callback: (chat: AIChat) => void): () => void;
}
export const AI_PRESETS = {
  siliconflow: { name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", modelId: "deepseek-ai/DeepSeek-V4-Pro", modelName: "DeepSeek V4 Pro" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelId: "openai/gpt-6-luna", modelName: "GPT-6 Luna" },
  others: { name: "Others", baseUrl: "", modelId: "", modelName: "" }
};
export function defaultAIProviders(): AIProvider[] { return (["siliconflow", "openrouter", "others"] as const).map(kind => ({ id: kind, kind, name: AI_PRESETS[kind].name, baseUrl: AI_PRESETS[kind].baseUrl, models: [], defaultModel: "", hasKey: false })); }
export function aiModelName(id: string): string {
  for (const preset of Object.values(AI_PRESETS)) if (preset.modelId === id) return preset.modelName;
  return id.split("/").at(-1)?.replace(/[-_]/g, " ") || id;
}
