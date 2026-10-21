import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { textChunks, type TextBlock } from "./shared/knowledgeText";
import { KNOWLEDGE_MAX_TEXT } from "./shared/knowledge";
import { pdfHasBrokenNumericGlyph, pdfTextNeedsOcr, type OcrPage } from "./shared/ocr";
import { LocalPdfOcr } from "./pdf-ocr";
declare global { interface Window { knowledgeParser: { job(): Promise<{ bytes: Uint8Array; onlyPage?: number; force?: boolean }>; cached(page: number): Promise<OcrPage | undefined>; save(value: OcrPage): Promise<void>; result(value: unknown): void; progress(unit: number, total: number, message?: string): void } } }
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
void (async () => {
  let document: pdfjs.PDFDocumentProxy | undefined;
  let loading: pdfjs.PDFDocumentLoadingTask | undefined;
  let ocr: LocalPdfOcr | undefined;
  try {
    const job = await window.knowledgeParser.job();
    loading = pdfjs.getDocument({ data: new Uint8Array(job.bytes), enableXfa: false, cMapUrl: new URL("pdfjs/cmaps/", documentBase()).href, cMapPacked: true, standardFontDataUrl: new URL("pdfjs/standard_fonts/", documentBase()).href, wasmUrl: new URL("pdfjs/wasm/", documentBase()).href, useWorkerFetch: false, useSystemFonts: true, disableAutoFetch: true });
    document = await loading.promise;
    const recognize = async (page: pdfjs.PDFPageProxy) => {
      const cached = !job.force && await window.knowledgeParser.cached(page.pageNumber).catch(() => undefined); if (cached) return cached;
      ocr ??= new LocalPdfOcr(message => window.knowledgeParser.progress(page.pageNumber, document!.numPages, `OCR · Page ${page.pageNumber} · ${message}`));
      window.knowledgeParser.progress(page.pageNumber, document!.numPages, `OCR · Page ${page.pageNumber}`);
      const value = await ocr.recognize(page, !!job.force); await window.knowledgeParser.save(value); return value;
    };
    if (job.onlyPage !== undefined) {
      if (!Number.isSafeInteger(job.onlyPage) || job.onlyPage < 1 || job.onlyPage > document.numPages) throw Error("Choose a page in this PDF.");
      const page = await document.getPage(job.onlyPage);
      try { window.knowledgeParser.result({ ocrPage: await recognize(page) }); } finally { page.cleanup(); }
      return;
    }
    const blocks: TextBlock[] = []; let characters = 0, blank = 0, failed = 0, processed = 0, ocrPages = 0, uncertain = 0;
    const count = Math.min(document.numPages, 500);
    for (let number = 1; number <= count && characters < KNOWLEDGE_MAX_TEXT; number++) {
      let page: pdfjs.PDFPageProxy | undefined;
      try {
        page = await document.getPage(number); const text = await page.getTextContent(); let paragraph = "";
        for (const item of text.items) if ("str" in item) paragraph += item.str + (item.hasEOL ? "\n" : " ");
        paragraph = paragraph.trim();
        const cached = await window.knowledgeParser.cached(number).catch(() => undefined); let recognized: OcrPage | undefined;
        if (job.force || cached?.manual || pdfTextNeedsOcr(paragraph)) {
          try { recognized = cached && !job.force ? cached : await recognize(page); if (recognized.text) { paragraph = recognized.text; ocrPages++; if (recognized.confidence < 55 || recognized.reviewNotes?.length) uncertain++; } }
          catch { failed++; }
        }
        const brokenNumeric = pdfHasBrokenNumericGlyph(paragraph);
        if (brokenNumeric) uncertain++;
        if (!paragraph) blank++;
        else { blocks.push({ text: paragraph.slice(0, KNOWLEDGE_MAX_TEXT - characters), anchor: { kind: "pdf", page: number, ...(recognized?.text ? { method: "ocr" as const, confidence: recognized.confidence, needsReview: !!recognized.reviewNotes?.length || brokenNumeric } : brokenNumeric ? { needsReview: true } : {}) } }); characters += paragraph.length; }
        processed++;
      } catch { failed++; }
      finally { page?.cleanup(); }
      window.knowledgeParser.progress(number, document.numPages);
    }
    const chunks = textChunks(blocks), partial = chunks.limited || blank > 0 || failed > 0 || uncertain > 0 || processed < document.numPages || characters >= KNOWLEDGE_MAX_TEXT;
    if (!chunks.chunks.length) throw Error("No readable text was found after local OCR. Check the scan quality or use Open externally.");
    const message = [ocrPages && `Local OCR: ${ocrPages} pages.`, uncertain && `${uncertain} pages have uncertain text, numeric glyphs or grouping; check the original.`, blank && `${blank} pages contain no readable text.`, failed && `${failed} pages could not be extracted.`, processed < document.numPages && `Processed ${processed} of ${document.numPages} pages.`, (chunks.limited || characters >= KNOWLEDGE_MAX_TEXT) && "Text extraction reached the per-source limit."].filter(Boolean).join(" ");
    window.knowledgeParser.result({ chunks: chunks.chunks, partial, message: message || undefined, totalUnits: document.numPages, processedUnits: processed, ocrPages, ocrVersion: 1 });
  } catch (error) { window.knowledgeParser.result({ error: error instanceof Error ? error.message : "Could not extract PDF text." }); }
  finally { await ocr?.close(); await loading?.destroy(); }
})();
function documentBase() { return window.document.baseURI; }
