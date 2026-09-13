import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assetId, assetReferences } from "../src/shared/assets";
import { collectPageIds, effectiveExportPath } from "../src/shared/books";
import { validateBookContent } from "../src/shared/bookValidation";
import type { Book, BookCheckIssue, BuildEnvironmentCheck, WorkspaceFile } from "../src/shared/types";
import type { AssetStore } from "./assets";
import { exportBookToDirectory } from "./book-exporter";
import { generateBookProject } from "../src/shared/jupyter-book";

const run = promisify(execFile);
const MARKER = ".lancarbon-build.json";
export type BuildCommand = (file: string, args: string[], options: { cwd: string; windowsHide: boolean; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv }) => Promise<{ stdout?: string; stderr?: string }>;
export type EnvironmentCommand = (file: string, args: string[]) => Promise<{ stdout?: string; stderr?: string }>;

const runEnvironmentCommand: EnvironmentCommand = (file, args) => run(file, args, { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 });

async function environmentVersion(command: EnvironmentCommand, candidates: Array<{ file: string; args: string[] }>): Promise<{ ok: true; output: string; file: string } | { ok: false }> {
  for (const candidate of candidates) {
    try {
      const result = await command(candidate.file, candidate.args);
      const output = String(result.stdout || result.stderr || "").replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/)[0];
      return { ok: true, output, file: candidate.file };
    } catch { /* Try the next supported launcher. */ }
  }
  return { ok: false };
}

export async function inspectBuildEnvironment(command: EnvironmentCommand = runEnvironmentCommand): Promise<BuildEnvironmentCheck[]> {
  const python = await environmentVersion(command, [{ file: "python", args: ["--version"] }, { file: "py", args: ["--version"] }, { file: "python3", args: ["--version"] }]);
  const node = await environmentVersion(command, [{ file: "node", args: ["--version"] }]);
  const jupyterBook = await environmentVersion(command, [{ file: "jupyter", args: ["book", "--version"] }]);
  const version = jupyterBook.ok ? /(?:^|\s)v?(\d+)\.(\d+)(?:\.\d+)?/i.exec(jupyterBook.output) : null;
  const compatible = Boolean(jupyterBook.ok && version && Number(version[1]) >= 2);
  const nodeVersion = node.ok ? /v?(\d+)\.(\d+)/i.exec(node.output) : null;
  const nodeMajor = nodeVersion ? Number(nodeVersion[1]) : 0;
  const nodeCompatible = node.ok && nodeMajor >= 18;
  return [
    { id: "python", label: "Python", status: python.ok ? "pass" : "error", detail: python.ok ? `${python.output} (${python.file})` : "Python was not found. Install Python 3 and restart LanCarbon." },
    { id: "node", label: "Node.js", status: nodeCompatible ? "pass" : "error", detail: nodeCompatible ? `${node.output} (${node.file})` : node.ok ? `${node.output || "Node.js detected"}. LanCarbon requires Node.js 18 or newer.` : "Node.js was not found. Install it from Environment Setup before building." },
    { id: "jupyter-book", label: "Jupyter Book CLI", status: compatible ? "pass" : "error", detail: compatible && jupyterBook.ok ? jupyterBook.output : jupyterBook.ok ? `${jupyterBook.output || "Jupyter Book detected"}. LanCarbon requires Jupyter Book 2.` : "Jupyter Book CLI was not found. Install Jupyter Book 2 and make the jupyter command available in PATH." },
  ];
}

async function localListeners(): Promise<Map<number, number>> {
  if (process.platform !== "win32") return new Map();
  const listing = await run("netstat.exe", ["-ano", "-p", "tcp"], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
  const result = new Map<number, number>();
  for (const line of String(listing.stdout).split(/\r?\n/)) {
    const match = /^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line);
    if (match) result.set(Number(match[1]), Number(match[2]));
  }
  return result;
}

async function stopWindowsProcess(pid: number): Promise<void> {
  await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
  ], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 }).catch(() => undefined);
}

