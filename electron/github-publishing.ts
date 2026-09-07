import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { GitHubCheck, GitHubPublishingBinding, GitHubSetupRequest } from "../src/shared/types";

const execute = promisify(execFile);
export type GitHubCommand = (file: string, args: string[], options?: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv }) => Promise<{ stdout?: string; stderr?: string }>;
export type GitHubPause = (milliseconds: number) => Promise<void>;

function installedCommand(file: string): string {
  if (process.platform !== "win32" || file !== "gh") return file;
  const candidates = [process.env.ProgramW6432, process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")]
    .filter((value): value is string => Boolean(value)).map(root => path.join(root, "GitHub CLI", "gh.exe"));
  return candidates.find(existsSync) ?? file;
}
const defaultCommand: GitHubCommand = (file, args, options) => execute(installedCommand(file), args, { windowsHide: true, timeout: options?.timeout ?? 120_000, maxBuffer: 4 * 1024 * 1024, cwd: options?.cwd, env: options?.env });
const defaultPause: GitHubPause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const repositoryPattern = /^(?!\.)(?!.*\.git$)[A-Za-z0-9._-]{1,100}$/i;
const branchPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

function message(error: unknown): string {
  const value = error as Error & { stderr?: string; stdout?: string };
  return String(value.stderr || value.stdout || value.message || "GitHub command failed").replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 2_000);
}

function transientNetworkFailure(value: string): boolean {
  return /(ECONNRESET|ETIMEDOUT|timed? out|port 443|could not connect|failed to connect|network|socket|unable to access|connection.*(?:failed|closed|reset)|recv failure)/i.test(value);
}

async function available(command: GitHubCommand, file: string, args: string[], options?: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv }): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  try { const result = await command(file, args, options); return { ok: true, output: String(result.stdout || result.stderr || "").trim() }; }
  catch (error) { return { ok: false, error: message(error) }; }
}

interface RepositoryInfo { nameWithOwner: string; url: string; visibility: "PUBLIC" | "PRIVATE"; defaultBranchRef?: { name?: string } | null }
interface PagesInfo { html_url?: string; source?: { branch?: string } }
interface PagesBuildInfo { status?: string; commit?: string; error?: { message?: string | null } }

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

export class GitHubPublishingService {
  constructor(private readonly command: GitHubCommand = defaultCommand, private readonly pause: GitHubPause = defaultPause, private readonly temporaryRoot = os.tmpdir()) {}

  private configurePages(fullName: string, branch: string, method: "POST" | "PATCH") {
    return available(this.command, "gh", ["api", "--method", method, `repos/${fullName}/pages`, "-f", `source[branch]=${branch}`, "-f", "source[path]=/"]);
  }

