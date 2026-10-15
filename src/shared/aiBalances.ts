import type { AICurrency, AIUsageRecord } from "./aiUsage";
export interface BalanceSource { providerId: string; baseUrl: string; providerName: string }
export interface BalanceInput extends BalanceSource { amount: number; currency: AICurrency }
export interface BalanceCheckpoint extends BalanceInput { calibratedAt: string; spent: { CNY: number; USD: number } }
export interface SourceBalance extends BalanceSource { checkpoint?: BalanceCheckpoint; remaining?: number; spent?: number; low?: boolean; unknownRequests: number; pending: number; configured: boolean }
export const balanceKey = (source: Pick<BalanceSource, "providerId" | "baseUrl">) => JSON.stringify([source.providerId, source.baseUrl]);
export function sourceSpending(records: AIUsageRecord[], source: BalanceSource): { CNY: number; USD: number } {
  const result = { CNY: 0, USD: 0 };
  for (const record of records) if (balanceKey(record) === balanceKey(source) && record.cost) result[record.cost.currency] += record.cost.amount;
  return result;
}
export function projectBalance(source: BalanceSource, checkpoint: BalanceCheckpoint | undefined, records: AIUsageRecord[], rate: number, configured: boolean): SourceBalance {
  const own = records.filter(record => balanceKey(record) === balanceKey(source)), current = sourceSpending(own, source);
  const since = own.filter(record => checkpoint && (record.status === "pending" || (record.completedAt ?? record.startedAt) >= checkpoint.calibratedAt));
  if (!checkpoint) return { ...source, configured, unknownRequests: 0, pending: 0 };
  const cny = Math.max(0, current.CNY - checkpoint.spent.CNY), usd = Math.max(0, current.USD - checkpoint.spent.USD);
  const spent = checkpoint.currency === "CNY" ? cny + usd * rate : usd + cny / rate;
  const remaining = Math.round((checkpoint.amount - spent) * 1e12) / 1e12;
  return { ...source, checkpoint, spent, remaining, configured, low: remaining * (checkpoint.currency === "USD" ? rate : 1) <= 10, unknownRequests: since.filter(record => record.status !== "pending" && !record.cost).length, pending: since.filter(record => record.status === "pending").length };
}
