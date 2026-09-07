import DOMPurify from "dompurify";
import katex from "katex";
import { all, defaultHandlers, type Handler } from "mdast-util-to-hast";
import { normalizeLabel, type GenericNode, type GenericParent } from "myst-common";
import { mystParse } from "myst-parser";
import { mystToHtml } from "myst-to-html";
import { VFile } from "vfile";
import { parseDocument } from "yaml";
import { assetId } from "../shared/assets";
import { citationText } from "../shared/bibliography";
import type { BibliographyEntry } from "../shared/types";
export type PreviewAssets = Record<string, { name: string; url?: string }>;

export interface PreviewDocument { id: string; title: string; content: string; path?: string; label?: string; bibliography?:BibliographyEntry[] }
export interface PreviewTarget { documentId: string; anchor: string; title: string; number?: number }
export interface PreviewResult { html: string; warnings: string[]; error?: string }
interface Parsed { tree: GenericParent; warnings: string[]; macros: Record<string, string>; label?: string }
const cache = new Map<string, Parsed>();
const normalize = (label: string) => normalizeLabel(label)?.identifier ?? label;
const anchorId = (label: string) => `lc-target-${encodeURIComponent(label)}`;
const text = (value: string) => ({ type: "text" as const, value });
const nodeText = (node: GenericNode): string => node.value ?? node.children?.map(nodeText).join("") ?? "";

function parseSource(content: string): Parsed {
  const cached = cache.get(content);
  if (cached) return structuredClone(cached);
  const file = new VFile();
  const warnings: string[] = [];
  let source = content;
  let label: string | undefined;
  const macros: Record<string, string> = Object.create(null);
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(content);
  if (frontmatter) {
    const yaml = parseDocument(frontmatter[1]);
    if (yaml.errors.length) warnings.push("Invalid YAML frontmatter; check the source before export.");
    else {
      try {
        const metadata = yaml.toJS({ maxAliasCount: 50 });
        if (typeof metadata?.label === "string") label = metadata.label;
        if (metadata?.math && typeof metadata.math === "object") {
          for (const [key, value] of Object.entries(metadata.math).slice(0, 100)) {
            if (/^\\[a-zA-Z]+$/.test(key) && typeof value === "string" && value.length <= 4000) macros[key] = value;
          }
        }
        source = content.slice(frontmatter[0].length);
      } catch { warnings.push("Unable to read frontmatter safely; check YAML aliases."); }
    }
  }
  const tree = mystParse(source, { vfile: file, markdownit: { html: false }, extensions: { smartquotes: false } });
  warnings.push(...file.messages.map(message => String(message.reason)));
  // Flatten only successfully parsed official wrappers. Preserve unsupported syntax visibly.
  function prepare(parent: GenericNode) {
    parent.children = parent.children?.flatMap(child => {
      if (["mystDirective", "mystRole"].includes(child.type)) {
        if (child.children?.length) { prepare(child); return child.children; }
        warnings.push(`Unsupported ${child.type === "mystRole" ? "role" : "directive"}: ${child.name}. Source is preserved.`);
        return { type: child.type === "mystRole" ? "inlineCode" : "code", value: `{${child.name}} ${child.args ?? ""}\n${child.value ?? ""}`.trim() };
      }
      prepare(child);
      if (child.type === "admonition") {
        child.previewKind = child.kind;
        if (child.children?.some(item => item.type === "admonitionTitle")) child.kind = "admonition";
      }
      return child;
    });
    // Labels apply to the next sibling, including inside nested directives.
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === "mystTarget" && children[i + 1]) children[i + 1].identifier = normalize(children[i].label ?? "");
    }
    parent.children = parent.children?.filter(child => child.type !== "mystTarget");
  }
  prepare(tree);
  const parsed = { tree, warnings, macros, label };
  // Bound retained source/AST memory. Large documents are not cached.
  if (content.length < 100_000) {
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(content, structuredClone(parsed));
  }
  return parsed;
}

function visit(node: GenericNode, callback: (node: GenericNode) => void) {
  callback(node); node.children?.forEach(child => visit(child, callback));
}

