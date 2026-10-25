import { renderMystPreview, type PreviewAssets, type PreviewDocument } from "./preview/mystPreview";
import "katex/dist/katex.min.css";
import "./pdf.css";
import type { AIChat, ChatPdfOptions } from "./shared/ai";
import { citationLocation, citedLabels, mapCitations } from "./shared/grounding";
import { chatPdfMarkdown } from "./shared/chatPdf";

interface PdfPayload { current: PreviewDocument; documents: PreviewDocument[]; assets: PreviewAssets }
declare global { interface Window { renderLanCarbonPdf(payload: PdfPayload): Promise<{ warnings: string[] }>; renderLanCarbonChatPdf(payload: { chat: AIChat; options: ChatPdfOptions }): Promise<{ warnings: string[] }> } }

window.renderLanCarbonChatPdf = async ({ chat, options }) => {
  const root = document.getElementById("pdf-page")!, warnings: string[] = [];
  const heading = document.createElement("h1"); heading.className = "page-title"; heading.textContent = chat.title || "Chat";
  root.replaceChildren(heading); document.title = heading.textContent;
  const metadata = document.createElement("p"); metadata.className = "pdf-chat-metadata";
  metadata.textContent = `LanCarbon · ${new Date(chat.createdAt).toLocaleString()} – ${new Date(chat.updatedAt).toLocaleString()}`;
  root.append(metadata);
  for (const [index, message] of chat.messages.entries()) {
    const section = document.createElement("section"); section.className = `pdf-chat-message pdf-chat-${message.role}`;
    const title = document.createElement("h2"); title.textContent = `${index + 1}. ${message.role === "user" ? "You" : [message.providerName, message.modelName || message.modelId].filter(Boolean).join(" · ") || "Assistant"}`;
    section.append(title);
    const time = document.createElement("p"); time.className = "pdf-chat-metadata";
    time.textContent = `${new Date(message.createdAt).toLocaleString()}${message.status !== "complete" ? ` · ${message.status} (partial)` : ""}`; section.append(time);
    const evidence = message.grounding?.evidence ?? [];
    const cited = citedLabels(message.content + (options.includeThinking ? `\n${message.reasoning ?? ""}` : ""));
    const referenced = evidence.filter(hit => cited.has(hit.label));
    const anchor = (label: string) => `pdf-message-${index + 1}-${label}`;
    const render = (text: string, className: string) => {
      const body = document.createElement("div"); body.className = `pdf-body ${className}`;
      const content = mapCitations(chatPdfMarkdown(text), label => referenced.some(hit => hit.label === label) ? `[${label}](#${anchor(label)})` : `[${label}]`);
      const rendered = renderMystPreview({ id: `pdf-chat-${index}`, title: "Chat", content, navigationAnchors: referenced.map(hit => anchor(hit.label)) });
      if (rendered.error) { body.textContent = text; body.classList.add("pdf-plain-text"); warnings.push(`Message ${index + 1}: Markdown could not be rendered; its complete text was preserved.`); }
      else { body.innerHTML = rendered.html; warnings.push(...rendered.warnings); }
      // Unavailable workspace/asset links become labels rather than broken PDF links.
      body.querySelectorAll<HTMLAnchorElement>("a[data-preview-note], a[data-asset-id]").forEach(link => { const label = document.createElement("span"); label.replaceChildren(...link.childNodes); link.replaceWith(label); });
      body.querySelectorAll("details").forEach(item => { item.open = true; });
      // Namespace generated headings/equations, preserving links within this message.
      const ids = new Map<string, string>();
      body.querySelectorAll<HTMLElement>("[id]").forEach(item => { const old = item.id; item.id = `pdf-body-${index}-${className}-${old}`; ids.set(old, item.id); });
      body.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(link => { const id = ids.get(link.getAttribute("href")!.slice(1)); if (id) link.setAttribute("href", `#${id}`); });
      return body;
    };
    if (options.includeThinking && message.reasoning) {
      const thinking = document.createElement("div"); thinking.className = "pdf-thinking";
      const label = document.createElement("h3"); label.textContent = "Thinking";
      // The on-screen Thinking is raw returned text, not Markdown. Preserve currency, delimiters
      // and all lines verbatim instead of interpreting model scratch text as mathematical markup.
      const text = document.createElement("div"); text.className = "pdf-thinking-text pdf-plain-text"; text.textContent = message.reasoning;
      thinking.append(label, text); section.append(thinking);
      const answer = document.createElement("h3"); answer.textContent = "Answer"; section.append(answer);
    }
    section.append(render(message.content, "pdf-chat-answer"));
    if (message.error) { const error = document.createElement("p"); error.className = "pdf-chat-warning"; error.textContent = message.error; section.append(error); }
    const notes = [...(message.grounding?.quantityCheck?.issues ?? []), ...(message.grounding?.warnings.filter(note => /needs checking|unresolved|unrecognized|did not supply|unavailable|changed|incomplete/iu.test(note)) ?? [])];
    for (const note of notes) {
      const warning = document.createElement("p"); warning.className = "pdf-chat-warning"; warning.textContent = note; section.append(warning);
    }
    if (referenced.length) {
      const sources = document.createElement("div"); sources.className = "pdf-chat-sources";
      const label = document.createElement("h3"); label.textContent = "Sources"; sources.append(label);
      for (const hit of referenced) {
        const entry = document.createElement("div"); entry.className = "pdf-source-entry";
        const name = document.createElement("p"); name.id = anchor(hit.label); name.textContent = `[${hit.label}] ${hit.source.title} · ${citationLocation(hit)}`; entry.append(name);
        if (options.includeEvidence) { const excerpt = document.createElement("blockquote"); excerpt.className = "pdf-plain-text"; excerpt.textContent = hit.chunk.text; entry.append(excerpt); }
        sources.append(entry);
      }
      section.append(sources);
    }
    root.append(section);
  }
  await settlePdf(root, warnings);
  return { warnings: [...new Set(warnings)] };
};

