import { expect, it } from "vitest";
import { chatMarkdown, CHAT_OUTPUT_GUIDELINES } from "../src/shared/chatText";
import { chatNote } from "../src/shared/chatNote";
import { renderMystPreview } from "../src/preview/mystPreview";
import type { AIChat } from "../src/shared/ai";
import { emptyKnowledgeScope } from "../src/shared/knowledge";

function fixture(): AIChat {
  const now = new Date().toISOString(), source = { id: "file:a", entityId: "a", title: "Research [A].pdf", kind: "file" as const, format: "pdf" as const, fingerprint: "v1", locations: [], attachments: [], tags: [], systemManaged: false };
  return { id: "chat", title: "A <review>", providerId: "fixture", modelId: "fixture", createdAt: now, updatedAt: now, messages: [
    { id: "q1", role: "user", content: "What is the loss?", status: "complete", createdAt: now },
    { id: "a1", role: "assistant", providerName: "Provider", modelName: "Model", content: "A formula \\(x^2\\).\n\n\\[S=\\sum_{t=1}^{T} x_t\\]\n\nUS$713 billion [S1].", reasoning: "Raw `reasoning`\n```\n[S1]", status: "complete", createdAt: now, grounding: { scope: emptyKnowledgeScope(), sourceIds: [source.id], mode: "keyword", warnings: [], evidence: [{ label: "S1", source, fingerprint: "v1", chunk: { id: "c1", text: "EXCERPT_ONE", anchor: { kind: "pdf", page: 3 } } }] } },
    { id: "a2", role: "assistant", content: "Another result [S1].", status: "stopped", createdAt: now, grounding: { scope: emptyKnowledgeScope(), sourceIds: [source.id], mode: "keyword", warnings: [], evidence: [{ label: "S1", source, fingerprint: "v1", chunk: { id: "c2", text: "EXCERPT_TWO", anchor: { kind: "pdf", page: 9 } } }] } }
  ] };
}
it("keeps Markdown/LaTeX portable for display, copy and exports, preserving code and ordinary text", () => {
  const raw = "Inline \\(x_i^2\\).\n\\[\\frac{a}{b}=2\\]\nUS$713 billion; $4 million.\n`\\(code\\)`\n```latex\n\\[source\\]\n```";
  const normalized = chatMarkdown(raw);
  expect(normalized).toContain("$x_i^2$"); expect(normalized).toContain("$$\n\\frac{a}{b}=2\n$$");
  expect(normalized).toContain("US\\$713 billion"); expect(normalized).toContain("`\\(code\\)`"); expect(normalized).toContain("```latex\n\\[source\\]\n```");
  expect(chatMarkdown(normalized)).toBe(normalized);
  expect(chatMarkdown("NPV = Σ revenue / (1+r)^t")).toBe("NPV = Σ revenue / (1+r)^t");
  expect(CHAT_OUTPUT_GUIDELINES).toContain("metaphors"); expect(CHAT_OUTPUT_GUIDELINES).toContain("LaTeX");
});
it("exports an editable snapshot with rendered math, separate citation anchors, optional raw Thinking and excerpts", () => {
  const chat = fixture(), before = JSON.stringify(chat), note = chatNote(chat, { includeThinking: true, includeEvidence: true });
  expect(JSON.stringify(chat)).toBe(before); expect(note.title).toBe(chat.title);
  expect(note.content).toContain("### Thinking"); expect(note.content).toContain("EXCERPT_ONE"); expect(note.content).toContain("EXCERPT_TWO");
  expect(note.content).toContain("stopped (partial)"); expect(note.content).toContain("Page 3"); expect(note.content).toContain("Page 9");
  const rendered = renderMystPreview(note), host = document.createElement("div"); host.innerHTML = rendered.html;
  expect(rendered.error).toBeUndefined(); expect(host.querySelectorAll(".math-error")).toHaveLength(0); expect(host.querySelectorAll("math")).toHaveLength(2);
  const links = [...host.querySelectorAll<HTMLAnchorElement>("a")].filter(link => link.textContent === "S1");
  expect(links).toHaveLength(2); expect(links[0].getAttribute("href")).not.toBe(links[1].getAttribute("href"));
  for (const link of links) expect(host.querySelector(link.getAttribute("href")!)).not.toBeNull();
  const short = chatNote(chat, { includeThinking: false, includeEvidence: false });
  expect(short.id).not.toBe(note.id); expect(short.content).not.toContain("Raw `reasoning`"); expect(short.content).not.toContain("EXCERPT_ONE"); expect(short.content).toContain("Research \\[A\\].pdf");
});
it("refuses empty/live/oversized exports instead of silently truncating the conversation", () => {
  const chat = fixture(); expect(() => chatNote({ ...chat, messages: [] }, { includeThinking: true, includeEvidence: false })).toThrow("no messages");
  chat.messages[1].status = "streaming"; expect(() => chatNote(chat, { includeThinking: false, includeEvidence: false })).toThrow("finish");
  chat.messages[1].status = "complete"; chat.messages[1].reasoning = "long ".repeat(410000);
  expect(() => chatNote(chat, { includeThinking: true, includeEvidence: false })).toThrow("size limit");
  expect(() => chatNote(chat, { includeThinking: false, includeEvidence: false })).not.toThrow();
});
