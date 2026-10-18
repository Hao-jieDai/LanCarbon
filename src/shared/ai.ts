import type { ChatGrounding, ChatSourceCatalogue, CitationTarget } from "./grounding";
import type { KnowledgeScope } from "./knowledge";
import type { AIModelPrice, AIModelPriceInput, AIUsagePage, AIUsageQuery } from "./aiUsage";
export type AIProviderKind = "siliconflow" | "openrouter" | "others";
// Retrieval roles use their own settings; Chat connections retain their Chat-only model lists.
export type AIModelPurpose = "chat" | "embedding" | "rerank";
export interface AIModel { id: string; name: string; purpose: AIModelPurpose }
export interface AIProvider { id: string; kind: AIProviderKind; name: string; baseUrl: string; models: AIModel[]; defaultModel: string; hasKey: boolean; maskedKey?: string }
export interface AIProviderInput { id: string; kind: AIProviderKind; name: string; baseUrl: string; models: AIModel[]; defaultModel: string; apiKey?: string; clearKey?: boolean }
export interface AIMessage { grounding?: ChatGrounding; sourceScope?: KnowledgeScope; id: string; role: "user" | "assistant"; content: string; reasoning?: string; progress?: string; status: "complete" | "streaming" | "stopped" | "error"; providerId?: string; providerName?: string; modelId?: string; modelName?: string; error?: string; createdAt: string }
export interface AIChat { sourceScope?: KnowledgeScope; id: string; title: string; providerId: string; modelId: string; messages: AIMessage[]; createdAt: string; updatedAt: string }
export interface ChatPdfOptions { includeThinking: boolean; includeEvidence: boolean }
export type ChatPdfResult = { ok: true; destination: string; warnings: string[] } | { ok: false; canceled?: boolean; error: string };
export type AIResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface AIDesktopApi {
  providers(): Promise<AIResult<{ providers: AIProvider[] }>>;
  priceProviders(): Promise<AIResult<{ providers: AIProvider[] }>>;
  saveProvider(input: AIProviderInput): Promise<AIResult<{ providers: AIProvider[] }>>;
  removeProvider(id: string): Promise<AIResult<{ providers: AIProvider[] }>>;
  clearKey(id: string): Promise<AIResult<{ providers: AIProvider[] }>>;
  preferences(): Promise<AIResult<{ systemPrompt: string }>>;
  savePreferences(systemPrompt: string): Promise<AIResult<{ systemPrompt: string }>>;
  models(id: string): Promise<AIResult<{ models: AIModel[] }>>;
  test(id: string, modelId: string): Promise<AIResult<{ message: string }>>;
  stopTest(): Promise<AIResult<object>>;
  onTestProgress(callback: (message: string) => void): () => void;
  sourceCatalogue(): Promise<AIResult<{ catalogue: ChatSourceCatalogue }>>;
  setSources(id: string, scope: KnowledgeScope): Promise<AIResult<{ chat: AIChat }>>;
  openCitation(chatId: string, messageId: string, label: string): Promise<AIResult<{ target: CitationTarget }>>;
  chats(): Promise<AIResult<{ chats: AIChat[] }>>;
  createChat(providerId: string, modelId: string): Promise<AIResult<{ chat: AIChat }>>;
  renameChat(id: string, title: string): Promise<AIResult<{ chat: AIChat }>>;
  deleteChat(id: string): Promise<AIResult<object>>;
  exportPdf(id: string, options: ChatPdfOptions): Promise<ChatPdfResult>;
  send(id: string, providerId: string, modelId: string, text: string, retry?: boolean): Promise<AIResult<{ chat: AIChat }>>;
  stop(id: string): Promise<AIResult<object>>;
  onChat(callback: (chat: AIChat) => void): () => void;
  balances(): Promise<AIResult<{ balances: import("./aiBalances").SourceBalance[]; usdToCny: number }>>;
  saveBalance(input: import("./aiBalances").BalanceInput): Promise<AIResult<object>>;
  removeBalance(source: import("./aiBalances").BalanceSource & { accountId?: string }): Promise<AIResult<object>>;
  usage(query?: AIUsageQuery): Promise<AIResult<{ usage: AIUsagePage }>>;
  prices(): Promise<AIResult<{ prices: AIModelPrice[]; usdToCny: number }>>;
  savePrice(price: AIModelPriceInput): Promise<AIResult<{ prices: AIModelPrice[] }>>;
  saveExchangeRate(usdToCny: number): Promise<AIResult<{ usdToCny: number }>>;
  onUsageChanged(callback: () => void): () => void;
}
export const DEFAULT_AI_SYSTEM_PROMPT = `Use a professional, accurate, calm, neutral and concise academic style. Answer in the user's language unless requested otherwise. Do not use emoji, decorative icons, exaggerated praise or promotional language. Give the main answer first and use clear paragraphs; use headings, lists, tables, code or mathematics only when they improve understanding. Distinguish established facts, assumptions, interpretations and uncertainty. Do not invent citations, quotations, sources, data or capabilities. State relevant limitations briefly and ask for essential missing information. Follow the user's specific task and requested format.`;
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
