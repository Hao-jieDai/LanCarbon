// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportBookToDirectory } from "../electron/book-exporter";
import { createBook } from "../src/shared/books";

describe("Book 文件夹导出器", () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-export-")); });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

  it("写入完整空目录", async () => {
    const { book, homeNote } = createBook("Export Test");
    await exportBookToDirectory({ version: 2, notes: [homeNote], books: [book] }, book.id, directory);
    await expect(fs.readFile(path.join(directory, "myst.yml"), "utf8")).resolves.toContain("book-theme");
    await expect(fs.readFile(path.join(directory, "index.md"), "utf8")).resolves.toContain("title: Export Test");
  });

  it("拒绝非空目录且不覆盖文件", async () => {
    const original = path.join(directory, "keep.txt"); await fs.writeFile(original, "keep");
    const { book, homeNote } = createBook();
    await expect(exportBookToDirectory({ version: 2, notes: [homeNote], books: [book] }, book.id, directory)).rejects.toThrow("must be empty");
    await expect(fs.readFile(original, "utf8")).resolves.toBe("keep");
  });

  it("写入失败后清理由本次导出创建的文件", async () => {
    const { book, homeNote } = createBook(); const realWrite = fs.writeFile.bind(fs); let count = 0;
    vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => { count += 1; if (count === 2) throw new Error("disk full"); return realWrite(...args); });
    await expect(exportBookToDirectory({ version: 2, notes: [homeNote], books: [book] }, book.id, directory)).rejects.toThrow("disk full");
    await expect(fs.readdir(directory)).resolves.toEqual([]);
  });
});