async function settlePdf(body: HTMLElement, warnings: string[]) {
  const images = [...body.querySelectorAll("img")]; images.forEach(image => { image.loading = "eager"; });
  await document.fonts.ready; await Promise.all(images.map(image => image.decode()));
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  body.querySelectorAll<HTMLElement>(".katex-display").forEach(display => {
    const equation = display.querySelector<HTMLElement>(".katex");
    if (equation && display.clientWidth > 0 && equation.scrollWidth > display.clientWidth) {
      equation.style.fontSize = `${display.clientWidth / equation.scrollWidth * 98}%`;
      warnings.push("A wide equation was reduced to fit the PDF page. Check its readability.");
    }
  });
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

window.renderLanCarbonPdf = async ({ current, documents, assets }) => {
  const rendered = renderMystPreview(current, documents, assets);
  if (rendered.error) throw new Error(`Preview unavailable: ${rendered.error}`);
  const root = document.getElementById("pdf-page")!;
  const heading = document.createElement("h1"); heading.className = "page-title"; heading.textContent = current.title.trim() || "Untitled Note";
  const body = document.createElement("article"); body.className = "pdf-body"; body.innerHTML = rendered.html;
  const first = body.firstElementChild;
  if (first?.tagName === "H1" && first.textContent?.trim() === heading.textContent) { heading.id = first.id; first.remove(); }
  root.replaceChildren(heading, body); document.title = heading.textContent;
  // Printing a single page must not create broken links to omitted Book pages or attachments.
  body.querySelectorAll<HTMLAnchorElement>("a[data-preview-note], a[data-asset-id]").forEach(link => {
    if (link.dataset.previewNote === current.id) return;
    const label = document.createElement("span"); label.replaceChildren(...link.childNodes); link.replaceWith(label);
  });
  body.querySelectorAll("details").forEach(item => { item.open = true; });
  await settlePdf(body, rendered.warnings);
  return { warnings: rendered.warnings };
};
