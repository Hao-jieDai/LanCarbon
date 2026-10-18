import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import type { PDFPageProxy } from "pdfjs-dist";
import { OCR_VERSION, ocrReviewNotes, type OcrPage } from "./shared/ocr";
/** One worker is reused for one bounded PDF task, then terminated with its hidden parser window. */
export class LocalPdfOcr {
  private worker?: Worker;
  constructor(private readonly progress: (message: string) => void) {}
  async recognize(page: PDFPageProxy, manual: boolean): Promise<OcrPage> {
    const natural = page.getViewport({ scale: 1 }); if (![natural.width, natural.height].every(value => Number.isFinite(value) && value > 0)) throw Error("Invalid PDF page dimensions.");
    const scale = Math.min(220 / 72, Math.sqrt(8000000 / (natural.width * natural.height)), 10000 / natural.width, 10000 / natural.height);
    const viewport = page.getViewport({ scale }), canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    try {
      await page.render({ canvas, viewport, background: "rgb(255,255,255)" }).promise;
      // Skip blank pages without starting an OCR engine. Sampling is conservative for small text.
      const pixels = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0; for (let i = 0; i < pixels.length; i += 32) if (pixels[i] < 210 || pixels[i + 1] < 210 || pixels[i + 2] < 210) ink++;
      if (ink < 12) return { version: OCR_VERSION, page: page.pageNumber, width: canvas.width, height: canvas.height, rotation: viewport.rotation, text: "", confidence: 100, lines: [], manual };
      if (!this.worker) {
        const base = new URL("ocr/", document.baseURI).href;
        this.worker = await createWorker("eng+chi_sim", OEM.LSTM_ONLY, { workerPath: base + "worker.min.js", corePath: base + "core", langPath: base + "lang", workerBlobURL: false, cacheMethod: "none", gzip: true, logger: value => this.progress(`${value.status}${typeof value.progress === "number" ? ` ${Math.round(value.progress * 100)}%` : ""}`) });
        await this.worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1", user_defined_dpi: "220" });
      }
      const { data } = await this.worker.recognize(canvas, {}, { text: true, blocks: true });
      const lines = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)).filter(line => line.text.trim() && line.bbox.x1 > line.bbox.x0 && line.bbox.y1 > line.bbox.y0).slice(0, 5000).map(line => ({ text: line.text.trim().slice(0, 4000), ...line.bbox }));
      const text = data.text.trim().slice(0, 100000), confidence = Math.max(0, Math.min(100, data.confidence || 0));
      return { version: OCR_VERSION, page: page.pageNumber, width: canvas.width, height: canvas.height, rotation: viewport.rotation, text, confidence, lines, manual, reviewNotes: ocrReviewNotes(text, confidence) };
    } finally { canvas.width = canvas.height = 0; }
  }
  async close() { await this.worker?.terminate(); this.worker = undefined; }
}
