// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetStore } from "../electron/assets";
import { bookSourceHash, buildBookForPublication, buildBookInParent, inspectBuildEnvironment, type BuildCommand } from "../electron/book-builder";
import { createBook } from "../src/shared/books";

describe("managed Book builder", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-builder-")); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const successful = (content: string): BuildCommand => async (_file, args, options) => {
    expect(args).toEqual(["book", "build", "--html", "--strict", "--ci"]);
    await fs.mkdir(path.join(options.cwd, "_build", "html"), { recursive: true });
    await fs.writeFile(path.join(options.cwd, "_build", "html", "index.html"), content);
    return { stdout: "build complete" };
  };

  it("checks Python and requires Jupyter Book 2 before building", async () => {
    const checks = await inspectBuildEnvironment(async (file, args) => {
      if (file === "python" && args[0] === "--version") return { stdout: "Python 3.13.7" };
      if (file === "jupyter") return { stdout: "Jupyter Book 2.1.6" };
      throw new Error("missing");
    });
    expect(checks).toEqual([
      expect.objectContaining({ id: "python", status: "pass", detail: expect.stringContaining("3.13.7") }),
      expect.objectContaining({ id: "jupyter-book", status: "pass", detail: expect.stringContaining("2.1.6") }),
    ]);
    const old = await inspectBuildEnvironment(async file => file === "python" ? { stdout: "Python 3.11.0" } : { stdout: "Jupyter Book 1.0.4" });
    expect(old[1]).toMatchObject({ id: "jupyter-book", status: "error" });
  });

  it("publishes a completed staging build and preserves it when a rebuild fails", async () => {
    const { book, homeNote } = createBook("Safe Build"); book.settings.authors = [{ name: "Tester" }];
    const workspace = { version: 2 as const, books: [book], notes: [homeNote] }, assets = new AssetStore(root);
    const first = await buildBookInParent(workspace, book.id, root, assets, undefined, successful("first"));
    expect(path.basename(first.destination)).toBe("Safe Build-Built");
    expect(await fs.readFile(path.join(first.htmlPath, "index.html"), "utf8")).toBe("first");
    const marker = JSON.parse(await fs.readFile(path.join(first.destination, ".lancarbon-build.json"), "utf8"));
    expect(marker).toMatchObject({ version: 2, bookId: book.id, sourceHash: bookSourceHash(workspace, book.id) });
    homeNote.content += "\n\nChanged after build.";
    expect(bookSourceHash(workspace, book.id)).not.toBe(marker.sourceHash);
    const failed: BuildCommand = async () => { throw Object.assign(new Error("strict build failed"), { stderr: "ERROR index.md:3:1 broken syntax", code: 1 }); };
    await expect(buildBookInParent(workspace, book.id, root, assets, first.destination, failed)).rejects.toMatchObject({ issues: [expect.objectContaining({ source: "jupyter-book", pageTitle: "Safe Build", line: 3 })] });
    expect(await fs.readFile(path.join(first.htmlPath, "index.html"), "utf8")).toBe("first");
  });

  it("refuses to replace an unmanaged destination", async () => {
    const { book, homeNote } = createBook("Existing"); book.settings.authors = [{ name: "Tester" }];
    const destination = path.join(root, "Existing-Built"); await fs.mkdir(destination); await fs.writeFile(path.join(destination, "keep.txt"), "keep");
    await expect(buildBookInParent({ version: 2, books: [book], notes: [homeNote] }, book.id, root, new AssetStore(root), undefined, successful("new"))).rejects.toThrow("unmanaged folder");
    expect(await fs.readFile(path.join(destination, "keep.txt"), "utf8")).toBe("keep");
  });

  it("migrates a previous ID-suffixed managed folder after a successful rebuild", async () => {
    const { book, homeNote } = createBook("Renamed Build"); book.settings.authors = [{ name: "Tester" }];
    const legacy = path.join(root, `Renamed Build-${book.id.slice(0, 8)}`);
    await fs.mkdir(path.join(legacy, "_build", "html"), { recursive: true });
    await fs.writeFile(path.join(legacy, "_build", "html", "index.html"), "old");
    await fs.writeFile(path.join(legacy, ".lancarbon-build.json"), JSON.stringify({ version: 1, bookId: book.id }));
    const result = await buildBookInParent({ version: 2, books: [book], notes: [homeNote] }, book.id, root, new AssetStore(root), legacy, successful("new"));
    expect(path.basename(result.destination)).toBe("Renamed Build-Built");
    expect(await fs.stat(legacy).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(result.htmlPath, "index.html"), "utf8")).toBe("new");
  });

  it("filters the known url.parse deprecation and does not treat plural errors as an error", async () => {
    const { book, homeNote } = createBook("Diagnostics"); book.settings.authors = [{ name: "Tester" }];
    const command: BuildCommand = async (_file, _args, options) => {
      await fs.mkdir(path.join(options.cwd, "_build", "html"), { recursive: true });
      await fs.writeFile(path.join(options.cwd, "_build", "html", "index.html"), "built");
      return { stderr: "(node:12) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors.\nWARNING content may contain errors without failing" };
    };
    const result = await buildBookInParent({ version: 2, books: [book], notes: [homeNote] }, book.id, root, new AssetStore(root), undefined, command);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringContaining("content may contain errors") })]);
  });

  it("creates a separate GitHub Pages build with the repository base URL", async () => {
    const publicationTemp = path.join(root, "publication-temp");
    const source = path.join(root, "Guide-Built"); await fs.mkdir(source);
    await fs.writeFile(path.join(source, ".lancarbon-build.json"), JSON.stringify({ version: 1, bookId: "guide" }));
    await fs.writeFile(path.join(source, "myst.yml"), "version: 1\n");
    await fs.writeFile(path.join(source, "index.md"), "# Guide\n");
    await fs.mkdir(path.join(source, "_build", "html"), { recursive: true }); await fs.writeFile(path.join(source, "_build", "html", "old.html"), "old");
    const command: BuildCommand = async (_file, args, options) => {
      expect(args).toEqual(["book", "build", "--html", "--strict", "--ci"]); expect(options.env?.BASE_URL).toBe("/LanCarbon-Guide");
      await fs.mkdir(path.join(options.cwd, "_build", "html"), { recursive: true }); await fs.writeFile(path.join(options.cwd, "_build", "html", "index.html"), '<script src="/LanCarbon-Guide/app.js"></script>');
      return { stdout: "built" };
    };
    const result = await buildBookForPublication(source, "/LanCarbon-Guide", command, undefined, publicationTemp);
    try {
      expect(result.directory.startsWith(publicationTemp)).toBe(true);
      expect(await fs.readFile(path.join(result.htmlPath, "index.html"), "utf8")).toContain("/LanCarbon-Guide/app.js");
      expect(await fs.stat(path.join(result.directory, "_build", "html", "old.html")).catch(() => null)).toBeNull();
    } finally { await fs.rm(result.directory, { recursive: true, force: true }); }
  });
});
