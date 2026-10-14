import { useCallback, useEffect, useRef, useState } from "react";
import type { AIProvider } from "../shared/ai";
import { formatUsageCost, localUsageDay, priceKey, type AICurrency, type AIModelPrice, type AIUsagePage, type AIUsageQuery, type AIUsageTotals } from "../shared/aiUsage";
import { ThemedSelect } from "./ThemedSelect";

const number = (value: number) => value.toLocaleString("en-US");
function recentRange(): AIUsageQuery { const from = new Date(); from.setDate(from.getDate() - 29); return { from: localUsageDay(from), to: localUsageDay(), page: 1 }; }
function Costs({ totals }: { totals: AIUsageTotals }) {
  return <>{totals.costs.length ? totals.costs.map(cost => <div key={cost.currency}>{cost.reportedRequests > 0 && <span>Reported {formatUsageCost(cost.reported, cost.currency)}</span>}{cost.estimatedRequests > 0 && <span>Estimated {formatUsageCost(cost.estimated, cost.currency)}</span>}</div>) : <span>No known cost</span>}</>;
}
function ModelPrices({ providers }: { providers: AIProvider[] }) {
  const choices = providers.flatMap(provider => provider.models.map(model => ({ value: priceKey({ providerId: provider.id, baseUrl: provider.baseUrl, modelId: model.id }), label: `${provider.name} · ${model.name}`, provider, model })));
  const [selected, setSelected] = useState("");
  const [prices, setPrices] = useState<AIModelPrice[]>([]);
  const [currency, setCurrency] = useState<AICurrency>("CNY");
  const [input, setInput] = useState(""), [output, setOutput] = useState(""), [cacheRead, setCacheRead] = useState(""), [cacheWrite, setCacheWrite] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const choice = choices.find(value => value.value === selected);
  useEffect(() => { let disposed = false; void window.notesDesktop.ai!.prices().then(result => { if (disposed) return; if (!result.ok) setError(result.error); else setPrices(result.prices); }).catch(() => { if (!disposed) setError("Could not load saved prices."); }); return () => { disposed = true; }; }, []);
  useEffect(() => {
    if (!choice) return;
    const price = prices.find(value => priceKey(value) === selected);
    setCurrency(price?.currency ?? (choice.provider.kind === "openrouter" ? "USD" : "CNY"));
    setInput(price ? String(price.input) : ""); setOutput(price ? String(price.output) : "");
    setCacheRead(price?.cacheRead === undefined ? "" : String(price.cacheRead)); setCacheWrite(price?.cacheWrite === undefined ? "" : String(price.cacheWrite));
  }, [selected, prices]);
  return <details className="usage-prices"><summary>Model prices</summary>
    <p>OpenRouter can report its charge directly. For services without reported costs, enter prices per million tokens to estimate future requests. Enter zero for a verified free model. Saving a price does not recalculate past requests.</p>
    {!choices.length ? <p>Add a model in AI Settings first.</p> : <form onSubmit={event => {
      event.preventDefault(); if (!choice || !input.trim() || !output.trim()) return; setBusy(true); setError(""); setNotice("");
      void window.notesDesktop.ai!.savePrice({ providerId: choice.provider.id, baseUrl: choice.provider.baseUrl, modelId: choice.model.id, currency, input: Number(input), output: Number(output), ...(cacheRead.trim() ? { cacheRead: Number(cacheRead) } : {}), ...(cacheWrite.trim() ? { cacheWrite: Number(cacheWrite) } : {}) }).then(result => { if (!result.ok) throw new Error(result.error); setPrices(result.prices); setNotice("Price saved for future requests."); }).catch(error => setError(error instanceof Error ? error.message : "Could not save this price.")).finally(() => setBusy(false));
    }}>
      <label>Service and model<ThemedSelect label="Price model" value={selected} options={choices.map(({ value, label }) => ({ value, label }))} placeholder="Choose a configured model" onChange={value => { setSelected(value); setNotice(""); setError(""); }} disabled={busy}/></label>
      {choice && <><p className="usage-model-id">{choice.model.id}</p><div className="usage-price-grid">
        <label>Currency<ThemedSelect label="Price currency" value={currency} options={[{ value: "CNY", label: "CNY" }, { value: "USD", label: "USD" }]} onChange={value => setCurrency(value as AICurrency)} disabled={busy}/></label>
        <label>Input / 1M tokens<input aria-label="Input price" type="number" min="0" max="1000000" step="any" required value={input} onChange={event => setInput(event.target.value)} disabled={busy}/></label>
        <label>Output / 1M tokens<input aria-label="Output price" type="number" min="0" max="1000000" step="any" required value={output} onChange={event => setOutput(event.target.value)} disabled={busy}/></label>
        <label>Cache read / 1M tokens<input aria-label="Cache read price" type="number" min="0" max="1000000" step="any" placeholder="Same as input" value={cacheRead} onChange={event => setCacheRead(event.target.value)} disabled={busy}/></label>
        <label>Cache write / 1M tokens<input aria-label="Cache write price" type="number" min="0" max="1000000" step="any" placeholder="Same as input" value={cacheWrite} onChange={event => setCacheWrite(event.target.value)} disabled={busy}/></label>
      </div><p>Cache tokens are part of input, and reasoning tokens are part of output; they are not counted twice. Platform discounts and credits may differ from this estimate.</p><button className="primary-button" disabled={busy || !input.trim() || !output.trim()}>Save price</button></>}
    </form>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}

export function AIUsage({ providers, visible }: { providers: AIProvider[]; visible: boolean }) {
  const [query, setQuery] = useState<AIUsageQuery>(recentRange);
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
      <label>From<input aria-label="Usage from" type="date" value={query.from ?? ""} onChange={event => filter({ from: event.target.value || undefined })}/></label>
      <label>To<input aria-label="Usage to" type="date" value={query.to ?? ""} onChange={event => filter({ to: event.target.value || undefined })}/></label>
      <label>Source<ThemedSelect label="Usage source" value={query.providerId ?? ""} options={[{ value: "", label: "All sources" }, ...(data?.sources ?? []).map(value => ({ value: value.id, label: value.name }))]} onChange={providerId => filter({ providerId: providerId || undefined, modelId: undefined })}/></label>
      <label>Model<ThemedSelect label="Usage model" value={query.modelId ?? ""} options={[{ value: "", label: "All models" }, ...(data?.models ?? []).map(value => ({ value: value.id, label: value.name }))]} onChange={modelId => filter({ modelId: modelId || undefined })}/></label>
      <label>Purpose<ThemedSelect label="Usage purpose" value={query.purpose ?? ""} options={[{ value: "", label: "All purposes" }, { value: "chat", label: "Chat" }, { value: "test", label: "Connection test" }]} onChange={purpose => filter({ purpose: purpose === "chat" || purpose === "test" ? purpose : undefined })}/></label>
    </div>
    <div className="usage-ranges"><button className="text-button" onClick={() => filter({ from: localUsageDay(), to: localUsageDay() })}>Today</button><button className="text-button" onClick={() => filter(recentRange())}>Last 30 days</button><button className="text-button" onClick={() => filter({ from: undefined, to: undefined })}>All time</button></div>
    {error && <p role="alert" className="usage-warning">{error}</p>}{data?.warning && <p role="alert" className="usage-warning">{data.warning}</p>}
    {!data ? <p role="status">{busy ? "Loading local usage…" : "Usage is unavailable."}</p> : <>
      <div className="usage-overview"><div><span>Requests</span><strong>{number(data.summary.requests)}</strong></div><div><span>Known input tokens</span><strong>{number(data.summary.inputTokens)}</strong></div><div><span>Known output tokens</span><strong>{number(data.summary.outputTokens)}</strong></div><div><span>Known total tokens</span><strong>{number(data.summary.totalTokens)}</strong></div><div className="usage-cost-card"><span>Known costs</span><Costs totals={data.summary}/></div></div>
      <p className="usage-coverage">{number(data.summary.unknownTokens)} requests without complete token data · {number(data.summary.unknownCosts)} without known costs{data.summary.pending ? ` · ${number(data.summary.pending)} in progress` : ""}. Missing data is unknown, not zero.</p>
      <section className="usage-section"><h2>By source and model</h2>{!data.groups.length ? <p>No requests in this range. Chat or Test model will start recording new usage.</p> : <div className="usage-table-scroll"><table className="usage-table" aria-label="Usage by source and model"><thead><tr><th>Source / Model</th><th>Purpose</th><th>Requests</th><th>Known input</th><th>Known output</th><th>Costs</th></tr></thead><tbody>{data.groups.map(group => <tr key={group.key}><td><strong>{group.providerName} · {group.modelName}</strong><small>{group.modelId}</small></td><td>{group.purpose === "test" ? "Test" : "Chat"}</td><td>{number(group.requests)}{group.unknownTokens > 0 && <small>{group.unknownTokens} without token data</small>}</td><td>{number(group.inputTokens)}</td><td>{number(group.outputTokens)}</td><td className="usage-cost-cell"><Costs totals={group}/>{group.unknownCosts > 0 && <small>{group.unknownCosts} unknown</small>}</td></tr>)}</tbody></table></div>}</section>
      <ModelPrices providers={providers}/>
      <section className="usage-section"><h2>Requests <small>{number(data.totalRecords)}</small></h2>{data.records.length > 0 && <><div className="usage-table-scroll"><table className="usage-table" aria-label="Usage requests"><thead><tr><th>Time / Source / Model</th><th>Purpose</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead><tbody>{data.records.map(record => <tr key={record.id}>
        <td><time>{new Date(record.startedAt).toLocaleString()}</time><strong>{record.providerName} · {record.modelName}</strong><small>{record.modelId}</small></td>
        <td>{record.purpose === "test" ? "Test" : "Chat"}{record.attempt > 1 && <small>Retry {record.attempt - 1}</small>}</td>
        <td>{record.totalTokens === undefined ? "Unknown" : number(record.totalTokens)}<small>In {record.inputTokens === undefined ? "?" : number(record.inputTokens)} / Out {record.outputTokens === undefined ? "?" : number(record.outputTokens)}</small>{record.cachedTokens !== undefined && <small>Cached {number(record.cachedTokens)}</small>}{record.reasoningTokens !== undefined && <small>Reasoning {number(record.reasoningTokens)}</small>}</td>
        <td>{record.cost ? <>{formatUsageCost(record.cost.amount, record.cost.currency)}<small>{record.cost.source === "reported" ? "Reported" : "Estimated"}</small></> : "Unknown"}</td>
        <td><span className={`usage-status ${record.status}`}>{record.status === "pending" ? "In progress" : record.status === "complete" ? "Complete" : record.status === "stopped" ? "Stopped" : record.status === "interrupted" ? "Interrupted" : "Failed"}</span></td>
      </tr>)}</tbody></table></div><div className="usage-pagination"><button className="quiet-button" disabled={data.page <= 1 || busy} onClick={() => setQuery(previous => ({ ...previous, page: data.page - 1 }))}>Previous</button><span>Page {data.page} / {Math.max(1, Math.ceil(data.totalRecords / data.pageSize))}</span><button className="quiet-button" disabled={data.page * data.pageSize >= data.totalRecords || busy} onClick={() => setQuery(previous => ({ ...previous, page: data.page + 1 }))}>Next</button></div></>}</section>
    </>}
    <p className="usage-footnote">Only calls made in LanCarbon after usage recording was introduced are included. Old chats and calls in other apps are not backfilled. Each automatic retry is a separate attempt. Currency totals remain separate; the service's billing statement is authoritative.</p>
  </div>;
}
