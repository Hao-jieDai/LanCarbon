import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AISettingsStore } from "./ai-storage";
import { AIClient, redactAIError } from "./ai-client";
import { defaultTranslationSettings, DEFAULT_TRANSLATION_PROMPT, normalizeTranslationText, type TranslationCacheStats, type TranslationResult, type TranslationSettings } from "../src/shared/translation";
class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  protected serial<T>(action: () => Promise<T>): Promise<T> { const result = this.tail.then(action); this.tail = result.catch(() => undefined); return result; }
  async flush() { await this.tail; }
}
async function read(filename: string, max: number): Promise<any> {
  try { const stat = await fs.lstat(filename); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw Error("Translation data is invalid or too large."); return JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function write(filename: string, value: unknown) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + "." + randomUUID() + ".tmp";
  try { await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}
export class TranslationSettingsStore extends Serial {
  private readonly filename: string;
  constructor(config: string) { super(); this.filename = path.join(config, "translation-settings.json"); }
  private validate(value: TranslationSettings): TranslationSettings {
    if (!value || !["reuse", "custom"].includes(value.mode) || typeof value.providerId !== "string" || (value.providerId && !/^[a-zA-Z0-9-]{1,100}$/.test(value.providerId)) || typeof value.modelId !== "string" || value.modelId.length > 256 || /\s/.test(value.modelId) || typeof value.modelName !== "string" || value.modelName.length > 100 || typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > 8000 || !["auto", "standard", "hunyuan"].includes(value.template)) throw Error("Choose a translation service, model and valid prompt.");
    if (value.mode === "custom" && value.providerId && !value.providerId.startsWith("translation-")) throw Error("Choose a dedicated translation connection.");
    if (value.mode === "reuse" && value.providerId.startsWith("translation-")) throw Error("Choose an existing chat connection.");
    return { mode: value.mode, providerId: value.providerId, modelId: value.modelId, modelName: value.modelName.trim(), prompt: value.prompt.trim(), template: value.template };
  }
  async get(): Promise<TranslationSettings> { return this.serial(async () => { const data = await read(this.filename, 100_000); if (!data) return defaultTranslationSettings(); if (data.version !== 1) throw Error("Unsupported translation settings. Existing settings were preserved."); return this.validate(data.settings); }); }
  async save(value: TranslationSettings): Promise<TranslationSettings> { const settings = this.validate(value); return this.serial(async () => { await write(this.filename, { version: 1, settings }); return settings; }); }
}
interface CacheEntry { key: string; text: string; usedAt: number }
export class TranslationCache extends Serial {
  static readonly MAX_ENTRIES = 1000;
  static readonly MAX_BYTES = 5_000_000;
  private readonly filename: string;
  constructor(data: string) { super(); this.filename = path.join(data, "Research", "Translation", "cache.json"); }
  private async entries(): Promise<CacheEntry[]> {
    const value = await read(this.filename, TranslationCache.MAX_BYTES); if (!value) return [];
    if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > TranslationCache.MAX_ENTRIES) throw Error("Translation cache is invalid. Clear it in Translation Settings.");
    return value.entries.filter((entry: CacheEntry) => /^[a-f0-9]{64}$/.test(entry.key) && typeof entry.text === "string" && entry.text.length <= 8000 && Number.isFinite(entry.usedAt));
  }
  private bytes(entries: CacheEntry[]) { return Buffer.byteLength(JSON.stringify({ version: 1, entries })); }
  async stats(): Promise<TranslationCacheStats> { return this.serial(async () => { const entries = await this.entries(); return { entries: entries.length, bytes: this.bytes(entries) }; }); }
  async get(key: string): Promise<string | undefined> { return this.serial(async () => { const entries = await this.entries(), index = entries.findIndex(entry => entry.key === key); if (index < 0) return undefined; const [entry] = entries.splice(index, 1); entries.push({ ...entry, usedAt: Date.now() }); await write(this.filename, { version: 1, entries }); return entry.text; }); }
  async put(key: string, text: string): Promise<void> { return this.serial(async () => { const entries = (await this.entries()).filter(entry => entry.key !== key); entries.push({ key, text, usedAt: Date.now() }); while (entries.length > TranslationCache.MAX_ENTRIES || this.bytes(entries) > TranslationCache.MAX_BYTES) entries.shift(); await write(this.filename, { version: 1, entries }); }); }
  async clear(): Promise<TranslationCacheStats> { return this.serial(async () => { await write(this.filename, { version: 1, entries: [] }); return { entries: 0, bytes: this.bytes([]) }; }); }
}
export function translationMessages(settings: TranslationSettings, source: string): Array<{ role: string; content: string }> {
  const hunyuan = settings.template === "hunyuan" || (settings.template === "auto" && /(?:Hunyuan-MT|HY-MT)/i.test(settings.modelId));
  if (hunyuan) return [{ role: "user", content: "把下面的文本翻译成简体中文，不要额外解释。" + (settings.prompt !== DEFAULT_TRANSLATION_PROMPT ? "\n翻译要求：" + settings.prompt : "") + "\n\n" + source }];
  return [{ role: "system", content: settings.prompt }, { role: "user", content: JSON.stringify({ text_to_translate: source }) }];
}
export class TranslationService {
  enabled = false;
  private active?: { id: string; controller: AbortController; done: Promise<void> };
  private revision = 0;
  private pendingId = "";
  constructor(readonly settings: TranslationSettingsStore, readonly custom: AISettingsStore, private readonly shared: AISettingsStore, private readonly cache: () => TranslationCache, private readonly client: AIClient) {}
  async setEnabled(value: boolean) { if (typeof value !== "boolean") throw Error("Choose whether translation is enabled."); this.enabled = value; if (!value) { this.revision++; await this.cancel(); } return this.enabled; }
  private async stopActive(id?: string): Promise<void> { const job = this.active; if (job && (id === undefined || job.id === id)) { job.controller.abort(); await job.done; } }
  async cancel(id?: string): Promise<void> { if (id === undefined || id === this.pendingId) this.revision++; await this.stopActive(id); }
  async translate(id: string, value: string, test = false): Promise<TranslationResult> {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Error("Invalid translation request.");
    if (!test && !this.enabled) throw Error("Turn on translation first.");
    const source = normalizeTranslationText(value), ticket = ++this.revision;
    this.pendingId = id;
    await this.stopActive();
    if (ticket !== this.revision || (!test && !this.enabled)) throw Error("Translation stopped.");
    let finish!: () => void;
    const job = { id, controller: new AbortController(), done: new Promise<void>(resolve => { finish = resolve; }) }; this.active = job;
    let key = "";
    try {
      const settings = await this.settings.get();
      if (!settings.providerId || !settings.modelId) throw Error("Choose and save a model in Translation Settings first.");
      const connection = await (settings.mode === "reuse" ? this.shared : this.custom).connection(settings.providerId); key = connection.key;
      if (settings.mode === "reuse" && !connection.provider.models.some(model => model.id === settings.modelId)) throw Error("Choose a model saved in AI Settings, or use a separate translation connection.");
      const messages = translationMessages(settings, source);
      const cacheKey = createHash("sha256").update(JSON.stringify([settings.mode, connection.provider.id, connection.provider.baseUrl, settings.modelId, messages])).digest("hex");
      const cache = this.cache();
      let cached: string | undefined; try { cached = test ? undefined : await cache.get(cacheKey); } catch { /* An unreadable cache must not prevent a direct translation. */ }
      if (job.controller.signal.aborted || ticket !== this.revision) throw Error("Translation stopped.");
      const provider = { ...connection.provider, models: [{ id: settings.modelId, name: settings.modelName || settings.modelId, purpose: "chat" as const }] };
      if (cached !== undefined) return { text: cached, cached: true, providerName: provider.name, modelName: provider.models[0].name };
      let text = "";
      await this.client.complete(provider, key, settings.modelId, messages, job.controller.signal, content => { text += content; if (text.length > 8000) { job.controller.abort(); throw Error("Translation response is too long."); } }, false, undefined, { purpose: "translation", maxTokens: 700, disableThinking: true, timeoutMs: 90_000, ...(settings.template === "hunyuan" || (settings.template === "auto" && /(?:Hunyuan-MT|HY-MT)/i.test(settings.modelId)) ? { temperature: 0.7 } : {}) });
      if (job.controller.signal.aborted || ticket !== this.revision) throw Error("Translation stopped.");
      text = text.trim(); if (!text) throw Error("The model returned no translation.");
      try { await cache.put(cacheKey, text); } catch { /* The translated result is usable even when caching fails. */ }
      return { text, cached: false, providerName: provider.name, modelName: provider.models[0].name };
    } catch (error) { throw Error(job.controller.signal.aborted ? "Translation stopped." : redactAIError(error, key)); }
    finally { if (this.active === job) this.active = undefined; finish(); }
  }
  async models(mode: TranslationSettings["mode"], id: string) { if (!["reuse", "custom"].includes(mode)) throw Error("Choose a translation connection."); const connection = await (mode === "reuse" ? this.shared : this.custom).connection(id); return this.client.models(connection.provider, connection.key); }
  async shutdown() { this.enabled = false; this.revision++; await this.cancel(); await this.settings.flush(); await this.custom.flush(); await this.cache().flush(); }
}
