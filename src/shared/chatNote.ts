import type { AIChat, ChatPdfOptions } from "./ai";
import { citationLocation, citedLabels, mapCitations } from "./grounding";
import { createNote } from "./notes";
import { chatMarkdown } from "./chatText";

const plain = (text: string) => text.replace(/[\\`*_{}[\]()<>#!|]/g, "\\$&").replace(/[\r\n]+/g, " ");
function literal(text: string): string {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = "`".repeat(length);
  return `${fence}text\n${text}\n${fence}`;
}

/** A self-contained, editable snapshot: evidence labels are scoped to each original reply. */
export function chatNote(chat: AIChat, options: ChatPdfOptions) {
  if (!options || typeof options.includeThinking !== "boolean" || typeof options.includeEvidence !== "boolean") throw Error("Invalid chat export options.");
  if (!chat.messages.length) throw Error("This conversation has no messages to export.");
  if (chat.messages.some(message => message.status === "streaming")) throw Error("Wait for the reply to finish or stop it before exporting a Note.");
  const note = createNote({ title: (chat.title || "Chat").slice(0, 120) });
  const parts = [`# ${plain(note.title)}`, `Created: ${plain(chat.createdAt)}\n\nLast message: ${plain(chat.updatedAt)}`];
  for (const [index, message] of chat.messages.entries()) {
    parts.push(`## ${index + 1}. ${message.role === "user" ? "You" : plain([message.providerName, message.modelName || message.modelId].filter(Boolean).join(" · ") || "Assistant")}`);
    parts.push(`${plain(message.createdAt)}${message.status !== "complete" ? ` · ${message.status} (partial)` : ""}`);
    if (message.role === "assistant" && options.includeThinking && message.reasoning) parts.push("### Thinking", literal(message.reasoning), "### Answer");
    const evidence = message.grounding?.evidence ?? [], labels = citedLabels(message.content), referenced = evidence.filter(hit => labels.has(hit.label));
    const anchor = (label: string) => `chat-note-${note.id}-${index + 1}-${label.toLowerCase()}`;
    const content = message.role === "assistant" ? chatMarkdown(message.content) : message.content;
    parts.push(mapCitations(content, label => referenced.some(hit => hit.label === label) ? `[${label}](#${anchor(label)})` : `[${label}]`));
    if (message.error) parts.push(`Status: ${plain(message.error)}`);
    const checks = [...(message.grounding?.quantityCheck?.issues ?? []), ...(message.grounding?.warnings.filter(text => /needs checking|unresolved|unrecognized|did not supply|unavailable|changed|incomplete/iu.test(text)) ?? [])];
    if (checks.length) parts.push("### Checks", ...checks.map(text => `- ${plain(text)}`));
    if (referenced.length) {
      parts.push("### Sources");
      for (const hit of referenced) {
        parts.push(`(${anchor(hit.label)})=\n**[${hit.label}] ${plain(hit.source.title)}** · ${plain(citationLocation(hit))}`);
        if (options.includeEvidence) parts.push(literal(hit.chunk.text));
      }
    }
  }
  note.content = parts.join("\n\n");
  if (note.content.length > 2_000_000) throw Error("This conversation exceeds the Note size limit. Export without Thinking or evidence excerpts, or copy a smaller part.");
  return note;
}
