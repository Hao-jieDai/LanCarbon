import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AIChatStore } from "../../electron/ai-storage";
import { emptyKnowledgeScope } from "../../src/shared/knowledge";
import type { ChatEvidence } from "../../src/shared/grounding";

test("exports a single multi-model chat offline with full Thinking, per-reply citations and optional excerpts", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-chat-pdf-"));
  const data = path.join(root, "Data"), store = new AIChatStore(data), chat = await store.create("siliconflow", "fixture-a"), other = await store.create("others", "fixture-b");
  const now = new Date().toISOString();
  const evidence = (title: string, page: number, text: string): ChatEvidence => ({ label: "S1", source: { id: "file:fixture", entityId: "fixture", kind: "file", format: "pdf", title, fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, fingerprint: "a".repeat(64), chunk: { id: `page-${page}`, text, anchor: { kind: "pdf", page } } });
  const grounding = (title: string, page: number, text: string) => ({ scope: emptyKnowledgeScope(), sourceIds: ["file:fixture"], mode: "keyword" as const, warnings: [], evidence: [evidence(title, page, text)] });
  await store.rename(chat.id, "科研对话 PDF");
  await store.update(chat.id, saved => { saved.messages = [
    { id: "user-one", role: "user", status: "complete", createdAt: now, content: "FIRST_QUESTION 关于搁浅资产的第一轮问题。" },
    { id: "reply-one", role: "assistant", status: "complete", createdAt: now, providerName: "SiliconFlow", modelName: "Model A", content: "## Results\n\nFIRST_ANSWER 中文与 Greek α β. 原文结果 [S1]。\n\n$$E=mc^2$$\n\n| No. | Value |\n| --- | --- |\n" + Array.from({ length: 35 }, (_, i) => `| ${i} | 数据 ${i} |`).join("\n") + "\n\n```python\n" + "a_very_long_code_line_".repeat(35) + "\n```\n\n![REMOTE_IMAGE](https://example.invalid/no-network.png)", reasoning: "THINKING_BEGIN\n\n" + Array.from({ length: 90 }, (_, i) => `推理段落 ${i}：逐一核查资料来源、金额口径和假设条件，不能把相关性当作因果识别。`).join("\n\n") + "\n\nTHINKING_END", grounding: grounding("First source.pdf", 3, "FIRST_EXCERPT: the original result at page three.") },
    { id: "user-two", role: "user", status: "complete", createdAt: now, content: "SECOND_QUESTION 另一份文献呢？" },
    { id: "reply-two", role: "assistant", status: "complete", createdAt: now, providerName: "Others", modelName: "Model B", content: "SECOND_ANSWER Different result ［S1］。", grounding: grounding("Second source.pdf", 11, "SECOND_EXCERPT: a different result at page eleven.") },
    { id: "user-three", role: "user", status: "complete", createdAt: now, content: "THIRD_QUESTION" },
    { id: "reply-three", role: "assistant", status: "stopped", createdAt: now, providerName: "SiliconFlow", modelName: "Model A", content: "PARTIAL_ANSWER", reasoning: "PARTIAL_THINKING", error: "Generation stopped. Partial text has been saved." }
  ]; });
  await store.update(other.id, saved => { saved.title = "Other conversation"; saved.messages = [{ id: "outside", role: "user", status: "complete", createdAt: now, content: "OTHER_CHAT_SECRET" }]; });
  const before = await fs.readFile(path.join(data, "Research/Chats/conversations", chat.id + ".json"));
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  try {
    await app.evaluate(({ net, dialog }) => { (globalThis as any).pdfCalls = 0; net.fetch = async () => { (globalThis as any).pdfCalls++; throw Error("No API calls allowed"); }; dialog.showSaveDialog = (async (_window, options) => { (globalThis as any).pdfDialog = options; return { canceled: !!(globalThis as any).cancelPdf, filePath: (globalThis as any).pdfDestination }; }) as typeof dialog.showSaveDialog; });
    const page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "科研对话 PDF", exact: true }).click();
    expect(await page.locator(".ai-reasoning").first().getAttribute("open")).toBeNull();
    const full = info.outputPath("chat-thinking.pdf"), answer = info.outputPath("chat-answers.pdf"), excerpts = info.outputPath("chat-evidence.pdf");
    const exportTo = async (filename: string, thinking: boolean, appendix: boolean) => {
      await app.evaluate((_electron, filename) => { (globalThis as any).pdfDestination = filename; }, filename);
      await page.locator(".ai-chat-heading").getByRole("button", { name: "Export PDF", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Export chat as PDF" });
      await expect(modal.getByLabel("Include Thinking", { exact: true })).toBeChecked();
      await expect(modal.getByLabel("Include cited evidence excerpts", { exact: true })).not.toBeChecked();
      await modal.getByLabel("Include Thinking", { exact: true }).setChecked(thinking);
      await modal.getByLabel("Include cited evidence excerpts", { exact: true }).setChecked(appendix);
      await modal.getByRole("button", { name: "Export PDF", exact: true }).click();
      await expect(modal).toHaveCount(0); await expect(page.locator(".ai-notice")).toContainText("PDF saved");
      const bytes = await fs.readFile(filename); expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
      return bytes;
    };
    const fullBytes = await exportTo(full, true, false), answerBytes = await exportTo(answer, false, false); await exportTo(excerpts, false, true);
    const pages = (bytes: Buffer) => bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    expect(pages(fullBytes)).toBeGreaterThan(pages(answerBytes)); expect(pages(fullBytes)).toBeGreaterThan(5);
    const dialog = await app.evaluate(() => (globalThis as any).pdfDialog); expect(path.basename(dialog.defaultPath)).toBe("科研对话 PDF.pdf"); expect(path.dirname(dialog.defaultPath)).toBe(path.join(root, "PDFs"));
    const result = await page.evaluate(id => window.notesDesktop.ai!.exportPdf(id, { includeThinking: true, includeEvidence: false }), "missing-chat"); expect(result.ok).toBe(false);
    await app.evaluate((_electron, filename) => { (globalThis as any).pdfDestination = filename; (globalThis as any).cancelPdf = true; }, full);
    const canceled = await page.evaluate(id => window.notesDesktop.ai!.exportPdf(id, { includeThinking: false, includeEvidence: false }), chat.id); expect(canceled).toMatchObject({ ok: false, canceled: true }); expect(await fs.readFile(full)).toEqual(fullBytes);
    expect(await fs.readFile(path.join(data, "Research/Chats/conversations", chat.id + ".json"))).toEqual(before); expect(await app.evaluate(() => (globalThis as any).pdfCalls)).toBe(0);
    expect((await fs.readdir(path.dirname(full))).filter(name => name.endsWith(".tmp"))).toEqual([]);
    await page.screenshot({ path: info.outputPath("chat-pdf-ui.png") });
  } finally { await app.close().catch(() => undefined); const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-chat-pdf-")) throw Error("Unsafe cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
