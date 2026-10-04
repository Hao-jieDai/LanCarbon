import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { EnvironmentInstallProgress, EnvironmentInstallResult, EnvironmentSetupItem, EnvironmentToolId, OperationResult } from "../src/shared/types";

const executeFile = promisify(execFile);
const PYTHON_VERSION = "3.13.14";
const PYTHON_ARCHIVE = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ARCHIVE}`;
const PYTHON_SHA256 = "90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907";
const NODE_VERSION = "24.21.0";
const NODE_ARCHIVE = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}`;
const NODE_SHA256 = "158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541";
const USER_AGENT = "LanCarbon/1.1.4";
const MANUAL_URLS: Record<EnvironmentToolId, string> = {
  python: "https://www.python.org/downloads/windows/",
  node: "https://nodejs.org/en/download/",
  "jupyter-book": "https://jupyterbook.org/stable/get-started/install/",
  git: "https://git-scm.com/download/win",
  "github-cli": "https://cli.github.com/"
};

interface CommandResult { stdout: string; stderr: string }
interface ReleaseAsset { name?: string; browser_download_url?: string; digest?: string; size?: number }
type CommandExecutor = (file: string, args: string[], options: Record<string, unknown>) => Promise<CommandResult>;
type Compatibility = (version: string) => boolean;
type ElevatedPermissionRepair = (toolsRoot: string, account: string) => Promise<void>;

const retryableFileCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
function fileErrorCode(error: unknown): string | undefined { return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined; }
function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Installation canceled")); return; }
    const timer = setTimeout(done, milliseconds);
    function done() { signal?.removeEventListener("abort", cancel); resolve(); }
    function cancel() { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(new Error("Installation canceled")); }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function retryWindowsFileOperation<T>(operation: () => Promise<T>, onRetry: (attempt: number, delayMs: number) => void = () => undefined, signal?: AbortSignal, delays = [250, 500, 1_000, 2_000, 4_000, 8_000]): Promise<T> {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new Error("Installation canceled");
    try { return await operation(); }
    catch (error) {
      if (!retryableFileCodes.has(fileErrorCode(error) ?? "") || attempt >= delays.length) throw error;
      const delayMs = delays[attempt++]; onRetry(attempt, delayMs); await abortableDelay(delayMs, signal);
    }
  }
}

const defaultElevatedPermissionRepair: ElevatedPermissionRepair = async (toolsRoot, account) => {
  const script = `$ErrorActionPreference='Stop'; $target=$env:LANCARBON_PERMISSION_PATH; New-Item -ItemType Directory -Force -Path $target | Out-Null; $quotedTarget='"'+$target.Replace('"','')+'"'; $quotedGrant='"'+$env:LANCARBON_PERMISSION_ACCOUNT.Replace('"','')+':(OI)(CI)M"'; $p=Start-Process -FilePath 'icacls.exe' -ArgumentList @($quotedTarget,'/inheritance:e','/grant',$quotedGrant,'/T','/C') -Verb RunAs -Wait -PassThru -WindowStyle Hidden; if($p.ExitCode -ne 0){exit $p.ExitCode}`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await executeFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024, env: { ...process.env, LANCARBON_PERMISSION_PATH: toolsRoot, LANCARBON_PERMISSION_ACCOUNT: account } });
};

function clean(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/)[0] ?? "";
}

