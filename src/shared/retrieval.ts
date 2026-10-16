import type { AIModel, AIProvider, AIProviderInput, AIResult } from "./ai";
import type { KnowledgeHit } from "./knowledge";
export type RetrievalRole = "embedding" | "rerank";
export interface RetrievalModel { mode: "reuse" | "custom"; providerId: string; modelId: string; modelName: string }
export interface RetrievalSettings { enabled: boolean; embedding: RetrievalModel; rerankEnabled: boolean; rerank: RetrievalModel; queryPrefix: string }
export const defaultRetrievalSettings = (): RetrievalSettings => ({ enabled: false, embedding: { mode: "reuse", providerId: "", modelId: "", modelName: "" }, rerankEnabled: false, rerank: { mode: "reuse", providerId: "", modelId: "", modelName: "" }, queryPrefix: "" });
export const RETRIEVAL_MAX_BYTES = 128 * 1024 * 1024;
export const RETRIEVAL_MAX_PASSAGES = 40000;
export interface RetrievalStatus { running: boolean; completed: number; total: number; ready: number; passages: number; bytes: number; limitBytes: number; dimensions?: number; message?: string }
export interface RetrievalHit extends KnowledgeHit { score: number; retrieval: "keyword" | "hybrid" | "reranked" }
export interface RetrievalResults { hits: RetrievalHit[]; warnings: string[]; mode: "keyword" | "hybrid" | "reranked" }
export interface RetrievalApi {
  settings(): Promise<AIResult<{ settings: RetrievalSettings; providers: AIProvider[]; shared: AIProvider[] }>>;
  saveSettings(settings: RetrievalSettings): Promise<AIResult<{ settings: RetrievalSettings }>>;
  saveProvider(input: AIProviderInput): Promise<AIResult<{ providers: AIProvider[] }>>;
  clearKey(id: string): Promise<AIResult<{ providers: AIProvider[] }>>;
  test(role: RetrievalRole): Promise<AIResult<{ message: string }>>;
  status(): Promise<AIResult<{ status: RetrievalStatus }>>;
  build(): Promise<AIResult<object>>;
  stop(): Promise<AIResult<object>>;
  clear(): Promise<AIResult<object>>;
  search(text: string, sourceIds?: string[], limit?: number): Promise<AIResult<RetrievalResults>>;
  onChanged(callback: () => void): () => void;
}
export function retrievalPriceProviders(providers: AIProvider[], dedicated: AIProvider[], settings: RetrievalSettings): AIProvider[] {
  const result = [...providers, ...dedicated].map(provider => ({ ...provider, models: [...provider.models] }));
  for (const role of ["embedding", "rerank"] as const) {
    const model = settings[role], provider = result.find(item => item.id === model.providerId);
    if (provider && model.modelId && !provider.models.some(item => item.id === model.modelId)) provider.models.push({ id: model.modelId, name: model.modelName || model.modelId, purpose: role });
  }
  return result;
}
export const retrievalModelSuggestions: Record<RetrievalRole, AIModel[]> = {
  embedding: [{ id: "BAAI/bge-m3", name: "BGE M3", purpose: "embedding" }, { id: "Pro/BAAI/bge-m3", name: "BGE M3 Pro", purpose: "embedding" }, { id: "Qwen/Qwen3-Embedding-0.6B", name: "Qwen3 Embedding 0.6B", purpose: "embedding" }],
  rerank: [{ id: "BAAI/bge-reranker-v2-m3", name: "BGE Reranker V2 M3", purpose: "rerank" }, { id: "Pro/BAAI/bge-reranker-v2-m3", name: "BGE Reranker V2 M3 Pro", purpose: "rerank" }, { id: "Qwen/Qwen3-Reranker-0.6B", name: "Qwen3 Reranker 0.6B", purpose: "rerank" }]
};
