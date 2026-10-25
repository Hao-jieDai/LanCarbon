export type AIUsagePurpose = "chat" | "test" | "translation" | "embedding" | "rerank";
export type AIUsageStatus = "pending" | "complete" | "stopped" | "error" | "interrupted";
export type AICurrency = "CNY" | "USD";
// A user-editable display reference, not a live exchange-rate quote.
export const DEFAULT_USD_TO_CNY = 7;

export interface AIModelPrice {
  providerId: string;
  baseUrl: string;
  modelId: string;
  providerName?: string;
  modelName?: string;
  currency: AICurrency;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  updatedAt: string;
}
export type AIModelPriceInput = Omit<AIModelPrice, "updatedAt">;
export type AIModelPriceKey = Pick<AIModelPrice, "providerId" | "baseUrl" | "modelId">;
export interface AIReportedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  reportedCost?: number;
  currency?: AICurrency;
}
export interface AIUsageRequest {
  id: string;
  startedAt: string;
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  modelName: string;
  purpose: AIUsagePurpose;
  attempt: number;
}
export type AIUsageEvent =
  | { type: "start"; request: AIUsageRequest }
  | { type: "finish"; id: string; completedAt: string; status: "complete" | "stopped" | "error"; usage: AIReportedUsage; timing?: AIRequestTiming };
export interface AIRequestTiming { dispatchMs: number; headersMs?: number; firstByteMs?: number; firstTextMs?: number; totalMs: number }
export interface AIUsageRecord extends AIUsageRequest, AIReportedUsage {
  day: string;
  completedAt?: string;
  timing?: AIRequestTiming;
  status: AIUsageStatus;
  price?: AIModelPrice;
  cost?: { amount: number; currency: AICurrency; source: "reported" | "estimated" };
}
export interface AIUsageQuery {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
  purpose?: AIUsagePurpose;
  page?: number;
}
export interface AIUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  unknownTokens: number;
  unknownCosts: number;
  pending: number;
  costs: Array<{ currency: AICurrency; reported: number; estimated: number; reportedRequests: number; estimatedRequests: number }>;
}
export interface AIUsageGroup extends AIUsageTotals {
  key: string;
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  modelName: string;
  purpose: AIUsagePurpose;
}
export interface AIUsagePage {
  summary: AIUsageTotals;
  groups: AIUsageGroup[];
  records: AIUsageRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
  sources: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string }>;
  activity: AIUsageActivity[];
  usdToCny: number;
  warning?: string;
}
export interface AIUsageActivity {
  day: string;
  summary: AIUsageTotals;
  hours: Array<{ hour: number; summary: AIUsageTotals }>;
}

