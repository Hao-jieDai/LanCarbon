import { createHash } from "node:crypto";
import type { KnowledgeHit } from "../src/shared/knowledge";
import { RETRIEVAL_MAX_BYTES, type RetrievalHit, type RetrievalResults, type RetrievalRole, type RetrievalSettings, type RetrievalStatus } from "../src/shared/retrieval";
import { RetrievalClient, type RetrievalConnection } from "./retrieval-client";
import { RetrievalCache } from "./retrieval-cache";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const retrievalProfile = (connection: RetrievalConnection) => hash(JSON.stringify([1, connection.provider.id, connection.provider.baseUrl, connection.modelId]));
const pause = () => new Promise<void>(resolve => setImmediate(resolve));
const stopwords = new Set("the a an is are was were of to in and or for on with this that it as by from be what how which".split(" "));
export function retrievalTerms(text: string) { return (text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).flatMap(term => /^[\p{Script=Han}]+$/u.test(term) && term.length > 1 ? Array.from({ length: term.length - 1 }, (_, i) => term.slice(i, i + 2)) : stopwords.has(term) ? [] : [term]); }
export async function keywordRanks(corpus: KnowledgeHit[], text: string, signal?: AbortSignal) {
  const terms = new Set(retrievalTerms(text)), documents: Array<{ length: number; counts: Map<string, number> }> = [], frequency = new Map<string, number>(); let total = 0;
  for (let index = 0; index < corpus.length; index++) {
    if (signal?.aborted) throw Error("Retrieval stopped."); const tokens = retrievalTerms(corpus[index].chunk.text), counts = new Map<string, number>(); total += tokens.length;
    for (const token of tokens) if (terms.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1); for (const term of counts.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1); documents.push({ length: tokens.length, counts }); if (index % 128 === 0) await pause();
  }
  const average = total / Math.max(1, corpus.length);
  return documents.map(({ length, counts }, index) => { let score = 0; for (const [term, count] of counts) score += Math.log(1 + (corpus.length - (frequency.get(term) ?? 0) + 0.5) / ((frequency.get(term) ?? 0) + 0.5)) * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * length / Math.max(1, average))); return { index, score }; }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}
