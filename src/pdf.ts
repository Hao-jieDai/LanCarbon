import { renderMystPreview, type PreviewAssets, type PreviewDocument } from "./preview/mystPreview";
import "katex/dist/katex.min.css";
import "./pdf.css";

interface PdfPayload { current: PreviewDocument; documents: PreviewDocument[]; assets: PreviewAssets }
declare global { interface Window { renderLanCarbonPdf(payload: PdfPayload): Promise<{ warnings: string[] }> } }

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
  const images = [...body.querySelectorAll("img")];
  images.forEach(image => { image.loading = "eager"; });
  await document.fonts.ready;
  await Promise.all(images.map(image => image.decode()));
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  // Scale only oversized display equations, keeping them as selectable text rather than images.
  body.querySelectorAll<HTMLElement>(".katex-display").forEach(display => {
    const equation = display.querySelector<HTMLElement>(".katex");
    if (equation && display.clientWidth > 0 && equation.scrollWidth > display.clientWidth) {
      equation.style.fontSize = `${display.clientWidth / equation.scrollWidth * 98}%`;
      rendered.warnings.push("A wide equation was reduced to fit the PDF page. Check its readability.");
    }
  });
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  return { warnings: rendered.warnings };
};
