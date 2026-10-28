import type { AnnotationAnchor, PageRect, ReadingAnnotation } from "./shared/annotations";

export interface AnnotationChapter { path: string; title: string; index: number }
export interface AnnotationSelection { quote: string; anchor: AnnotationAnchor; x: number; y: number }
export interface AnnotationGeometry { host: HTMLElement; id: string; x: number; y: number; width: number; height: number }
const element = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => element(node)?.closest(".reader-annotation-layer,.endOfContent,script,style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }), nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}
function rangeRects(range: Range, root: HTMLElement): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const node of textNodes(root)) {
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange(); part.selectNodeContents(node);
    if (range.startContainer === node) part.setStart(node, range.startOffset);
    if (range.endContainer === node) part.setEnd(node, range.endOffset);
    // For element-boundary selections, clip using range boundary comparisons too.
    if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) part.setStart(range.startContainer, range.startOffset);
    if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) part.setEnd(range.endContainer, range.endOffset);
    if (!part.collapsed) rects.push(...Array.from(part.getClientRects()).filter(r => r.width > .1 && r.height > .1));
  }
  return rects;
}
export function captureAnnotation(root: HTMLElement, chapter?: AnnotationChapter): AnnotationSelection | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0), start = element(range.startContainer), end = element(range.endContainer);
  if (!start || !end || !root.contains(start) || !root.contains(end)) return;
  let quote = range.toString(); if (!quote.trim() || quote.length > 20000) return;
  let anchor: AnnotationAnchor;
  if (chapter) {
    const prose = root.querySelector<HTMLElement>(".epub-prose");
    if (!prose?.contains(start) || !prose.contains(end)) return;
    const before = range.cloneRange(); before.selectNodeContents(prose); before.setEnd(range.startContainer, range.startOffset);
    const offset = before.toString().length, text = prose.textContent ?? "";
    quote = text.slice(offset, offset + quote.length);
    const paragraph = Number(start.closest("[data-epub-paragraph]")?.getAttribute("data-epub-paragraph")) || undefined;
    anchor = { kind: "epub", chapter: chapter.path, chapterIndex: chapter.index, chapterTitle: chapter.title.slice(0, 1000), start: offset, end: offset + quote.length, prefix: text.slice(Math.max(0, offset - 60), offset), suffix: text.slice(offset + quote.length, offset + quote.length + 60), paragraph };
  } else {
    if (!start.closest(".textLayer") || !end.closest(".textLayer")) return;
    const rects: PageRect[] = [];
    for (const layer of root.querySelectorAll<HTMLElement>(".pdfViewer .page .textLayer")) {
      if (!range.intersectsNode(layer)) continue;
      const bounds = layer.getBoundingClientRect(), page = Number(layer.closest(".page")?.getAttribute("data-page-number"));
      if (!bounds.width || !bounds.height || !page) continue;
      for (const r of rangeRects(range, layer)) {
        const x = Math.max(0, (r.left - bounds.left) / bounds.width), y = Math.max(0, (r.top - bounds.top) / bounds.height);
        const width = Math.min(1 - x, r.width / bounds.width), height = Math.min(1 - y, r.height / bounds.height);
        if (width > 0 && height > 0) rects.push({ page, x, y, width, height });
      }
    }
    if (!rects.length || rects.length > 2000) return;
    anchor = { kind: "pdf", rects };
  }
  const bounds = range.getBoundingClientRect();
  return { quote, anchor, x: Math.max(12, Math.min(window.innerWidth - 330, bounds.left)), y: Math.max(12, Math.min(window.innerHeight - 60, bounds.top - 42)) };
}
export function epubRange(prose: HTMLElement, annotation: ReadingAnnotation): Range | undefined {
  const a = annotation.anchor; if (a.kind !== "epub") return;
  const text = prose.textContent ?? "";
  if (text.slice(a.start, a.end) !== annotation.quote || text.slice(Math.max(0, a.start - a.prefix.length), a.start) !== a.prefix || text.slice(a.end, a.end + a.suffix.length) !== a.suffix) return;
  let offset = 0; const range = document.createRange(); let started = false;
  for (const node of textNodes(prose)) {
    const end = offset + node.length;
    if (!started && a.start >= offset && a.start < end) { range.setStart(node, a.start - offset); started = true; }
    if (started && a.end <= end) { range.setEnd(node, a.end - offset); return range; }
    offset = end;
  }
}
export function annotationGeometry(root: HTMLElement, annotation: ReadingAnnotation, chapter?: AnnotationChapter): AnnotationGeometry[] {
  const a = annotation.anchor;
  if (a.kind === "pdf") return a.rects.flatMap(r => {
    const host = root.querySelector<HTMLElement>(`.pdfViewer .page[data-page-number="${r.page}"] .textLayer`);
    if (!host) return [];
    return [{ host, id: annotation.id, x: r.x * host.clientWidth, y: r.y * host.clientHeight, width: r.width * host.clientWidth, height: r.height * host.clientHeight }];
  });
  if (chapter?.path !== a.chapter) return [];
  const host = root.querySelector<HTMLElement>(".epub-prose"); if (!host) return [];
  const range = epubRange(host, annotation); if (!range) return [];
  const bounds = host.getBoundingClientRect();
  return rangeRects(range, host).map(r => ({ host, id: annotation.id, x: r.left - bounds.left, y: r.top - bounds.top, width: r.width, height: r.height }));
}
