import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AI_PRESETS, DEFAULT_AI_SYSTEM_PROMPT, defaultAIProviders, type AIProvider, type AIProviderInput, type AIChat } from "../src/shared/ai";

export interface SecretCodec { available(): boolean | Promise<boolean>; encrypt(text: string): Buffer | Promise<Buffer>; decrypt(bytes: Buffer): string | Promise<string> }
interface StoredProvider extends Omit<AIProvider, "hasKey" | "maskedKey"> { encryptedKey?: string }
interface StoredSettings { version: number; providers: StoredProvider[]; systemPrompt: string }
function validId(id: unknown): asserts id is string { if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("Invalid AI record ID"); }
function bounded(text: unknown, label: string, max: number): string { if (typeof text !== "string" || text.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error(`Invalid ${label}`); return text.trim(); }
export function aiBaseUrl(value: unknown): string {
  const text = bounded(value, "API address", 2000).replace(/\/+$/, "");
  let url: URL; try { url = new URL(text); } catch { throw new Error("Enter a complete API base address, such as https://example.com/v1"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS API base address (HTTP is allowed for local services)");
  if (/\/(chat\/completions|models|responses)$/i.test(url.pathname)) throw new Error("Enter the base address without /chat/completions, /models or /responses");
  return text;
}
async function readJson(filename: string, limit: number): Promise<unknown | undefined> {
  try { const stat = await fs.lstat(filename); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("AI data file is invalid or too large"); return JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function atomicJson(filename: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > (filename.endsWith("chats.json") ? 25_000_000 : 2_000_000)) throw new Error("AI storage is full. Delete unused conversations or configurations to continue.");
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, text, { mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}
class Serialized {
  private tail: Promise<unknown> = Promise.resolve();
  protected serial<T>(action: () => Promise<T>): Promise<T> { const result = this.tail.then(action); this.tail = result.catch(() => undefined); return result; }
  async flush(): Promise<void> { await this.tail; }
}
export class AISettingsStore extends Serialized {
  private readonly filename: string;
  constructor(config: string, private readonly codec: SecretCodec) { super(); this.filename = path.join(config, "ai-settings.json"); }
  private async read(): Promise<StoredSettings> {
    const data = await readJson(this.filename, 2_000_000) as { version?: number; providers?: StoredProvider[]; systemPrompt?: string } | undefined;
    if (!data) return { version: 1, providers: defaultAIProviders().map(({ hasKey: _key, ...provider }) => provider), systemPrompt: DEFAULT_AI_SYSTEM_PROMPT };
    if (data.version !== 1 || !Array.isArray(data.providers) || data.providers.length > 30) throw new Error("Unsupported AI settings format. Existing settings have been preserved.");
    const ids = new Set<string>();
    for (const provider of data.providers) { validId(provider.id); if (ids.has(provider.id)) throw new Error("Duplicate AI configuration"); ids.add(provider.id); const validated = this.validate(provider); if (validated.baseUrl !== provider.baseUrl) throw new Error("Invalid stored API address"); if (provider.encryptedKey !== undefined && (typeof provider.encryptedKey !== "string" || provider.encryptedKey.length > 20000)) throw new Error("Invalid stored API key"); }
    if (["siliconflow", "openrouter", "others"].some(id => !ids.has(id))) throw new Error("AI settings are incomplete. Existing settings have been preserved.");
    const systemPrompt = data.systemPrompt === undefined ? DEFAULT_AI_SYSTEM_PROMPT : bounded(data.systemPrompt, "response guidelines", 12000);
    return { version: 1, providers: data.providers, systemPrompt };
  }
  private validate(input: AIProviderInput): Omit<AIProvider, "hasKey"> {
    validId(input.id);
    if (!["siliconflow", "openrouter", "others"].includes(input.kind)) throw new Error("Unknown AI service");
    if (input.kind !== "others" && input.id !== input.kind) throw new Error("Invalid preset configuration");
    const name = input.kind === "others" ? bounded(input.name, "configuration name", 100) : AI_PRESETS[input.kind].name;
    if (!name) throw new Error("Enter a configuration name");
    const baseUrl = input.kind === "others" ? (input.baseUrl.trim() ? aiBaseUrl(input.baseUrl) : "") : AI_PRESETS[input.kind].baseUrl;
    if (!Array.isArray(input.models) || input.models.length > 100) throw new Error("Configure up to 100 chat models per service");
    const models = input.models.map(model => { const id = bounded(model.id, "model ID", 256), label = bounded(model.name, "model name", 100); if (!id || /\s/.test(id) || !label || model.purpose !== "chat") throw new Error("Enter a chat model ID and display name"); return { id, name: label, purpose: "chat" as const }; });
    if (new Set(models.map(model => model.id)).size !== models.length) throw new Error("This model is already configured");
    const defaultModel = bounded(input.defaultModel, "default model", 256);
    if (defaultModel && !models.some(model => model.id === defaultModel)) throw new Error("Choose a configured default model");
    return { id: input.id, kind: input.kind, name, baseUrl, models, defaultModel: defaultModel || models[0]?.id || "" };
  }
  private async publicProviders(providers: StoredProvider[]): Promise<AIProvider[]> {
    return Promise.all(providers.map(async ({ encryptedKey, ...provider }) => {
      let maskedKey: string | undefined;
      if (encryptedKey) {
        try { if (await this.codec.available()) { const key = await this.codec.decrypt(Buffer.from(encryptedKey, "base64")); maskedKey = key.length > 8 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : "••••••••"; } }
        catch { /* The key can still be removed or replaced on another Windows account. */ }
      }
      return { ...provider, hasKey: !!encryptedKey, ...(maskedKey ? { maskedKey } : {}) };
    }));
  }
  async list(): Promise<AIProvider[]> { return this.serial(async () => this.publicProviders((await this.read()).providers)); }
  async preferences(): Promise<string> { return this.serial(async () => (await this.read()).systemPrompt); }
  async savePreferences(value: string): Promise<string> { return this.serial(async () => { const systemPrompt = bounded(value, "response guidelines", 12000), settings = await this.read(); await atomicJson(this.filename, { ...settings, systemPrompt }); return systemPrompt; }); }
  async clearKey(id: string): Promise<AIProvider[]> { validId(id); return this.serial(async () => { const settings = await this.read(); if (!settings.providers.some(item => item.id === id)) throw new Error("AI configuration not found"); const providers = settings.providers.map(item => item.id === id ? { ...item, encryptedKey: undefined } : item); await atomicJson(this.filename, { ...settings, providers }); return this.publicProviders(providers); }); }
  async save(input: AIProviderInput): Promise<AIProvider[]> {
    return this.serial(async () => {
      const provider = this.validate(input), settings = await this.read(), providers = settings.providers, existing = providers.find(item => item.id === provider.id);
      const key = input.apiKey === undefined ? "" : bounded(input.apiKey, "API key", 8000);
      if (/\s/.test(key)) throw new Error("The API key contains whitespace");
      if (existing?.encryptedKey && existing.baseUrl !== provider.baseUrl && !key && !input.clearKey) throw new Error("Enter the API key again when changing the API address");
      let encryptedKey = input.clearKey ? undefined : existing?.encryptedKey;
      if (key) { if (!await this.codec.available()) throw new Error("Windows secure key storage is unavailable. The key was not saved."); encryptedKey = (await this.codec.encrypt(key)).toString("base64"); }
      const next = { ...provider, encryptedKey };
      const updated = existing ? providers.map(item => item.id === next.id ? next : item) : [...providers, next];
      if (updated.length > 30) throw new Error("Configure up to 30 services");
      await atomicJson(this.filename, { ...settings, providers: updated });
      return this.publicProviders(updated);
    });
  }
  async remove(id: string): Promise<AIProvider[]> { validId(id); if (["siliconflow", "openrouter", "others"].includes(id)) throw new Error("Clear the preset's API key instead of deleting the preset"); return this.serial(async () => { const settings = await this.read(), providers = settings.providers.filter(item => item.id !== id); await atomicJson(this.filename, { ...settings, providers }); return this.publicProviders(providers); }); }
  async connection(id: string): Promise<{ provider: AIProvider; key: string }> {
    return this.serial(async () => { validId(id); const saved = (await this.read()).providers.find(item => item.id === id); if (!saved?.baseUrl || !saved.encryptedKey) throw new Error("Save an API address and API key in AI Settings first"); if (!await this.codec.available()) throw new Error("Windows secure key storage is unavailable"); let key: string; try { key = await this.codec.decrypt(Buffer.from(saved.encryptedKey, "base64")); } catch { throw new Error("This API key cannot be decrypted on this Windows account. Enter it again in AI Settings."); } const { encryptedKey: _secret, ...provider } = saved; return { provider: { ...provider, hasKey: true }, key }; });
  }
}
export class AIChatStore extends Serialized {
  private loaded?: AIChat[];
  private readonly filename: string;
  constructor(data: string) { super(); this.filename = path.join(data, "Research", "Chats", "chats.json"); }
  private async read(): Promise<AIChat[]> {
    if (this.loaded) return this.loaded;
    const data = await readJson(this.filename, 25_000_000) as { version?: number; chats?: AIChat[] } | undefined;
    if (!data) return this.loaded = [];
    if (data.version !== 1 || !Array.isArray(data.chats)) throw new Error("Unsupported chat format. Existing conversations have been preserved.");
    let interrupted = false;
    const ids = new Set<string>();
    for (const chat of data.chats) {
      validId(chat.id); if (ids.has(chat.id) || typeof chat.title !== "string" || !Array.isArray(chat.messages) || typeof chat.providerId !== "string" || typeof chat.modelId !== "string") throw new Error("Invalid conversation data"); ids.add(chat.id);
      for (const message of chat.messages) { validId(message.id); if (!["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !["complete", "streaming", "stopped", "error"].includes(message.status)) throw new Error("Invalid chat message"); if (message.status === "streaming") { message.status = "stopped"; message.error = "Generation was interrupted when LanCarbon closed. You can retry."; interrupted = true; } }
    }
    if (interrupted) await atomicJson(this.filename, data);
    return this.loaded = data.chats;
  }
  async list(): Promise<AIChat[]> { return this.serial(async () => structuredClone(await this.read())); }
  async get(id: string): Promise<AIChat> { validId(id); const chat = (await this.list()).find(item => item.id === id); if (!chat) throw new Error("Conversation not found"); return chat; }
  async update(id: string, change: (chat: AIChat) => void): Promise<AIChat> { validId(id); return this.serial(async () => { const chats = structuredClone(await this.read()), chat = chats.find(item => item.id === id); if (!chat) throw new Error("Conversation not found"); change(chat); chat.updatedAt = new Date().toISOString(); await atomicJson(this.filename, { version: 1, chats }); this.loaded = chats; return structuredClone(chat); }); }
  async create(providerId: string, modelId: string): Promise<AIChat> { return this.serial(async () => { const chats = await this.read(), now = new Date().toISOString(); const chat: AIChat = { id: randomUUID(), title: "New chat", providerId, modelId, messages: [], createdAt: now, updatedAt: now }; await atomicJson(this.filename, { version: 1, chats: [...chats, chat] }); this.loaded = [...chats, chat]; return structuredClone(chat); }); }
  async rename(id: string, title: string): Promise<AIChat> { const text = bounded(title, "chat title", 120); if (!text) throw new Error("Enter a chat title"); return this.update(id, chat => { chat.title = text; }); }
  async remove(id: string): Promise<void> { validId(id); return this.serial(async () => { const chats = (await this.read()).filter(chat => chat.id !== id); await atomicJson(this.filename, { version: 1, chats }); this.loaded = chats; }); }
}