export function renderMystPreview(current: PreviewDocument, documents: PreviewDocument[] = [current], assets: PreviewAssets = {}): PreviewResult {
  try {
    const warnings = new Set<string>();
    const sources = documents.some(doc => doc.id === current.id)
      ? documents.map(doc => doc.id === current.id ? current : doc) : [...documents, current];
    const parsed = new Map<string, Parsed>();
    const targets = new Map<string, PreviewTarget[]>();
    const localTargets = new Map<string, Map<string, PreviewTarget>>();
    function addTarget(label: string, target: PreviewTarget) {
      const key = normalize(label);
      const local = localTargets.get(target.documentId)!;
      if (local.has(key)) { if (target.documentId === current.id) warnings.add(`Duplicate label: ${label}`); return; }
      local.set(key, target); targets.set(key, [...targets.get(key) ?? [], target]);
    }
    for (const doc of sources) {
      let item: Parsed;
      try { item = parseSource(doc.content); }
      catch (error) {
        if (doc.id === current.id) throw error;
        warnings.add(`Cannot index page: ${doc.title}`); continue;
      }
      parsed.set(doc.id, item); localTargets.set(doc.id, new Map());
      if (doc.id === current.id) item.warnings.forEach(warning => warnings.add(warning));
      const pageTarget = { documentId: doc.id, anchor: "", title: doc.title };
      if (doc.label || item.label) addTarget(doc.label || item.label!, pageTarget);
      let equation = 0;
      const slugs = new Map<string, number>();
      visit(item.tree, node => {
        if (node.type === "heading" && !node.identifier) {
          const slug = normalize(nodeText(node)).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "heading";
          const count = slugs.get(slug) ?? 0; slugs.set(slug, count + 1);
          node.identifier = count ? `${slug}-${count}` : slug;
        }
        if (node.type === "math") {
          // Dollar math can contain a native LaTeX label.
          node.value = (node.value ?? "").replace(/\\label\{([^}]+)\}/g, (_match: string, label: string) => { node.identifier ??= normalize(label); return ""; });
          if (node.enumerated !== false) node.previewNumber = ++equation;
        }
        if (node.identifier && !["crossReference", "link", "cite"].includes(node.type)) {
          const identifier = normalize(node.identifier);
          node.identifier = identifier;
          // Custom compound handlers create several elements from the same node;
          // assign their anchor only on the outer element to avoid duplicate IDs.
          if (!["heading", "math", "inlineMath", "admonition", "details", "container", "code"].includes(node.type)) {
            node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: anchorId(identifier) } };
          }
          addTarget(identifier, { documentId: doc.id, anchor: anchorId(identifier), title: node.type === "math" ? `Equation ${node.previewNumber ?? ""}`.trim() : nodeText(node) || identifier, number: node.previewNumber });
        }
      });
    }
    const active = parsed.get(current.id)!;
    const references=new Map<string,BibliographyEntry>();for(const entry of current.bibliography??[]){const key=entry.key.toLowerCase();if(references.has(key))warnings.add(`Duplicate citation key: ${entry.key}`);else references.set(key,entry);}
    const cited:string[]=[];visit(active.tree,node=>{if(node.type==="cite"&&node.identifier){const key=String(node.identifier).toLowerCase();if(!cited.includes(key))cited.push(key);if(!references.has(key))warnings.add(`Missing citation: @${node.identifier}`);}});
    function resolve(url: string): PreviewTarget | undefined {
      if (url.startsWith("#")) {
        const key = normalize(decodeURIComponent(url.slice(1)));
        const local = localTargets.get(current.id)?.get(key);
        if (local) return local;
        const matches = targets.get(key) ?? [];
        if (matches.length === 1) return matches[0];
        warnings.add(matches.length ? `Ambiguous reference: ${key}` : `Unresolved reference: ${key}`); return;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("/")) return;
      const base = new URL(current.path ?? "index.md", "https://preview.invalid/");
      const destination = new URL(url, base);
      const doc = sources.find(item => item.path && new URL(item.path, "https://preview.invalid/").pathname === destination.pathname);
      if (!doc) { warnings.add(`Unresolved page: ${url}`); return; }
      if (!destination.hash) return { documentId: doc.id, anchor: "", title: doc.title };
      const target = localTargets.get(doc.id)?.get(normalize(decodeURIComponent(destination.hash.slice(1))));
      if (!target) warnings.add(`Unresolved reference: ${url}`);
      return target;
    }
    // Resolve through the Book index before myst-to-html's document-only transform.
    visit(active.tree, node => {
      if (!["crossReference", "link"].includes(node.type)) return;
      const url = node.type === "crossReference" ? (node.kind === "doc" ? node.identifier : `#${node.identifier}`) : node.url;
      const resource = typeof url === "string" && assetId(url);
      if (resource) {
        if (assets[resource]) { node.type = "previewAssetLink"; node.assetId = resource; }
        else { warnings.add(`Missing resource: ${url}`); node.type = "previewMissingReference"; }
        return;
      }
      let target: PreviewTarget | undefined;
      try { target = resolve(url); } catch { warnings.add(`Invalid reference: ${String(url)}`); }
      if (!target) {
        if (node.type === "crossReference" || !/^(https?:|mailto:)/i.test(url)) {
          node.type = "previewMissingReference"; node.children = node.children?.length ? node.children : [text(url)];
        }
        return;
      }
      node.type = "previewReference"; node.previewTarget = target;
      const title = node.kind === "eq" && target.number ? `(${target.number})` : target.title;
      if (!node.children?.length) node.children = [text(title)];
      else visit(node, child => { if (child.type === "text") child.value = (child.value ?? "").replace(/%s|\{number\}/g, String(target!.number ?? target!.title)).replace(/\{name\}/g, target!.title); });
    });
    const mathMarkup: string[] = [];
    const mathHandler: Handler = (h, node) => {
      let markup: string;
      try {
        markup = katex.renderToString(node.value, { displayMode: node.type === "math", throwOnError: true, trust: false, strict: "error", maxExpand: 500, maxSize: 20, macros: { ...active.macros }, output: "htmlAndMathml" });
      } catch (error) {
        warnings.add(`Math: ${error instanceof Error ? error.message : "Unable to render formula"}`);
        return h(node, "code", { className: "math-error", id: node.identifier ? anchorId(node.identifier) : undefined }, [text(node.value)]);
      }
      const index = mathMarkup.push(markup) - 1;
      return h(node, node.type === "math" ? "div" : "span", { className: node.type === "math" ? "preview-equation" : "preview-inline-math", id: node.identifier ? anchorId(node.identifier) : undefined }, [
        h(node, "span", { "data-math-slot": String(index) }, []),
        ...(node.type === "math" && node.previewNumber ? [h(node, "span", { className: "equation-number" }, [text(`(${node.previewNumber})`)])] : [])
      ]);
    };
    const unsupported: Handler = (h, node) => {
      warnings.add(`Not available in local preview: ${node.type}. Verify with Jupyter Book.`);
      return h(node, "pre", { className: "preview-unsupported" }, [text(`[${node.type}] ${node.value ?? node.url ?? node.file ?? nodeText(node)}`)]);
    };
    const html = mystToHtml(active.tree, {
      hast: { allowDangerousHtml: false, handlers: {
        math: mathHandler, inlineMath: mathHandler,
        heading: (h, node) => h(node, `h${node.depth}`, { id: anchorId(node.identifier) }, all(h, node)),
        admonition: (h, node) => {
          const properties = { className: `admonition ${node.previewKind ?? node.kind ?? "note"}`, id: node.identifier ? anchorId(node.identifier) : undefined };
          if (node.class?.split(/\s+/).includes("dropdown")) {
            const title = node.children?.find((child: GenericNode) => child.type === "admonitionTitle");
            return h(node, "details", { ...properties, open: node.open === true }, [h(node, "summary", title ? all(h, title) : [text("Details")]), ...all(h, { ...node, children: node.children?.filter((child: GenericNode) => child !== title) })]);
          }
          return h(node, "aside", properties, all(h, node));
        },
        details: (h, node) => h(node, "details", { open: node.open === true, id: node.identifier ? anchorId(node.identifier) : undefined }, all(h, node)),
        summary: (h, node) => h(node, "summary", all(h, node)),
        underline: (h, node) => h(node, "u", all(h, node)),
        smallcaps: (h, node) => h(node, "span", { className: "preview-smallcaps" }, all(h, node)),
        // MyST stores alignment on cells, while the mdast handler expects a
        // column array on the table. Preserve it through HTML sanitization.
        table: (h, node) => defaultHandlers.table(h, { ...node, align: node.children?.[0]?.children?.map((cell: GenericNode) => ["left", "center", "right"].includes(cell.align) ? cell.align : null) }),
        previewReference: (h, node) => h(node, "a", { href: `#${node.previewTarget.anchor}`, "data-preview-note": node.previewTarget.documentId, "data-preview-anchor": node.previewTarget.anchor }, all(h, node)),
        previewMissingReference: (h, node) => h(node, "span", { className: "preview-unresolved", title: "Reference could not be resolved in this Book" }, all(h, node)),
        previewAssetLink: (h, node) => h(node,"a",{href:"#", "data-asset-id":node.assetId, title:"Save a copy"},all(h,node)),
        cite:(h,node)=>{const entry=references.get(String(node.identifier??"").toLowerCase());return h(node,"span",{className:entry?"preview-citation":"preview-unresolved"},[text(entry?citationText(entry,node.kind==="narrative"):`@${node.identifier}`)]);},
        citeGroup:(h,node)=>h(node,"span",{className:"preview-citation-group"},[text("("),...((node.children??[]).flatMap((child:GenericNode,i:number)=>[...(i?[text("; ")]:[]),...(all(h,{...node,children:[child]}))])),text(")")]),
        bibliography:(h,node)=>h(node,"span",{},[]),
        image: (h, node) => {
          const id = typeof node.url === "string" && assetId(node.url);
          if (!id || !assets[id]?.url) { warnings.add(`Image unavailable: ${node.url ?? "unknown image"}. Import it through Insert image.`); return h(node,"span",{className:"preview-unresolved"},[text(node.alt || "Image unavailable")]); }
          return h(node,"span",{"data-image-asset":id,"data-image-alt":node.alt ?? assets[id].name,"data-image-width":node.width ?? "","data-image-align":node.align ?? ""},[]);
        },
        iframe: unsupported, embed: unsupported, include: unsupported, mermaid: unsupported,
        myst: unsupported, mdast: unsupported, output: unsupported,
        div: (h, node) => {
          const classes = (Array.isArray(node.class) ? node.class : String(node.class ?? "").split(/\s+/)).filter((value: string) => /^lc-align-(?:left|center|right)$/.test(value));
          return h(node, "div", { className: classes, id: node.identifier ? anchorId(node.identifier) : undefined }, all(h, node));
        },
        container: (h, node) => h(node, "figure", { id: node.identifier ? anchorId(node.identifier) : undefined, "data-figure-align":node.align ?? "" }, all(h, node)),
        code: (h, node) => h(node, "pre", { id: node.identifier ? anchorId(node.identifier) : undefined }, [h(node, "code", {}, [text(node.value)])])
      } }, stringifyHtml: { allowDangerousHtml: false }
    });
    const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["audio", "embed", "form", "iframe", "img", "object", "style", "video", "input", "button"], FORBID_ATTR: ["srcset", "style"] });
    const host = document.createElement("div"); host.innerHTML = sanitized;
    // Only trusted KaTeX-generated markup is inserted after sanitization. User HTML
    // cannot create these slots (parser HTML disabled); trust:false blocks HTML/URL macros.
    host.querySelectorAll<HTMLElement>("[data-math-slot]").forEach(slot => { slot.innerHTML = mathMarkup[Number(slot.dataset.mathSlot)] ?? ""; slot.removeAttribute("data-math-slot"); });
    host.querySelectorAll<HTMLElement>("[data-image-asset]").forEach(slot => {
      const url = assets[slot.dataset.imageAsset!]?.url;
      if (!url || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) return;
      const image = document.createElement("img"); image.src = url; image.alt = slot.dataset.imageAlt ?? ""; image.loading = "lazy";
      const width=slot.dataset.imageWidth??"";
      if (/^\d+(?:\.\d+)?(?:px|%)$/.test(width)) image.style.width=width;
      else if (/^\d+$/.test(width)) image.style.width=`${width}px`;
      const align=slot.dataset.imageAlign || slot.closest<HTMLElement>("[data-figure-align]")?.dataset.figureAlign || "center";
      image.style.marginLeft=align==="left"?"0":"auto"; image.style.marginRight=align==="right"?"0":"auto";
      const figure=slot.closest("figure"); if(figure&&["left","center","right"].includes(align))figure.style.textAlign=align;
      slot.replaceWith(image);
    });
    if(cited.length){const section=document.createElement("section");section.className="preview-bibliography";const heading=document.createElement("h2");heading.textContent="References";section.append(heading);const list=document.createElement("ol");for(const key of cited){const entry=references.get(key);if(!entry)continue;const item=document.createElement("li");item.textContent=`${entry.authors.join("; ")||"Unknown author"} (${entry.year}). ${entry.title}${entry.container?`. ${entry.container}`:""}${entry.doi?`. https://doi.org/${entry.doi}`:""}`;list.append(item);}section.append(list);host.append(section);}
    return { html: host.innerHTML, warnings: [...warnings] };
  } catch (error) { return { html: "", warnings: [], error: error instanceof Error ? error.message : "Unable to render this document" }; }
}
