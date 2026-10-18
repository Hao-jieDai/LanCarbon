import { Util, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import type { OcrPage } from "./shared/ocr";
import { pdfTextNeedsOcr } from "./shared/ocr";
type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;
/** Map recognition coordinates back into PDF coordinates so the normal text layer/find/translation work together. */
export function ocrTextContent(page: PDFPageProxy, recognized: OcrPage): TextContent {
  const viewport = page.getViewport({ scale: 1, rotation: recognized.rotation }), inverse = Util.inverseTransform(viewport.transform), sx = viewport.width / recognized.width, sy = viewport.height / recognized.height;
  return { lang: "zh", styles: { LocalOCR: { fontFamily: "sans-serif", ascent: 0.85, descent: -0.15, vertical: false } }, items: recognized.lines.map(line => {
    const height = (line.y1 - line.y0) * sy;
    return { str: line.text, dir: "ltr", transform: Util.transform(inverse, [height, 0, 0, -height, line.x0 * sx, line.y1 * sy - height * 0.15]), width: (line.x1 - line.x0) * sx, height, fontName: "LocalOCR", hasEOL: true };
  }) };
}
export function attachOcrText(document: PDFDocumentProxy, cached: (page: number) => Promise<OcrPage | undefined>) {
  const original = document.getPage.bind(document), patched = new WeakSet<PDFPageProxy>(), pages = new Map<number, Promise<OcrPage | undefined>>();
  const read = (number: number) => { let value = pages.get(number); if (!value) { value = cached(number).catch(() => undefined); pages.set(number, value); } return value; };
  document.getPage = async number => {
    const page = await original(number); if (patched.has(page)) return page; patched.add(page);
    const stream = page.streamTextContent.bind(page);
    page.streamTextContent = options => new ReadableStream({ start(controller) { void (async () => {
      // getTextContent itself consumes streamTextContent. Read the original stream here to avoid recursion.
      const reader = stream(options).getReader(), text: TextContent = { items: [], styles: {}, lang: null };
      try { while (true) { const value = await reader.read(); if (value.done) break; text.items.push(...value.value.items); Object.assign(text.styles, value.value.styles); text.lang = value.value.lang ?? text.lang; } } finally { reader.releaseLock(); }
      const recognized = await read(number);
      controller.enqueue(recognized?.lines.length && (recognized.manual || pdfTextNeedsOcr(text.items.flatMap(item => "str" in item ? [item.str] : []).join(" "))) ? ocrTextContent(page, recognized) : text); controller.close();
    })().catch(error => controller.error(error)); } });
    return page;
  };
  return { refresh() { pages.clear(); } };
}