function pathEntries(toolsRoot: string): string[] {
  return [
    path.join(toolsRoot, "JupyterBook", "Scripts"),
    path.join(toolsRoot, "Node"),
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
    },
    private readonly elevatedPermissionRepair: ElevatedPermissionRepair = defaultElevatedPermissionRepair
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
    const nodeCompatible: Compatibility = version => {
      const match = /v?(\d+)\.(\d+)/i.exec(version);
      const major = match ? Number(match[1]) : 0;
      return major >= 18;
    };
    const jupyterCompatible: Compatibility = version => /(?:^|\s|:)v?2\./i.test(version);
    const nodeCandidates = [...new Set([path.join(this.toolsRoot, "Node", "node.exe"), process.env.ProgramFiles && path.join(process.env.ProgramFiles, "nodejs", "node.exe"), process.env.ProgramW6432 && path.join(process.env.ProgramW6432, "nodejs", "node.exe"), "node"].filter((value): value is string => Boolean(value)))];
    const [python, node, jupyter] = await Promise.all([
      this.inspectCommand("python", "Python", [path.join(this.toolsRoot, "Python", "python.exe"), "python", "py", "python3"], ["--version"], "Python 3.10 or newer", "about 11 MB", pythonCompatible),
      this.inspectCommand("node", "Node.js", nodeCandidates, ["--version"], "Node.js 18 or newer", "about 38 MB", nodeCompatible),
      this.inspectCommand("jupyter-book", "Jupyter Book 2", [path.join(this.toolsRoot, "JupyterBook", "Scripts", "jupyter.exe"), "jupyter"], ["book", "--version"], "Jupyter Book major version 2", "downloaded from PyPI", jupyterCompatible)
    ]);
    if (scope === "build") return [python, node, jupyter];
    const [permission, git, gh, network] = await Promise.all([
      this.inspectToolsPermission(),
      this.inspectCommand("git", "Git", [path.join(this.toolsRoot, "Git", "cmd", "git.exe"), "git"], ["--version"], "Git for Windows", "about 40 MB", () => true),
      this.inspectCommand("github-cli", "GitHub CLI", [path.join(this.toolsRoot, "GitHubCLI", "bin", "gh.exe"), path.join(this.toolsRoot, "GitHubCLI", "gh.exe"), "gh"], ["--version"], "GitHub CLI for Windows", "about 16 MB", () => true),
      this.inspectNetwork()
    ]);
    const auth = await this.inspectAuthentication(gh);
    return [permission, python, node, jupyter, git, gh, auth, network];
  }

  async install(id: EnvironmentToolId): Promise<EnvironmentInstallResult> {
    if (process.platform !== "win32") return { ok: false, error: "Managed installation is currently available only on Windows x64." };
    if (this.active) return { ok: false, error: "Another tool installation is already running." };
    const existing = (await this.inspect()).find(item => item.id === id);
    if (existing?.status === "pass" && existing.source === "system") return { ok: true, item: existing };
    const controller = new AbortController();
    this.active = { id, controller };
    try {
      await fs.mkdir(this.tempRoot, { recursive: true });
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      try { await this.assertToolsWritable(undefined, controller.signal); }
      catch (error) {
        if (retryableFileCodes.has(fileErrorCode(error) ?? "")) throw new Error(`LanCarbon cannot write to ${this.toolsRoot}. Select Repair folder permissions in Environment Setup, approve the Windows prompt if shown, then retry.`);
        throw error;
      }
      this.progress(id, "preparing", `Preparing a private LanCarbon copy of ${existing?.label ?? id}…`);
      await this.log(`Starting ${id} managed installation in ${this.toolsRoot}`);
      if (id === "python") await this.installPython(id, controller.signal);
      else if (id === "node") await this.installNode(id, controller.signal);
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

  async repairPermissions(): Promise<OperationResult> {
    if (process.platform !== "win32") return { ok: false, error: "Automatic folder-permission repair is currently available only on Windows." };
    if (this.active) return { ok: false, error: "Wait for the current tool installation to finish before repairing permissions." };
    try {
      const existing = await fs.lstat(this.toolsRoot).catch(() => null);
      if (existing?.isSymbolicLink()) throw new Error("The managed Tools path is a symbolic link. Choose a normal LanCarbon installation folder before repairing permissions.");
      const identity = await this.command("whoami.exe", [], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024, env: process.env });
      const account = clean(identity.stdout || identity.stderr || "");
      if (!account || /[\r\n"]/.test(account)) throw new Error("LanCarbon could not identify the current Windows account.");
      const args = [this.toolsRoot, "/inheritance:e", "/grant", `${account}:(OI)(CI)M`, "/T", "/C"];
      try {
        await this.command("icacls.exe", args, { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024, env: process.env });
      } catch {
        await this.elevatedPermissionRepair(this.toolsRoot, account);
      }
      await this.assertToolsWritable();
      await this.log(`Repaired managed Tools permissions for ${account}`).catch(() => undefined);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Folder-permission repair failed";
      await this.log(`Failed Tools permission repair: ${message}`).catch(() => undefined);
      return { ok: false, error: `LanCarbon could not repair the managed Tools folder. ${message}` };
    }
  }

  private async inspectToolsPermission(): Promise<EnvironmentSetupItem> {
    try {
      await this.assertToolsWritable([100, 250]);
      return { id: "tools-permission", label: "Managed tools folder", status: "pass", detail: `${this.toolsRoot} is writable.`, requirement: "Create, update and remove managed tools", installable: false };
    } catch (error) {
      const code = fileErrorCode(error);
      const detail = retryableFileCodes.has(code ?? "") ? `LanCarbon cannot write to ${this.toolsRoot}. Windows permissions or security software may be blocking it.` : error instanceof Error ? error.message : `LanCarbon cannot use ${this.toolsRoot}.`;
      return { id: "tools-permission", label: "Managed tools folder", status: "error", detail, requirement: "Writable LanCarbon\\Tools folder", installable: false, repairable: true };
    }
  }

  private async assertToolsWritable(delays?: number[], signal?: AbortSignal): Promise<void> {
    const existing = await fs.lstat(this.toolsRoot).catch(() => null);
    if (existing?.isSymbolicLink()) throw new Error("The managed Tools path must not be a symbolic link.");
    await retryWindowsFileOperation(() => fs.mkdir(this.toolsRoot, { recursive: true }), () => undefined, signal, delays);
    const probe = path.join(this.toolsRoot, `.lancarbon-write-test-${process.pid}-${Date.now()}`);
    const source = path.join(probe, "write.tmp"), renamed = path.join(probe, "rename.tmp");
    try {
      await retryWindowsFileOperation(() => fs.mkdir(probe), () => undefined, signal, delays);
      await retryWindowsFileOperation(() => fs.writeFile(source, "LanCarbon permission check", "utf8"), () => undefined, signal, delays);
      await retryWindowsFileOperation(() => fs.rename(source, renamed), () => undefined, signal, delays);
    } finally {
      await fs.rm(probe, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
    }
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
      await this.fileOperation(id, "portable Python folder", () => fs.mkdir(staging, { recursive: true }), signal);
      await this.run("tar.exe", ["-xf", archive, "-C", staging], signal, 5 * 60_000);
      const pth = await findFile(staging, "python313._pth", 1);
      if (!pth) throw new Error("The Python archive did not contain its path configuration.");
      const original = await fs.readFile(pth, "utf8");
      const configured = original.replace(/^#import site$/m, "import site") + "\n../JupyterBook/Lib/site-packages\n";
      await fs.writeFile(pth, configured, "utf8");
      await this.run(path.join(staging, "python.exe"), ["--version"], signal, 30_000);
      await this.replaceDirectory(id, target, staging, () => this.run(path.join(target, "python.exe"), ["--version"], signal, 30_000), signal);
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(archive, { force: true }).catch(() => undefined);
      await fs.rm(`${archive}.download`, { force: true }).catch(() => undefined);
    }
  }

  private async installNode(id: EnvironmentToolId, signal: AbortSignal): Promise<void> {
    const archive = path.join(this.tempRoot, NODE_ARCHIVE);
    const target = path.join(this.toolsRoot, "Node");
    const staging = `${target}.installing-${Date.now()}`;
    try {
      await this.download(id, NODE_URL, archive, NODE_SHA256, signal);
      this.progress(id, "installing", "Extracting portable Node.js into LanCarbon\\Tools…");
      await this.fileOperation(id, "portable Node.js folder", () => fs.mkdir(staging, { recursive: true }), signal);
      await this.run("tar.exe", ["-xf", archive, "-C", staging], signal, 5 * 60_000);
      const executable = await findFile(staging, "node.exe", 2);
      if (!executable) throw new Error("The Node.js archive did not contain node.exe.");
      const sourceRoot = path.dirname(executable);
      await this.run(executable, ["--version"], signal, 30_000);
      await this.replaceDirectory(id, target, sourceRoot, () => this.run(path.join(target, "node.exe"), ["--version"], signal, 30_000), signal);
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(archive, { force: true }).catch(() => undefined);
      await fs.rm(`${archive}.download`, { force: true }).catch(() => undefined);
    }
  }

  private async installJupyterBook(id: EnvironmentToolId, signal: AbortSignal): Promise<void> {
    let checks = await this.inspect("build");
    if (checks.find(item => item.id === "python")?.status !== "pass") {
      this.progress(id, "preparing", "Python is required. Installing a managed Python copy first…");
      await this.installPython(id, signal); checks = await this.inspect("build");
    }
    if (checks.find(item => item.id === "node")?.status !== "pass") {
      this.progress(id, "preparing", "Node.js is required. Installing a managed Node.js copy first…");
      await this.installNode(id, signal); checks = await this.inspect("build");
    }
    const pythonItem = checks.find(item => item.id === "python"), nodeItem = checks.find(item => item.id === "node");
    if (pythonItem?.status !== "pass" || !pythonItem.path) throw new Error("LanCarbon could not prepare Python for Jupyter Book 2.");
    if (nodeItem?.status !== "pass" || !nodeItem.path) throw new Error("LanCarbon could not prepare Node.js for Jupyter Book 2.");
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
      await this.fileOperation(id, "Jupyter Book installation folder", () => fs.mkdir(staging, { recursive: true }), signal);
      const launcher = "import runpy,sys; w=sys.argv[1]; sys.argv=['pip',*sys.argv[2:]]; sys.path.insert(0,w); runpy.run_module('pip',run_name='__main__')";
      await this.run(pythonItem.path, ["-c", launcher, wheelPath, "install", "--disable-pip-version-check", "--no-cache-dir", "--prefix", staging, "jupyter-book>=2,<3"], signal, 15 * 60_000, this.environment(), output => this.progress(id, "installing", `Installing Jupyter Book: ${output}`));
      await this.replaceDirectory(id, target, staging, () => this.run(path.join(target, "Scripts", "jupyter.exe"), ["book", "--version"], signal, 60_000), signal);
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
      await this.fileOperation(id, `${id === "git" ? "Git" : "GitHub CLI"} installation folder`, () => fs.mkdir(staging, { recursive: true }), signal);
      await this.run("tar.exe", ["-xf", archive, "-C", staging], signal, 5 * 60_000);
      const executable = await findFile(staging, id === "git" ? "git.exe" : "gh.exe");
      if (!executable) throw new Error("The downloaded archive did not contain the expected executable.");
      const executableDirectory = path.dirname(executable);
      const sourceRoot = id === "github-cli" && path.basename(executableDirectory).toLocaleLowerCase("en-US") === "bin" ? path.dirname(executableDirectory) : staging;
      const executableRelativePath = path.relative(sourceRoot, executable);
      await this.replaceDirectory(id, target, sourceRoot, () => this.run(path.join(target, executableRelativePath), ["--version"], signal, 30_000), signal);
    } finally {
      await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      await fs.rm(archive, { force: true }).catch(() => undefined);
      await fs.rm(`${archive}.download`, { force: true }).catch(() => undefined);
    }
  }

  private fileOperation<T>(id: EnvironmentToolId, description: string, operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return retryWindowsFileOperation(operation, (attempt, delayMs) => this.progress(id, "installing", `Windows is still using the ${description}. Waiting ${delayMs} ms before retry ${attempt}…`), signal).catch(error => {
      if (retryableFileCodes.has(fileErrorCode(error) ?? "")) {
        const wrapped = new Error(`Windows continued to block the ${description} after several automatic retries. Close programs that may be scanning LanCarbon\\Tools, wait a moment, and retry. If the problem continues, use Repair folder permissions.`);
        Object.assign(wrapped, { code: fileErrorCode(error), cause: error });
        throw wrapped;
      }
      throw error;
    });
  }

  private async replaceDirectory(id: EnvironmentToolId, target: string, staging: string, verify: () => Promise<unknown>, signal: AbortSignal): Promise<void> {
    const backup = `${target}.backup-${Date.now()}`;
    const hasTarget = Boolean(await fs.stat(target).catch(() => null));
    try {
      if (hasTarget) await this.fileOperation(id, "previous managed tool folder", () => fs.rename(target, backup), signal);
      await this.fileOperation(id, "new managed tool folder", () => fs.rename(staging, target), signal);
      await verify();
      await fs.rm(backup, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
    } catch (error) {
      if (await fs.stat(target).catch(() => null)) await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
      if (hasTarget && await fs.stat(backup).catch(() => null)) await retryWindowsFileOperation(() => fs.rename(backup, target), () => undefined, undefined, [250, 500, 1_000, 2_000]).catch(() => undefined);
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
    await fs.rm(destination, { force: true });
    await this.fileOperation(id, "verified download", () => fs.rename(temporary, destination), signal);
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
