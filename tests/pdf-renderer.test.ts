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
  it("preserves Thinking verbatim and distinguishes monetary prose from answer formulae", async () => {
    const reasoning = '原文说 "US$300 billion each"。\n\n不要把 $1.4 trillion 当作公式。\n最后一行 <literal> **raw**';
    const rendered = await window.renderLanCarbonChatPdf({ chat: { id: "chat", title: "Chat", providerId: "", modelId: "", createdAt: "2026-10-18", updatedAt: "2026-10-18", messages: [{ id: "reply", role: "assistant", createdAt: "2026-10-18", status: "complete", reasoning, content: "US$1.4 trillion，$300 billion 是金额。\n\n数学公式 $E=mc^2$。" }] }, options: { includeThinking: true, includeEvidence: false } });
    expect(document.querySelector(".pdf-thinking-text")?.textContent).toBe(reasoning);
    expect(document.querySelectorAll(".katex")).toHaveLength(1); expect(rendered.warnings).toEqual([]);
    expect(document.querySelector(".pdf-chat-answer")?.textContent).toContain("US$1.4 trillion");
    expect(document.querySelector(".pdf-chat-answer")?.textContent).toContain("$300 billion");
  });
});