async function stopThemeServers(output: string, before: Map<number, number>): Promise<void> {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  const reported = new Set([...plain.matchAll(/Server started on port\s+(\d+)/gi)].map(match => Number(match[1])).filter(Number.isInteger));
  if (process.platform !== "win32") return;
  const after = await localListeners();
  const pids = new Set<number>();
  for (const [port, pid] of after) if (reported.has(port) || (port >= 3000 && port < 4000 && !before.has(port))) pids.add(pid);
  await Promise.all([...pids].map(stopWindowsProcess));
}

const runJupyterBuild: BuildCommand = async (file, args, options) => {
 const before = await localListeners();
 return new Promise((resolve, reject) => {
  const token = `${process.pid}-${Date.now()}`, stdoutPath = path.join(options.cwd, `.lancarbon-${token}.stdout.log`), stderrPath = path.join(options.cwd, `.lancarbon-${token}.stderr.log`);
  const stdoutFd = openSync(stdoutPath, "wx"), stderrFd = openSync(stderrPath, "wx");
  const child = spawn(file, args, { cwd: options.cwd, windowsHide: options.windowsHide, env: options.env, stdio: ["ignore", stdoutFd, stderrFd] });
  closeSync(stdoutFd); closeSync(stderrFd);
  let settled = false;
  const logs = async () => {
    const [stdout, stderr] = await Promise.all([fs.readFile(stdoutPath, "utf8").catch(() => ""), fs.readFile(stderrPath, "utf8").catch(() => "")]);
    await Promise.all([fs.unlink(stdoutPath).catch(() => undefined), fs.unlink(stderrPath).catch(() => undefined)]);
    return { stdout: stdout.slice(-options.maxBuffer), stderr: stderr.slice(-options.maxBuffer) };
  };
  const timer = setTimeout(() => {
    if (child.pid && process.platform === "win32") void stopWindowsProcess(child.pid).then(() => child.kill());
    else child.kill("SIGKILL");
  }, options.timeout);
  child.once("error", error => { clearTimeout(timer); if (settled) return; settled = true; void logs().then(output => reject(Object.assign(error, output))); });
  // Use files rather than pipes because the MyST theme server may inherit stdio.
  child.once("exit", (code, signal) => {
    clearTimeout(timer); if (settled) return; settled = true;
    void stopThemeServers("", before).then(logs).then(async output => {
      await stopThemeServers(`${output.stdout}\n${output.stderr}`, before);
      if (code === 0) resolve(output);
      else reject(Object.assign(new Error(signal ? `Jupyter Book was terminated by ${signal}` : `Jupyter Book exited with code ${code}`), { ...output, code }));
    });
  });
 });
};

function safeFolderName(book: Book): string {
  const title = book.settings.title.normalize("NFKC").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").slice(0, 80) || "Untitled Book";
  return `${title}-Built`;
}

