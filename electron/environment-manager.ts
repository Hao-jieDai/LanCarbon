import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { EnvironmentInstallResult, EnvironmentSetupItem, EnvironmentToolId } from "../src/shared/types";

const execute = promisify(execFile);
const PYTHON_VERSION = "3.13.14";
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-amd64.exe`;
const PYTHON_SHA256 = "c54d9b9bbb8a36e6489363ddd01139707fd781d72f1f9e90c7ec65d0061368e0";
const MANUAL_URLS: Record<EnvironmentToolId, string> = {
  python: "https://www.python.org/downloads/windows/",
  "jupyter-book": "https://jupyterbook.org/stable/get-started/install/",
  git: "https://git-scm.com/download/win",
  "github-cli": "https://cli.github.com/"
};

interface CommandResult { stdout: string; stderr: string }
interface ReleaseAsset { name?: string; browser_download_url?: string; digest?: string; size?: number }

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
  const existing = base.Path ?? base.PATH ?? "";
  return { ...base, Path: [...pathEntries(toolsRoot), existing].filter(Boolean).join(path.delimiter), PATH: [...pathEntries(toolsRoot), existing].filter(Boolean).join(path.delimiter) };
}

async function firstExisting(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) if ((await fs.stat(candidate).catch(() => null))?.isFile()) return candidate;
  return undefined;
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

export class EnvironmentManager {
  private active?: { controller: AbortController; child?: ChildProcess };

  constructor(private readonly toolsRoot: string, private readonly tempRoot: string, private readonly logPath: string, private readonly fetcher: typeof fetch = fetch) {}

  environment(): NodeJS.ProcessEnv { return { ...environmentWithManagedTools(this.toolsRoot), TEMP: this.tempRoot, TMP: this.tempRoot }; }
  manualUrl(id: EnvironmentToolId): string { return MANUAL_URLS[id]; }

  cancel(): void {
    this.active?.controller.abort();
    this.active?.child?.kill();
  }

  async inspect(scope: "all" | "build" = "all"): Promise<EnvironmentSetupItem[]> {
    const [python, jupyter] = await Promise.all([
      this.inspectCommand("python", "Python", [path.join(this.toolsRoot, "Python", "python.exe"), "python", "py", "python3"], ["--version"], "Python 3.10 or newer", "about 28 MB"),
      this.inspectCommand("jupyter-book", "Jupyter Book 2", [path.join(this.toolsRoot, "JupyterBook", "Scripts", "jupyter.exe"), "jupyter"], ["book", "--version"], "Jupyter Book major version 2", "downloaded from PyPI")
    ]);
    const pythonVersion = /Python\s+(\d+)\.(\d+)/i.exec(python.version ?? "");
    if (python.status === "pass" && (!pythonVersion || Number(pythonVersion[1]) !== 3 || Number(pythonVersion[2]) < 10)) {
      python.status = "error"; python.detail = `${python.version ?? "The detected version"} is incompatible. LanCarbon requires Python 3.10 or newer.`;
    }
    if (jupyter.status === "pass" && !/(?:^|\s|:)v?2\./i.test(jupyter.version ?? jupyter.detail)) {
      jupyter.status = "error"; jupyter.detail = `${jupyter.version ?? "The detected version"} is incompatible. LanCarbon requires Jupyter Book 2.`;
    }
    if (scope === "build") return [python, jupyter];
    const [git, gh, network] = await Promise.all([
      this.inspectCommand("git", "Git", [path.join(this.toolsRoot, "Git", "cmd", "git.exe"), "git"], ["--version"], "Git for Windows", "about 40 MB"),
      this.inspectCommand("github-cli", "GitHub CLI", [path.join(this.toolsRoot, "GitHubCLI", "bin", "gh.exe"), path.join(this.toolsRoot, "GitHubCLI", "gh.exe"), "gh"], ["--version"], "GitHub CLI for Windows", "about 16 MB"),
      this.inspectNetwork()
    ]);
    const auth = await this.inspectAuthentication(gh);
    return [python, jupyter, git, gh, auth, network];
  }

  async install(id: EnvironmentToolId): Promise<EnvironmentInstallResult> {
    if (process.platform !== "win32") return { ok: false, error: "Managed installation is currently available only on Windows x64." };
    if (this.active) return { ok: false, error: "Another tool installation is already running." };
    const controller = new AbortController(); this.active = { controller };
    try {
      await fs.mkdir(this.toolsRoot, { recursive: true }); await fs.mkdir(this.tempRoot, { recursive: true }); await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await this.log(`Starting ${id} installation in ${this.toolsRoot}`);
      if (id === "python") await this.installPython(controller.signal);
      else if (id === "jupyter-book") await this.installJupyterBook(controller.signal);
      else await this.installGitHubArchive(id, controller.signal);
      const item = (await this.inspect()).find(value => value.id === id);
      if (!item || item.status !== "pass") throw new Error(`${item?.label ?? id} did not pass verification after installation.`);
      await this.log(`Completed ${id}: ${item.detail}`);
      return { ok: true, item };
    } catch (error) {
      const canceled = controller.signal.aborted;
      const message = canceled ? "Installation canceled. Already installed tools were not changed." : error instanceof Error ? error.message : "Tool installation failed";
      await this.log(`${canceled ? "Canceled" : "Failed"} ${id}: ${message}`);
      return { ok: false, ...(canceled ? { canceled: true } : {}), error: message };
    } finally { this.active = undefined; }
  }

  private async inspectCommand(id: EnvironmentToolId, label: string, candidates: string[], args: string[], requirement: string, downloadSize: string): Promise<EnvironmentSetupItem> {
    for (const candidate of candidates) {
      try {
        const result = await execute(candidate, args, { windowsHide: true, timeout: 12_000, maxBuffer: 1024 * 1024, env: this.environment() });
        const version = clean(String(result.stdout || result.stderr || ""));
        let executable = candidate;
        if (!path.isAbsolute(candidate) && process.platform === "win32") {
          const located = await execute("where.exe", [candidate], { windowsHide: true, timeout: 5_000, maxBuffer: 1024 * 1024, env: this.environment() }).catch(() => ({ stdout: candidate }));
          executable = clean(String(located.stdout)) || candidate;
        }
        const managed = path.resolve(executable).toLocaleLowerCase("en-US").startsWith(path.resolve(this.toolsRoot).toLocaleLowerCase("en-US") + path.sep.toLocaleLowerCase("en-US"));
        return { id, label, status: "pass", detail: `${version} · ${managed ? "Managed by LanCarbon" : "System installation"}`, version, path: executable, source: managed ? "managed" : "system", requirement, downloadSize, installable: true };
      } catch { /* Continue to the next supported command. */ }
    }
    return { id, label, status: "error", detail: `${label} was not found.`, requirement, downloadSize, installable: true };
  }

  private async inspectAuthentication(gh: EnvironmentSetupItem): Promise<EnvironmentSetupItem> {
    const base = { id: "github-auth" as const, label: "GitHub account", requirement: "GitHub CLI signed in to github.com", installable: false };
    if (gh.status !== "pass" || !gh.path) return { ...base, status: "error", detail: "Install GitHub CLI before signing in." };
    try {
      const result = await execute(gh.path, ["auth", "status", "--hostname", "github.com"], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, env: this.environment() });
      return { ...base, status: "pass", detail: clean(String(result.stdout || result.stderr || "")) || "GitHub CLI is signed in." };
    } catch { return { ...base, status: "warning", detail: "GitHub CLI is installed but is not signed in." }; }
  }

  private async inspectNetwork(): Promise<EnvironmentSetupItem> {
    const base = { id: "github-network" as const, label: "GitHub connection", requirement: "HTTPS access to api.github.com", installable: false };
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.fetcher("https://api.github.com/", { signal: controller.signal, headers: { "User-Agent": "LanCarbon/1.1.0" } });
      return response.ok ? { ...base, status: "pass", detail: "GitHub is reachable." } : { ...base, status: "warning", detail: `GitHub returned HTTP ${response.status}.` };
    } catch { return { ...base, status: "warning", detail: "GitHub could not be reached. Check the system proxy or TUN mode." }; }
    finally { clearTimeout(timer); }
  }

  private async installPython(signal: AbortSignal): Promise<void> {
    const installer = path.join(this.tempRoot, `python-${PYTHON_VERSION}-amd64.exe`);
    try {
      await this.download(PYTHON_URL, installer, PYTHON_SHA256, signal);
      const target = path.join(this.toolsRoot, "Python"); await fs.mkdir(target, { recursive: true });
      await this.run(installer, ["/quiet", "InstallAllUsers=0", `TargetDir=${target}`, "Include_pip=1", "Include_launcher=0", "PrependPath=0", "Shortcuts=0", "Include_test=0"], signal, 10 * 60_000);
    } finally { await fs.rm(installer, { force: true }).catch(() => undefined); }
  }

  private async installJupyterBook(signal: AbortSignal): Promise<void> {
    const managedPython = path.join(this.toolsRoot, "Python", "python.exe");
    const python = await firstExisting([managedPython]) ?? "python";
    try { await this.run(python, ["--version"], signal, 15_000); }
    catch { throw new Error("Install Python before installing Jupyter Book 2."); }
    const target = path.join(this.toolsRoot, "JupyterBook"), staging = `${target}.installing-${Date.now()}`;
    try {
      await this.run(python, ["-m", "venv", staging], signal, 2 * 60_000);
      const venvPython = path.join(staging, "Scripts", "python.exe");
      await this.run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--upgrade", "jupyter-book>=2,<3"], signal, 15 * 60_000);
      await this.run(path.join(staging, "Scripts", "jupyter.exe"), ["book", "--version"], signal, 30_000);
      await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); await fs.rename(staging, target);
    } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined); }
  }

  private async installGitHubArchive(id: "git" | "github-cli", signal: AbortSignal): Promise<void> {
    const repository = id === "git" ? "git-for-windows/git" : "cli/cli";
    const matcher = id === "git" ? /^MinGit-[\d.]+(?:-busybox)?-64-bit\.zip$/i : /^gh_[\d.]+_windows_amd64\.zip$/i;
    const response = await this.fetcher(`https://api.github.com/repos/${repository}/releases/latest`, { signal, headers: { "Accept": "application/vnd.github+json", "User-Agent": "LanCarbon/1.1.0" } });
    if (!response.ok) throw new Error(`GitHub release information returned HTTP ${response.status}.`);
    const release = await response.json() as { assets?: ReleaseAsset[] };
    const asset = release.assets?.find(value => matcher.test(value.name ?? "") && value.browser_download_url);
    if (!asset?.browser_download_url || !asset.name) throw new Error(`The official ${id === "git" ? "Git" : "GitHub CLI"} Windows archive was not found.`);
    const digest = asset.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1];
    if (!digest) throw new Error("The official release did not provide a SHA-256 digest; installation was stopped.");
    const archive = path.join(this.tempRoot, asset.name); await this.download(asset.browser_download_url, archive, digest, signal);
    const target = path.join(this.toolsRoot, id === "git" ? "Git" : "GitHubCLI");
    const staging = `${target}.installing-${Date.now()}`; await fs.mkdir(staging, { recursive: true });
    try {
      await this.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", archive, staging], signal, 5 * 60_000);
      const executable = await findFile(staging, id === "git" ? "git.exe" : "gh.exe"); if (!executable) throw new Error("The downloaded archive did not contain the expected executable.");
      const executableDirectory = path.dirname(executable);
      const sourceRoot = id === "github-cli" && path.basename(executableDirectory).toLocaleLowerCase("en-US") === "bin" ? path.dirname(executableDirectory) : staging;
      await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rename(sourceRoot, target);
    } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined); await fs.rm(archive, { force: true }).catch(() => undefined); }
  }

  private async download(url: string, destination: string, expectedSha256: string, signal: AbortSignal): Promise<void> {
    await this.log(`Downloading ${url}`);
    const response = await this.fetcher(url, { signal, redirect: "follow", headers: { "User-Agent": "LanCarbon/1.1.0" } });
    if (!response.ok) throw new Error(`Download returned HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error("SHA-256 verification failed; the downloaded file was discarded.");
    const temporary = `${destination}.download`;
    try { await fs.writeFile(temporary, bytes); await fs.rm(destination, { force: true }); await fs.rename(temporary, destination); }
    catch (error) { await fs.rm(temporary, { force: true }).catch(() => undefined); throw error; }
    await this.log(`Verified ${path.basename(destination)} (${bytes.length} bytes, SHA-256 ${actual})`);
  }

  private run(file: string, args: string[], signal: AbortSignal, timeout: number): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error("Installation canceled")); return; }
      const child = spawn(file, args, { windowsHide: true, env: this.environment(), stdio: ["ignore", "pipe", "pipe"] });
      if (this.active) this.active.child = child;
      let stdout = "", stderr = "";
      child.stdout?.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-100_000); }); child.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-100_000); });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${path.basename(file)} timed out.`)); }, timeout);
      const abort = () => child.kill(); signal.addEventListener("abort", abort, { once: true });
      child.once("error", error => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(error); });
      child.once("close", code => { clearTimeout(timer); signal.removeEventListener("abort", abort); void this.log(`${path.basename(file)} exited with ${code}\n${stdout}\n${stderr}`); if (signal.aborted) reject(new Error("Installation canceled")); else if (code === 0) resolve({ stdout, stderr }); else reject(new Error(clean(stderr || stdout) || `${path.basename(file)} exited with code ${code}`)); });
    });
  }

  private async log(message: string): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true }); await fs.appendFile(this.logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  }
}
