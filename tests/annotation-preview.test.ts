import { expect, it } from "vitest";
import { renderMystPreview } from "../src/preview/mystPreview";
import { annotationLink, annotationNoteContent, type ReadingAnnotation } from "../src/shared/annotations";
it("renders safe internal return links and treats excerpts and comments as literal source text", () => {
  const documentId = `import:${"a".repeat(64)}.pdf`, id = "a1234567-1234-1234-1234-123456789abc";
  const annotation: ReadingAnnotation = { id, documentId, fingerprint: "b".repeat(64), fileVersion: 1, quote: "Original <script>alert(1)</script> [link](https://example.com)\n# Heading", comment: "Cost $10 * 3", kind: "highlight", color: "yellow", anchor: { kind: "pdf", rects: [{ page: 1, x: .1, y: .2, width: .2, height: .03 }] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const rendered = renderMystPreview({ id: "test", title: "test", content: annotationNoteContent("Source.pdf", documentId, [annotation], "2026-10-29") });
  expect(rendered.error).toBeUndefined(); const host = document.createElement("div"); host.innerHTML = rendered.html;
  expect(host.querySelectorAll("script")).toHaveLength(0); expect(host.querySelectorAll("a")).toHaveLength(1);
  expect(host.querySelector("a")?.getAttribute("data-reader-id")).toBe(documentId); expect(host.querySelector("a")?.getAttribute("data-annotation-id")).toBe(id);
  expect(host.textContent).toContain(annotation.comment); expect(host.textContent).toContain("<script>alert(1)</script>");
  expect(annotationLink(documentId, id)).toContain("import%3A");
});