export function bookSourceHash(workspace: WorkspaceFile, bookId: string): string {
  const project = generateBookProject(workspace, bookId);
  const hash = createHash("sha256");
  for (const [name, content] of [...project.files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(name); hash.update("\0"); hash.update(content); hash.update("\0");
  }
  return hash.digest("hex");
}

function requiredResources(workspace: WorkspaceFile, book: Book): Array<{ id: string; pageId?: string; noteId?: string; pageTitle?: string; line?: number }> {
  const result: Array<{ id: string; pageId?: string; noteId?: string; pageTitle?: string; line?: number }> = [];
  for (const page of Object.values(book.pages)) {
    const note = workspace.notes.find(item => item.id === page.noteId); if (!note) continue;
    for (const ref of assetReferences(note.content)) result.push({ id: ref.id, pageId: page.id, noteId: note.id, pageTitle: note.title, line: ref.line });
  }
  for (const value of [book.settings.logo, book.settings.favicon]) { const id = value && assetId(value); if (id) result.push({ id }); }
  for (const source of book.settings.bibliography ?? []) result.push({ id: source.assetId });
  return result;
}

export async function preflightBook(workspace: WorkspaceFile, bookId: string, assets: AssetStore): Promise<BookCheckIssue[]> {
  const issues = validateBookContent(workspace, bookId);
  const book = workspace.books.find(item => item.id === bookId); if (!book) return issues;
  const seen = new Set<string>();
  for (const ref of requiredResources(workspace, book)) {
    if (seen.has(ref.id)) continue; seen.add(ref.id);
    try { await assets.read(ref.id); }
    catch { issues.push({ severity: "error", source: "preflight", code: "missing-resource", message: `Missing or damaged resource: ${ref.id}`, ...ref }); }
  }
  return issues;
}

function cliIssues(output: string, workspace: WorkspaceFile, book: Book): BookCheckIssue[] {
  const targets = collectPageIds(book).map(pageId => {
    const page = book.pages[pageId], note = workspace.notes.find(item => item.id === page.noteId);
    return { page, note, exported: effectiveExportPath(book, page).replace(/\\/g, "/").toLocaleLowerCase("en-US") };
  });
  const issues: BookCheckIssue[] = [];
  for (const lineText of output.split(/\r?\n/)) {
    if (/\[DEP0169\]\s+DeprecationWarning:\s+`?url\.parse\(\)`?/i.test(lineText)) continue;
    if (!/(error|warning|fatal|failed)/i.test(lineText)) continue;
    const located = /(?:^|[\s(])([^\s():]+\.(?:md|ipynb))(?::|\s+line\s+)(\d+)(?::\d+)?/i.exec(lineText);
    const file = located?.[1].replace(/\\/g, "/").replace(/^\.\//, "").toLocaleLowerCase("en-US");
    const target = file ? targets.find(item => item.exported === file || file.endsWith(`/${item.exported}`)) : undefined;
    issues.push({ severity: /warning/i.test(lineText) && !/\b(?:error|fatal|failed)\b/i.test(lineText) ? "warning" : "error", source: "jupyter-book", code: "cli", message: lineText.trim().slice(0, 1200), ...(target?.page ? { pageId: target.page.id, noteId: target.page.noteId } : {}), ...(target?.note ? { pageTitle: target.note.title } : {}), ...(located ? { line: Number(located[2]) } : {}) });
  }
  return [...new Map(issues.map(item => [`${item.severity}:${item.message}`, item])).values()];
}

export interface BuildOutput { destination: string; htmlPath: string; issues: BookCheckIssue[]; log: string; durationMs: number }

export async function buildBookForPublication(sourceDirectory: string, baseUrl: string, command: BuildCommand = runJupyterBuild, templateCache?: string, temporaryRoot = os.tmpdir()): Promise<{ directory: string; htmlPath: string }> {
  if (!/^\/[A-Za-z0-9._-]+$/.test(baseUrl) && baseUrl !== "") throw new Error("The GitHub Pages base URL is invalid");
  const source = path.resolve(sourceDirectory);
  if (!(await fs.stat(path.join(source, MARKER)).catch(() => null))?.isFile() || !(await fs.stat(path.join(source, "myst.yml")).catch(() => null))?.isFile()) throw new Error("The saved Book build source is incomplete. Build the Book again.");
  await fs.mkdir(temporaryRoot, { recursive: true });
  const staging = await fs.mkdtemp(path.join(temporaryRoot, "lancarbon-pages-build-"));
  try {
    for (const entry of await fs.readdir(source)) if (entry !== "_build" && entry !== MARKER) await fs.cp(path.join(source, entry), path.join(staging, entry), { recursive: true });
    if (templateCache) {
      await fs.mkdir(path.join(staging, "_build"), { recursive: true });
      await fs.symlink(path.resolve(templateCache), path.join(staging, "_build", "templates"), "junction");
    }
    try {
      await command("jupyter", ["book", "build", "--html", "--strict", "--ci"], { cwd: staging, windowsHide: true, timeout: 300_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, BASE_URL: baseUrl } });
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(`The GitHub Pages build failed: ${String(failure.stderr || failure.stdout || failure.message).trim().slice(-2_000)}`);
    }
    const htmlPath = path.join(staging, "_build", "html");
    if (!(await fs.stat(path.join(htmlPath, "index.html")).catch(() => null))?.isFile()) throw new Error("The GitHub Pages build did not create index.html");
    if (templateCache) await fs.unlink(path.join(staging, "_build", "templates")).catch(() => undefined);
    return { directory: staging, htmlPath };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
    throw error;
  }
}

export async function buildBookInParent(workspace: WorkspaceFile, bookId: string, parent: string, assets: AssetStore, previousDestination?: string, command: BuildCommand = runJupyterBuild, templateCache?: string): Promise<BuildOutput> {
  const book = workspace.books.find(item => item.id === bookId); if (!book) throw new Error("The selected Book no longer exists");
  const sourceHash = bookSourceHash(workspace, bookId);
  const preflight = await preflightBook(workspace, bookId, assets);
  if (preflight.some(item => item.severity === "error")) throw Object.assign(new Error("Book preflight found errors. Fix them before building."), { issues: preflight });
  await fs.mkdir(parent, { recursive: true });
  const destination = path.join(parent, safeFolderName(book));
  const resolvedParent = path.resolve(parent), resolvedDestination = path.resolve(destination);
  if (path.dirname(resolvedDestination) !== resolvedParent) throw new Error("Build destination leaves the selected folder");
  const legacyDestination = previousDestination && path.dirname(path.resolve(previousDestination)) === resolvedParent && path.resolve(previousDestination) !== resolvedDestination ? path.resolve(previousDestination) : undefined;
  const existing = await fs.stat(resolvedDestination).catch(() => null);
  if (existing) {
    if (!existing.isDirectory()) throw new Error("The build destination is not a folder");
    try { const marker = JSON.parse(await fs.readFile(path.join(resolvedDestination, MARKER), "utf8")); if (marker.bookId !== bookId) throw new Error(); }
    catch { throw new Error(`LanCarbon will not replace an unmanaged folder: ${resolvedDestination}`); }
  }
  const staging = await fs.mkdtemp(path.join(resolvedParent, `.lancarbon-${book.id.slice(0, 8)}-`));
  const backup = `${resolvedDestination}.previous-${Date.now()}`;
  const started = Date.now(); let output = "";
  try {
    await exportBookToDirectory(workspace, bookId, staging, assets);
    if (templateCache) {
      await fs.mkdir(path.join(staging, "_build"), { recursive: true });
      await fs.symlink(path.resolve(templateCache), path.join(staging, "_build", "templates"), "junction");
    }
    try {
      const result = await command("jupyter", ["book", "build", "--html", "--strict", "--ci"], { cwd: staging, windowsHide: true, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
      output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string; code?: string | number };
      output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim();
      const issues = [...preflight, ...cliIssues(output, workspace, book)];
      if (!issues.some(item => item.severity === "error")) issues.push({ severity: "error", source: "jupyter-book", code: "build-failed", message: failure.code === "ENOENT" ? "Jupyter Book CLI was not found. Install Jupyter Book 2 and make the jupyter command available in PATH." : (failure.message || "Jupyter Book build failed") });
      throw Object.assign(new Error(issues.at(-1)?.message ?? "Jupyter Book build failed"), { issues, log: output });
    }
    const htmlPath = path.join(staging, "_build", "html");
    if (!(await fs.stat(path.join(htmlPath, "index.html")).catch(() => null))?.isFile()) throw new Error("Jupyter Book reported success but did not create _build/html/index.html");
    if (templateCache) await fs.unlink(path.join(staging, "_build", "templates")).catch(() => undefined);
    await fs.writeFile(path.join(staging, MARKER), JSON.stringify({ version: 2, bookId, sourceHash, builtAt: new Date().toISOString() }, null, 2), "utf8");
    if (existing) await fs.rename(resolvedDestination, backup);
    try { await fs.rename(staging, resolvedDestination); } catch (error) { if (existing) await fs.rename(backup, resolvedDestination).catch(() => undefined); throw error; }
    if (existing) await fs.rm(backup, { recursive: true, force: true });
    if (legacyDestination) {
      try {
        const marker = JSON.parse(await fs.readFile(path.join(legacyDestination, MARKER), "utf8"));
        if (marker.bookId === bookId) await fs.rm(legacyDestination, { recursive: true, force: true });
      } catch { /* Keep unknown or unavailable legacy folders. */ }
    }
    return { destination: resolvedDestination, htmlPath: path.join(resolvedDestination, "_build", "html"), issues: [...preflight, ...cliIssues(output, workspace, book)], log: output.slice(-100_000), durationMs: Date.now() - started };
  } finally {
    await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
  }
}
