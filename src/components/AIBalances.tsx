import { useCallback, useEffect, useRef, useState } from "react";
import { balanceKey, type SourceBalance } from "../shared/aiBalances";
import type { AICurrency } from "../shared/aiUsage";
import { ThemedSelect } from "./ThemedSelect";
export function AIBalances({ visible }: { visible: boolean }) {
  const api = window.notesDesktop.ai;
  const [balances, setBalances] = useState<SourceBalance[]>([]), [editing, setEditing] = useState<SourceBalance | null>(null);
  const [amount, setAmount] = useState(""), [currency, setCurrency] = useState<AICurrency>("CNY"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const version = useRef(0);
  const load = useCallback(async () => { const current = ++version.current; if (!api?.balances) return; const result = await api.balances(); if (current !== version.current) return; if (!result.ok) { setError(result.error); return; } setBalances(result.balances); }, [api]);
  useEffect(() => { if (!visible || !api?.balances) return; void load().catch(error => setError(String(error))); let timer: ReturnType<typeof setTimeout> | undefined; const unsubscribe = api.onUsageChanged(() => { clearTimeout(timer); timer = setTimeout(() => void load().catch(error => setError(String(error))), 150); }); return () => { version.current++; clearTimeout(timer); unsubscribe(); }; }, [visible, api, load]);
  if (!api?.balances) return null;
  const money = (balance: SourceBalance) => new Intl.NumberFormat("en-US", { style: "currency", currency: balance.checkpoint!.currency, maximumFractionDigits: 4 }).format(balance.remaining!);
  return <section className="usage-balances" aria-label="Estimated API balances">
    <div className="usage-balance-heading"><h2>Estimated balances</h2><span>Manual starting balances · LanCarbon usage only</span><button className="text-button" aria-label="Refresh balances" onClick={() => void load()}>Refresh</button></div>
    <div className="balance-cards">{balances.map(balance => <article key={balanceKey(balance)} className={`balance-card${balance.low ? " balance-low" : ""}`} aria-label={`${balance.providerName} balance`}>
      <div><strong title={balance.baseUrl}>{balance.providerName}</strong><span className="balance-amount">{balance.checkpoint ? `≈ ${money(balance)}` : "Not set"}</span></div>
      <small>{balance.checkpoint ? `Calibrated ${new Date(balance.checkpoint.calibratedAt).toLocaleString()}` : "Enter your current platform balance."}</small>
      {balance.low && <small className="balance-low-label">Low balance · Check whether a top-up is needed</small>}{!!balance.unknownRequests && <small>{balance.unknownRequests} calls without known fees</small>}{!!balance.pending && <small>{balance.pending} calls in progress</small>}{!balance.configured && <small>Source no longer configured</small>}
      <div className="balance-actions"><button className="text-button" disabled={busy || !balance.configured} onClick={() => { setEditing(balance); setAmount(""); setCurrency(balance.checkpoint?.currency ?? (new URL(balance.baseUrl).hostname === "openrouter.ai" ? "USD" : "CNY")); setError(""); }}>{balance.checkpoint ? "Update balance" : "Set balance"}</button>{balance.checkpoint && <button className="text-button" disabled={busy} onClick={() => { setBusy(true); void api.removeBalance(balance).then(result => { if (!result.ok) throw Error(result.error); return load(); }).catch(error => setError(error.message)).finally(() => setBusy(false)); }}>Stop tracking</button>}</div>
    </article>)}</div>
    {editing && <form className="balance-editor" aria-label="Calibrate API balance" data-translation-exclude onSubmit={event => { event.preventDefault(); const value = Number(amount); if (!amount.trim() || !Number.isFinite(value) || value < 0) { setError("Enter the platform's full current balance. Zero is allowed."); return; } setBusy(true); setError(""); void api.saveBalance({ providerId: editing.providerId, providerName: editing.providerName, baseUrl: editing.baseUrl, amount: value, currency }).then(result => { if (!result.ok) throw Error(result.error); setEditing(null); return load(); }).catch(error => setError(error.message)).finally(() => setBusy(false)); }}>
      <strong>{editing.providerName}</strong><label>Current platform balance<input autoFocus type="number" aria-label="Current API balance" min={0} max={1000000000} step="any" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)}/></label><label>Currency<ThemedSelect label="Balance currency" value={currency} options={[{ value: "CNY", label: "CNY" }, { value: "USD", label: "USD" }]} onChange={value => setCurrency(value as AICurrency)}/></label><button className="primary-button" disabled={busy}>Save balance</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><p>Enter the full balance after a top-up, not the amount added. Future fees start from this checkpoint; usage history stays available.</p>
    </form>}{error && <p role="alert" className="usage-warning">{error}</p>}
  </section>;
}
