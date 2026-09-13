import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { EnvironmentInstallProgress, EnvironmentInstallResult, EnvironmentSetupItem, EnvironmentToolId } from "../src/shared/types";

const executeFile = promisify(execFile);
const PYTHON_VERSION = "3.13.14";
const PYTHON_ARCHIVE = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ARCHIVE}`;
const PYTHON_SHA256 = "90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907";
const USER_AGENT = "LanCarbon/1.1.2";
const MANUAL_URLS: Record<EnvironmentToolId, string> = {
  python: "https://www.python.org/downloads/windows/",
  "jupyter-book": "https://jupyterbook.org/stable/get-started/install/",
  git: "https://git-scm.com/download/win",
  "github-cli": "https://cli.github.com/"
};

interface CommandResult { stdout: string; stderr: string }
interface ReleaseAsset { name?: string; browser_download_url?: string; digest?: string; size?: number }
type CommandExecutor = (file: string, args: string[], options: Record<string, unknown>) => Promise<CommandResult>;
type Compatibility = (version: string) => boolean;

function clean(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/)[0] ?? "";
}

function pathEntries(toolsRoot: string): string[] {
  return [
    path.join(toolsRoot, "JupyterBook", "Scripts"),
    path.join(toolsRoot, "Python"),
    path.join(toolsRoot, "Python", "Scripts"),
    path.join(toolsRoot, "Git", "cmd"),
    path.join(toolsRoot, "Git", "bin"),
    path.join(toolsRoot, "GitHubCLI", "bin"),
    path.join(toolsRoot, "GitHubCLI")
  ];
}

export function environmentWithManagedTools(toolsRoot: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const existingPath = base.Path ?? base.PATH ?? "";
  const managedPath = [...pathEntries(toolsRoot), existingPath].filter(Boolean).join(path.delimiter);
  const sitePackages = path.join(toolsRoot, "JupyterBook", "Lib", "site-packages");
  const pythonPath = [sitePackages, base.PYTHONPATH].filter(Boolean).join(path.delimiter);
  return { ...base, Path: managedPath, PATH: managedPath, PYTHONPATH: pythonPath };
}

async function findFile(root: string, name: string, depth = 3): Promise<string | undefined> {
  if (depth < 0 || !(await fs.stat(root).catch(() => null))?.isDirectory()) return undefined;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")) return child;
    if (entry.isDirectory()) { const found = await findFile(child, name, depth - 1); if (found) return found; }
  }
  return undefined;
}

function inside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class EnvironmentManager {
  private active?: { id: EnvironmentToolId; controller: AbortController; child?: ChildProcess };

  constructor(
    private readonly toolsRoot: string,
    private readonly tempRoot: string,
    private readonly logPath: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly reportProgress: (progress: EnvironmentInstallProgress) => void = () => undefined,
    private readonly command: CommandExecutor = async (file, args, options) => {
      const result = await executeFile(file, args, options);
      return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
    }
  ) {}

  environment(): NodeJS.ProcessEnv { return { ...environmentWithManagedTools(this.toolsRoot), TEMP: this.tempRoot, TMP: this.tempRoot }; }
  manualUrl(id: EnvironmentToolId): string { return MANUAL_URLS[id]; }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.progress(active.id, "canceling", "Cancel requested. Stopping the current operation and removing temporary files…");
    active.controller.abort();
    if (active.child?.pid) {
      if (process.platform === "win32") spawn("taskkill.exe", ["/pid", String(active.child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else active.child.kill("SIGTERM");
    }
  }

  async inspect(scope: "all" | "build" = "all"): Promise<EnvironmentSetupItem[]> {
    const pythonCompatible: Compatibility = version => {
      const match = /Python\s+(\d+)\.(\d+)/i.exec(version);
      return Boolean(match && Number(match[1]) === 3 && Number(match[2]) >= 10);
    };
    const jupyterCompatible: Compatibility = version => /(?:^|\s|:)v?2\./i.test(version);
    const [python, jupyter] = await Promise.all([
      this.inspectCommand("python", "Python", [path.join(this.toolsRoot, "Python", "python.exe"), "python", "py", "python3"], ["--version"], "Python 3.10 or newer", "about 11 MB", pythonCompatible),
      this.inspectCommand("jupyter-book", "Jupyter Book 2", [path.join(this.toolsRoot, "JupyterBook", "Scripts", "jupyter.exe"), "jupyter"], ["book", "--version"], "Jupyter Book major version 2", "downloaded from PyPI", jupyterCompatible)
    ]);
    if (scope === "build") return [python, jupyter];
    const [git, gh, network] = await Promise.all([
      this.inspectCommand("git", "Git", [path.join(this.toolsRoot, "Git", "cmd", "git.exe"), "git"], ["--version"], "Git for Windows", "about 40 MB", () => true),
      this.inspectCommand("github-cli", "GitHub CLI", [path.join(this.toolsRoot, "GitHubCLI", "bin", "gh.exe"), path.join(this.toolsRoot, "GitHubCLI", "gh.exe"), "gh"], ["--version"], "GitHub CLI for Windows", "about 16 MB", () => true),
      this.inspectNetwork()
    ]);
    const auth = await this.inspectAuthentication(gh);
    return [python, jupyter, git, gh, auth, network];
  }

  async install(id: EnvironmentToolId): Promise<EnvironmentInstallResult> {
    if (process.platform !== "win32") return { ok: false, error: "Managed installation is currently available only on Windows x64." };
    if (this.active) return { ok: false, error: "Another tool installation is already running." };
    const existing = (await this.inspect()).find(item => item.id === id);
    if (existing?.status === "pass" && existing.source === "system") return { ok: true, item: existing };
    const controller = new AbortController();
    this.active = { id, controller };
    try {
      await fs.mkdir(this.toolsRoot, { recursive: true });
      await fs.mkdir(this.tempRoot, { recursive: true });
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      this.progress(id, "preparing", `Preparing a private LanCarbon copy of ${existing?.label ?? id}…`);
      await this.log(`Starting ${id} managed installation in ${this.toolsRoot}`);
      if (id === "python") await this.installPython(id, controller.signal);
      else if (id === "jupyter-book") await this.installJupyterBook(id, controller.signal);
      else await this.installGitHubArchive(id, controller.signal);
      this.progress(id, "checking", "Installation finished. Verifying the managed tool…");
      const item = (await this.inspect()).find(value => value.id === id);
      if (!item || item.status !== "pass") throw new Error(`${item?.label ?? id} did not pass verification after installation.`);
      await this.log(`Completed ${id}: ${item.detail}`);
      return { ok: true, item };
    } catch (error) {
      const canceled = controller.signal.aborted;
      const message = canceled ? "Installation canceled. System tools and the previous managed copy were not changed." : error instanceof Error ? error.message : "Tool installation failed";
      await this.log(`${canceled ? "Canceled" : "Failed"} ${id}: ${message}`);
      return { ok: false, ...(canceled ? { canceled: true } : {}), error: message };
    } finally { this.active = undefined; }
  }

  private async inspectCommand(id: EnvironmentToolId, label: string, candidates: string[], args: string[], requirement: string, downloadSize: string, compatible: Compatibility): Promise<EnvironmentSetupItem> {
    let incompatible: { version: string; executable: string; managed: boolean } | undefined;
    for (const candidate of candidates) {
      try {
        const commandEnvironment = id === "github-cli" ? { ...this.environment(), GH_CONFIG_DIR: path.join(this.tempRoot, "gh-version-check") } : this.environment();
        const result = await this.command(candidate, args, { windowsHide: true, timeout: 12_000, maxBuffer: 1024 * 1024, env: commandEnvironment });
        const version = clean(result.stdout || result.stderr || "");
        let executable = candidate;
        if (!path.isAbsolute(candidate) && process.platform === "win32") {
          const located = await this.command("where.exe", [candidate], { windowsHide: true, timeout: 5_000, maxBuffer: 1024 * 1024, env: commandEnvironment }).catch(() => ({ stdout: candidate, stderr: "" }));
          executable = clean(located.stdout) || candidate;
        }
        const managed = path.isAbsolute(executable) && inside(executable, this.toolsRoot);
        if (!compatible(version)) { incompatible ??= { version, executable, managed }; continue; }
        return {
          id, label, status: "pass", version, path: executable, source: managed ? "managed" : "system", requirement, downloadSize,
          detail: `${version} · ${managed ? "Managed by LanCarbon" : "System installation — no additional install needed"}`,
          installable: managed
        };
      } catch { /* Try every supported command before reporting failure. */ }
    }
    if (incompatible) return { id, label, status: "error", version: incompatible.version, path: incompatible.executable, source: incompatible.managed ? "managed" : "system", detail: `${incompatible.version} is incompatible. ${requirement} is required.`, requirement, downloadSize, installable: true };
    return { id, label, status: "error", detail: `${label} was not found.`, requirement, downloadSize, installable: true };
  }

  private async inspectAuthentication(gh: EnvironmentSetupItem): Promise<EnvironmentSetupItem> {
    const base = { id: "github-auth" as const, label: "GitHub account", requirement: "GitHub CLI signed in to github.com", installable: false };
    if (gh.status !== "pass" || !gh.path) return { ...base, status: "error" as const, detail: "Install GitHub CLI before signing in." };
    try {
      const result = await this.command(gh.path, ["auth", "status", "--hostname", "github.com"], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, env: this.environment() });
      return { ...base, status: "pass" as const, detail: clean(result.stdout || result.stderr || "") || "GitHub CLI is signed in." };
    } catch { return { ...base, status: "warning" as const, detail: "GitHub CLI is installed but is not signed in." }; }
  }

  private async inspectNetwork(): Promise<EnvironmentSetupItem> {
    const base = { id: "github-network" as const, label: "GitHub connection", requirement: "HTTPS access to api.github.com", installable: false };
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.fetcher("https://api.github.com/", { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
      return response.ok ? { ...base, status: "pass" as const, detail: "GitHub is reachable." } : { ...base, status: "warning" as const, detail: `GitHub returned HTTP ${response.status}.` };
    } catch { return { ...base, status: "warning" as const, detail: "GitHub could not be reached. Check the system proxy or TUN mode." }; }
    finally { clearTimeout(timer); }
  }

  private async installPython(id: EnvironmentToolId, signal: AbortSignal): Promise<void> {
    const archive = path.join(this.tempRoot, PYTHON_ARCHIVE);
    const target = path.join(this.toolsRoot, "Python");
    const staging = `${target}.installing-${Date.now()}`;
    try {
      await this.download(id, PYTHON_URL, archive, PYTHON_SHA256, signal);
      this.progress(id, "installing", "Extracting portable Python into LanCarbon\\Tools…");
      await fs.mkdir(staging, { recursive: true });
      await this.run("tar.exe", ["-xf", archive, "-C", staging], signal, 5 * 60_000);
      const pth = await findFile(staging, "python313._pth", 1);
      if (!pth) throw new Error("The Python archive did not contain its path configuration.");
      const original = await fs.readFile(pth, "utf8");
      const configured = original.replace(/^#import site$/m, "import site") + "\n../JupyterBook/Lib/site-packages\n";
      await fs.writeFile(pth, configured, "utf8");
      await this.run(path.join(staging, "python.exe"), ["--version"], signal, 30_000);
      await this.replaceDirectory(target, staging, () => this.run(path.join(target, "python.exe"), ["--version"], signal, 30_000));
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(archive, { force: true }).catch(() => undefined);
      await fs.rm(`${archive}.download`, { force: true }).catch(() => undefined);
    }
  }

  private async installJupyterBook(id: EnvironmentToolId, signal: AbortSignal): Promise<void> {
    const pythonItem = (await this.inspect("build")).find(item => item.id === "python");
    if (pythonItem?.status !== "pass" || !pythonItem.path) throw new Error("Install Python before installing Jupyter Book 2.");
    const metadataResponse = await this.fetcher("https://pypi.org/pypi/pip/json", { signal, headers: { "User-Agent": USER_AGENT } });
    if (!metadataResponse.ok) throw new Error(`PyPI returned HTTP ${metadataResponse.status}.`);
    const metadata = await metadataResponse.json() as { urls?: Array<{ filename?: string; url?: string; digests?: { sha256?: string } }> };
    const wheel = metadata.urls?.find(item => /-py3-none-any\.whl$/i.test(item.filename ?? "") && item.url && item.digests?.sha256);
    if (!wheel?.url || !wheel.filename || !wheel.digests?.sha256) throw new Error("PyPI did not provide a verifiable pip wheel.");
    const wheelPath = path.join(this.tempRoot, wheel.filename);
    const target = path.join(this.toolsRoot, "JupyterBook");
    const staging = `${target}.installing-${Date.now()}`;
    try {
      await this.download(id, wheel.url, wheelPath, wheel.digests.sha256, signal);
      this.progress(id, "installing", "Installing Jupyter Book into an isolated LanCarbon directory…");
      await fs.mkdir(staging, { recursive: true });
      const launcher = "import runpy,sys; w=sys.argv[1]; sys.argv=['pip',*sys.argv[2:]]; sys.path.insert(0,w); runpy.run_module('pip',run_name='__main__')";
      await this.run(pythonItem.path, ["-c", launcher, wheelPath, "install", "--disable-pip-version-check", "--no-cache-dir", "--prefix", staging, "jupyter-book>=2,<3"], signal, 15 * 60_000, this.environment(), output => this.progress(id, "installing", `Installing Jupyter Book: ${output}`));
      await this.replaceDirectory(target, staging, () => this.run(path.join(target, "Scripts", "jupyter.exe"), ["book", "--version"], signal, 60_000));
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(wheelPath, { force: true }).catch(() => undefined);
      await fs.rm(`${wheelPath}.download`, { force: true }).catch(() => undefined);
    }
  }

  private async installGitHubArchive(id: "git" | "github-cli", signal: AbortSignal): Promise<void> {
    const repository = id === "git" ? "git-for-windows/git" : "cli/cli";
    const matcher = id === "git" ? /^MinGit-[\d.]+(?:-busybox)?-64-bit\.zip$/i : /^gh_[\d.]+_windows_amd64\.zip$/i;
    this.progress(id, "preparing", `Requesting the latest ${id === "git" ? "Git" : "GitHub CLI"} release information…`);
    const response = await this.fetcher(`https://api.github.com/repos/${repository}/releases/latest`, { signal, headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`GitHub release information returned HTTP ${response.status}.`);
    const release = await response.json() as { assets?: ReleaseAsset[] };
    const asset = release.assets?.find(value => matcher.test(value.name ?? "") && value.browser_download_url);
    if (!asset?.browser_download_url || !asset.name) throw new Error(`The official ${id === "git" ? "Git" : "GitHub CLI"} Windows archive was not found.`);
    const digest = asset.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1];
    if (!digest) throw new Error("The official release did not provide a SHA-256 digest; installation was stopped.");
    const archive = path.join(this.tempRoot, asset.name);
    const target = path.join(this.toolsRoot, id === "git" ? "Git" : "GitHubCLI");
    const staging = `${target}.installing-${Date.now()}`;
    try {
      await this.download(id, asset.browser_download_url, archive, digest, signal, asset.size);
      this.progress(id, "installing", `Extracting ${id === "git" ? "Git" : "GitHub CLI"} into LanCarbon\\Tools…`);
      await fs.mkdir(staging, { recursive: true });
      await this.run("tar.exe", ["-xf", archive, "-C", staging], signal, 5 * 60_000);
      const executable = await findFile(staging, id === "git" ? "git.exe" : "gh.exe");
      if (!executable) throw new Error("The downloaded archive did not contain the expected executable.");
      const executableDirectory = path.dirname(executable);
      const sourceRoot = id === "github-cli" && path.basename(executableDirectory).toLocaleLowerCase("en-US") === "bin" ? path.dirname(executableDirectory) : staging;
      const executableRelativePath = path.relative(sourceRoot, executable);
      await this.replaceDirectory(target, sourceRoot, () => this.run(path.join(target, executableRelativePath), ["--version"], signal, 30_000));
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(archive, { force: true }).catch(() => undefined);
      await fs.rm(`${archive}.download`, { force: true }).catch(() => undefined);
    }
  }

  private async replaceDirectory(target: string, staging: string, verify: () => Promise<unknown>): Promise<void> {
    const backup = `${target}.backup-${Date.now()}`;
    const hasTarget = Boolean(await fs.stat(target).catch(() => null));
    try {
      if (hasTarget) await fs.rename(target, backup);
      await fs.rename(staging, target);
      await verify();
      await fs.rm(backup, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
    } catch (error) {
      if (await fs.stat(target).catch(() => null)) await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      if (hasTarget && await fs.stat(backup).catch(() => null)) await fs.rename(backup, target).catch(() => undefined);
      throw error;
    }
  }

  private async download(id: EnvironmentToolId, url: string, destination: string, expectedSha256: string, signal: AbortSignal, expectedSize?: number): Promise<void> {
    this.progress(id, "downloading", `Connecting to ${new URL(url).hostname}…`, 0, expectedSize);
    await this.log(`Downloading ${url}`);
    const response = await this.fetcher(url, { signal, redirect: "follow", headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Download returned HTTP ${response.status}.`);
    if (!response.body) throw new Error("The download response did not contain a readable body.");
    const total = Number(response.headers.get("content-length")) || expectedSize;
    const temporary = `${destination}.download`;
    const handle = await fs.open(temporary, "w");
    const hash = createHash("sha256");
    let received = 0; let lastReport = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        if (signal.aborted) { await reader.cancel(); throw new Error("Installation canceled"); }
        const chunk = await reader.read(); if (chunk.done) break;
        const bytes = Buffer.from(chunk.value); await handle.write(bytes); hash.update(bytes); received += bytes.length;
        if (Date.now() - lastReport > 100) { this.progress(id, "downloading", `Downloading ${path.basename(destination)}…`, received, total); lastReport = Date.now(); }
      }
    } finally { await handle.close(); }
    const actual = hash.digest("hex");
    this.progress(id, "verifying", `Verifying SHA-256 for ${path.basename(destination)}…`, received, total);
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) { await fs.rm(temporary, { force: true }); throw new Error("SHA-256 verification failed; the downloaded file was discarded."); }
    await fs.rm(destination, { force: true }); await fs.rename(temporary, destination);
    await this.log(`Verified ${path.basename(destination)} (${received} bytes, SHA-256 ${actual})`);
  }

  private run(file: string, args: string[], signal: AbortSignal, timeout: number, env = this.environment(), onOutput?: (message: string) => void): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error("Installation canceled")); return; }
      const child = spawn(file, args, { windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"] });
      if (this.active) this.active.child = child;
      let stdout = "", stderr = "", settled = false;
      const finish = (error?: Error, result?: CommandResult) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort); if (this.active?.child === child) this.active.child = undefined; error ? reject(error) : resolve(result!); };
      let lastOutput = 0;
      const capture = (stream: "stdout" | "stderr", chunk: unknown) => {
        const value = String(chunk); if (stream === "stdout") stdout = (stdout + value).slice(-100_000); else stderr = (stderr + value).slice(-100_000);
        const message = clean(value).slice(0, 180); if (onOutput && message && Date.now() - lastOutput > 250) { onOutput(message); lastOutput = Date.now(); }
      };
      child.stdout?.on("data", chunk => capture("stdout", chunk));
      child.stderr?.on("data", chunk => capture("stderr", chunk));
      const stopTree = () => { if (child.pid && process.platform === "win32") spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill("SIGTERM"); };
      const timer = setTimeout(() => { stopTree(); finish(new Error(`${path.basename(file)} timed out.`)); }, timeout);
      const abort = () => { stopTree(); finish(new Error("Installation canceled")); };
      signal.addEventListener("abort", abort, { once: true });
      child.once("error", error => finish(error));
      child.once("close", code => { void this.log(`${path.basename(file)} exited with ${code}\n${stdout}\n${stderr}`); if (signal.aborted) finish(new Error("Installation canceled")); else if (code === 0) finish(undefined, { stdout, stderr }); else finish(new Error(clean(stderr || stdout) || `${path.basename(file)} exited with code ${code}`)); });
    });
  }

  private progress(tool: EnvironmentToolId, phase: EnvironmentInstallProgress["phase"], message: string, receivedBytes?: number, totalBytes?: number): void {
    this.reportProgress({ tool, phase, message, ...(receivedBytes === undefined ? {} : { receivedBytes }), ...(totalBytes === undefined ? {} : { totalBytes }) });
  }

  private async log(message: string): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    await fs.appendFile(this.logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  }
}
