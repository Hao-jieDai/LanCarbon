// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { createSnapshot, verifySnapshot, restoreSnapshot } = createRequire(import.meta.url)("../scripts/workspace-recovery.cjs");
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-recovery-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const root = path.join(directory, "Installed", "LanCarbon");
  const data = path.join(directory, "CustomData");
  await fs.mkdir(data, { recursive: true });
  await fs.mkdir(path.join(root, "Config"), { recursive: true });
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [{ id: "personal", content: "Keep my edits" }], books: [] }));
  await fs.writeFile(path.join(data, "attachment.bin"), Buffer.from([0, 1, 2, 255]));
  await fs.writeFile(path.join(root, "Config", "data-location.json"), JSON.stringify({ version: 1, path: data }));
  await fs.writeFile(path.join(root, "Config", "build-location.json"), JSON.stringify({ version: 1, destinations: { book: path.join(root, "Builds", "book") } }));
  return { root, data, destination: path.join(directory, "Backup") };
}

describe("workspace recovery", () => {
  it("backs up the actual custom data location and restores verified files into a new root", async () => {
    const options = await fixture();
    const manifest = await createSnapshot(options);
    expect(manifest.data).toBe(await fs.realpath(options.data));
    expect((await verifySnapshot(options.destination)).files).toHaveLength(4);
    const target = path.join(directory, "Recovered", "LanCarbon");
    await restoreSnapshot({ backup: options.destination, target });
    expect(await fs.readFile(path.join(target, "Data", "notes.json"), "utf8")).toBe(await fs.readFile(path.join(options.data, "notes.json"), "utf8"));
    const canonicalTarget = await fs.realpath(target);
    expect(JSON.parse(await fs.readFile(path.join(target, "Config", "data-location.json"), "utf8")).path).toBe(path.join(canonicalTarget, "Data"));
    expect(JSON.parse(await fs.readFile(path.join(target, "Config", "build-location.json"), "utf8")).destinations.book).toBe(path.join(canonicalTarget, "Builds", "book"));
    expect(await fs.readFile(path.join(target, "Data", "attachment.bin"))).toEqual(Buffer.from([0, 1, 2, 255]));
  });
  it("rejects corruption before creating restored files and refuses to overwrite a destination", async () => {
    const options = await fixture(); await createSnapshot(options);
    const target = path.join(directory, "Target");
    await fs.writeFile(path.join(options.destination, "Data", "attachment.bin"), "changed");
    await expect(restoreSnapshot({ backup: options.destination, target })).rejects.toThrow("SHA-256");
    expect(await fs.stat(target).catch(() => null)).toBeNull();
    await fs.mkdir(target); await fs.writeFile(path.join(target, "keep.txt"), "Keep");
    await expect(restoreSnapshot({ backup: options.destination, target })).rejects.toThrow("never overwritten");
    expect(await fs.readFile(path.join(target, "keep.txt"), "utf8")).toBe("Keep");
  });
  it("rejects escaping paths, unexpected files and backups inside the live data", async () => {
    const options = await fixture();
    await expect(createSnapshot({ ...options, destination: path.join(options.data, "backup") })).rejects.toThrow("separate");
    await createSnapshot(options);
    await fs.writeFile(path.join(options.destination, "unexpected.txt"), "Extra");
    await expect(verifySnapshot(options.destination)).rejects.toThrow("unexpected");
    await fs.unlink(path.join(options.destination, "unexpected.txt"));
    const file = path.join(options.destination, "recovery.json");
    const manifest = JSON.parse(await fs.readFile(file, "utf8")); manifest.files[0].path = "Data/../../escape";
    await fs.writeFile(file, JSON.stringify(manifest));
    await expect(verifySnapshot(options.destination)).rejects.toThrow("Invalid backup path");
  });
});
