import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { aiBaseUrl } from "./ai-storage";
import { managedDirectory } from "./resource-files";
import { balanceKey, projectBalance, sourceSpending, type BalanceAccount, type BalanceCheckpoint, type BalanceInput, type BalanceSource } from "../src/shared/aiBalances";
import type { AIUsageStore } from "./ai-usage";

const sourceId = (source: BalanceSource) => createHash("sha256").update(balanceKey(source)).digest("hex").slice(0, 24);
export class AIBalanceStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly data: string, private readonly usage: AIUsageStore) {}
  private source(value: BalanceSource): BalanceSource {
    if (!value || typeof value.providerId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value.providerId) || typeof value.providerName !== "string" || !value.providerName.trim() || value.providerName.length > 256 || (value.usage !== undefined && !["ai", "translation", "retrieval"].includes(value.usage))) throw Error("Choose a valid API connection.");
    return { providerId: value.providerId, baseUrl: aiBaseUrl(value.baseUrl), providerName: value.providerName.trim(), ...(value.usage ? { usage: value.usage } : {}) };
  }
  private input(value: BalanceInput): BalanceInput {
    const source = this.source(value);
    if (!["CNY", "USD"].includes(value.currency) || !Number.isFinite(value.amount) || value.amount < 0 || value.amount > 1_000_000_000 || (value.mode !== undefined && !["limited", "unlimited"].includes(value.mode))) throw Error("Enter a balance from 0 to 1,000,000,000 and choose CNY or USD, or select Unlimited.");
    return { ...source, amount: value.mode === "unlimited" ? 0 : value.amount, currency: value.currency, ...(value.mode ? { mode: value.mode } : {}) };
  }
  private checkpoint(value: BalanceCheckpoint): BalanceCheckpoint {
    const input = this.input(value);
    if (!Number.isFinite(Date.parse(value.calibratedAt)) || !value.spent || [value.spent.CNY, value.spent.USD].some(amount => !Number.isFinite(amount) || amount < 0)) throw Error("Invalid balance checkpoint.");
    return { ...input, calibratedAt: value.calibratedAt, spent: { CNY: value.spent.CNY, USD: value.spent.USD } };
  }
  private name(value: string): string {
    if (typeof value !== "string" || !value.trim() || value.length > 256) throw Error("Enter an account name of up to 256 characters.");
    return value.trim();
  }
  private sources(value: BalanceSource[]): BalanceSource[] {
    if (!Array.isArray(value) || !value.length || value.length > 2000) throw Error("Choose at least one connection for this balance account.");
    const sources = value.map(source => this.source(source));
    if (new Set(sources.map(balanceKey)).size !== sources.length) throw Error("A connection can only be counted once.");
    return sources;
  }
  private async read(): Promise<BalanceAccount[]> {
    const directory = await managedDirectory(this.data, "Research/Usage"), file = path.join(directory, "balances.json");
    try {
      const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw Error("Invalid balance data. Existing records have been preserved.");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (![1, 2].includes(value.version) || !Array.isArray(value.balances) || value.balances.length > 2000) throw Error("Unsupported balance data.");
      // Legacy checkpoints are projected without rewriting the user's file during a read.
      const accounts: BalanceAccount[] = value.version === 1
        ? value.balances.map((item: BalanceCheckpoint) => { const checkpoint = this.checkpoint(item), source = this.source(item); return { id: `account-${sourceId(source)}`, name: source.providerName, sources: [source], checkpoint }; })
        : value.balances.map((item: BalanceAccount) => {
          if (!item || typeof item.id !== "string" || !/^account-[a-zA-Z0-9-]{1,100}$/.test(item.id) || (item.needsCalibration !== undefined && typeof item.needsCalibration !== "boolean")) throw Error("Invalid balance account.");
          const sources = this.sources(item.sources), checkpoint = item.checkpoint ? this.checkpoint(item.checkpoint) : undefined;
          if (checkpoint && !sources.some(source => balanceKey(source) === balanceKey(checkpoint))) throw Error("Balance checkpoint connection is missing.");
          return { id: item.id, name: this.name(item.name), sources, ...(checkpoint ? { checkpoint } : {}), ...(item.needsCalibration ? { needsCalibration: true } : {}) };
        });
      const keys = accounts.flatMap(account => account.sources.map(balanceKey));
      if (keys.length > 2000 || new Set(keys).size !== keys.length || new Set(accounts.map(account => account.id)).size !== accounts.length) throw Error("Duplicate balance accounts or connections.");
      return accounts;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  private async write(balances: BalanceAccount[]) {
    if (balances.length > 2000 || balances.reduce((sum, account) => sum + account.sources.length, 0) > 2000) throw Error("Too many balance accounts.");
    const directory = await managedDirectory(this.data, "Research/Usage"), filename = path.join(directory, "balances.json"), temporary = `${filename}.${randomUUID()}.tmp`;
    const content = JSON.stringify({ version: 2, balances }, null, 2);
    if (Buffer.byteLength(content) > 2_000_000) throw Error("Balance account data is too large.");
    try { await fs.writeFile(temporary, content, { flag: "wx" }); await fs.rename(temporary, filename); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> { const pending = this.queue.then(action); this.queue = pending.catch(() => undefined); return pending; }
  list(sources: BalanceSource[], rate: number) { return this.serial(async () => {
    const saved = await this.read(), records = await this.usage.allRecords(), assigned = new Set(saved.flatMap(account => account.sources.map(balanceKey)));
    const all = [...saved, ...sources.filter(source => !assigned.has(balanceKey(source))).map(source => ({ id: `source-${sourceId(source)}`, name: source.providerName, sources: [source] }))];
    return all.map(account => projectBalance(account, records, rate, sources));
  }); }
  save(input: BalanceInput, configured?: BalanceSource[]) { return this.serial(async () => {
    const source = this.source(input), saved = await this.read(), key = balanceKey(source);
    const previous = input.accountId ? saved.find(account => account.id === input.accountId) : saved.find(account => account.sources.some(source => balanceKey(source) === key));
    const placeholder = (configured ?? input.sources ?? [source]).some(source => input.accountId === `source-${sourceId(source)}` && !saved.some(account => account.sources.some(member => balanceKey(member) === balanceKey(source))));
    if (input.accountId && !previous && !placeholder) throw Error("This balance account changed. Refresh and try again.");
    if (input.preserveCheckpoint !== undefined && typeof input.preserveCheckpoint !== "boolean") throw Error("Invalid balance update.");
    const value = this.input(input.preserveCheckpoint && previous?.checkpoint ? { ...input, amount: previous.checkpoint.amount } : input);
    const sources = this.sources(input.sources ?? previous?.sources ?? [value]), keys = new Set(sources.map(balanceKey));
    if (!keys.has(key)) throw Error("The selected connection must belong to this account.");
    if (configured) {
      const allowed = new Set([...configured, ...(previous?.sources ?? [])].map(balanceKey));
      if (sources.some(source => !allowed.has(balanceKey(source))) || !sources.some(source => configured.some(known => balanceKey(known) === balanceKey(source)))) throw Error("Choose configured API connections. Refresh if a connection changed.");
    }
    if (input.preserveCheckpoint) {
      const checkpoint = previous?.checkpoint;
      if (!previous || !checkpoint || checkpoint.currency !== value.currency || (checkpoint.mode ?? "limited") !== (value.mode ?? "limited") || sources.length !== previous.sources.length || !previous.sources.every(source => keys.has(balanceKey(source)))) throw Error("Balance settings changed. Confirm the full current account balance.");
      const name = this.name(input.accountName ?? previous.name);
      if (name !== previous.name) await this.write(saved.map(account => account.id === previous.id ? { ...account, name } : account));
      return checkpoint;
    }
    const records = await this.usage.allRecords();
    const checkpoint: BalanceCheckpoint = { ...value, calibratedAt: new Date().toISOString(), spent: sourceSpending(records, sources) };
    const next: BalanceAccount[] = [];
    for (const account of saved) {
      if (account.id === previous?.id) continue;
      const remaining = account.sources.filter(source => !keys.has(balanceKey(source)));
      if (!remaining.length) continue;
      // Changing membership invalidates the old baseline, rather than moving old charges between accounts.
      next.push(remaining.length === account.sources.length ? account : { id: account.id, name: account.name, sources: remaining, needsCalibration: true });
    }
    const account: BalanceAccount = { id: previous?.id ?? `account-${randomUUID()}`, name: this.name(input.accountName ?? previous?.name ?? value.providerName), sources, checkpoint };
    next.push(account); await this.write(next); return checkpoint;
  }); }
  async flush() { await this.queue; }
  remove(source: BalanceSource & { accountId?: string }) { return this.serial(async () => {
    const checked = this.source(source), saved = await this.read();
    const target = source.accountId ? saved.find(account => account.id === source.accountId) : saved.find(account => account.sources.some(item => balanceKey(item) === balanceKey(checked)));
    if (!target) return;
    await this.write(saved.map(account => account.id === target.id ? { id: account.id, name: account.name, sources: account.sources } : account));
  }); }
}
