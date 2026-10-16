import { promises as fs } from "node:fs";
import path from "node:path";
import { aiBaseUrl } from "./ai-storage";
import { DEFAULT_USD_TO_CNY, localUsageDay, priceKey, summarizeUsage, usageActivity, usageCost, type AIModelPrice, type AIModelPriceInput, type AIModelPriceKey, type AIUsageEvent, type AIUsagePage, type AIUsageQuery, type AIUsageRecord } from "../src/shared/aiUsage";

class SerializedUsage {
  private tail: Promise<unknown> = Promise.resolve();
  protected serial<T>(action: () => Promise<T>): Promise<T> { const result = this.tail.then(action); this.tail = result.catch(() => undefined); return result; }
  async flush(): Promise<void> { await this.tail; }
}
async function readFile(filename: string, maximum: number): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new Error("Usage data file is invalid or too large.");
    return await fs.readFile(filename, "utf8");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export class AIPriceStore extends SerializedUsage {
  private readonly filename: string;
  constructor(config: string) { super(); this.filename = path.join(config, "ai-pricing.json"); }
  private validate(input: AIModelPriceInput): AIModelPriceInput {
    if (typeof input.providerId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(input.providerId) || typeof input.modelId !== "string" || !input.modelId || input.modelId.length > 256 || /\s/.test(input.modelId)) throw new Error("Choose a configured service and model.");
    if (!["CNY", "USD"].includes(input.currency)) throw new Error("Choose CNY or USD.");
    for (const value of [input.input, input.output, input.cacheRead, input.cacheWrite]) if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000)) throw new Error("Prices must be non-negative amounts per million tokens.");
    if (input.input === undefined || input.output === undefined) throw new Error("Enter both input and output prices. Zero is allowed for a free model.");
    const name = (value: unknown) => typeof value === "string" && value.trim() && value.length <= 256 ? value.trim() : undefined;
    return { providerId: input.providerId, modelId: input.modelId, baseUrl: aiBaseUrl(input.baseUrl), currency: input.currency, input: input.input, output: input.output, cacheRead: input.cacheRead, cacheWrite: input.cacheWrite, providerName: name(input.providerName), modelName: name(input.modelName) };
  }
  private rate(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new Error("Enter a positive USD to CNY exchange rate.");
    return value;
  }
  private async read(): Promise<{ prices: AIModelPrice[]; usdToCny: number }> {
    const raw = await readFile(this.filename, 2_000_000); if (!raw) return { prices: [], usdToCny: DEFAULT_USD_TO_CNY };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.prices) || value.prices.length > 3000) throw new Error("Unsupported model price data. Existing prices have been preserved.");
    return { prices: value.prices.map((price: AIModelPrice) => ({ ...this.validate(price), updatedAt: price.updatedAt })), usdToCny: value.usdToCny === undefined ? DEFAULT_USD_TO_CNY : this.rate(value.usdToCny) };
  }
  private async write(data: { prices: AIModelPrice[]; usdToCny: number }): Promise<void> {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + ".tmp";
    try { await fs.writeFile(temporary, JSON.stringify({ version: 1, ...data }, null, 2), { mode: 0o600 }); await fs.rename(temporary, this.filename); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  async list(): Promise<AIModelPrice[]> { return this.serial(async () => (await this.read()).prices); }
  async exchangeRate(): Promise<number> { return this.serial(async () => (await this.read()).usdToCny); }
  async saveExchangeRate(input: number): Promise<number> {
    const usdToCny = this.rate(input);
    return this.serial(async () => { await this.write({ ...await this.read(), usdToCny }); return usdToCny; });
  }
  async retain(configured: AIModelPriceKey[]): Promise<AIModelPrice[]> {
    const keys = new Set(configured.map(value => priceKey(value)));
    return this.serial(async () => {
      const data = await this.read(), prices = data.prices.filter(price => keys.has(priceKey(price)));
      if (prices.length !== data.prices.length) await this.write({ ...data, prices });
      return prices;
    });
  }
  async save(input: AIModelPriceInput): Promise<AIModelPrice[]> {
    const value = { ...this.validate(input), updatedAt: new Date().toISOString() };
    return this.serial(async () => {
      const data = await this.read(), prices = data.prices, key = priceKey(value), index = prices.findIndex(price => priceKey(price) === key);
      if (index >= 0) prices[index] = value; else prices.push(value);
      if (prices.length > 3000) throw new Error("Too many saved model prices.");
      await this.write({ ...data, prices });
      return prices;
    });
  }
}

type LedgerEvent = { version: 1; record: AIUsageRecord } | { version: 1; finish: Extract<AIUsageEvent, { type: "finish" }> };
const LEDGER_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}\.jsonl$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value: unknown): value is string { return typeof value === "string" && DAY.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function validUsage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  for (const field of ["inputTokens", "outputTokens", "totalTokens", "cachedTokens", "cacheWriteTokens", "reasoningTokens"]) if (usage[field] !== undefined && (typeof usage[field] !== "number" || !Number.isSafeInteger(usage[field]) || (usage[field] as number) < 0 || (usage[field] as number) > 4_000_000_000)) return false;
  if (usage.reportedCost !== undefined && (typeof usage.reportedCost !== "number" || !Number.isFinite(usage.reportedCost) || usage.reportedCost < 0 || usage.reportedCost > 1_000_000_000 || !["USD", "CNY"].includes(usage.currency as string))) return false;
  return true;
}
export class AIUsageStore extends SerializedUsage {
  private readonly directory: string;
  private readonly active = new Map<string, AIUsageRecord>();
  private warning = "";
  constructor(data: string, private readonly prices: AIPriceStore) { super(); this.directory = path.join(data, "Research", "Usage"); }
  reportFailure(message = "Some usage records could not be saved. Check your data folder. Chat remains available; these totals may be incomplete."): void { this.warning = message; }
  private async append(day: string, event: LedgerEvent): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const directory = await fs.lstat(this.directory);
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error("Invalid usage directory.");
    const names = (await fs.readdir(this.directory)).filter(name => LEDGER_NAME.test(name) && name.startsWith(day + "-")).sort();
    let name = names.at(-1) ?? `${day}-0000.jsonl`;
    const previous = await fs.lstat(path.join(this.directory, name)).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new Error("Invalid usage log.");
    if (previous && previous.size >= 4_000_000) {
      const next = Number(name.slice(11, 15)) + 1;
      if (next > 9999) throw new Error("Usage storage limit reached for this day.");
      name = `${day}-${String(next).padStart(4, "0")}.jsonl`;
    }
    // Leading newline isolates a torn final write without discarding earlier records.
    await fs.appendFile(path.join(this.directory, name), "\n" + JSON.stringify(event) + "\n", { mode: 0o600 });
  }
  async record(event: AIUsageEvent): Promise<void> {
    return this.serial(async () => {
      if (event.type === "start") {
        const request = event.request;
        const price = (await this.prices.list()).find(value => priceKey(value) === priceKey(request));
        const record: AIUsageRecord = { ...request, day: localUsageDay(new Date(request.startedAt)), status: "pending", ...(price ? { price } : {}) };
        this.active.set(record.id, record);
        await this.append(record.day, { version: 1, record });
      } else {
        const record = this.active.get(event.id);
        if (!record) throw new Error("The usage request could not be matched.");
        try { await this.append(record.day, { version: 1, finish: event }); }
        finally { this.active.delete(event.id); }
      }
    });
  }
  async allRecords(): Promise<AIUsageRecord[]> { return (await this.query({}, true)).records; }
  async query(input: AIUsageQuery = {}, includeAll = false): Promise<AIUsagePage> {
    if (!input || typeof input !== "object" || (input.from !== undefined && !validDay(input.from)) || (input.to !== undefined && !validDay(input.to)) || (input.from && input.to && input.from > input.to)) throw new Error("Choose a valid date range.");
    if (input.purpose !== undefined && !["chat", "test", "translation", "embedding", "rerank"].includes(input.purpose)) throw new Error("Invalid usage purpose.");
    if (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000)) throw new Error("Invalid usage page.");
    return this.serial(async () => {
      const names = (await fs.readdir(this.directory).catch(error => { if (error.code === "ENOENT") return []; throw error; })).filter(name => LEDGER_NAME.test(name) && (!input.from || name.slice(0, 10) >= input.from) && (!input.to || name.slice(0, 10) <= input.to)).sort();
      const records = new Map<string, AIUsageRecord>(); let warning = this.warning;
      for (const name of names) {
        const raw = await readFile(path.join(this.directory, name), 5_000_000);
        for (const line of (raw ?? "").split("\n")) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as LedgerEvent;
            if (event.version !== 1) throw new Error("Unknown event version");
            if ("record" in event) {
              const record = event.record;
              if (typeof record.id !== "string" || !validDay(record.day) || typeof record.startedAt !== "string" || !Number.isFinite(Date.parse(record.startedAt)) || !["chat", "test", "translation", "embedding", "rerank"].includes(record.purpose) || typeof record.providerId !== "string" || typeof record.baseUrl !== "string" || typeof record.modelId !== "string" || typeof record.providerName !== "string" || typeof record.modelName !== "string") throw new Error("Invalid usage record");
              if (record.price && (!["CNY", "USD"].includes(record.price.currency) || priceKey(record.price) !== priceKey(record) || [record.price.input, record.price.output, record.price.cacheRead ?? 0, record.price.cacheWrite ?? 0].some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000))) throw new Error("Invalid price snapshot");
              if (!records.has(record.id)) records.set(record.id, { ...record, status: this.active.has(record.id) ? "pending" : "interrupted" });
            } else if ("finish" in event) {
              const finish = event.finish, record = records.get(finish.id);
              if (!record || !["complete", "error", "stopped"].includes(finish.status) || !validUsage(finish.usage) || !Number.isFinite(Date.parse(finish.completedAt))) throw new Error("Invalid usage completion");
              records.set(finish.id, { ...record, ...finish.usage, status: finish.status, completedAt: finish.completedAt, cost: usageCost(finish.usage, record.price) });
            } else throw new Error("Invalid usage event");
          } catch { warning = "Some usage log entries could not be read. Valid records are preserved; totals may be incomplete."; }
        }
      }
      const all = [...records.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const sources = [...new Map(all.map(record => [record.providerId, { id: record.providerId, name: record.providerName }])).values()];
      const models = [...new Map(all.filter(record => !input.providerId || record.providerId === input.providerId).map(record => [record.modelId, { id: record.modelId, name: record.modelName }])).values()];
      const filtered = all.filter(record => (!input.providerId || record.providerId === input.providerId) && (!input.modelId || record.modelId === input.modelId) && (!input.purpose || record.purpose === input.purpose));
      const pageSize = includeAll ? Math.max(1, filtered.length) : 10, page = Math.min(input.page ?? 1, Math.max(1, Math.ceil(filtered.length / pageSize)));
      return { ...summarizeUsage(filtered), activity: usageActivity(filtered), usdToCny: await this.prices.exchangeRate(), records: filtered.slice((page - 1) * pageSize, page * pageSize), totalRecords: filtered.length, page, pageSize, sources, models, ...(warning ? { warning } : {}) };
    });
  }
}
