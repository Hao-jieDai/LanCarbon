import { expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { OcrStore } from "../electron/ocr-store";
import { ocrReviewNotes, pdfHasBrokenNumericGlyph, pdfTextNeedsOcr, validOcrPage, type OcrPage } from "../src/shared/ocr";
import { textChunks } from "../src/shared/knowledgeText";
const value: OcrPage = { version: 1, page: 3, width: 1200, height: 1600, rotation: 0, text: "Climate policy\n气候政策", confidence: 91, lines: [{ text: "Climate policy", x0: 20, y0: 30, x1: 300, y1: 80 }], manual: false };
it("keeps local OCR reusable by document content/page across restarts and clears only derived recognized pages", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ocr-"));
  try {
    const store = new OcrStore(root), fingerprint = "a".repeat(64); await store.put(fingerprint, value);
    expect(await new OcrStore(root).get(fingerprint, 3)).toEqual(value);
    expect(await store.get("b".repeat(64), 3)).toBeUndefined(); expect(await store.get(fingerprint, 4)).toBeUndefined();
    expect((await store.stats()).pages).toBe(1);
    await fs.writeFile(path.join(root, "Research/OCR/keep.txt"), "unrelated file"); await store.clear();
    expect((await store.stats()).bytes).toBe(0); expect(await fs.readFile(path.join(root, "Research/OCR/keep.txt"), "utf8")).toBe("unrelated file");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it("rejects cache traversal and invalid recognition geometry without losing saved results", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ocr-"));
  try {
    const store = new OcrStore(root); await store.put("a".repeat(64), value);
    await expect(store.get("../outside", 3)).rejects.toThrow("Invalid OCR");
    await expect(store.put("a".repeat(64), { ...value, lines: [{ ...value.lines[0], x1: 90000 }] })).rejects.toThrow("invalid text");
    expect(await store.get("a".repeat(64), 3)).toEqual(value);
    expect(validOcrPage({ ...value, confidence: NaN })).toBe(false);
    expect(validOcrPage({ ...value, page: -1 })).toBe(false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it("uses existing readable text while detecting blank, sparse and corrupted PDF layers", () => {
  expect(pdfTextNeedsOcr("Climate investment research evidence.")).toBe(false);
  expect(pdfTextNeedsOcr("气候变化影响投资决策，研究未来现金流损失。")).toBe(false);
  expect(pdfTextNeedsOcr(" 1 ")).toBe(true); expect(pdfTextNeedsOcr("\ufffd".repeat(80)+"Broken text")).toBe(true);
  expect(ocrReviewNotes("Asset row: 216.2 189.73 4521163 325.6", 94).join(" ")).toContain("decimal points");
  expect(ocrReviewNotes("Total loss is CNY 28.4 billion.", 94)).toEqual([]);
});
it("recognizes a single damaged numeric glyph on long native pages without guessing its sign", () => {
  for (const text of ["Clinical results. ".repeat(200) + "Change was \u0000 4.7 degrees.", "River monitoring. ".repeat(200) + "Net change is \uFFFD6.2 units.", "Cost 2\u00001 million."]) {
    expect(pdfHasBrokenNumericGlyph(text)).toBe(true); expect(pdfTextNeedsOcr(text)).toBe(true);
  }
  for (const text of ["Native results. ".repeat(200) + "Change was −4.7 degrees.", "Routine reading with a normal footnote ¹ and value 6.2.", "The page heading\u0000 contains no numeric symbol."]) expect(pdfTextNeedsOcr(text)).toBe(false);
  expect(textChunks([{text: "The change is \u0000 4.7 degrees.", anchor: {kind: "pdf", page: 2, needsReview: true}}]).chunks[0]).toMatchObject({text: "The change is \uFFFD 4.7 degrees.",anchor: {needsReview: true}});
});
