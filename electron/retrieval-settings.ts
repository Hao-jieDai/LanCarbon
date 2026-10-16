import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultRetrievalSettings, type RetrievalModel, type RetrievalSettings } from "../src/shared/retrieval";
export function validRetrievalSettings(value: RetrievalSettings): RetrievalSettings {
  if (!value || typeof value.enabled !== "boolean" || typeof value.rerankEnabled !== "boolean" || typeof value.queryPrefix !== "string" || value.queryPrefix.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.queryPrefix)) throw Error("Invalid retrieval settings.");
  const model = (input: RetrievalModel): RetrievalModel => {
    if (!input || !["reuse", "custom"].includes(input.mode) || typeof input.providerId !== "string" || input.providerId && !/^[a-zA-Z0-9-]{1,100}$/.test(input.providerId) || typeof input.modelId !== "string" || input.modelId.length > 256 || /\s/.test(input.modelId) || typeof input.modelName !== "string" || input.modelName.length > 100) throw Error("Enter a valid retrieval service and model ID.");
    if (input.providerId && (input.mode === "custom") !== input.providerId.startsWith("retrieval-")) throw Error("Choose a connection matching the selected mode.");
    return { mode: input.mode, providerId: input.providerId, modelId: input.modelId, modelName: input.modelName.trim() || input.modelId.slice(0, 100) };
  };
  const result = { enabled: value.enabled, embedding: model(value.embedding), rerankEnabled: value.rerankEnabled, rerank: model(value.rerank), queryPrefix: value.queryPrefix };
  if (result.enabled && (!result.embedding.providerId || !result.embedding.modelId) || result.rerankEnabled && (!result.rerank.providerId || !result.rerank.modelId)) throw Error("Choose a service and model before enabling retrieval or reranking.");
  return result;
}
export class RetrievalSettingsStore {
  private queue: Promise<unknown> = Promise.resolve(); private filename: string;
  constructor(config: string) { this.filename = path.join(config, "retrieval-settings.json"); }
  private serial<T>(action: () => Promise<T>): Promise<T> { const work = this.queue.then(action); this.queue = work.catch(() => undefined); return work; }
  async get() { return this.serial(async () => { try { const stat = await fs.lstat(this.filename); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50000) throw Error("Invalid retrieval settings file."); const value = JSON.parse(await fs.readFile(this.filename, "utf8")); if (value.version !== 1) throw Error("Unsupported retrieval settings format."); return validRetrievalSettings(value.settings); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultRetrievalSettings(); throw error; } }); }
  async save(input: RetrievalSettings) { const settings = validRetrievalSettings(input); return this.serial(async () => { const existing = await fs.lstat(this.filename).catch(error => { if (error.code === "ENOENT") return null; throw error; }); if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw Error("Invalid retrieval settings path."); await fs.mkdir(path.dirname(this.filename), { recursive: true }); const temporary = `${this.filename}.${randomUUID()}.tmp`; try { await fs.writeFile(temporary, JSON.stringify({ version: 1, settings }, null, 2), { mode: 0o600, flag: "wx" }); await fs.rename(temporary, this.filename); } finally { await fs.unlink(temporary).catch(() => undefined); } return settings; }); }
}
