const excluded = new Set(["head", "script", "style", "iframe", "object", "embed", "form"]);
function readableText(node: Node, depth = 0): string {
  if (depth > 100 || excluded.has((node as Element).localName)) return "";
  if (node.nodeType === 3) return node.textContent ?? "";
  if ((node as Element).localName === "br") return " ";
  return Array.from(node.childNodes).map(child => readableText(child, depth + 1)).join("");
}
// The parser and reader use the same traversal, including loose text nodes and nested list blocks.
export function epubPassages(body: Node): Array<{ node: Node; text: string; paragraph: number; heading: string; fragment?: string }> {
  const result: ReturnType<typeof epubPassages> = []; let heading = "";
  const walk = (node: Node, depth = 0) => {
    if (depth > 100) return;
    const element = node as Element, name = element.localName;
    if (excluded.has(name)) return;
    const block = /^(p|h[1-6]|li|pre|tr|blockquote|dt|dd)$/.test(name ?? "");
    if (block || node.nodeType === 3) {
      const text = (name === "tr" ? Array.from(node.childNodes).filter(child => ["td", "th"].includes((child as Element).localName)).map(child => readableText(child)).join(" | ") : readableText(node)).replace(/\s+/g, " ").trim();
      if (!text) return; if (/^h[1-6]$/.test(name ?? "")) heading = text.slice(0, 300);
      result.push({ node, text, paragraph: result.length + 1, heading, fragment: block ? element.getAttribute("id")?.slice(0, 500) ?? undefined : undefined });
    } else for (const child of Array.from(node.childNodes)) walk(child, depth + 1);
  }; walk(body); return result;
}
