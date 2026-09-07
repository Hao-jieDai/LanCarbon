import { useEffect, useMemo, useState } from "react";
import type { Book, GitHubCheck, GitHubPublishingBinding, GitHubPublishingStatusResult, GitHubSetupRequest } from "../shared/types";

function repositoryName(title: string): string {
  return title.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "lancarbon-book";
}

function hasNetworkError(value: string): boolean {
  return /(ECONNRESET|ETIMEDOUT|timed? out|port 443|could not connect|failed to connect|network|socket|unable to access|connection.*(?:failed|closed|reset))/i.test(value);
}

function NetworkHint({ kind }: { kind: "account" | "repository" | "publish" }) {
  const action = kind === "account" ? "GitHub sign-in and account checks" : kind === "repository" ? "Connecting or creating a repository" : "Publishing and updating the website";
  return <p className="github-network-hint">{action} requires access to GitHub. If your network uses a proxy, enable its system proxy or TUN mode first.</p>;
}

export function GitHubPublishingPanel(props: { book: Book; onBinding(binding: GitHubPublishingBinding): void; onClose(): void; onNotice(message: string): void }) {
  const binding = props.book.settings.publishing;
  const [status, setStatus] = useState<GitHubPublishingStatusResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [partialUrl, setPartialUrl] = useState("");
  const [signInMessage, setSignInMessage] = useState("");
  const [showSetup, setShowSetup] = useState(!binding);
  const [request, setRequest] = useState<GitHubSetupRequest>({ mode: "existing", owner: binding?.repository.split("/")[0] ?? "", repository: binding?.repository.split("/")[1] ?? repositoryName(props.book.settings.title), visibility: binding?.visibility === "PRIVATE" ? "private" : "public", branch: binding?.branch ?? "gh-pages" });
  const refresh = async () => {
    setBusy(true); const result = await window.notesDesktop.inspectGitHubPublishing(props.book.id); setStatus(result); setBusy(false);
    if (result.ok && !request.owner && result.account) setRequest(current => ({ ...current, owner: result.account ?? "" }));
  };
  useEffect(() => { void refresh(); }, [props.book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = status?.ok ? status.checks : [];
  const prerequisites = useMemo(() => ["git", "gh", "auth", "github-api"].every(id => checks.find(check => check.id === id)?.status === "pass"), [checks]);
  const publishReady = useMemo(() => Boolean(binding) && ["git", "gh", "auth", "github-api", "repository", "pages"].every(id => checks.find(check => check.id === id)?.status === "pass"), [binding, checks]);
  const publishLabel = !binding?.lastPublishedAt
    ? status?.ok && status.buildStatus !== "current" ? "Build and Publish Website" : "Publish Website"
    : status?.ok && status.buildStatus !== "current" ? "Rebuild and Update Website" : "Update Website";
  const submit = async () => {
    setBusy(true); setError(""); setPartialUrl("");
    const result = await window.notesDesktop.setupGitHubPublishing(props.book.id, { ...request, owner: request.owner.trim(), repository: request.repository.trim(), branch: request.branch.trim() });
    setBusy(false);
    if (!result.ok) { setError(result.error); setPartialUrl(result.repositoryUrl ?? ""); return; }
    props.onBinding(result.binding); props.onNotice("GitHub repository and Pages are connected"); setShowSetup(false);
    setStatus(current => current?.ok ? { ...current, checks: current.checks.map(check => check.id === "repository" ? { ...check, status: "pass", detail: `${result.binding.repository} is connected.` } : check.id === "pages" ? { ...check, status: "pass", detail: result.binding.pagesUrl ?? `Configured from ${result.binding.branch}.` } : check) } : current);
  };
  const publish = async () => {
    setBusy(true); setPublishing(true); setError("");
    const result = await window.notesDesktop.publishGitHubBook(props.book.id);
    setBusy(false); setPublishing(false);
    if (!result.ok) { if (!result.canceled) setError(result.error); return; }
    props.onBinding(result.binding);
    props.onNotice(result.deployment === "built" ? (result.rebuilt ? "Book rebuilt and website published to GitHub Pages" : result.changed ? "Website published to GitHub Pages" : "Published website is already up to date") : "Website uploaded; GitHub Pages is still deploying it");
    setStatus(current => {
      if (!current?.ok) return current;
      const publication: GitHubCheck = { id: "publication", label: "Published website", status: result.deployment === "built" ? "pass" : "warning", detail: result.deployment === "built" ? `Published just now; commit ${result.binding.lastCommit?.slice(0, 7)}.` : "Website files are uploaded. GitHub Pages is still deploying this revision; wait briefly, then refresh the checks." };
      const build: GitHubCheck = { id: "build", label: "Book website build", status: "pass", detail: "The managed website matches the current Book." };
      const nextChecks = current.checks.map(check => check.id === "build" ? build : check);
      return { ...current, buildStatus: "current", checks: nextChecks.some(check => check.id === "publication") ? nextChecks.map(check => check.id === "publication" ? publication : check) : [...nextChecks, publication] };
    });
  };
  const open = async (url: string) => { const result = await window.notesDesktop.openGitHubUrl(url); if (!result.ok) props.onNotice(result.error); };
  return <div className="modal-backdrop" role="presentation"><section className="settings-modal github-panel" aria-label="GitHub Publishing">
    <header><h2>GitHub Publishing</h2><button type="button" className="icon-button" aria-label="Close GitHub publishing" onClick={props.onClose} disabled={busy}>×</button></header>
    <p className="modal-help">Check the publishing environment, connect this Book, then publish its latest successful build. Later publishes update the same website and keep a verified revision.</p>
    <NetworkHint kind="account" />
    {!status ? <div className="build-progress"><span className="status-dot" />Checking Git and GitHub…</div> : !status.ok ? <p className="insert-error">{status.error}</p> : <div className="github-checks">{checks.map(check => <div className={`github-check ${check.status}`} key={check.id}><span aria-hidden="true">{check.status === "pass" ? "✓" : check.status === "error" ? "×" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div>}
    {status?.ok && checks.find(check => check.id === "gh")?.status === "error" && <button type="button" className="build-action github-inline-action" onClick={async () => { const value = await window.notesDesktop.openGitHubCliDownload(); if (!value.ok) props.onNotice(value.error); }}>Open GitHub CLI Download</button>}
    {status?.ok && checks.find(check => check.id === "gh")?.status === "pass" && checks.find(check => check.id === "auth")?.status === "error" && <><button type="button" className="build-action github-inline-action" onClick={async () => { setSignInMessage(""); const value = await window.notesDesktop.startGitHubSignIn(); if (value.ok) setSignInMessage("A PowerShell sign-in window has opened. Complete the browser authorization, return here, then select Refresh Checks."); else setError(value.error); }}>Sign in with GitHub CLI</button>{signInMessage && <p className="github-signin-message" role="status">{signInMessage}</p>}</>}
    {binding && <div className="github-binding"><span>Connected repository</span><strong>{binding.repository}</strong><small>{binding.visibility} · {binding.branch}{binding.lastPublishedAt ? ` · Last published ${new Date(binding.lastPublishedAt).toLocaleString()}` : " · Not published by LanCarbon yet"}</small><div><button type="button" className="github-publish-button" onClick={() => void publish()} disabled={busy || !publishReady}>{publishing ? "Building and publishing…" : publishLabel}</button>{binding.pagesUrl && <button type="button" onClick={() => void open(binding.pagesUrl!)}>Open Pages</button>}{binding.repositoryUrl && <button type="button" onClick={() => void open(binding.repositoryUrl)}>Open Repository</button>}</div><NetworkHint kind="publish" /></div>}
    {binding && !showSetup && <button type="button" className="github-change-setup" onClick={() => setShowSetup(true)}>Change repository setup</button>}
    {showSetup && <fieldset className="github-setup" disabled={busy || !prerequisites}>
      <legend>{binding ? "Change repository setup" : "Repository setup"}</legend>
      <div className="github-mode" role="group" aria-label="Repository setup mode"><button type="button" aria-pressed={request.mode === "existing"} onClick={() => setRequest(current => ({ ...current, mode: "existing" }))}>Existing repository</button><button type="button" aria-pressed={request.mode === "new"} onClick={() => setRequest(current => ({ ...current, mode: "new" }))}>New repository</button></div>
      <div className="github-fields"><label>Owner or organization<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="GitHub owner" value={request.owner} onChange={event => setRequest(current => ({ ...current, owner: event.target.value }))} /></label><label>Repository name<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="GitHub repository" value={request.repository} onChange={event => setRequest(current => ({ ...current, repository: event.target.value }))} /></label></div>
      <div className="github-fields"><label>Publication branch<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="GitHub Pages branch" value={request.branch} onChange={event => setRequest(current => ({ ...current, branch: event.target.value }))} /></label><label>Visibility<select aria-label="GitHub repository visibility" value={request.visibility} disabled={request.mode === "existing"} onChange={event => setRequest(current => ({ ...current, visibility: event.target.value as "public" | "private" }))}><option value="public">Public</option><option value="private">Private</option></select></label></div>
      <p className="modal-help">{request.mode === "new" ? "This creates a GitHub repository with an initial README." : "The repository must already exist and your account must have administration access."} LanCarbon creates the branch if needed and configures GitHub Pages to use its root. Existing repository files are retained.</p>
      <NetworkHint kind="repository" />
      <div className="github-setup-actions">{binding && <button type="button" className="build-action" onClick={() => setShowSetup(false)}>Cancel</button>}<button type="button" className="build-action build-primary" onClick={() => void submit()} disabled={busy || !prerequisites || !request.owner.trim() || !request.repository.trim() || !request.branch.trim()}>{busy ? "Setting up…" : request.mode === "new" ? "Create Repository and Pages" : binding ? "Connect Different Repository" : "Connect and Initialize Pages"}</button></div>
    </fieldset>}
    {error && <div className="insert-error">{error}{hasNetworkError(error) && <p className="github-error-hint">GitHub could not be reached. Check the connection and, if required, enable the proxy application's system proxy or TUN mode before retrying.</p>}{partialUrl && <button type="button" className="text-button" onClick={() => void open(partialUrl)}>Open repository created before this error</button>}</div>}
    <footer><button type="button" className="build-action" onClick={() => void refresh()} disabled={busy}>{busy ? "Checking…" : "Refresh Checks"}</button><button type="button" className="build-action" onClick={props.onClose} disabled={busy}>Close</button></footer>
  </section></div>;
}
