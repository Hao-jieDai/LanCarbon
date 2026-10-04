import { beforeEach, describe, expect, it } from "vitest";
import "../src/pdf";
beforeEach(() => {
  document.body.innerHTML = '<main id="pdf-page"></main>';
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
});
describe("print-only reading renderer", () => {
  it("avoids a duplicate title while retaining its same-page reference target", async () => {
    const current = { id: "current", title: "研究记录", content: "(page-self)=\n# 研究记录\n\n[Here](#page-self)\n\n$\\alpha+\\beta$" };
    await window.renderLanCarbonPdf({ current, documents: [current], assets: {} });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    const link = document.querySelector<HTMLAnchorElement>("a[data-preview-note]")!;
    expect(link).not.toBeNull(); expect(document.getElementById(link.hash.slice(1))).toBe(document.querySelector("h1"));
    expect(document.querySelector(".katex")).not.toBeNull();
  });
  it("keeps labels for other pages and attachments, preserves web links, and opens collapsed content", async () => {
    const id = "a".repeat(64) + ".txt", other = { id: "other", title: "Other", content: "(other-page)=\n# Other" };
    const current = { id: "current", title: "PDF", content: `[Other page](#other-page)\n\n[Attachment](assets/${id})\n\n[Web](https://example.com)\n\n\`\`\`{dropdown} Details\nHidden content must print.\n\`\`\`` };
    await window.renderLanCarbonPdf({ current, documents: [current, other], assets: { [id]: { name: "attachment.txt" } } });
    expect(document.querySelector("a[data-preview-note], a[data-asset-id]")).toBeNull();
    expect(document.body).toHaveTextContent("Other page"); expect(document.body).toHaveTextContent("Attachment");
    expect(document.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(document.querySelector("details")?.open).toBe(true); expect(document.body).toHaveTextContent("Hidden content must print");
  });
});
