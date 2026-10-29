// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AIChatStore } from "../electron/ai-storage";
import { emptyKnowledgeScope } from "../src/shared/knowledge";
import type { ChatEvidence, ChatGrounding } from "../src/shared/grounding";
import type { AIChat } from "../src/shared/ai";

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-chat-files-")); });
afterEach(async () => { vi.restoreAllMocks(); if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-chat-files-")) throw Error("Unsafe cleanup"); await fs.rm(root, { recursive: true, force: true }); });
const folder = () => path.join(root, "Research/Chats");
it.each([1, 2, 3] as const)("marks quantity protocol %s validation unfinished after an interrupted generation", async protocol => {
  const store = new AIChatStore(root), c = await store.create("fixture", "model");
  await store.update(c.id, saved => { saved.messages = [{ id: "partial", role: "assistant", content: "EUR 235 million", status: "streaming", createdAt: "2026-10-25", grounding: { ...grounding(), quantityProtocol: protocol } }]; });
  const recovered = (await new AIChatStore(root).get(c.id)).messages[0];
  expect(recovered.status).toBe("stopped");
  expect(recovered.grounding?.quantityCheck?.status).toBe("needs-review");
  expect(recovered.grounding?.quantityCheck?.issues[0]).toContain("interrupted");
});
const hit = (index = 0): ChatEvidence => ({ label: `S${index + 1}`, fingerprint: "a".repeat(64), source: { id: "file:sample", entityId: "sample", kind: "file", format: "pdf", title: "Sample", fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id: String(index), text: ("Original material " + index + " ").padEnd(1200, "x"), anchor: { kind: "pdf", page: index + 1 } } });
const grounding = (count = 2): ChatGrounding => ({ scope: { ...emptyKnowledgeScope(), fileIds: ["sample"] }, sourceIds: ["file:sample"], evidence: Array.from({ length: count }, (_, i) => hit(i)), warnings: [], mode: "full-text" });
const chat = (id: string, count = 2): AIChat => ({ id, title: id, providerId: "fixture", modelId: "model", createdAt: "2026-10-25", updatedAt: "2026-10-25", messages: Array.from({ length: count }, (_, i) => ({ id: "reply-" + i, role: "assistant", content: "A supported answer [S1].", reasoning: "Original reasoning", status: "complete", createdAt: "2026-10-25", grounding: grounding() })) });
it("preserves legacy diagnostics alongside v2 literal replies and rejects unknown protocols", async () => {
  const store = new AIChatStore(root), c = await store.create("fixture", "model"), messages = chat(c.id, 3).messages;
  messages[0].grounding = { ...grounding(), quantityProtocol: 1, quantityCheck: { version: 1, resolved: 0, status: "needs-review", issues: ["Legacy amount not bound"] } };
  messages[1].grounding = { ...grounding(), quantityProtocol: 2, quantityCheck: { version: 1, resolved: 0, status: "not-checked", issues: [] } };
  messages[2].grounding = { ...grounding(), quantityProtocol: 3, quantityCheck: { version: 1, resolved: 0, status: "not-checked", issues: [] } };
  await store.update(c.id, saved => { saved.messages = messages; });
  expect((await new AIChatStore(root).get(c.id)).messages).toEqual(messages);
  await store.update(c.id, saved => { saved.messages[1].grounding!.quantityProtocol = 4 as 2; });
  await expect(new AIChatStore(root).get(c.id)).rejects.toThrow("Unsupported quantity");
});
async function legacy(chats: AIChat[]) { await fs.mkdir(folder(), { recursive: true }); const text = JSON.stringify({ version: 1, chats }, null, 2); await fs.writeFile(path.join(folder(), "chats.json"), text); return text; }

it("migrates without changing answers, Thinking, source anchors or the rollback copy; shares evidence across chats", async () => {
  const original = [chat("first"), chat("second")], backup = await legacy(original);
  const store = new AIChatStore(root); expect(await store.list()).toEqual(original);
  expect(await fs.readFile(path.join(folder(), "chats.json"), "utf8")).toBe(backup);
  expect(await fs.readdir(path.join(folder(), "evidence"))).toHaveLength(2);
  const secondPath = path.join(folder(), "conversations/second.json"), before = await fs.readFile(secondPath);
  await store.rename("first", "Updated title"); expect(await fs.readFile(secondPath)).toEqual(before);
  expect((await new AIChatStore(root).get("first")).messages).toEqual(original[0].messages);
  await store.remove("first"); expect(await fs.readdir(path.join(folder(), "evidence"))).toHaveLength(2);
  await store.remove("second"); expect(await new AIChatStore(root).list()).toEqual([]); expect(await fs.readdir(path.join(folder(), "evidence"))).toHaveLength(0);
  expect(await fs.readFile(path.join(folder(), "chats.json"), "utf8")).toBe(backup);
});

it("persists more than 25 MB of hydrated full-text history without repeated evidence or rewriting other chats", async () => {
  const store = new AIChatStore(root), item = await store.create("fixture", "model"), g = grounding(600);
  const large = chat(item.id, 32); for (const message of large.messages) message.grounding = g;
  expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(25_000_000);
  await store.update(item.id, target => { target.messages = large.messages; });
  const disk = path.join(folder(), "conversations", item.id + ".json");
  expect((await fs.stat(disk)).size).toBeLessThan(2_000_000);
  expect(await fs.readdir(path.join(folder(), "evidence"))).toHaveLength(600);
  expect((await new AIChatStore(root).get(item.id)).messages).toEqual(large.messages);
}, 30000);

it("publishes migration only when all files are durable and resumes after an interrupted migration", async () => {
  const original = [chat("first"), chat("second")], backup = await legacy(original), rename = fs.rename.bind(fs);
  const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => { if (String(to).endsWith("index.json")) throw Object.assign(Error("write blocked"), { code: "EACCES" }); return rename(from, to); });
  await expect(new AIChatStore(root).list()).rejects.toThrow("write blocked");
  expect(await fs.readFile(path.join(folder(), "chats.json"), "utf8")).toBe(backup);
  expect(await fs.stat(path.join(folder(), "index.json")).catch(() => null)).toBeNull(); spy.mockRestore();
  expect(await new AIChatStore(root).list()).toEqual(original);
});

it("keeps the last committed conversation on a failed save and rejects missing or tampered evidence", async () => {
  await legacy([chat("first")]); const store = new AIChatStore(root); await store.list();
  const file = path.join(folder(), "conversations/first.json"), before = await fs.readFile(file), rename = fs.rename.bind(fs);
  const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => { if (String(to) === file) throw Error("disk unavailable"); return rename(from, to); });
  await expect(store.rename("first", "Unsaved")).rejects.toThrow("disk unavailable"); expect((await store.get("first")).title).toBe("first"); expect(await fs.readFile(file)).toEqual(before); spy.mockRestore();
  const names = await fs.readdir(path.join(folder(), "evidence")); await fs.writeFile(path.join(folder(), "evidence", names[0]), '{}');
  await expect(new AIChatStore(root).list()).rejects.toThrow("missing or damaged"); expect(await fs.readFile(file)).toEqual(before);
});

it("does not resurrect deleted legacy chats or accept traversal IDs in a damaged index", async () => {
  await legacy([chat("first")]); const store = new AIChatStore(root); await store.list(); await store.remove("first");
  expect(await new AIChatStore(root).list()).toEqual([]);
  await fs.writeFile(path.join(folder(), "index.json"), JSON.stringify({ version: 2, ids: ["../outside"] }));
  await expect(new AIChatStore(root).list()).rejects.toThrow("Invalid chat index");
});

it("retains page conversation ownership across disk reload and rejects invalid page IDs", async () => {
  const store = new AIChatStore(root);
  const first = await store.create("fixture", "model", "note-one"), second = await store.create("fixture", "model", "note-two");
  await store.rename(first.id, "Page discussion");
  const restored = await new AIChatStore(root).list();
  expect(restored.find(chat => chat.id === first.id)?.contextNoteId).toBe("note-one");
  expect(restored.find(chat => chat.id === second.id)?.contextNoteId).toBe("note-two");
  await expect(store.create("fixture", "model", "../invalid")).rejects.toThrow();
});
