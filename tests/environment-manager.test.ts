// @vitest-environment node
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvironmentManager, environmentWithManagedTools, retryWindowsFileOperation } from "../electron/environment-manager";

function successfulFetch(): typeof fetch {
  return (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

function fullyInstalledCommand(overrides: Record<string, string> = {}) {
  const versions: Record<string, string> = { python: "Python 3.13.14", py: "Python 3.13.14", python3: "Python 3.13.14", node: "v24.21.0", jupyter: "Jupyter Book      : v2.1.6", git: "git version 2.51.1.windows.1", gh: "gh version 2.100.0", ...overrides };
  return async (file: string, args: string[]) => {
    if (file === "where.exe") return { stdout: `D:\\System\\${args[0]}.exe`, stderr: "" };
    if (path.isAbsolute(file)) throw new Error("managed copy missing");
    const name = path.basename(file, path.extname(file)).toLowerCase();
    if (args[0] === "auth") return { stdout: "Logged in to github.com", stderr: "" };
    if (versions[name]) return { stdout: versions[name], stderr: "" };
    throw new Error("missing");
  };
}

describe("managed tool environment", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-environment-")); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const managerPaths = () => ({ tools: path.join(root, "Tools"), temp: path.join(root, "Temp"), log: path.join(root, "environment.log") });

  it("prepends LanCarbon tools without changing the system configuration", () => {
    const root = path.resolve("D:\\LanCarbon\\Tools");
    const result = environmentWithManagedTools(root, { Path: "C:\\Windows\\System32" });
    const entries = String(result.Path).split(path.delimiter);
    expect(entries[0]).toBe(path.join(root, "JupyterBook", "Scripts"));
    expect(entries).toContain(path.join(root, "Node"));
    expect(entries).toContain(path.join(root, "Python"));
    expect(entries).toContain(path.join(root, "Git", "cmd"));
    expect(entries).toContain(path.join(root, "GitHubCLI", "bin"));
    expect(entries.at(-1)).toBe("C:\\Windows\\System32");
    expect(result.PATH).toBe(result.Path);
  });

  it("marks every compatible system tool as ready and non-installable", async () => {
    const paths = managerPaths();
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, successfulFetch(), () => undefined, fullyInstalledCommand());
    const items = await manager.inspect();
    expect(items.find(item => item.id === "tools-permission")).toMatchObject({ status: "pass" });
    for (const id of ["python", "node", "jupyter-book", "git", "github-cli"] as const) expect(items.find(item => item.id === id)).toMatchObject({ status: "pass", source: "system", installable: false });
  });

  it("continues past an incompatible command and accepts a later compatible Python", async () => {
    const paths = managerPaths();
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, successfulFetch(), () => undefined, fullyInstalledCommand({ python: "Python 3.9.19", py: "Python 3.12.10" }));
    expect((await manager.inspect("build")).find(item => item.id === "python")).toMatchObject({ status: "pass", version: "Python 3.12.10", source: "system", installable: false });
  });

  it("reports offline GitHub access without hiding locally installed tools", async () => {
    const offline = (async () => { throw new Error("offline"); }) as typeof fetch;
    const paths = managerPaths();
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, offline, () => undefined, fullyInstalledCommand());
    const items = await manager.inspect();
    expect(items.find(item => item.id === "github-network")).toMatchObject({ status: "warning", installable: false });
    expect(items.find(item => item.id === "python")).toMatchObject({ status: "pass", installable: false });
  });

  it("short-circuits a backend install request when a compatible system copy exists", async () => {
    let requests = 0;
    const fetcher = (async () => { requests += 1; return new Response("{}", { status: 200 }); }) as typeof fetch;
    const paths = managerPaths();
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, fetcher, () => undefined, fullyInstalledCommand());
    const result = await manager.install("python");
    expect(result).toMatchObject({ ok: true, item: { source: "system", installable: false } });
    expect(requests).toBe(1); // Read-only reachability check only; no Python payload request.
  });

  it("cancels a streaming download and removes all partial files", async () => {
    let manager!: EnvironmentManager;
    let requests = 0;
    const fetcher = (async () => {
      requests += 1;
      if (requests === 1) return new Response("{}", { status: 200 });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024)); controller.enqueue(new Uint8Array(1024)); } }), { status: 200, headers: { "content-length": "4096" } });
    }) as typeof fetch;
    const missing = async () => { throw new Error("missing"); };
    manager = new EnvironmentManager(path.join(root, "Tools"), path.join(root, "Temp"), path.join(root, "install.log"), fetcher, progress => { if (progress.phase === "downloading" && progress.receivedBytes) manager.cancel(); }, missing);
    try {
      expect(await manager.install("python")).toMatchObject({ ok: false, canceled: true });
      expect(await fs.readdir(path.join(root, "Temp"))).toEqual([]);
      expect(await fs.stat(path.join(root, "Tools", "Python")).catch(() => null)).toBeNull();
    } finally { /* shared cleanup */ }
  });

  it("waits and retries transient Windows file locks", async () => {
    let attempts = 0;
    const result = await retryWindowsFileOperation(async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("busy"), { code: "EPERM" });
      return "ready";
    }, () => undefined, undefined, [0, 0]);
    expect(result).toBe("ready");
    expect(attempts).toBe(3);
  });

  it("does not retry unrelated file failures", async () => {
    let attempts = 0;
    await expect(retryWindowsFileOperation(async () => { attempts += 1; throw Object.assign(new Error("missing"), { code: "ENOENT" }); }, () => undefined, undefined, [0])).rejects.toThrow("missing");
    expect(attempts).toBe(1);
  });

  it.skipIf(process.platform !== "win32")("repairs the managed Tools ACL and verifies write access", async () => {
    const paths = managerPaths();
    const calls: string[] = [];
    const command = async (file: string) => {
      calls.push(file);
      if (file === "whoami.exe") return { stdout: "desktop\\writer\n", stderr: "" };
      if (file === "icacls.exe") return { stdout: "Successfully processed 1 files", stderr: "" };
      throw new Error("not used");
    };
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, successfulFetch(), () => undefined, command);
    expect(await manager.repairPermissions()).toEqual({ ok: true });
    expect(calls).toEqual(["whoami.exe", "icacls.exe"]);
    expect((await manager.inspect()).find(item => item.id === "tools-permission")).toMatchObject({ status: "pass" });
  });

  it.skipIf(process.platform !== "win32")("requests elevated ACL repair when direct repair is denied", async () => {
    const paths = managerPaths();
    let elevated: { tools: string; account: string } | undefined;
    const command = async (file: string) => {
      if (file === "whoami.exe") return { stdout: "desktop\\writer\n", stderr: "" };
      throw Object.assign(new Error("Access denied"), { code: "EACCES" });
    };
    const manager = new EnvironmentManager(paths.tools, paths.temp, paths.log, successfulFetch(), () => undefined, command, async (tools, account) => { elevated = { tools, account }; });
    expect(await manager.repairPermissions()).toEqual({ ok: true });
    expect(elevated).toEqual({ tools: paths.tools, account: "desktop\\writer" });
  });
});
