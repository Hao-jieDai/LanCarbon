import { useEffect, useState } from "react";
import { RELEASE_VERSION } from "../shared/notes";
import type { EnvironmentInstallProgress, EnvironmentSetupItem, EnvironmentSetupResult, EnvironmentToolId } from "../shared/types";

function mark(status: EnvironmentSetupItem["status"]): string { return status === "pass" ? "✓" : status === "warning" ? "!" : "×"; }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

export function EnvironmentSetupPanel(props: { onClose(): void; onNotice(message: string): void }) {
  const [result, setResult] = useState<EnvironmentSetupResult | null>(null);
  const [busy, setBusy] = useState<EnvironmentToolId | null>(null);
  const [progress, setProgress] = useState<EnvironmentInstallProgress | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [repairingPermissions, setRepairingPermissions] = useState(false);
  const [failed, setFailed] = useState<EnvironmentToolId | null>(null);
  const [error, setError] = useState("");
  const refresh = async () => { setError(""); const value = await window.notesDesktop.inspectEnvironment(); setResult(value); if (!value.ok) setError(value.error); };
  useEffect(() => {
    const unsubscribe = window.notesDesktop.onEnvironmentProgress(value => setProgress(value));
    void refresh();
    return () => { unsubscribe(); void window.notesDesktop.cancelEnvironmentInstall(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const install = async (id: EnvironmentToolId) => {
    setBusy(id); setProgress(null); setCanceling(false); setError(""); const value = await window.notesDesktop.installEnvironmentTool(id); setBusy(null); setProgress(null); setCanceling(false);
    if (value.ok) { setFailed(null); props.onNotice(`${value.item.label} is ready`); await refresh(); }
    else if (!value.canceled) { setFailed(id); setError(value.error); }
  };
  const cancel = async () => { setCanceling(true); await window.notesDesktop.cancelEnvironmentInstall(); };
  const repairPermissions = async () => {
    setRepairingPermissions(true); setError("");
    const value = await window.notesDesktop.repairEnvironmentPermissions();
    setRepairingPermissions(false);
    if (value.ok) { props.onNotice("Managed tools folder permissions repaired"); await refresh(); }
    else setError(value.error);
  };
  const close = async () => { if (busy) await window.notesDesktop.cancelEnvironmentInstall(); props.onClose(); };
  const items = result?.ok ? result.items : [];
  return <div className="modal-backdrop" role="presentation"><section className="settings-modal environment-panel" aria-label="Environment Setup">
    <header><div><h2>Environment Setup</h2><p>LanCarbon {RELEASE_VERSION}</p></div><button type="button" className="icon-button" aria-label="Close Environment Setup" onClick={() => void close()}>×</button></header>
    <p className="modal-help">Notes, Books, Preview and source Export work without these optional tools. Install only what you need for Build and Publish.</p>
    {result?.ok && <div className="environment-location"><span>LanCarbon home</span><strong>{result.root}</strong><span>Managed tools</span><strong>{result.toolsPath}</strong></div>}
    {!result ? <div className="build-progress"><span className="status-dot" />Checking installed tools and GitHub access…</div> : <div className="setup-list">{items.map(item => <article className={`setup-item ${item.status}`} key={item.id}>
      <span className="setup-mark" aria-hidden="true">{mark(item.status)}</span><div className="setup-description"><div><strong>{item.label}</strong><span>{item.requirement}</span></div><p>{item.detail}</p>{item.path && <code title={item.path}>{item.path}</code>}</div>
      <div className="setup-actions">{item.repairable ? <button type="button" className="build-action build-primary" disabled={Boolean(busy) || repairingPermissions} onClick={() => void repairPermissions()}>{repairingPermissions ? "Repairing…" : "Repair folder permissions"}</button> : item.status === "pass" && item.source === "system" ? <span className="environment-existing">Using existing</span> : item.installable && <><button type="button" className="build-action build-primary" disabled={Boolean(busy) || repairingPermissions} onClick={() => void install(item.id as EnvironmentToolId)}>{busy === item.id ? "Working…" : failed === item.id ? "Retry managed install" : item.status === "pass" && item.source === "managed" ? "Repair managed copy" : "Install managed copy"}</button><button type="button" className="build-action" disabled={Boolean(busy) || repairingPermissions} onClick={async () => { const value = await window.notesDesktop.openEnvironmentInstructions(item.id as EnvironmentToolId); if (!value.ok) setError(value.error); }}>Instructions</button>{item.downloadSize && <small>{item.downloadSize}</small>}</>}</div>
    </article>)}</div>}
    <p className="environment-network-note">Downloads use official Python, Node.js, PyPI and GitHub sources and are verified before installation. If GitHub is unavailable, enable your proxy application's system proxy or TUN mode and retry. A failed download does not affect local editing or tools already installed successfully.</p>
    {busy && <div className="build-progress environment-install-progress" role="status"><span className="status-dot" /><div><strong>{progress?.message ?? `Preparing ${items.find(item => item.id === busy)?.label ?? busy}…`}</strong>{progress?.receivedBytes !== undefined && <><progress value={progress.receivedBytes} max={progress.totalBytes || undefined} /><small>{formatBytes(progress.receivedBytes)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)} (${Math.min(100, Math.round(progress.receivedBytes / progress.totalBytes * 100))}%)` : " downloaded"}</small></>}</div><button type="button" className="text-button" disabled={canceling} onClick={() => void cancel()}>{canceling ? "Canceling…" : "Cancel"}</button></div>}
    {error && <p className="insert-error" role="alert">{error}</p>}
    <footer><button type="button" className="build-action" onClick={async () => { const value = await window.notesDesktop.openEnvironmentLog(); if (!value.ok) setError(value.error); }}>Open Log</button><button type="button" className="build-action" onClick={() => void refresh()} disabled={Boolean(busy)}>Refresh</button><button type="button" className="build-action" onClick={() => void close()}>Close</button></footer>
  </section></div>;
}