export class RetrievalService {
  private controller?: AbortController; private job?: Promise<unknown>; private running = false; private completed = 0; private total = 0; private message = "";
  constructor(private readonly settings: () => Promise<RetrievalSettings>, private readonly connection: (role: RetrievalRole) => Promise<RetrievalConnection>, private readonly corpus: () => Promise<KnowledgeHit[]>, private readonly cache: RetrievalCache, private readonly client: RetrievalClient, private readonly changed: () => void = () => {}) {}
  private begin<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.running) throw Error("A retrieval task is running. Stop it or wait for it to finish.");
    this.running = true; this.message = ""; this.completed = 0; this.total = 0; const controller = this.controller = new AbortController(); this.changed();
    const job = action(controller.signal).catch(error => { this.message = error instanceof Error ? error.message : String(error); throw error; }).finally(() => { this.running = false; this.controller = undefined; this.changed(); }); this.job = job; return job;
  }
  async status(): Promise<RetrievalStatus> {
    const corpus = await this.corpus(), settings = await this.settings(); let ready = 0, bytes = 0, dimensions: number | undefined;
    if (settings.embedding.modelId && settings.embedding.providerId) {
      try { const profile = retrievalProfile(await this.connection("embedding")), stats = await this.cache.stats(profile); bytes = stats.bytes; dimensions = stats.dimensions; for (const hit of corpus) if (await this.cache.has(profile, hash(hit.chunk.text))) ready++; }
      catch (error) { if (!this.message) this.message = error instanceof Error ? error.message : String(error); }
    }
    return { running: this.running, completed: this.completed, total: this.total, ready, passages: corpus.length, bytes, limitBytes: RETRIEVAL_MAX_BYTES, dimensions, message: this.message || undefined };
  }
  async build(wait = false, external?: AbortSignal, progress: (message: string) => void = () => {}, sourceIds?: string[]) {
    if (this.running) throw Error("A retrieval task is running.");
    const job = this.begin(async signal => {
      if (!(await this.settings()).enabled) throw Error("Enable and save semantic retrieval in AI Settings first.");
      const connection = await this.connection("embedding"), profile = retrievalProfile(connection), all = await this.corpus(), selected = sourceIds && new Set(sourceIds), original = selected ? all.filter(hit => selected.has(hit.source.id)) : all;
      if (!original.length) throw Error("No extracted passages are ready. Select sources and prepare their text first.");
      const unique = new Map(original.map(hit => [hash(hit.chunk.text), hit.chunk.text])); await this.cache.prune(profile, new Set(all.map(hit => hash(hit.chunk.text)))); this.total = unique.size;
      const pending: Array<{ key: string; text: string }> = [];
      for (const [key, text] of unique) { if (signal.aborted) throw Error("Retrieval stopped."); if (await this.cache.has(profile, key)) this.completed++; else pending.push({ key, text }); }
      for (let offset = 0; offset < pending.length; offset += 16) {
        if (signal.aborted) throw Error("Retrieval stopped."); const batch = pending.slice(offset, offset + 16), vectors = await this.client.embed(connection, batch.map(item => item.text), signal);
        if (signal.aborted) throw Error("Retrieval stopped."); const fresh = new Set((await this.corpus()).map(hit => hash(hit.chunk.text)));
        await this.cache.put(profile, batch.flatMap((item, i) => fresh.has(item.key) ? [{ key: item.key, vector: vectors[i] }] : [])); this.completed += batch.length; this.changed(); progress(`Preparing retrieval ${this.completed} / ${this.total}`); await pause();
      }
      await this.cache.prune(profile, new Set((await this.corpus()).map(hit => hash(hit.chunk.text)))); this.message = "Selected sources prepared. Unchanged passages reuse saved vectors.";
    }); const abort = () => this.controller?.abort(); external?.addEventListener("abort", abort, { once: true }); if (external?.aborted) abort();
    if (wait) { try { await job; external?.throwIfAborted(); } finally { external?.removeEventListener("abort", abort); } }
    else void job.catch(() => undefined).finally(() => external?.removeEventListener("abort", abort));
  }
  async test(role: RetrievalRole) {
    if (!["embedding", "rerank"].includes(role)) throw Error("Choose Embedding or Rerank.");
    return this.begin(async signal => { const connection = await this.connection(role); if (role === "embedding") { const vector = (await this.client.embed(connection, ["Climate change affects investment."], signal))[0]; return `Embedding test succeeded · ${vector.length} dimensions`; } const results = await this.client.rerank(connection, "Which text concerns climate investment?", ["Climate change affects investment.", "A recipe for bread."], signal); if (results[0].index !== 0) return "Rerank connection succeeded. The sample ordering needs checking with your own documents."; return "Rerank test succeeded"; });
  }
  async stop() { this.controller?.abort(); await this.job?.catch(() => undefined); }
  async shutdown() { await this.stop(); this.cache.close(); }
  async clear() { await this.stop(); await this.cache.clear(); this.message = "Vector index cleared. Source documents and extracted text are kept."; this.changed(); }
  async search(text: string, sourceIds?: string[], limit = 8, external?: AbortSignal): Promise<RetrievalResults> {
    if (typeof text !== "string" || !text.trim() || text.length > 1500 || !Number.isInteger(limit) || limit < 1 || limit > 20 || sourceIds !== undefined && (!Array.isArray(sourceIds) || sourceIds.length > 20000 || !sourceIds.every(id => typeof id === "string" && /^(file|note):/.test(id)))) throw Error("Enter a question up to 1,500 characters and a valid source selection.");
    external?.throwIfAborted(); const abort = () => this.controller?.abort(); external?.addEventListener("abort", abort, { once: true });
    try { return await this.begin(async signal => {
      const selected = sourceIds && new Set(sourceIds), seenText = new Set<string>();
      const corpus = (await this.corpus()).filter(hit => !selected || selected.has(hit.source.id)).sort((a, b) => `${a.source.id}:${a.chunk.id}`.localeCompare(`${b.source.id}:${b.chunk.id}`)).filter(hit => {
        const key = `${hit.source.id}:${hit.chunk.text.replace(/\s+/g, " ").trim()}`;
        if (seenText.has(key)) return false; seenText.add(key); return true;
      }), settings = await this.settings(), warnings: string[] = [];
      if (!corpus.length) return { hits: [], warnings: ["No current extracted text is available for the selected sources."], mode: "keyword" };
      const keyword = (await keywordRanks(corpus, text, signal)).slice(0, 120), semantic: Array<{ index: number; score: number }> = []; let mode: RetrievalResults["mode"] = "keyword";
      if (settings.enabled) {
        try {
          const connection = await this.connection("embedding"), profile = retrievalProfile(connection), stats = await this.cache.stats(profile);
          if (!stats.count) warnings.push("Prepare the selected sources to enable semantic retrieval. Keyword matches are shown.");
          else {
            const prefix = settings.queryPrefix || (/Qwen3.*Embedding/i.test(connection.modelId) ? "Instruct: Given a question, retrieve relevant passages that answer the question.\nQuery: " : ""), query = (await this.client.embed(connection, [prefix + text], signal))[0]; let missing = 0;
            for (let index = 0; index < corpus.length; index++) {
              if (signal.aborted) throw Error("Retrieval stopped."); const vector = await this.cache.get(profile, hash(corpus[index].chunk.text)); if (!vector) { missing++; continue; } if (vector.length !== query.length) throw Error("Embedding dimensions changed. Clear and prepare the vector index again.");
              let score = 0; for (let dimension = 0; dimension < vector.length; dimension++) score += vector[dimension] * query[dimension]; semantic.push({ index, score }); if (index % 256 === 0) await pause();
            }
            semantic.sort((a, b) => b.score - a.score); semantic.splice(120); if (semantic.length) mode = "hybrid";
            if (missing) warnings.push(`${missing} passages need vector preparation; current results may be incomplete.`);
          }
        } catch (error) { if (signal.aborted) throw error; warnings.push(`Semantic retrieval unavailable: ${error instanceof Error ? error.message : String(error)} Keyword matches are shown.`); semantic.length = 0; }
      } else warnings.push("Semantic retrieval is off. Keyword matches are shown.");
      const ranks = new Map<number, number>(); for (const list of [keyword, semantic]) list.forEach((item, rank) => ranks.set(item.index, (ranks.get(item.index) ?? 0) + 1 / (60 + rank + 1)));
      let candidates = [...ranks].map(([index, score]) => ({ ...corpus[index], score, retrieval: mode } as RetrievalHit)).sort((a, b) => b.score - a.score);
      // Most of the budget is relevance-ranked. A small, relevance-ordered tail
      // offers other sources a chance without reserving a slot for every document.
      const primary = candidates.slice(0, 48), represented = new Set(primary.map(hit => hit.source.id));
      const diversity = candidates.filter(hit => { if (represented.has(hit.source.id)) return false; represented.add(hit.source.id); return true; }).slice(0, 12);
      candidates = [...primary, ...diversity, ...candidates.slice(48).filter(hit => !diversity.includes(hit))].slice(0, 60);
      if (settings.enabled && settings.rerankEnabled && candidates.length) {
        try { const results = await this.client.rerank(await this.connection("rerank"), text, candidates.map(hit => hit.chunk.text), signal); candidates = results.map(result => ({ ...candidates[result.index], score: result.score, retrieval: "reranked" })); mode = "reranked"; }
        catch (error) { if (signal.aborted) throw error; warnings.push(`Reranking unavailable: ${error instanceof Error ? error.message : String(error)} Initial retrieval order is kept.`); }
      }
      if (signal.aborted) throw Error("Retrieval stopped.");
      const fresh = new Map((await this.corpus()).map(hit => [`${hit.source.id}:${hit.chunk.id}`, hit]));
      const hits = candidates.flatMap(hit => { const current = fresh.get(`${hit.source.id}:${hit.chunk.id}`); return current?.fingerprint === hit.fingerprint && current.chunk.text === hit.chunk.text ? [{ ...hit, source: current.source }] : []; });
      if (hits.length !== candidates.length) warnings.push("Some sources changed during retrieval. Their outdated passages were removed; retry after updating.");
      // Never reorder the reranker's results by source selection order.
      return { hits: hits.slice(0, limit), warnings, mode };
    }); } finally { external?.removeEventListener("abort", abort); }
  }
}