  private async ensurePagesDeployment(fullName: string, revision: string): Promise<"built" | "pending"> {
    let requested = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const latest = await available(this.command, "gh", ["api", `repos/${fullName}/pages/builds/latest`]);
      const build = latest.ok ? parseJson<PagesBuildInfo>(latest.output, {}) : {};
      const currentRevision = build.commit?.toLowerCase() === revision.toLowerCase();
      if (currentRevision && build.status === "built") return "built";
      if (currentRevision && (build.status === "errored" || build.status === "error")) {
        throw new Error(`GitHub Pages could not deploy the uploaded website: ${build.error?.message || "the Pages build failed"}`);
      }
      if (!requested || (!currentRevision && attempt > 0 && attempt % 6 === 0)) {
        const triggered = await available(this.command, "gh", ["api", "--method", "POST", `repos/${fullName}/pages/builds`]);
        if (triggered.ok) requested = true;
        else if (/(409|conflict|queued|progress|already)/i.test(triggered.error)) requested = true;
        else {
          if (attempt >= 2) return "pending";
        }
      }
      if (attempt < 23) await this.pause(2_500);
    }
    return "pending";
  }

  async inspect(binding: GitHubPublishingBinding | undefined, buildStatus: "missing" | "outdated" | "current"): Promise<{ checks: GitHubCheck[]; account?: string; buildStatus: "missing" | "outdated" | "current" }> {
    const checks: GitHubCheck[] = [];
    const git = await available(this.command, "git", ["--version"]);
    checks.push({ id: "git", label: "Git", status: git.ok ? "pass" : "error", detail: git.ok ? git.output : "Git was not found in PATH." });
    const gh = await available(this.command, "gh", ["--version"]);
    checks.push({ id: "gh", label: "GitHub CLI", status: gh.ok ? "pass" : "error", detail: gh.ok ? gh.output.split(/\r?\n/)[0] : "GitHub CLI was not found in PATH." });
    let account: string | undefined;
    if (gh.ok) {
      const auth = await available(this.command, "gh", ["auth", "status"]);
      if (auth.ok) {
        const user = await available(this.command, "gh", ["api", "user", "--jq", ".login"]);
        account = user.ok ? user.output.trim() : undefined;
        checks.push({ id: "auth", label: "GitHub account", status: "pass", detail: account ? `Signed in as ${account}.` : "GitHub CLI is authenticated." });
        checks.push({ id: "github-api", label: "GitHub API", status: user.ok ? "pass" : "error", detail: user.ok ? "GitHub account services are reachable." : `GitHub account services could not be reached: ${user.error}` });
      } else checks.push({ id: "auth", label: "GitHub account", status: "error", detail: "Run GitHub sign-in before connecting a repository." });
      if (!auth.ok) checks.push({ id: "github-api", label: "GitHub API", status: "error", detail: "Sign in before checking GitHub account services." });
    } else {
      checks.push({ id: "auth", label: "GitHub account", status: "error", detail: "Install GitHub CLI before signing in." });
      checks.push({ id: "github-api", label: "GitHub API", status: "error", detail: "Install GitHub CLI before checking GitHub account services." });
    }
    checks.push({ id: "build", label: "Book website build", status: buildStatus === "current" ? "pass" : "warning", detail: buildStatus === "current" ? "The managed website matches the current Book." : buildStatus === "outdated" ? "The Book changed after its last successful build. Publishing will rebuild it first." : "No managed website exists yet. Publishing will ask for a build location and build it first." });
    if (!binding) {
      checks.push({ id: "repository", label: "Repository binding", status: "warning", detail: "No GitHub repository is connected to this Book." });
      checks.push({ id: "git-network", label: "Git HTTPS connection", status: "warning", detail: "Connect a repository before checking Git upload access." });
      checks.push({ id: "pages", label: "GitHub Pages", status: "warning", detail: "Initialize a repository and Pages branch below." });
      return { checks, account, buildStatus };
    }
    if (!gh.ok) {
      checks.push({ id: "repository", label: "Repository binding", status: "warning", detail: `Saved binding: ${binding.repository}. Install GitHub CLI to verify it.` });
      checks.push({ id: "git-network", label: "Git HTTPS connection", status: "error", detail: "Install GitHub CLI before checking Git upload access." });
      checks.push({ id: "pages", label: "GitHub Pages", status: "warning", detail: binding.pagesUrl ?? `Saved branch: ${binding.branch}.` });
      return { checks, account, buildStatus };
    }
    const repository = await available(this.command, "gh", ["repo", "view", binding.repository, "--json", "nameWithOwner,url,visibility,defaultBranchRef"]);
    checks.push({ id: "repository", label: "Repository binding", status: repository.ok ? "pass" : "error", detail: repository.ok ? `${binding.repository} is reachable.` : `Cannot verify ${binding.repository}: ${repository.error}` });
    const gitNetwork = git.ok && repository.ok ? await available(this.command, "git", ["ls-remote", "--heads", `https://github.com/${binding.repository}.git`, binding.branch], { timeout: 25_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }) : { ok: false as const, error: "Git or repository verification failed." };
    checks.push({ id: "git-network", label: "Git HTTPS connection", status: gitNetwork.ok ? "pass" : "warning", detail: gitNetwork.ok ? "Git can download the publication branch from github.com." : `The latest connection check failed, but Publish or Update can still retry it: ${gitNetwork.error}` });
    const pages = repository.ok ? await available(this.command, "gh", ["api", `repos/${binding.repository}/pages`]) : { ok: false as const, error: "Repository verification failed." };
    checks.push({ id: "pages", label: "GitHub Pages", status: pages.ok ? "pass" : "warning", detail: pages.ok ? parseJson<PagesInfo>(pages.output, {}).html_url ?? binding.pagesUrl ?? `Configured from ${binding.branch}.` : `Pages could not be verified: ${pages.error}` });
    const remoteCommit = repository.ok ? await available(this.command, "gh", ["api", `repos/${binding.repository}/commits/${binding.branch}`, "--jq", ".sha"]) : { ok: false as const, error: "Repository verification failed." };
    const sameCommit = Boolean(remoteCommit.ok && binding.lastCommit && binding.lastPublishedAt && remoteCommit.output.trim().toLowerCase() === binding.lastCommit.toLowerCase());
    const pagesBuild = sameCommit ? await available(this.command, "gh", ["api", `repos/${binding.repository}/pages/builds/latest`]) : undefined;
    const buildInfo = pagesBuild?.ok ? parseJson<PagesBuildInfo>(pagesBuild.output, {}) : {};
    const deployed = Boolean(binding.lastCommit && buildInfo.status === "built" && buildInfo.commit?.toLowerCase() === binding.lastCommit.toLowerCase());
    checks.push({ id: "publication", label: "Published website", status: sameCommit && deployed ? "pass" : "warning", detail: sameCommit && deployed
      ? `Published ${new Date(binding.lastPublishedAt!).toLocaleString()}; commit ${binding.lastCommit!.slice(0, 7)}.`
      : sameCommit ? "The website files are uploaded, but GitHub Pages has not deployed this revision yet. Wait briefly, then refresh the checks."
        : binding.lastPublishedAt ? "The publication branch changed after the last LanCarbon publish. Publish again to update it." : "The Book is connected and ready for its first publish." });
    return { checks, account, buildStatus };
  }

  async setup(request: GitHubSetupRequest): Promise<GitHubPublishingBinding> {
    const owner = request.owner.trim(), repository = request.repository.trim(), branch = request.branch.trim();
    if (!ownerPattern.test(owner)) throw new Error("Enter a valid GitHub owner or organization name.");
    if (!repositoryPattern.test(repository)) throw new Error("Enter a valid GitHub repository name.");
    if (!branchPattern.test(branch)) throw new Error("Enter a simple publication branch name, such as gh-pages.");
    if (request.visibility !== "public" && request.visibility !== "private") throw new Error("Choose public or private repository visibility.");
    const auth = await available(this.command, "gh", ["auth", "status"]); if (!auth.ok) throw new Error("GitHub CLI is not signed in.");
    const fullName = `${owner}/${repository}`; let repositoryCreated = false;
    if (request.mode === "new") {
      const created = await available(this.command, "gh", ["repo", "create", fullName, request.visibility === "private" ? "--private" : "--public", "--add-readme", "--description", "Jupyter Book published with LanCarbon"]);
      if (!created.ok) throw new Error(`Repository was not created: ${created.error}`);
      repositoryCreated = true;
    }
    const viewed = await available(this.command, "gh", ["repo", "view", fullName, "--json", "nameWithOwner,url,visibility,defaultBranchRef"]);
    if (!viewed.ok) throw Object.assign(new Error(`Repository could not be connected: ${viewed.error}`), repositoryCreated ? { repositoryUrl: `https://github.com/${fullName}` } : {});
    const info = parseJson<RepositoryInfo | null>(viewed.output, null);
    if (!info?.nameWithOwner || !info.url) throw Object.assign(new Error("GitHub returned an unreadable repository response."), repositoryCreated ? { repositoryUrl: `https://github.com/${fullName}` } : {});
    const defaultBranch = info.defaultBranchRef?.name;
    if (!defaultBranch) throw Object.assign(new Error("The repository has no default branch. Add an initial commit and try again."), { repositoryUrl: info.url });
    const existingBranch = await available(this.command, "gh", ["api", `repos/${fullName}/git/ref/heads/${branch}`]);
    if (!existingBranch.ok) {
      const source = await available(this.command, "gh", ["api", `repos/${fullName}/git/ref/heads/${defaultBranch}`, "--jq", ".object.sha"]);
      if (!source.ok || !/^[a-f0-9]{40}$/i.test(source.output.trim())) throw Object.assign(new Error("The publication branch could not be based on the default branch."), { repositoryUrl: info.url });
      const created = await available(this.command, "gh", ["api", "--method", "POST", `repos/${fullName}/git/refs`, "-f", `ref=refs/heads/${branch}`, "-f", `sha=${source.output.trim()}`]);
      if (!created.ok) throw Object.assign(new Error(`The publication branch was not created: ${created.error}`), { repositoryUrl: info.url });
    }
    let currentPages = await available(this.command, "gh", ["api", `repos/${fullName}/pages`]);
    let pages = currentPages.ok ? parseJson<PagesInfo>(currentPages.output, {}) : {};
    let configured = currentPages.ok && pages.source?.branch === branch
      ? currentPages
      : await this.configurePages(fullName, branch, currentPages.ok ? "PATCH" : "POST");
    for (let attempt = 0; !configured.ok && attempt < 4; attempt += 1) {
      await this.pause(600 * (attempt + 1));
      currentPages = await available(this.command, "gh", ["api", `repos/${fullName}/pages`]);
      pages = currentPages.ok ? parseJson<PagesInfo>(currentPages.output, {}) : {};
      if (currentPages.ok && pages.source?.branch === branch) { configured = currentPages; break; }
      configured = await this.configurePages(fullName, branch, currentPages.ok ? "PATCH" : "POST");
    }
    if (!configured.ok) throw Object.assign(new Error(`GitHub Pages was not configured after retrying: ${configured.error}`), { repositoryUrl: info.url });
    pages = parseJson<PagesInfo>(configured.output, pages);
    const pagesUrl = pages.html_url || (repository.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repository}/`);
    return { repository: info.nameWithOwner || fullName, repositoryUrl: info.url || `https://github.com/${fullName}`, pagesUrl, branch,
      visibility: info.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC", initializedAt: new Date().toISOString() };
  }

  async publish(binding: GitHubPublishingBinding, htmlPath: string, title: string): Promise<{ binding: GitHubPublishingBinding; changed: boolean; deployment: "built" | "pending" }> {
    if (!(await fs.stat(path.join(htmlPath, "index.html")).catch(() => null))?.isFile()) throw new Error("The saved Book build is incomplete. Build the Book again before publishing.");
    const auth = await available(this.command, "gh", ["auth", "status"]); if (!auth.ok) throw new Error("GitHub CLI is not signed in.");
    const repository = await available(this.command, "gh", ["repo", "view", binding.repository, "--json", "nameWithOwner,url"]);
    if (!repository.ok) throw new Error(`The connected repository is unavailable: ${repository.error}`);
    await fs.mkdir(this.temporaryRoot, { recursive: true });
    const temporary = await fs.mkdtemp(path.join(this.temporaryRoot, "lancarbon-publish-"));
    try {
      const configured = await available(this.command, "gh", ["auth", "setup-git"]); if (!configured.ok) throw new Error(`Git authentication could not be prepared: ${configured.error}`);
      let cloned = await available(this.command, "gh", ["repo", "clone", binding.repository, temporary, "--", "--branch", binding.branch, "--single-branch", "--depth=1"], { timeout: 60_000 });
      for (let attempt = 0; !cloned.ok && transientNetworkFailure(cloned.error) && attempt < 2; attempt += 1) {
        for (const entry of await fs.readdir(temporary)) await fs.rm(path.join(temporary, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        await this.pause(800 * (attempt + 1));
        cloned = await available(this.command, "gh", ["repo", "clone", binding.repository, temporary, "--", "--branch", binding.branch, "--single-branch", "--depth=1"], { timeout: 60_000 });
      }
      if (!cloned.ok) throw new Error(`The publication branch could not be downloaded: ${cloned.error}`);
      for (const entry of await fs.readdir(temporary)) if (entry !== ".git") await fs.rm(path.join(temporary, entry), { recursive: true, force: true });
      for (const entry of await fs.readdir(htmlPath)) await fs.cp(path.join(htmlPath, entry), path.join(temporary, entry), { recursive: true });
      await fs.writeFile(path.join(temporary, ".nojekyll"), "", "utf8");
      const added = await available(this.command, "git", ["add", "--all"], { cwd: temporary }); if (!added.ok) throw new Error(`Website files could not be staged: ${added.error}`);
      const status = await available(this.command, "git", ["status", "--porcelain"], { cwd: temporary }); if (!status.ok) throw new Error(`Publication changes could not be checked: ${status.error}`);
      const changed = Boolean(status.output.trim());
      if (changed) {
        await available(this.command, "git", ["config", "user.name", "LanCarbon"], { cwd: temporary });
        await available(this.command, "git", ["config", "user.email", "lancarbon@users.noreply.github.com"], { cwd: temporary });
        const committed = await available(this.command, "git", ["commit", "-m", `Publish ${title.slice(0, 100)}`], { cwd: temporary }); if (!committed.ok) throw new Error(`The website commit failed: ${committed.error}`);
        const pushed = await available(this.command, "git", ["push", "origin", `HEAD:${binding.branch}`], { cwd: temporary }); if (!pushed.ok) throw new Error(`The website was committed locally but GitHub rejected the update: ${pushed.error}`);
      }
      const revision = await available(this.command, "git", ["rev-parse", "HEAD"], { cwd: temporary });
      if (!revision.ok || !/^[a-f0-9]{40}$/i.test(revision.output.trim())) throw new Error("GitHub accepted the website, but its published revision could not be verified.");
      const verifiedRevision = revision.output.trim();
      const deployment = await this.ensurePagesDeployment(binding.repository, verifiedRevision);
      const next = { ...binding, lastPublishedAt: new Date().toISOString(), lastCommit: verifiedRevision };
      return { binding: next, changed, deployment };
    } finally { await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  }
}