export function localUsageDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function priceKey(value: Pick<AIModelPrice, "providerId" | "baseUrl" | "modelId">): string {
  return JSON.stringify([value.providerId, value.baseUrl, value.modelId]);
}
function token(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000 ? value : undefined;
}
export function parseAIUsage(value: unknown, baseUrl: string): AIReportedUsage {
  if (!value || typeof value !== "object") return {};
  const item = value as Record<string, any>;
  const inputTokens = token(item.prompt_tokens ?? item.input_tokens);
  const outputTokens = token(item.completion_tokens ?? item.output_tokens);
  const inputDetails = item.prompt_tokens_details ?? item.input_tokens_details;
  const outputDetails = item.completion_tokens_details ?? item.output_tokens_details;
  const cached = token(inputDetails?.cached_tokens ?? item.prompt_cache_hit_tokens);
  const writes = token(inputDetails?.cache_write_tokens);
  const reasoning = token(outputDetails?.reasoning_tokens);
  let currency: AICurrency | undefined;
  try { if (new URL(baseUrl).hostname === "openrouter.ai") currency = "USD"; } catch { /* Invalid addresses are rejected when configured. */ }
  if (!currency && ["CNY", "USD"].includes(item.currency ?? item.cost_currency)) currency = item.currency ?? item.cost_currency;
  const cost = item.cost;
  const reportedCost = currency && typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && cost <= 1_000_000_000 ? cost : undefined;
  return {
    inputTokens, outputTokens,
    totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : token(item.total_tokens),
    cachedTokens: cached !== undefined && (inputTokens === undefined || cached <= inputTokens) ? cached : undefined,
    cacheWriteTokens: writes !== undefined && (inputTokens === undefined || writes <= inputTokens) ? writes : undefined,
    reasoningTokens: reasoning !== undefined && (outputTokens === undefined || reasoning <= outputTokens) ? reasoning : undefined,
    reportedCost, ...(reportedCost !== undefined ? { currency } : {})
  };
}
export function usageCost(usage: AIReportedUsage, price?: AIModelPrice): AIUsageRecord["cost"] {
  if (usage.reportedCost !== undefined && usage.currency) return { amount: usage.reportedCost, currency: usage.currency, source: "reported" };
  if (!price || usage.inputTokens === undefined || usage.outputTokens === undefined) return undefined;
  const cached = usage.cachedTokens ?? 0, writes = usage.cacheWriteTokens ?? 0;
  if (cached + writes > usage.inputTokens) return undefined;
  const amount = ((usage.inputTokens - cached - writes) * price.input + cached * (price.cacheRead ?? price.input) + writes * (price.cacheWrite ?? price.input) + usage.outputTokens * price.output) / 1_000_000;
  return { amount: Math.round(amount * 1e12) / 1e12, currency: price.currency, source: "estimated" };
}
export function emptyUsageTotals(): AIUsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0, unknownTokens: 0, unknownCosts: 0, pending: 0, costs: [] };
}
function addUsage(totals: AIUsageTotals, record: AIUsageRecord): void {
  totals.requests++;
  totals.inputTokens += record.inputTokens ?? 0;
  totals.outputTokens += record.outputTokens ?? 0;
  totals.totalTokens += record.totalTokens ?? 0;
  totals.cachedTokens += record.cachedTokens ?? 0;
  totals.reasoningTokens += record.reasoningTokens ?? 0;
  if (record.inputTokens === undefined || record.outputTokens === undefined) totals.unknownTokens++;
  if (record.status === "pending") totals.pending++;
  if (!record.cost) totals.unknownCosts++;
  else {
    let cost = totals.costs.find(value => value.currency === record.cost!.currency);
    if (!cost) { cost = { currency: record.cost.currency, reported: 0, estimated: 0, reportedRequests: 0, estimatedRequests: 0 }; totals.costs.push(cost); }
    cost[record.cost.source] += record.cost.amount;
    if (record.cost.source === "reported") cost.reportedRequests++; else cost.estimatedRequests++;
  }
}
export function summarizeUsage(records: AIUsageRecord[]): Pick<AIUsagePage, "summary" | "groups"> {
  const summary = emptyUsageTotals(), groups = new Map<string, AIUsageGroup>();
  for (const record of records) {
    addUsage(summary, record);
    const key = JSON.stringify([record.providerId, record.baseUrl, record.modelId, record.purpose]);
    let group = groups.get(key);
    if (!group) { group = { ...emptyUsageTotals(), key, providerId: record.providerId, providerName: record.providerName, baseUrl: record.baseUrl, modelId: record.modelId, modelName: record.modelName, purpose: record.purpose }; groups.set(key, group); }
    addUsage(group, record);
  }
  return { summary, groups: [...groups.values()].sort((a, b) => b.requests - a.requests) };
}
export function usageActivity(records: AIUsageRecord[]): AIUsageActivity[] {
  const days = new Map<string, AIUsageActivity>();
  for (const record of records) {
    let day = days.get(record.day);
    if (!day) { day = { day: record.day, summary: emptyUsageTotals(), hours: [] }; days.set(record.day, day); }
    addUsage(day.summary, record);
    const hour = new Date(record.startedAt).getHours();
    let bucket = day.hours.find(value => value.hour === hour);
    if (!bucket) { bucket = { hour, summary: emptyUsageTotals() }; day.hours.push(bucket); }
    addUsage(bucket.summary, record);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(day => ({ ...day, hours: day.hours.sort((a, b) => a.hour - b.hour) }));
}
export function cnyUsageCost(totals: AIUsageTotals, usdToCny: number): number | undefined {
  if (!totals.costs.length) return undefined;
  return totals.costs.reduce((sum, cost) => sum + (cost.reported + cost.estimated) * (cost.currency === "USD" ? usdToCny : 1), 0);
}
export function formatCnyCost(amount: number): string {
  return `¥${amount > 0 && amount < 0.000001 ? "<0.000001" : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}
export function formatUsageCost(amount: number, currency: AICurrency): string {
  return `${currency} ${amount > 0 && amount < 0.000001 ? "<0.000001" : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}
