import { useCallback, useEffect, useRef, useState } from "react";
import { balanceKey, type BalanceMode, type BalanceSource, type SourceBalance } from "../shared/aiBalances";
import type { AICurrency } from "../shared/aiUsage";
import { ThemedSelect } from "./ThemedSelect";

const connectionLabel = (source: BalanceSource) => {
  if (source.usage !== "translation" && !source.providerId.startsWith("translation-")) return `${source.providerName} · AI connection`;
  const preset = ["SiliconFlow", "OpenRouter", "Others"].find(name => source.providerName === `${name} Translation`);
  const name = preset ?? source.providerName;
  return ["Translation", "Translation connection"].includes(name) ? "Translation connection" : `${name} · Translation connection`;
};
export function AIBalances({ visible }: { visible: boolean }) {
  const api = window.notesDesktop.ai;
  const [balances, setBalances] = useState<SourceBalance[]>([]), [editing, setEditing] = useState<SourceBalance | null>(null);
  const [amount, setAmount] = useState(""), [currency, setCurrency] = useState<AICurrency>("CNY");
  const [amountChanged, setAmountChanged] = useState(false);
  const [mode, setMode] = useState<BalanceMode>("limited"), [name, setName] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const version = useRef(0);
  const load = useCallback(async () => { const current = ++version.current; if (!api?.balances) return; const result = await api.balances(); if (current !== version.current) return; if (!result.ok) throw Error(result.error); setBalances(result.balances); }, [api]);
  useEffect(() => { if (!visible || !api?.balances) return; void load().catch(error => setError(String(error))); let timer: ReturnType<typeof setTimeout> | undefined; const unsubscribe = api.onUsageChanged(() => { clearTimeout(timer); timer = setTimeout(() => void load().catch(error => setError(String(error))), 150); }); return () => { version.current++; clearTimeout(timer); unsubscribe(); }; }, [visible, api, load]);
  if (!api?.balances) return null;
  const connections = balances.flatMap(balance => balance.sources.map(source => ({ ...source, ownerId: balance.accountId, ownerName: balance.providerName, tracked: !!balance.checkpoint })));
  const money = (balance: SourceBalance) => new Intl.NumberFormat("en-US", { style: "currency", currency: balance.checkpoint!.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 4 }).format(balance.remaining!);
  const edit = (balance: SourceBalance) => {
    setEditing(balance); setName(balance.providerName); setAmount(balance.remaining === undefined ? "" : String(balance.remaining)); setAmountChanged(false); setMode(balance.checkpoint?.mode ?? "limited");
    setSelected(balance.sources.map(balanceKey)); setCurrency(balance.checkpoint?.currency ?? (new URL(balance.baseUrl).hostname === "openrouter.ai" ? "USD" : "CNY")); setError("");
  };
  const run = (action: () => Promise<void>) => { setBusy(true); setError(""); void action().catch(error => setError(error.message)).finally(() => setBusy(false)); };
  return <section className="usage-balances" aria-label="Estimated API balances">
    <div className="usage-balance-heading"><h2>Estimated balances</h2><span>By billing account · LanCarbon usage only</span><button className="text-button" aria-label="Refresh balances" disabled={busy} onClick={() => void load().catch(error => setError(error.message))}>Refresh</button></div>
    <div className="balance-cards">{balances.map(balance => <article key={balance.accountId} className={`balance-card${balance.low ? " balance-low" : ""}`} aria-label={`${balance.providerName} balance`}>
      <div><strong title={balance.providerName}>{balance.providerName}</strong><span className="balance-amount">{balance.checkpoint?.mode === "unlimited" ? "Unlimited" : balance.checkpoint ? `≈ ${money(balance)}` : "Not set"}</span></div>
      <small>{balance.sources.map(connectionLabel).join(" / ")}</small>
      <small>{balance.checkpoint ? `${balance.checkpoint.mode === "unlimited" ? "Set" : "Calibrated"} ${new Date(balance.checkpoint.calibratedAt).toLocaleString()}` : balance.needsCalibration ? "Connections changed. Enter the current account balance." : "Enter your current account balance or choose Unlimited."}</small>
      {balance.low && <small className="balance-low-label">Low balance · Check whether a top-up is needed</small>}
      {!!balance.unknownRequests && <small>{balance.unknownRequests} calls without known fees</small>}{!!balance.pending && <small>{balance.pending} calls in progress</small>}
      {balance.sources.some(source => !source.configured) && <small>Includes a connection no longer configured</small>}
      <div className="balance-actions"><button className="text-button" disabled={busy || !balance.configured} onClick={() => edit(balance)}>{balance.checkpoint ? "Update balance" : "Set balance"}</button>{balance.checkpoint && <button className="text-button" disabled={busy} onClick={() => run(async () => { const result = await api.removeBalance(balance); if (!result.ok) throw Error(result.error); await load(); })}>Stop tracking</button>}</div>
    </article>)}</div>
    {editing && <form className="balance-editor" aria-label="Calibrate API balance" data-translation-exclude onSubmit={event => {
      event.preventDefault(); const value = mode === "unlimited" ? 0 : Number(amount);
      const sameSources = selected.length === editing.sources.length && editing.sources.every(source => selected.includes(balanceKey(source)));
      const preserveCheckpoint = !!editing.checkpoint && !amountChanged && sameSources && currency === editing.checkpoint.currency && mode === (editing.checkpoint.mode ?? "limited");
      if (!name.trim()) { setError("Enter a balance account name."); return; }
      if (mode === "limited" && !preserveCheckpoint && (!amount.trim() || !Number.isFinite(value) || value < 0)) { setError("Enter the account's full current balance. Zero is allowed."); return; }
      if (mode === "limited" && editing.checkpoint && !sameSources && !amountChanged) { setError("Connections changed. Enter the full current account balance to confirm the new checkpoint."); return; }
      const sources = connections.filter(source => selected.includes(balanceKey(source)));
      if (!sources.length) { setError("Choose at least one connection sharing this balance."); return; }
      run(async () => { const result = await api.saveBalance({ ...sources[0], accountId: editing.accountId, accountName: name, sources, amount: value, currency, mode, preserveCheckpoint }); if (!result.ok) throw Error(result.error); setEditing(null); await load(); });
    }}>
      <strong>Balance account</strong>
      <label>Account name<input autoFocus aria-label="Balance account name" maxLength={256} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>
      <label>Balance mode<ThemedSelect label="Balance mode" value={mode} options={[{ value: "limited", label: "Track balance" }, { value: "unlimited", label: "Unlimited · No balance tracking" }]} disabled={busy} onChange={value => setMode(value as BalanceMode)}/></label>
      {mode === "limited" && <><label>Current account balance<input type="number" aria-label="Current API balance" min={editing.checkpoint && !amountChanged ? undefined : 0} max={1000000000} step="any" value={amount} disabled={busy} onInput={() => setAmountChanged(true)} onChange={event => { setAmount(event.target.value); setAmountChanged(true); }}/></label><label>Currency<ThemedSelect label="Balance currency" value={currency} options={[{ value: "CNY", label: "CNY" }, { value: "USD", label: "USD" }]} disabled={busy} onChange={value => setCurrency(value as AICurrency)}/></label></>}
      <fieldset className="balance-connections" disabled={busy}><legend>Connections sharing this balance</legend>{connections.filter(source => source.configured || selected.includes(balanceKey(source))).map(source => {
        const key = balanceKey(source), checked = selected.includes(key);
        return <label key={key}><input type="checkbox" aria-label={`Share balance with ${connectionLabel(source)}`} checked={checked} onChange={event => setSelected(current => event.target.checked ? [...current, key] : current.filter(value => value !== key))}/><span>{connectionLabel(source)}<small>{source.baseUrl}{!source.configured ? " · No longer configured" : source.ownerId !== editing.accountId && source.tracked ? ` · Moves from ${source.ownerName}` : ""}</small></span></label>;
      })}</fieldset>
      <p>Select only connections billed to the same account. Different API keys can share a balance. After a top-up or regrouping, enter the full current balance; existing balances are never added together. Any other account whose connections change will need recalibration. Unchecked connections become separate entries.</p>
      <p>{mode === "unlimited" ? "Unlimited disables balance estimates and top-up reminders. Token and cost statistics are still recorded." : "Future fees start from this checkpoint; history is preserved. Low-balance reminders: below CNY 5 or USD 2."}</p>
      <div className="balance-editor-actions"><button className="primary-button" disabled={busy}>Save balance</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}{error && <p role="alert" className="usage-warning">{error}</p>}
  </section>;
}
