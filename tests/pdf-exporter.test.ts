// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const print = vi.hoisted(() => ({ render: vi.fn(), pdf: vi.fn(), destroy: vi.fn(), payload: "" }));
vi.mock("electron", () => ({ BrowserWindow: class {
  webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), executeJavaScript: (script: string) => { print.payload = script; return print.render(); }, printToPDF: print.pdf };
  loadFile = vi.fn(); loadURL = vi.fn(); isDestroyed = () => false; destroy = print.destroy;
} }));
import { exportPagePdf, pdfFileName } from "../electron/pdf-exporter";
import { AssetStore } from "../electron/assets";
import { createNote } from "../src/shared/notes";
import { addNoteToBook, createBook } from "../src/shared/books";
import { assetMarkdown } from "../src/shared/assets";

describe("single-page PDF exporter", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-pdf-unit-"));
    print.render.mockReset().mockResolvedValue({ warnings: [] }); print.pdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.7\nfixture")); print.destroy.mockClear();
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  it("makes safe Unicode filenames, including empty and Windows-reserved titles", () => {
    expect(pdfFileName("研究/记录:α?")).toBe("研究_记录_α_.pdf");
    expect(pdfFileName(" . ")).toBe("Untitled Note.pdf");
    expect(pdfFileName("CON")).toBe("Note CON.pdf");
    expect(pdfFileName("a".repeat(200))).toHaveLength(114);
  });
  it("writes an A4 PDF atomically without changing Note source", async () => {
    const note = createNote({ content: "$\\alpha$" }), workspace = { version: 2 as const, notes: [note], books: [] }, before = JSON.stringify(workspace), destination = path.join(directory, "note.pdf");
    print.render.mockResolvedValue({ warnings: ["Check Preview"] });
    await expect(exportPagePdf(workspace, note.id, destination, new AssetStore(directory))).resolves.toEqual(["Check Preview"]);
    expect((await fs.readFile(destination)).toString()).toContain("%PDF");
    expect(print.pdf).toHaveBeenCalledWith(expect.objectContaining({ pageSize: "A4", printBackground: true }));
    expect(JSON.stringify(workspace)).toBe(before); expect(print.destroy).toHaveBeenCalledOnce();
    expect(await fs.readdir(directory)).toEqual(["note.pdf"]);
  });
  it("prints the selected Book page while passing other pages only as reference context", async () => {
    const { book, homeNote } = createBook("Book"), child = createNote({ title: "Child", content: "Only selected" }), updated = addNoteToBook(book, child, { parentPageId: book.homePageId });
    await exportPagePdf({ version: 2, notes: [homeNote, child], books: [updated] }, child.id, path.join(directory, "child.pdf"), new AssetStore(directory));
    const payload = JSON.parse(print.payload.slice("window.renderLanCarbonPdf(".length, -1));
    expect(payload.current.id).toBe(child.id); expect(payload.documents).toHaveLength(2);
  });
  it("leaves an existing PDF intact after rendering or writing failure and closes the print window", async () => {
    const note = createNote(), destination = path.join(directory, "previous.pdf"), workspace = { version: 2 as const, notes: [note], books: [] };
    await fs.writeFile(destination, "previous"); print.pdf.mockRejectedValueOnce(new Error("Print failed"));
    await expect(exportPagePdf(workspace, note.id, destination, new AssetStore(directory))).rejects.toThrow("Print failed");
    expect(await fs.readFile(destination, "utf8")).toBe("previous"); expect(print.destroy).toHaveBeenCalledOnce();
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Access denied"));
    await expect(exportPagePdf(workspace, note.id, destination, new AssetStore(directory))).rejects.toThrow("Access denied");
    expect(await fs.readdir(directory)).toEqual(["previous.pdf"]);
  });
  it("rejects missing pages and resources before creating output", async () => {
    const store = new AssetStore(directory), asset = await store.importBytes("attachment.txt", Buffer.from("source"), false), note = createNote({ content: assetMarkdown(asset) }), workspace = { version: 2 as const, notes: [note], books: [] };
    await fs.unlink(path.join(directory, "assets", asset.id));
    await expect(exportPagePdf(workspace, note.id, path.join(directory, "missing.pdf"), store)).rejects.toThrow("Missing or damaged resource");
    await expect(exportPagePdf(workspace, "gone", path.join(directory, "gone.pdf"), store)).rejects.toThrow("no longer exists");
    expect(print.pdf).not.toHaveBeenCalled();
  });
});
