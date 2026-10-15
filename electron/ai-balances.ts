import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { aiBaseUrl } from "./ai-storage";
import { managedDirectory } from "./resource-files";
import { balanceKey, projectBalance, sourceSpending, type BalanceCheckpoint, type BalanceInput, type BalanceSource } from "../src/shared/aiBalances";
import type { AIUsageStore } from "./ai-usage";
export class AIBalanceStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string, private readonly usage: AIUsageStore) {}
  private validate(value: BalanceInput): BalanceInput {
    if (!value || typeof value.providerId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value.providerId) || typeof value.providerName !== "string" || !value.providerName.trim() || value.providerName.length > 256 || !["CNY", "USD"].includes(value.currency) || !Number.isFinite(value.amount) || value.amount < 0 || value.amount > 1_000_000_000) throw Error("Enter a balance from 0 to 1,000,000,000 and choose CNY or USD.");
    return { providerId: value.providerId, baseUrl: aiBaseUrl(value.baseUrl), providerName: value.providerName.trim(), amount: value.amount, currency: value.currency };
  }
  private async read(): Promise<BalanceCheckpoint[]> {
    const directory = await managedDirectory(this.data, "Research/Usage"), file = path.join(directory, "balances.json");
    try {
      const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw Error("Invalid balance data. Existing records have been preserved.");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (value.version !== 1 || !Array.isArray(value.balances) || value.balances.length > 2000) throw Error("Unsupported balance data.");
      const balances = value.balances.map((item: BalanceCheckpoint) => { const input = this.validate(item); if (!Number.isFinite(Date.parse(item.calibratedAt)) || !item.spent || [item.spent.CNY, item.spent.USD].some(amount => !Number.isFinite(amount) || amount < 0)) throw Error("Invalid balance checkpoint."); return { ...input, calibratedAt: item.calibratedAt, spent: item.spent }; });
      if (new Set(balances.map(balanceKey)).size !== balances.length) throw Error("Duplicate balance records."); return balances;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  private async write(balances: BalanceCheckpoint[]) {
    const directory = await managedDirectory(this.data, "Research/Usage"), filename = path.join(directory, "balances.json"), temporary = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify({ version: 1, balances }, null, 2), { flag: "wx" }); await fs.rename(temporary, filename); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> { const pending = this.queue.then(action); this.queue = pending.catch(() => undefined); return pending; }
  list(sources: BalanceSource[], rate: number) { return this.serial(async () => {
    const saved = await this.read(), records = await this.usage.allRecords(), configured = new Set(sources.map(balanceKey));
    const all = [...new Map([...saved, ...sources].map(source => [balanceKey(source), source])).values()];
    return all.map(source => projectBalance(source, saved.find(value => balanceKey(value) === balanceKey(source)), records, rate, configured.has(balanceKey(source))));
  }); }
  save(input: BalanceInput) { return this.serial(async () => {
    const value = this.validate(input), saved = await this.read(), records = await this.usage.allRecords();
    // A ledger checkpoint also handles requests that started before calibration but finish afterwards.
    const checkpoint: BalanceCheckpoint = { ...value, calibratedAt: new Date().toISOString(), spent: sourceSpending(records, value) };
    const next = saved.filter(item => balanceKey(item) !== balanceKey(value)); next.push(checkpoint); if (next.length > 2000) throw Error("Too many balance records."); await this.write(next); return checkpoint;
  }); }
  async flush() { await this.queue; }
  remove(source: BalanceSource) { return this.serial(async () => { const checked = this.validate({ ...source, amount: 0, currency: "CNY" }); await this.write((await this.read()).filter(item => balanceKey(item) !== balanceKey(checked))); }); }
}
