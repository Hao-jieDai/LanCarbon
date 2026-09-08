// @vitest-environment node
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { EnvironmentManager, environmentWithManagedTools } from "../electron/environment-manager";

function successfulFetch(): typeof fetch {
  return (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

function fullyInstalledCommand(overrides: Record<string, string> = {}) {
  const versions: Record<string, string> = { python: "Python 3.13.14", py: "Python 3.13.14", python3: "Python 3.13.14", jupyter: "Jupyter Book      : v2.1.6", git: "git version 2.51.1.windows.1", gh: "gh version 2.100.0", ...overrides };
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
  it("prepends LanCarbon tools without changing the system configuration", () => {
    const root = path.resolve("D:\\LanCarbon\\Tools");
    const result = environmentWithManagedTools(root, { Path: "C:\\Windows\\System32" });
    const entries = String(result.Path).split(path.delimiter);
    expect(entries[0]).toBe(path.join(root, "JupyterBook", "Scripts"));
    expect(entries).toContain(path.join(root, "Python"));
    expect(entries).toContain(path.join(root, "Git", "cmd"));
    expect(entries).toContain(path.join(root, "GitHubCLI", "bin"));
    expect(entries.at(-1)).toBe("C:\\Windows\\System32");
    expect(result.PATH).toBe(result.Path);
  });

  it("marks every compatible system tool as ready and non-installable", async () => {
    const manager = new EnvironmentManager("D:\\LanCarbon\\Tools", "D:\\LanCarbon\\Temp", "D:\\LanCarbon\\log.txt", successfulFetch(), () => undefined, fullyInstalledCommand());
    const items = await manager.inspect();
    for (const id of ["python", "jupyter-book", "git", "github-cli"] as const) expect(items.find(item => item.id === id)).toMatchObject({ status: "pass", source: "system", installable: false });
  });

  it("continues past an incompatible command and accepts a later compatible Python", async () => {
    const manager = new EnvironmentManager("D:\\LanCarbon\\Tools", "D:\\LanCarbon\\Temp", "D:\\LanCarbon\\log.txt", successfulFetch(), () => undefined, fullyInstalledCommand({ python: "Python 3.9.19", py: "Python 3.12.10" }));
    expect((await manager.inspect("build")).find(item => item.id === "python")).toMatchObject({ status: "pass", version: "Python 3.12.10", source: "system", installable: false });
  });

  it("reports offline GitHub access without hiding locally installed tools", async () => {
    const offline = (async () => { throw new Error("offline"); }) as typeof fetch;
    const manager = new EnvironmentManager("D:\\LanCarbon\\Tools", "D:\\LanCarbon\\Temp", "D:\\LanCarbon\\log.txt", offline, () => undefined, fullyInstalledCommand());
    const items = await manager.inspect();
    expect(items.find(item => item.id === "github-network")).toMatchObject({ status: "warning", installable: false });
    expect(items.find(item => item.id === "python")).toMatchObject({ status: "pass", installable: false });
  });

  it("short-circuits a backend install request when a compatible system copy exists", async () => {
    let requests = 0;
    const fetcher = (async () => { requests += 1; return new Response("{}", { status: 200 }); }) as typeof fetch;
    const manager = new EnvironmentManager("D:\\LanCarbon\\Tools", "D:\\LanCarbon\\Temp", "D:\\LanCarbon\\log.txt", fetcher, () => undefined, fullyInstalledCommand());
    const result = await manager.install("python");
    expect(result).toMatchObject({ ok: true, item: { source: "system", installable: false } });
    expect(requests).toBe(1); // Read-only reachability check only; no Python payload request.
  });

  it("cancels a streaming download and removes all partial files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-cancel-"));
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
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
