import { KNOWLEDGE_MAX_CHUNKS, KNOWLEDGE_MAX_TEXT, type KnowledgeAnchor, type KnowledgeChunk, type KnowledgeExtraction } from "./knowledge";
export interface TextBlock { text: string; anchor: KnowledgeAnchor }
/** Bounded paragraphs retain source positions; long paragraphs use a small overlapping window. */
export function textChunks(blocks: Iterable<TextBlock>): { chunks: KnowledgeChunk[]; limited: boolean } {
  const chunks: KnowledgeChunk[] = []; let characters = 0, limited = false;
  outer: for (const block of blocks) {
    // Retain an explicit unreadable-glyph marker rather than silently turning
    // a potentially signed number into a positive one after OCR failure.
    const text = block.text.replace(/\u0000/g, "\uFFFD").trim(); if (!text) continue;
    for (let offset = 0; offset < text.length;) {
      if (chunks.length >= KNOWLEDGE_MAX_CHUNKS || characters >= KNOWLEDGE_MAX_TEXT) { limited = true; break outer; }
      const maximum = Math.min(text.length, offset + 1200, offset + KNOWLEDGE_MAX_TEXT - characters);
      let end = maximum;
      if (maximum < text.length) {
        const window = text.slice(offset, maximum);
        // Prefer a complete sentence over an arbitrary window ending inside a
        // definition or range label. Keep long sentences/tables bounded too.
        const boundaries = [...window.matchAll(/[。！？]|[.!?](?=\s|$)/gu)].map(match => match.index! + 1).filter(position => position >= 600);
        const line = window.lastIndexOf("\n");
        if (boundaries.length) end = offset + boundaries.at(-1)!;
        else if (line >= 800) end = offset + line;
        else { const space = window.search(/\s\S{0,79}$/u); if (space >= 1040) end = offset + space; }
      }
      const piece = text.slice(offset, end);
      chunks.push({ id: String(chunks.length), text: piece, anchor: { ...block.anchor } }); characters += piece.length;
      if (end >= text.length) break;
      let next = Math.max(offset + 1, end - 160);
      const space = text.slice(next, end).search(/\s/u);
      if (space >= 0 && space < 80) next += space + 1;
      offset = next;
    }
  }
  return { chunks, limited };
}
export function extractMarkdown(content: string): KnowledgeExtraction {
  const lines = content.split(/\r?\n/), blocks: TextBlock[] = []; let start = 0, paragraph: string[] = [], heading = "", fence = false, frontmatter = lines[0]?.trim() === "---";
  const flush = (end: number) => { if (paragraph.length) blocks.push({ text: paragraph.join("\n"), anchor: { kind: "markdown", line: start + 1, endLine: end, heading } }); paragraph = []; };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (frontmatter) { if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
    if (/^\s*(`{3,}|~{3,})/.test(line)) { fence = !fence; continue; }
    const title = !fence && /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (title) { flush(i); heading = title[1].slice(0, 300); }
    if (!line.trim()) { flush(i); continue; }
    if (!paragraph.length) start = i;
    if (!fence) line = line.replace(/^ {0,3}#{1,6}\s+/, "").replace(/!?\[([^\]]*)\]\([^\n)]*\)/g, "$1").replace(/<\/?[A-Za-z][^>]*>/g, "");
    paragraph.push(line);
    if (paragraph.join("\n").length >= 1600) flush(i + 1);
    if (blocks.length > KNOWLEDGE_MAX_CHUNKS) break;
  }
  flush(lines.length); const result = textChunks(blocks), partial = result.limited || blocks.length > KNOWLEDGE_MAX_CHUNKS;
  return { chunks: result.chunks, partial, message: partial ? "Text extraction reached the per-source limit." : !result.chunks.length ? "This page contains no readable text." : undefined, totalUnits: lines.length, processedUnits: partial ? blocks.at(-1)?.anchor.endLine ?? 0 : lines.length };
}
export function knowledgeTerms(query: string): string[] {
  return [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).flatMap(term => /^[\p{Script=Han}]+$/u.test(term) && term.length > 2 ? [term, ...Array.from({ length: term.length - 1 }, (_, i) => term.slice(i, i + 2))] : [term]))].slice(0, 30);
}
