import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { textChunks, type TextBlock } from "./shared/knowledgeText";
import { KNOWLEDGE_MAX_TEXT } from "./shared/knowledge";
declare global { interface Window { knowledgeParser: { job(): Promise<{ bytes: Uint8Array }>; result(value: unknown): void; progress(unit: number, total: number): void } } }
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
void (async () => {
  let document: pdfjs.PDFDocumentProxy | undefined;
  let loading: pdfjs.PDFDocumentLoadingTask | undefined;
  try {
    const job = await window.knowledgeParser.job();
    loading = pdfjs.getDocument({ data: new Uint8Array(job.bytes), enableXfa: false, cMapUrl: new URL("pdfjs/cmaps/", documentBase()).href, cMapPacked: true, standardFontDataUrl: new URL("pdfjs/standard_fonts/", documentBase()).href, wasmUrl: new URL("pdfjs/wasm/", documentBase()).href, useWorkerFetch: false, useSystemFonts: true, disableAutoFetch: true });
    document = await loading.promise;
    const blocks: TextBlock[] = []; let characters = 0, blank = 0, failed = 0, processed = 0;
    const count = Math.min(document.numPages, 500);
    for (let number = 1; number <= count && characters < KNOWLEDGE_MAX_TEXT; number++) {
      let page: pdfjs.PDFPageProxy | undefined;
      try {
        page = await document.getPage(number); const text = await page.getTextContent(); let paragraph = "";
        for (const item of text.items) if ("str" in item) paragraph += item.str + (item.hasEOL ? "\n" : " ");
        paragraph = paragraph.trim(); if (!paragraph) blank++;
        else { blocks.push({ text: paragraph.slice(0, KNOWLEDGE_MAX_TEXT - characters), anchor: { kind: "pdf", page: number } }); characters += paragraph.length; }
        processed++;
      } catch { failed++; }
      finally { page?.cleanup(); }
      window.knowledgeParser.progress(number, document.numPages);
    }
    const chunks = textChunks(blocks), partial = chunks.limited || blank > 0 || failed > 0 || processed < document.numPages || characters >= KNOWLEDGE_MAX_TEXT;
    if (!chunks.chunks.length) throw Error("No selectable PDF text was found. Scanned pages need OCR, which is not included in text indexing.");
    const message = [blank && `${blank} pages contain no selectable text.`, failed && `${failed} pages could not be extracted.`, processed < document.numPages && `Processed ${processed} of ${document.numPages} pages.`, (chunks.limited || characters >= KNOWLEDGE_MAX_TEXT) && "Text extraction reached the per-source limit."].filter(Boolean).join(" ");
    window.knowledgeParser.result({ chunks: chunks.chunks, partial, message: message || undefined, totalUnits: document.numPages, processedUnits: processed });
  } catch (error) { window.knowledgeParser.result({ error: error instanceof Error ? error.message : "Could not extract PDF text." }); }
  finally { await loading?.destroy(); }
})();
function documentBase() { return window.document.baseURI; }
