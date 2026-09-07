// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataLocationManager } from "../electron/data-location";

describe("DataLocationManager", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-location-")); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it("首次启动把旧工作区复制到默认目录并保留源文件", async () => {
    const legacy = path.join(root, "legacy");
    const target = path.join(root, "D", "LanCarbon", "Data");
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, "notes.json"), JSON.stringify({ version: 2, notes: [], books: [] }), "utf8");
    const manager = new DataLocationManager(legacy, legacy, target);
    await expect(manager.resolve()).resolves.toBe(target);
    await expect(fs.readFile(path.join(target, "notes.json"), "utf8")).resolves.toContain('"version":2');
    await expect(fs.access(path.join(legacy, "notes.json"))).resolves.toBeUndefined();
    await expect(manager.resolve()).resolves.toBe(target);
  });

  it("更改位置时拒绝覆盖已有 notes.json", async () => {
    const config = path.join(root, "config"); const source = path.join(root, "source"); const target = path.join(root, "target");
    await fs.mkdir(source, { recursive: true }); await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(source, "notes.json"), "{}", "utf8");
    await fs.writeFile(path.join(target, "notes.json"), "existing", "utf8");
    const manager = new DataLocationManager(config, source, target);
    await expect(manager.prepareTarget(source, target)).rejects.toThrow("already contains notes.json");
    await expect(fs.readFile(path.join(target, "notes.json"), "utf8")).resolves.toBe("existing");
  });

  it("损坏的旧文件不会切换到空的新目录", async () => {
    const legacy = path.join(root, "legacy"); const target = path.join(root, "target");
    await fs.mkdir(legacy, { recursive: true }); await fs.writeFile(path.join(legacy, "notes.json"), "broken", "utf8");
    const manager = new DataLocationManager(legacy, legacy, target);
    await expect(manager.resolve()).resolves.toBe(legacy);
  });
});
