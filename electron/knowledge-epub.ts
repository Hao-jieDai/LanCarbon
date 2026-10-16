import { EpubArchive, elements, safePath, target, xml } from "./epub-reader";
import { textChunks, type TextBlock } from "../src/shared/knowledgeText";
import { KNOWLEDGE_MAX_TEXT, type KnowledgeExtraction } from "../src/shared/knowledge";
import { epubPassages } from "../src/shared/epubPassages";
export function extractEpub(bytes: Buffer, progress: (unit: number, total: number) => void = () => {}): KnowledgeExtraction {
  const archive = new EpubArchive(bytes), container = xml(archive.read("META-INF/container.xml", 1024 * 1024)), opfPath = elements(container, "rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw Error("The EPUB package could not be located."); safePath(opfPath);
  if (archive.items.has("META-INF/encryption.xml") && elements(xml(archive.read("META-INF/encryption.xml", 1024 * 1024)), "EncryptionMethod").some(item => !/(?:idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC)$/.test(item.getAttribute("Algorithm") ?? ""))) throw Error("This EPUB is protected by DRM and cannot be indexed.");
  const opf = xml(archive.read(opfPath, 2 * 1024 * 1024));
  if (elements(opf, "meta").some(item => item.getAttribute("property") === "rendition:layout" && item.textContent?.trim() === "pre-paginated")) throw Error("Fixed-layout EPUB text extraction is not supported.");
  const items = new Map(elements(opf, "item").map(item => [item.getAttribute("id"), item]));
  const chapters = elements(opf, "itemref").flatMap(item => { const file = items.get(item.getAttribute("idref")); if (!file || !["application/xhtml+xml", "text/html"].includes(file.getAttribute("media-type") ?? "")) return []; const resolved = target(opfPath, file.getAttribute("href") ?? ""); if (!resolved) throw Error("Invalid EPUB chapter path."); return [resolved.file]; });
  if (!chapters.length || chapters.length > 3000) throw Error("This EPUB has no readable chapters or exceeds the 3,000-chapter limit.");
  const blocks: TextBlock[] = [], errors: string[] = []; let characters = 0, processed = 0;
  for (let index = 0; index < chapters.length; index++) {
    if (characters >= KNOWLEDGE_MAX_TEXT) { errors.push("Text extraction reached the per-source limit."); break; }
    try {
      const doc = xml(archive.read(chapters[index]), true), body = elements(doc, "body")[0]; if (!body) throw Error("No readable body");
      for (const passage of epubPassages(body)) {
        if (characters >= KNOWLEDGE_MAX_TEXT) break;
        blocks.push({ text: passage.text.slice(0, KNOWLEDGE_MAX_TEXT - characters), anchor: { kind: "epub", chapter: chapters[index], chapterIndex: index, paragraph: passage.paragraph, heading: passage.heading, fragment: passage.fragment } }); characters += passage.text.length;
      }
      processed++;
    } catch (error) { errors.push(`Chapter ${index + 1}: ${error instanceof Error ? error.message : "Could not extract text"}`); }
    progress(index + 1, chapters.length);
  }
  const result = textChunks(blocks), partial = result.limited || errors.length > 0 || characters >= KNOWLEDGE_MAX_TEXT;
  if (!result.chunks.length) throw Error(errors[0] ?? "This EPUB contains no readable text.");
  return { chunks: result.chunks, partial, message: [...errors.slice(0, 3), ...(result.limited ? ["Text extraction reached the per-source limit."] : [])].join(" ") || undefined, totalUnits: chapters.length, processedUnits: processed };
}
