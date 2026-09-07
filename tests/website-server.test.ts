// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebsiteServerManager } from "../electron/website-server";

describe("local built website server", () => {
  let root: string; let manager: WebsiteServerManager;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-website-")); manager = new WebsiteServerManager(); });
  afterEach(async () => { manager.closeAll(); await fs.rm(root, { recursive: true, force: true }); });

  it("serves the built index and nested routes only from the HTML folder", async () => {
    await fs.writeFile(path.join(root, "index.html"), "home");
    await fs.mkdir(path.join(root, "chapter")); await fs.writeFile(path.join(root, "chapter", "index.html"), "chapter");
    const url = await manager.serve("book", root);
    await expect(fetch(url).then(response => response.text())).resolves.toBe("home");
    await expect(fetch(`${url}chapter/`).then(response => response.text())).resolves.toBe("chapter");
    expect((await fetch(`${url}../package.json`)).status).toBe(404);
    expect(await manager.serve("book", root)).toBe(url);
    await manager.stop("book"); expect(manager.url("book")).toBeUndefined();
    const restarted = await manager.serve("book", root); expect(restarted).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("serves different Books independently", async () => {
    const second = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-website-second-"));
    try {
      await fs.writeFile(path.join(root, "index.html"), "first"); await fs.writeFile(path.join(second, "index.html"), "second");
      const firstUrl = await manager.serve("first", root), secondUrl = await manager.serve("second", second);
      expect(firstUrl).not.toBe(secondUrl);
      await expect(fetch(firstUrl).then(response => response.text())).resolves.toBe("first");
      await expect(fetch(secondUrl).then(response => response.text())).resolves.toBe("second");
      await manager.stop("first"); await expect(fetch(secondUrl).then(response => response.text())).resolves.toBe("second");
    } finally { await fs.rm(second, { recursive: true, force: true }); }
  });
});
