import type { AICurrency, AIUsageRecord } from "./aiUsage";

export interface BalanceSource { providerId: string; baseUrl: string; providerName: string; usage?: "ai" | "translation" }
export type BalanceMode = "limited" | "unlimited";
export interface BalanceInput extends BalanceSource {
  amount: number; currency: AICurrency; mode?: BalanceMode;
  accountId?: string; accountName?: string; sources?: BalanceSource[];
}
export interface BalanceCheckpoint extends BalanceSource {
  amount: number; currency: AICurrency; mode?: BalanceMode;
  calibratedAt: string; spent: { CNY: number; USD: number };
}
export interface BalanceAccount { id: string; name: string; sources: BalanceSource[]; checkpoint?: BalanceCheckpoint; needsCalibration?: boolean }
export interface SourceBalance extends BalanceSource {
  accountId: string; sources: (BalanceSource & { configured: boolean })[];
  checkpoint?: BalanceCheckpoint; remaining?: number; spent?: number; low?: boolean;
  unknownRequests: number; pending: number; configured: boolean; needsCalibration?: boolean;
}
export const balanceKey = (source: Pick<BalanceSource, "providerId" | "baseUrl">) => JSON.stringify([source.providerId, source.baseUrl]);
export function sourceSpending(records: AIUsageRecord[], sources: BalanceSource | BalanceSource[]): { CNY: number; USD: number } {
  const keys = new Set((Array.isArray(sources) ? sources : [sources]).map(balanceKey));
  const result = { CNY: 0, USD: 0 };
  for (const record of records) if (keys.has(balanceKey(record)) && record.cost) result[record.cost.currency] += record.cost.amount;
  return result;
}
export function projectBalance(account: BalanceAccount, records: AIUsageRecord[], rate: number, configured: BalanceSource[]): SourceBalance {
  const known = new Map(configured.map(source => [balanceKey(source), source]));
  const sources = account.sources.map(source => ({ ...source, ...known.get(balanceKey(source)), configured: known.has(balanceKey(source)) }));
  const keys = new Set(sources.map(balanceKey)), own = records.filter(record => keys.has(balanceKey(record)));
  const checkpoint = account.checkpoint;
  const base: SourceBalance = { ...sources[0], providerName: account.name, accountId: account.id, sources, configured: sources.some(source => source.configured), checkpoint, needsCalibration: account.needsCalibration, unknownRequests: 0, pending: 0 };
  if (!checkpoint) return base;
  const since = own.filter(record => record.status === "pending" || (record.completedAt ?? record.startedAt) >= checkpoint.calibratedAt);
  base.unknownRequests = since.filter(record => record.status !== "pending" && !record.cost).length;
  base.pending = since.filter(record => record.status === "pending").length;
  if (checkpoint.mode === "unlimited") return { ...base, low: false };
  const current = sourceSpending(own, sources);
  const cny = Math.max(0, current.CNY - checkpoint.spent.CNY), usd = Math.max(0, current.USD - checkpoint.spent.USD);
  const spent = checkpoint.currency === "CNY" ? cny + usd * rate : usd + cny / rate;
  const remaining = Math.round((checkpoint.amount - spent) * 1e12) / 1e12;
  return { ...base, spent, remaining, low: remaining < (checkpoint.currency === "CNY" ? 5 : 2) };
}
