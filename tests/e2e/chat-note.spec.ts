import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AIChatStore } from "../../electron/ai-storage";
import { createNote } from "../../src/shared/notes";
import { createBook } from "../../src/shared/books";
import { emptyKnowledgeScope } from "../../src/shared/knowledge";
import type { ChatEvidence } from "../../src/shared/grounding";

test("copies LaTeX into Notes and exports independent chat snapshots with scoped sources, optional Thinking and no API calls", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-chat-note-")), data = path.join(root, "Data"); await fs.mkdir(data);
  const memo = createNote({ title: "Personal memo", content: "ORIGINAL_PERSONAL_TEXT" }), { book, homeNote } = createBook("Personal book");
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [memo, homeNote], books: [book] }));
  const chats = new AIChatStore(data), chat = await chats.create("fixture", "model"), now = new Date().toISOString();
  const evidence = (page: number): ChatEvidence => ({ label: "S1", fingerprint: "a".repeat(64), source: { id: "file:fixture", entityId: "fixture", kind: "file", format: "pdf", title: `Source page ${page}.pdf`, fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id: String(page), text: `SOURCE_EXCERPT_${page}`, anchor: { kind: "pdf", page } } });
  await chats.rename(chat.id, "Research discussion");
  await chats.update(chat.id, saved => { saved.messages = [
    { id: "q1", role: "user", content: "How is value calculated?", status: "complete", createdAt: now },
    { id: "a1", role: "assistant", providerName: "Fixture", modelName: "A", status: "complete", createdAt: now, content: "Inline \\(r=0.06\\).\n\n\\[V=\\sum_{t=1}^{T}\\frac{R_t-C_t}{(1+r)^t}\\]\n\nUS$713 billion [S1].", reasoning: "RAW_THINKING\n```\nKEEP_ALL_REASONING", grounding: { scope: emptyKnowledgeScope(), sourceIds: ["file:fixture"], mode: "keyword", warnings: [], evidence: [evidence(3)] } },
    { id: "q2", role: "user", content: "Another study?", status: "complete", createdAt: now },
    { id: "a2", role: "assistant", providerName: "Fixture", modelName: "B", status: "stopped", createdAt: now, content: "PARTIAL_ANSWER [S1].", error: "Stopped by user.", grounding: { scope: emptyKnowledgeScope(), sourceIds: ["file:fixture"], mode: "keyword", warnings: [], evidence: [evidence(9)] } }
  ]; });
  const before = await fs.readFile(path.join(data, "Research/Chats/conversations", chat.id + ".json"));
  const launch = () => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const initial = await page.evaluate(() => window.notesDesktop.loadWorkspace()); if (!initial.ok) throw Error(initial.error);
    const originalBook = initial.workspace.books.find(item => item.id === book.id)!;
    await app.evaluate(({ net }) => { (globalThis as any).noteApiCalls = 0; net.fetch = async () => { (globalThis as any).noteApiCalls++; throw Error("No API calls in export tests"); }; });
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "Research discussion", exact: true }).click();
    await expect(page.locator(".ai-message-assistant").first().locator("math")).toHaveCount(2);
    // Capture the exact Clipboard API payload without replacing the user's operating-system clipboard.
    await page.evaluate(() => { navigator.clipboard.writeText = async text => { (window as any).copiedChat = text; }; });
    await page.getByRole("button", { name: "Copy reply", exact: true }).first().click();
    const copied = await page.evaluate(() => (window as any).copiedChat as string); expect(copied).toContain("$$\nV=\\sum"); expect(copied).toContain("$r=0.06$");
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await page.locator(".note-card").filter({ has: page.getByRole("heading", { name: "Personal memo", exact: true }) }).click();
    await page.getByLabel("Note content").fill(copied); await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByLabel("Rendered preview").locator("math")).toHaveCount(2); await expect(page.locator(".math-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByLabel("Note content").fill(memo.content);
    const goChat = async () => { await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Chat", exact: true }).click(); };
    const exportNote = async (thinking: boolean, excerpts: boolean) => {
      await page.locator(".ai-chat-heading").getByRole("button", { name: "Export to Note", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Export chat as Note" });
      await modal.getByLabel("Include Thinking", { exact: true }).setChecked(thinking); await modal.getByLabel("Include cited evidence excerpts", { exact: true }).setChecked(excerpts);
      await modal.getByRole("button", { name: "Export to Note", exact: true }).click(); await expect(modal).toHaveCount(0);
      await expect(page.getByLabel("Note title")).toHaveValue("Research discussion");
      await expect(page.getByLabel("Rendered preview").locator("math")).toHaveCount(2);
      const result = await page.evaluate(() => window.notesDesktop.loadWorkspace()); if (!result.ok) throw Error(result.error);
      return result.workspace.notes.filter(note => note.title === "Research discussion").at(-1)!;
    };
    await goChat(); const short = await exportNote(false, false);
    expect(short.content).not.toContain("RAW_THINKING"); expect(short.content).not.toContain("SOURCE_EXCERPT_3"); expect(short.content).toContain("Source page 3.pdf"); expect(short.content).toContain("Source page 9.pdf");
    const links = page.getByLabel("Rendered preview").getByRole("link", { name: "S1", exact: true }); expect(await links.count()).toBe(2); expect(await links.nth(0).getAttribute("href")).not.toBe(await links.nth(1).getAttribute("href")); await links.nth(1).click();
    await page.locator(".theme-option").filter({ hasText: "Light" }).click(); await page.screenshot({ path: info.outputPath("chat-note-light.png") });
    await goChat(); const full = await exportNote(true, true); expect(full.id).not.toBe(short.id); expect(full.content).toContain("RAW_THINKING"); expect(full.content).toContain("KEEP_ALL_REASONING"); expect(full.content).toContain("SOURCE_EXCERPT_9"); expect(full.content).toContain("stopped (partial)");
    const invalid = await page.evaluate(() => window.notesDesktop.ai!.exportNote("missing-chat", { includeThinking: false, includeEvidence: false })); expect(invalid.ok).toBe(false);
    // Concurrent IPC exports must append two Notes rather than overwrite one another.
    const parallel = await page.evaluate(id => Promise.all([window.notesDesktop.ai!.exportNote(id, { includeThinking: false, includeEvidence: false }), window.notesDesktop.ai!.exportNote(id, { includeThinking: false, includeEvidence: false })]), chat.id); expect(parallel.every(result => result.ok)).toBe(true);
    expect(await app.evaluate(() => (globalThis as any).noteApiCalls)).toBe(0);
    expect(await fs.readFile(path.join(data, "Research/Chats/conversations", chat.id + ".json"))).toEqual(before);
    await page.locator(".theme-option").filter({ hasText: "Dark" }).click(); await page.screenshot({ path: info.outputPath("chat-note-dark.png") });
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const reloaded = await page.evaluate(() => window.notesDesktop.loadWorkspace()); if (!reloaded.ok) throw Error(reloaded.error);
    expect(reloaded.workspace.notes.filter(note => note.title === "Research discussion")).toHaveLength(4);
    expect(reloaded.workspace.notes.find(note => note.id === memo.id)!.content).toBe(memo.content);
    expect(reloaded.workspace.books.find(item => item.id === book.id)).toEqual(originalBook);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(900, 650); }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("chat-note-small.png") });
  } finally { await app.close().catch(() => undefined); const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-chat-note-")) throw Error("Unsafe cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
