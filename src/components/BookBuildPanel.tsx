import { useEffect, useState } from "react";
import type { Book, BookCheckIssue, BookWebsiteResult, BuildBookResult, BuildEnvironmentCheck } from "../shared/types";

function IssueList({ issues, onNavigate }: { issues: BookCheckIssue[]; onNavigate(issue: BookCheckIssue): void }) {
  if (!issues.length) return <div className="build-pass"><strong>Preflight passed</strong><span>No problems were found.</span></div>;
  return <div className="build-issue-list">{issues.map((item, index) => <button type="button" className={`build-issue ${item.severity}`} key={`${item.code}-${item.pageId ?? "book"}-${item.line ?? index}`} onClick={() => onNavigate(item)} disabled={!item.pageId}>
    <span className="build-issue-mark">{item.source === "jupyter-book" ? "Build" : item.severity === "error" ? "Error" : "Warning"}</span>
    <span><strong>{item.pageTitle ?? "Book"}{item.line ? ` · line ${item.line}` : ""}</strong><small>{item.message}</small></span>
  </button>)}</div>;
}

export function BookBuildPanel(props: { book: Book; onClose(): void; onNavigate(issue: BookCheckIssue): void; onNotice(message: string): void; onEnvironmentSetup?(): void }) {
  const [issues, setIssues] = useState<BookCheckIssue[]>([]);
  const [state, setState] = useState<"checking" | "ready" | "building" | "success" | "failed">("checking");
  const [result, setResult] = useState<BuildBookResult | null>(null);
  const [website, setWebsite] = useState<BookWebsiteResult | null>(null);
  const [environment, setEnvironment] = useState<BuildEnvironmentCheck[]>([]);
  const [environmentError, setEnvironmentError] = useState("");
  const [websiteBusy, setWebsiteBusy] = useState(false);
  useEffect(() => { let live = true; void Promise.all([window.notesDesktop.validateBook(props.book.id), window.notesDesktop.getBookWebsite(props.book.id), window.notesDesktop.inspectBuildEnvironment()]).then(([validation, saved, inspected]) => { if (!live) return; setWebsite(saved); if (inspected.ok) setEnvironment(inspected.checks); else setEnvironmentError(inspected.error); if (validation.ok) { setIssues(validation.issues); setState("ready"); } else { setResult({ ok: false, error: validation.error }); setState("failed"); } }); return () => { live = false; }; }, [props.book.id]);
  const build = async (chooseLocation = false) => {
    setState("building"); const value = await window.notesDesktop.buildBook(props.book.id, { chooseLocation }); setResult(value);
    if (value.ok) { setIssues(value.issues); setWebsite({ ok: true, built: true, running: true, htmlPath: value.htmlPath, destination: value.destination, sourceStatus: "current", builtAt: new Date().toISOString(), url: value.url }); setState("success"); props.onNotice("Jupyter Book build completed"); }
    else if (value.canceled) setState("ready"); else { if (value.issues) setIssues(value.issues); setState("failed"); }
  };
  const open = async () => { const value = await window.notesDesktop.openBuildFolder(props.book.id); if (!value.ok) props.onNotice(value.error); };
  const openWebsite = async () => { const value = await window.notesDesktop.openBookWebsite(props.book.id); if (!value.ok) props.onNotice(value.error); };
  const startWebsite = async () => { setWebsiteBusy(true); const value = await window.notesDesktop.startBookWebsite(props.book.id); setWebsite(value); setWebsiteBusy(false); if (!value.ok) props.onNotice(value.error); };
  const stopWebsite = async () => { setWebsiteBusy(true); const value = await window.notesDesktop.stopBookWebsite(props.book.id); setWebsite(value); setWebsiteBusy(false); if (!value.ok) props.onNotice(value.error); };
  const errors = issues.filter(item => item.severity === "error").length, preflightErrors = issues.filter(item => item.severity === "error" && item.source === "preflight").length, warnings = issues.filter(item => item.severity === "warning").length;
  const environmentBlocked = Boolean(environmentError) || environment.some(check => check.status === "error");
  const savedWebsite = website?.ok && website.built ? website : null;
  const buildLabel = state === "building" ? "Building…" : state === "failed" ? (savedWebsite ? "Try Rebuild Website" : "Try Build Again") : savedWebsite ? "Rebuild Website" : "Choose Location and Build";
  return <div className="modal-backdrop" role="presentation"><section className="settings-modal build-panel" aria-label="Check and Build Book">
    <header><h2>Check and Build</h2><button type="button" className="icon-button" aria-label="Close Book build" onClick={props.onClose} disabled={state === "building"}>×</button></header>
    <p className="modal-help">LanCarbon checks the whole Book first, then runs <code>jupyter book build --html --strict --ci</code> in a managed folder. A failed build keeps the previous successful website intact.</p>
    {state === "checking" && <div className="build-progress"><span className="status-dot" />Checking pages, references and resources…</div>}
    {state !== "checking" && <><div className="build-environment" aria-label="Build environment checks">{environment.map(check => <div className={`environment-check ${check.status}`} key={check.id}><span aria-hidden="true">{check.status === "pass" ? "✓" : "×"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div>{environmentError && <p className="insert-error">{environmentError}</p>}<p className="build-requirement-hint">Build requires Python 3, Node.js and Jupyter Book 2. Use Environment Setup to install or repair them, then refresh this panel.</p>{props.onEnvironmentSetup && <button type="button" className="build-action github-inline-action" onClick={props.onEnvironmentSetup}>Open Environment Setup</button>}</>}
    {state !== "checking" && <div className="build-summary"><strong>{errors} errors · {warnings} warnings</strong><span>{state === "building" ? "Building with Jupyter Book…" : state === "success" ? `Completed in ${((result?.ok ? result.durationMs : 0) / 1000).toFixed(1)} seconds` : state === "failed" && result ? "Jupyter Book build failed" : "Preflight result"}</span></div>}
    {state !== "checking" && <IssueList issues={issues} onNavigate={props.onNavigate} />}
    {result && !result.ok && !result.canceled && !issues.length && <p className="insert-error">{result.error}</p>}
    {savedWebsite && <div className="build-output"><span>Book content status</span><strong>{savedWebsite.sourceStatus === "current" ? "Build is up to date" : "Book changed — rebuild required"}</strong>{savedWebsite.builtAt && <><span>Last successful build</span><strong>{new Date(savedWebsite.builtAt).toLocaleString()}</strong></>}<span>Local website</span>{savedWebsite.running && savedWebsite.url ? <button type="button" className="build-url" onClick={() => void openWebsite()}>{savedWebsite.url}</button> : <strong>Stopped — start it to get a local address</strong>}<span>Saved files</span><strong>{savedWebsite.htmlPath}</strong></div>}
    {result && "log" in result && result.log && <details className="build-log"><summary>Jupyter Book output</summary><pre>{result.log}</pre></details>}
    <footer>{savedWebsite && <>{savedWebsite.running ? <><button type="button" className="build-action" onClick={() => void openWebsite()} disabled={websiteBusy}>Open Website</button><button type="button" className="build-action" onClick={() => void stopWebsite()} disabled={websiteBusy}>Stop Website</button></> : <button type="button" className="build-action" onClick={() => void startWebsite()} disabled={websiteBusy}>{websiteBusy ? "Starting…" : "Start Website"}</button>}<button type="button" className="build-action" onClick={() => void open()}>Open Build Folder</button><button type="button" className="build-action" onClick={() => void build(true)} disabled={state === "building" || preflightErrors > 0 || environmentBlocked}>Change Build Location</button></>}<button type="button" className="build-action" onClick={props.onClose} disabled={state === "building"}>Close</button><button type="button" className="build-action build-primary" disabled={state === "checking" || state === "building" || preflightErrors > 0 || environmentBlocked} onClick={() => void build()}>{buildLabel}</button></footer>
  </section></div>;
}
