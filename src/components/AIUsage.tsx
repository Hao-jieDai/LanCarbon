import { useCallback, useEffect, useRef, useState } from "react";
import type { AIProvider } from "../shared/ai";
import { cnyUsageCost, formatCnyCost, formatUsageCost, localUsageDay, priceKey, type AICurrency, type AIModelPrice, type AIUsagePage, type AIUsageQuery, type AIUsageTotals } from "../shared/aiUsage";
import { ThemedSelect } from "./ThemedSelect";
import { AIUsageHeatmap } from "./AIUsageHeatmap";

const number = (value: number) => value.toLocaleString("en-US");
function range(days = 1): AIUsageQuery { const from = new Date(); from.setDate(from.getDate() - days + 1); return { from: localUsageDay(from), to: localUsageDay(), page: 1 }; }
function Costs({ totals, rate }: { totals: AIUsageTotals; rate: number }) {
  const amount = cnyUsageCost(totals, rate);
  const detail = totals.costs.flatMap(cost => [cost.reportedRequests ? "Reported " + formatUsageCost(cost.reported, cost.currency) : "", cost.estimatedRequests ? "Estimated " + formatUsageCost(cost.estimated, cost.currency) : ""]).filter(Boolean).join(" · ");
  return <strong title={detail + (totals.costs.some(cost => cost.currency === "USD") ? " · 1 USD = " + rate + " CNY" : "")}>{amount === undefined ? totals.requests ? "Unknown" : formatCnyCost(0) : "≈ " + formatCnyCost(amount)}</strong>;
}
function ModelPrices({ providers, usdToCny }: { providers: AIProvider[]; usdToCny: number }) {
  const [selected, setSelected] = useState("");
  const [prices, setPrices] = useState<AIModelPrice[]>([]);
  const [currency, setCurrency] = useState<AICurrency>("CNY");
  const [input, setInput] = useState(""), [output, setOutput] = useState(""), [cacheRead, setCacheRead] = useState(""), [cacheWrite, setCacheWrite] = useState("");
  const [rate, setRate] = useState(String(usdToCny));
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const choices = providers.flatMap(provider => provider.models.map(model => ({ value: priceKey({ providerId: provider.id, baseUrl: provider.baseUrl, modelId: model.id }), label: provider.name + " · " + model.name, providerId: provider.id, baseUrl: provider.baseUrl, modelId: model.id, removed: false })));
  const savedChoices = prices.map(price => {
    const configured = choices.find(choice => choice.value === priceKey(price));
    const provider = providers.find(provider => provider.id === price.providerId && provider.baseUrl === price.baseUrl);
    return configured ?? { value: priceKey(price), label: (provider?.name ?? price.providerName ?? price.providerId) + " · " + (price.modelName ?? price.modelId), providerId: price.providerId, baseUrl: price.baseUrl, modelId: price.modelId, removed: true };
  });
  const allChoices = choices;
  const choice = allChoices.find(value => value.value === selected);
  useEffect(() => { let disposed = false; void window.notesDesktop.ai!.prices().then(result => { if (disposed) return; if (!result.ok) setError(result.error); else setPrices(result.prices); }).catch(() => { if (!disposed) setError("Could not load saved prices."); }); return () => { disposed = true; }; }, []);
  useEffect(() => setRate(String(usdToCny)), [usdToCny]);
  useEffect(() => {
    if (!selected) return;
    const price = prices.find(value => priceKey(value) === selected);
    setCurrency(price?.currency ?? (providers.some(provider => provider.id === choice?.providerId && provider.kind === "openrouter") ? "USD" : "CNY"));
    setInput(price ? String(price.input) : ""); setOutput(price ? String(price.output) : "");
    setCacheRead(price?.cacheRead === undefined ? "" : String(price.cacheRead)); setCacheWrite(price?.cacheWrite === undefined ? "" : String(price.cacheWrite));
  }, [selected, prices]);
  const failure = (value: unknown) => setError(value instanceof Error ? value.message : "Could not save this setting.");
  return <details className="usage-prices"><summary>Model prices</summary>
    <form className="usage-exchange" onSubmit={event => {
      event.preventDefault(); if (!rate.trim()) return; setBusy(true); setError(""); setNotice("");
      void window.notesDesktop.ai!.saveExchangeRate(Number(rate)).then(result => { if (!result.ok) throw Error(result.error); setRate(String(result.usdToCny)); setNotice("Exchange rate saved. Historical original charges are unchanged."); }).catch(failure).finally(() => setBusy(false));
    }}><label>1 USD = CNY<input aria-label="USD to CNY exchange rate" type="number" min="0.000001" max="1000000" step="any" required value={rate} onChange={event => setRate(event.target.value)} disabled={busy}/></label><button className="quiet-button" disabled={busy || !rate.trim()}>Save exchange rate</button></form>
    <p>This editable reference converts all USD costs for display, including history. Original charges stay in their original currency. No live exchange-rate lookup.</p>
    <div className="usage-saved-prices" aria-label="Saved model prices">
      {prices.length ? prices.map(price => { const saved = savedChoices.find(choice => choice.value === priceKey(price))!; return <div className="usage-saved-price" key={saved.value}>
        <div><strong>{saved.label}</strong><small>{saved.removed ? "Model removed · " : ""}{price.currency} / 1M · Input {price.input} · Output {price.output}{price.cacheRead !== undefined ? " · Cache read " + price.cacheRead : ""}{price.cacheWrite !== undefined ? " · Cache write " + price.cacheWrite : ""}</small></div>
        <div className="usage-price-actions"><button className="quiet-button" type="button" aria-label={"Edit price " + saved.label} disabled={busy || saved.removed} onClick={() => { setSelected(saved.value); setNotice(""); setError(""); }}>Edit</button></div>
      </div>; }) : <p>No saved model prices.</p>}
    </div>
    <p>Prices apply to future requests. Removing a model or service automatically removes its price; historical usage and costs stay unchanged. OpenRouter reported charges do not need a saved price.</p>
    {!allChoices.length ? <p>Add a model in AI Settings first.</p> : <form onSubmit={event => {
      event.preventDefault(); if (!choice || !input.trim() || !output.trim()) return; setBusy(true); setError(""); setNotice("");
      void window.notesDesktop.ai!.savePrice({ providerId: choice.providerId, baseUrl: choice.baseUrl, modelId: choice.modelId, currency, input: Number(input), output: Number(output), ...(cacheRead.trim() ? { cacheRead: Number(cacheRead) } : {}), ...(cacheWrite.trim() ? { cacheWrite: Number(cacheWrite) } : {}) }).then(result => { if (!result.ok) throw Error(result.error); setPrices(result.prices); setNotice("Price saved for future requests."); }).catch(failure).finally(() => setBusy(false));
    }}>
      <label>Service and model<ThemedSelect label="Price model" value={selected} options={allChoices.map(({ value, label, removed }) => ({ value, label: label + (removed ? " · Model removed" : "") }))} placeholder="Choose a model" onChange={value => { setSelected(value); setNotice(""); setError(""); }} disabled={busy}/></label>
      {choice && <><p className="usage-model-id">{choice.modelId}</p><div className="usage-price-grid">
        <label>Currency<ThemedSelect label="Price currency" value={currency} options={[{ value: "CNY", label: "CNY" }, { value: "USD", label: "USD" }]} onChange={value => setCurrency(value as AICurrency)} disabled={busy}/></label>
        <label>Input / 1M tokens<input aria-label="Input price" type="number" min="0" max="1000000" step="any" required value={input} onChange={event => setInput(event.target.value)} disabled={busy}/></label>
        <label>Output / 1M tokens<input aria-label="Output price" type="number" min="0" max="1000000" step="any" required value={output} onChange={event => setOutput(event.target.value)} disabled={busy}/></label>
        <label>Cache read / 1M tokens<input aria-label="Cache read price" type="number" min="0" max="1000000" step="any" placeholder="Same as input" value={cacheRead} onChange={event => setCacheRead(event.target.value)} disabled={busy}/></label>
        <label>Cache write / 1M tokens<input aria-label="Cache write price" type="number" min="0" max="1000000" step="any" placeholder="Same as input" value={cacheWrite} onChange={event => setCacheWrite(event.target.value)} disabled={busy}/></label>
      </div><p>Blank cache prices use the input rate. Enter zero for a verified free model.</p><button className="primary-button" disabled={busy || !input.trim() || !output.trim()}>Save price</button></>}
    </form>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
export function AIUsage({ providers, visible }: { providers: AIProvider[]; visible: boolean }) {
  const [query, setQuery] = useState<AIUsageQuery>(() => range());
  const [mode, setMode] = useState<"hourly" | "daily">("hourly");
  const [data, setData] = useState<AIUsagePage>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const current = ++revision.current; setBusy(true);
    try { const result = await window.notesDesktop.ai!.usage(query); if (current !== revision.current) return; if (!result.ok) throw new Error(result.error); setData(result.usage); setError(""); }
    catch (error) { if (current === revision.current) setError(error instanceof Error ? error.message : "Could not load usage."); }
    finally { if (current === revision.current) setBusy(false); }
  }, [query]);
  useEffect(() => {
    if (!visible) return;
    void reload(); let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.notesDesktop.ai!.onUsageChanged(() => { clearTimeout(timer); timer = setTimeout(() => void reload(), 150); });
    return () => { revision.current++; clearTimeout(timer); unsubscribe(); };
  }, [visible, reload]);
  const filter = (patch: Partial<AIUsageQuery>) => setQuery(previous => ({ ...previous, ...patch, page: 1 }));
  return <div className="ai-usage-content">
    <div className="usage-heading"><div><h1>Usage</h1><p>Token usage and costs recorded by LanCarbon. History is available offline.</p></div><button className="quiet-button" disabled={busy} onClick={() => void reload()}>Refresh</button></div>
    <div className="usage-filters">
      <label>From<input aria-label="Usage from" type="date" value={query.from ?? ""} onChange={event => { filter({ from: event.target.value || undefined }); setMode("daily"); }}/></label>
      <label>To<input aria-label="Usage to" type="date" value={query.to ?? ""} onChange={event => { filter({ to: event.target.value || undefined }); setMode("daily"); }}/></label>
      <label>Source<ThemedSelect label="Usage source" value={query.providerId ?? ""} options={[{ value: "", label: "All sources" }, ...(data?.sources ?? []).map(value => ({ value: value.id, label: value.name }))]} onChange={providerId => filter({ providerId: providerId || undefined, modelId: undefined })}/></label>
      <label>Model<ThemedSelect label="Usage model" value={query.modelId ?? ""} options={[{ value: "", label: "All models" }, ...(data?.models ?? []).map(value => ({ value: value.id, label: value.name }))]} onChange={modelId => filter({ modelId: modelId || undefined })}/></label>
      <label>Purpose<ThemedSelect label="Usage purpose" value={query.purpose ?? ""} options={[{ value: "", label: "All purposes" }, { value: "chat", label: "Chat" }, { value: "test", label: "Connection test" }]} onChange={purpose => filter({ purpose: purpose === "chat" || purpose === "test" ? purpose : undefined })}/></label>
    </div>
    <div className="usage-ranges">{([1, 7, 30] as const).map(days => <button className="text-button" key={days} onClick={() => { filter(range(days)); setMode(days === 1 ? "hourly" : "daily"); }}>{days === 1 ? "Today" : "Last " + days + " days"}</button>)}</div>
    {error && <p role="alert" className="usage-warning">{error}</p>}{data?.warning && <p role="alert" className="usage-warning">{data.warning}</p>}
    {!data ? <p role="status">{busy ? "Loading local usage…" : "Usage is unavailable."}</p> : <>
      <AIUsageHeatmap activity={data.activity} query={query} usdToCny={data.usdToCny} mode={mode} onMode={setMode}/>
      <div className="usage-overview"><div><span>Requests</span><strong>{number(data.summary.requests)}</strong></div><div><span>Tokens</span><strong>{number(data.summary.totalTokens)}</strong></div><div><span>Costs</span><Costs totals={data.summary} rate={data.usdToCny}/></div></div>
      {(data.summary.unknownTokens > 0 || data.summary.unknownCosts > 0 || data.summary.pending > 0) && <p className="usage-coverage">{[data.summary.unknownTokens ? number(data.summary.unknownTokens) + " without token data" : "", data.summary.unknownCosts ? number(data.summary.unknownCosts) + " without known costs" : "", data.summary.pending ? number(data.summary.pending) + " in progress" : ""].filter(Boolean).join(" · ")}. Totals include known data only.</p>}
      <section className="usage-section"><h2>Requests <small>{number(data.totalRecords)}</small></h2>{!data.records.length ? <p>No requests in this range.</p> : <><div className="usage-table-scroll"><table className="usage-table" aria-label="Usage requests"><thead><tr><th>Time / Source / Model</th><th>Purpose</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead><tbody>{data.records.map(record => <tr key={record.id}>
        <td><time>{new Date(record.startedAt).toLocaleString()}</time><strong>{record.providerName} · {record.modelName}</strong></td>
        <td>{record.purpose === "test" ? "Test" : "Chat"}{record.attempt > 1 && <small>Retry {record.attempt - 1}</small>}</td>
        <td>{record.totalTokens === undefined ? "Unknown" : number(record.totalTokens)}</td>
        <td title={record.cost ? formatUsageCost(record.cost.amount, record.cost.currency) + " · " + (record.cost.source === "reported" ? "Reported" : "Estimated") + (record.cost.currency === "USD" ? " · 1 USD = " + data.usdToCny + " CNY" : "") : undefined}>{record.cost ? "≈ " + formatCnyCost(record.cost.amount * (record.cost.currency === "USD" ? data.usdToCny : 1)) : "Unknown"}</td>
        <td><span className={"usage-status " + record.status}>{record.status === "pending" ? "In progress" : record.status === "complete" ? "Complete" : record.status === "stopped" ? "Stopped" : record.status === "interrupted" ? "Interrupted" : "Failed"}</span></td>
      </tr>)}</tbody></table></div><div className="usage-pagination"><button className="quiet-button" disabled={data.page <= 1 || busy} onClick={() => setQuery(previous => ({ ...previous, page: data.page - 1 }))}>Previous</button><span>Page {data.page} / {Math.max(1, Math.ceil(data.totalRecords / data.pageSize))}</span><button className="quiet-button" disabled={data.page * data.pageSize >= data.totalRecords || busy} onClick={() => setQuery(previous => ({ ...previous, page: data.page + 1 }))}>Next</button></div></>}</section>
      <ModelPrices providers={providers} usdToCny={data.usdToCny}/>
    </>}
    <p className="usage-footnote">Only calls recorded in LanCarbon are included. Costs in CNY are reference amounts; hover for original charges. Historical model prices stay unchanged. Each retry is a separate attempt.</p>
  </div>;
}
