// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAssetsToLibrary } from "../electron/asset-migration";
import { AssetStore } from "../electron/assets";
import { createBook } from "../src/shared/books";
import { assetMarkdown } from "../src/shared/assets";
import { exportBookToDirectory } from "../electron/book-exporter";
import { NotesStore } from "../electron/storage";

let root: string, data: string, library: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-migration-")); data = path.join(root, "Data"); library = path.join(root, "Library"); await fs.mkdir(data); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

describe("Library resource migration", () => {
  it("moves the entire resource folder without changing writing or IDs and keeps exports portable", async () => {
    const old = new AssetStore(data);
    const asset = await old.importBytes("Original.txt", Buffer.from("Original bytes"), false);
    const { book, homeNote } = createBook("Portable Book"); homeNote.content = assetMarkdown(asset);
    const workspace = { version: 2 as const, notes: [homeNote], books: [book] };
    await new NotesStore(data).saveWorkspace(workspace);
    const writing = await fs.readFile(path.join(data, "notes.json"));
    const catalog = await fs.readFile(path.join(data, "assets.json"));
    await fs.mkdir(path.join(data, "assets", "extra")); await fs.writeFile(path.join(data, "assets", "extra", "retain.txt"), "Keep unlisted original");
    await migrateAssetsToLibrary(data, library); await migrateAssetsToLibrary(data, library);
    expect(await fs.stat(path.join(data, "assets")).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(data, "notes.json"))).toEqual(writing);
    expect(await fs.readFile(path.join(data, "assets.json"))).toEqual(catalog);
    expect(await fs.readFile(path.join(library, "assets", "extra", "retain.txt"), "utf8")).toBe("Keep unlisted original");
    const current = new AssetStore(data, path.join(library, "assets"));
    expect((await current.read(asset.id)).bytes.toString()).toBe("Original bytes");
    const added = await current.importBytes("Later.txt", Buffer.from("New bytes"), false);
    expect(await fs.readFile(path.join(library, "assets", added.file ?? added.id), "utf8")).toBe("New bytes");
    const destination = path.join(root, "Export"); await fs.mkdir(destination);
    await exportBookToDirectory(workspace, book.id, destination, current);
    expect(await fs.readFile(path.join(destination, "assets", asset.id), "utf8")).toBe("Original bytes");
    expect(await fs.readFile(path.join(destination, "index.md"), "utf8")).toContain(`assets/${asset.id}`);
  });
  it("keeps the original folder intact after a copy failure and resumes without duplicate records", async () => {
    const old = new AssetStore(data);
    const first = await old.importBytes("first.txt", Buffer.from("A"), false);
    const second = await old.importBytes("second.txt", Buffer.from("B"), false);
    const copy = fs.copyFile.bind(fs); let count = 0;
    const failing = vi.spyOn(fs, "copyFile").mockImplementation(async (...args) => { if (++count === 2) throw new Error("Disk copy failed"); return copy(...args); });
    await expect(migrateAssetsToLibrary(data, library)).rejects.toThrow("Disk copy failed");
    expect((await old.read(first.id)).bytes.toString()).toBe("A"); expect((await old.read(second.id)).bytes.toString()).toBe("B");
    failing.mockRestore(); await migrateAssetsToLibrary(data, library);
    const current = new AssetStore(data, path.join(library, "assets")); expect(await current.list()).toHaveLength(2);
  });
  it("refuses conflicting files, corrupt originals and future formats before retiring any source", async () => {
    await fs.mkdir(path.join(data, "assets")); await fs.mkdir(path.join(library, "assets"), { recursive: true });
    await fs.writeFile(path.join(data, "assets", "personal.txt"), "Original"); await fs.writeFile(path.join(library, "assets", "personal.txt"), "Other");
    await expect(migrateAssetsToLibrary(data, library)).rejects.toThrow("conflicting");
    expect(await fs.readFile(path.join(data, "assets", "personal.txt"), "utf8")).toBe("Original");
    await fs.unlink(path.join(library, "assets", "personal.txt"));
    await fs.writeFile(path.join(data, "notes.json"), '{"version":3,"notes":[],"books":[]}');
    await expect(migrateAssetsToLibrary(data, library)).rejects.toThrow("compatible");
    await fs.unlink(path.join(data, "notes.json"));
    await fs.writeFile(path.join(data, "assets", "a".repeat(64) + ".txt"), "Corrupt");
    await expect(migrateAssetsToLibrary(data, library)).rejects.toThrow("integrity");
    expect(await fs.readFile(path.join(data, "assets", "personal.txt"), "utf8")).toBe("Original");
  });
  it("synchronizes built-in resources into Library without recreating Data/assets", async () => {
    await migrateAssetsToLibrary(data, library);
    await new NotesStore(data, path.resolve("resources/starter-content"), path.join(library, "assets")).loadWorkspace();
    expect((await new AssetStore(data, path.join(library, "assets")).list()).length).toBeGreaterThan(0);
    expect(await fs.stat(path.join(data, "assets")).catch(() => null)).toBeNull();
  });
});
