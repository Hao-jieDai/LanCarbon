import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { createNote } from "../../src/shared/notes";
import { createBook } from "../../src/shared/books";
import { readerPdfFixture } from "../fixtures/reader";
import { readerEpubFixture } from "../fixtures/epub";

async function launch(root: string) {
  if (process.env.E2E_EXECUTABLE) return electron.launch({ executablePath: process.env.E2E_EXECUTABLE,
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox"],
    // Invalid development overrides prove installed builds use their own runtime.
    env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "", VITE_DEV_SERVER_URL: "", LANCARBON_PAPERQA_DEV: "", LANCARBON_PAPERQA_PYTHON: "Z:/missing/python.exe", LANCARBON_PAPERQA_TEST_ROOT: "" } });
  const python = process.env.LANCARBON_PAPERQA_PYTHON || (await fs.readFile(path.resolve(".dev-workspace/paperqa-python.txt"), "utf8")).trim();
  return electron.launch({ args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", path.resolve(".")], env: { ...process.env, E2E_USER_DATA_DIR: "", VITE_DEV_SERVER_URL: "", LANCARBON_PAPERQA_DEV: "1", LANCARBON_PAPERQA_TEST_ROOT: root, LANCARBON_PAPERQA_PYTHON: python } });
}
async function mock(app: ElectronApplication, hang = false) {
  await app.evaluate(({ net }, hang) => {
    (globalThis as any).paperqaCalls = [];
    net.fetch = async (url, init) => {
      const endpoint = String(url), request = JSON.parse(String(init?.body ?? "{}"));
      (globalThis as any).paperqaCalls.push({ endpoint, request });
      if (!endpoint.endsWith("/chat/completions")) throw Error("Unexpected auxiliary request");
      if (hang) return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Error("stopped")), { once: true }));
      return new Response(JSON.stringify({ choices: [{ message: { content: "The selected sources distinguish scope and results [S1].", reasoning_content: "Reading the supplied originals." }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } }), { headers: { "content-type": "application/json" } });
    };
  }, hang);
}

for (const connection of [
  { id: "siliconflow", kind: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V4.1-Flash" },
  { id: "openrouter", kind: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "x-ai/grok-4.7" },
  { id: "others", kind: "others", name: "Custom", baseUrl: "https://fixture.example/v1", model: "fixture-chat" }
] as const) test(`PaperQA ${connection.kind} reads all source kinds, calls once per turn and survives restart`, async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-paperqa-ui-")); await fs.mkdir(path.join(root, "Data"));
  const pdf = path.join(root, "Study.pdf"), epub = path.join(root, "Study.epub");
  await fs.writeFile(pdf, readerPdfFixture(3)); await fs.writeFile(epub, readerEpubFixture());
  const assets = new AssetStore(path.join(root, "Data"), path.join(root, "Library/assets")), library = new LibraryStore(path.join(root, "Data"), path.join(root, "Library"), assets);
  const files = (await library.importFiles([pdf, epub])).items.map(i => i.entry);
  const note = createNote({ id: "scope-note", title: "Scope memo", content: Array.from({ length: 105 }, (_, i) => `## Section ${i}\n\n${"Methods retain the full population and qualifications. ".repeat(20)}LAST_${i}`).join("\n\n") });
  const secret = createNote({ id: "outside", title: "Unselected", content: "DO_NOT_SEND_OUTSIDE_SCOPE" });
  const { book, homeNote } = createBook("Study handbook"); homeNote.content = "# Handbook\n\nHandbook qualifications remain available.";
  await fs.writeFile(path.join(root, "Data/notes.json"), JSON.stringify({ version: 2, notes: [note, secret, homeNote], books: [book] }));
  let app = await launch(root);
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app);
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(!!process.env.E2E_EXECUTABLE);
    if (!process.env.E2E_EXECUTABLE) expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toContain("PaperQA Development");
    await page.evaluate(async c => { const r = await window.notesDesktop.ai!.saveProvider({ id: c.id, kind: c.kind, name: c.name, baseUrl: c.baseUrl, apiKey: "mock-key-not-real", models: [{ id: c.model, name: "Test Chat", purpose: "chat" }], defaultModel: c.model }); if (!r.ok) throw Error(r.error); }, connection);
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "Choose sources", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Choose chat sources" });
    for (const name of ["Study.pdf", "Study.epub", "Scope memo", "Book: Study handbook"]) await picker.getByLabel(`Select ${name}`, { exact: true }).check();
    await picker.getByRole("button", { name: "Use sources", exact: true }).click();
    await page.getByLabel("Chat message").fill("Compare the selected studies and scope."); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".chat-evidence summary").last()).toContainText("PaperQA · full text", { timeout: 90000 });
    await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0, { timeout: 90000 });
    const result = await page.evaluate(() => window.notesDesktop.ai!.chats()); if (!result.ok) throw Error(result.error);
    const chat = result.chats[0], answer = chat.messages.at(-1)!;
    expect(answer.status).toBe("complete"); expect(answer.grounding!.evidence.length).toBeGreaterThan(96);
    expect(new Set(answer.grounding!.sourceIds)).toEqual(new Set([`note:${note.id}`, `note:${homeNote.id}`, ...files.map(f => `file:${f.id}`)]));
    const calls = await app.evaluate(() => (globalThis as any).paperqaCalls); expect(calls).toHaveLength(1);
    expect(calls[0].endpoint).toBe(`${connection.baseUrl}/chat/completions`);
    expect(calls[0].request.model).toBe(connection.model);
    if (connection.kind !== "siliconflow") { expect(calls[0].request).not.toHaveProperty("thinking_budget"); expect(calls[0].request).not.toHaveProperty("enable_thinking"); expect(calls[0].request).not.toHaveProperty("temperature"); }
    expect(JSON.stringify(calls)).toContain("LAST_104"); expect(JSON.stringify(calls)).not.toContain("DO_NOT_SEND_OUTSIDE_SCOPE");
    expect(calls[0].request.messages.filter((m: any) => m.role === "system")).toHaveLength(1);
    const instructions = calls[0].request.messages.map((m: any) => m.content).join("\n");
    expect(instructions).toContain("Answer each supported part");
    expect(instructions).toContain("author-year citations");
    expect(instructions).toContain("separate evidence links");
    expect(instructions).not.toContain('reply "I cannot answer."');
    expect(instructions).not.toContain("Invalid citation examples");
    const pdfHit = answer.grounding!.evidence.find(h => h.chunk.anchor.kind === "pdf" && h.chunk.anchor.page === 3)!;
    await page.locator(".chat-evidence summary").last().click();
    await page.getByRole("article", { name: `Evidence ${pdfHit.label}`, exact: true }).getByRole("button", { name: "Open source", exact: true }).click();
    await expect(page.getByRole("region", { name: "PDF reader", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Workspace", exact: true }).click();
    await page.getByLabel("Chat message").fill("What about the qualifications in that comparison?"); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => { const r = await page.evaluate(() => window.notesDesktop.ai!.chats()); return r.ok && r.chats[0].messages.length === 4 && r.chats[0].messages.at(-1)?.status; }, { timeout: 90000 }).toBe("complete");
    const followup = await app.evaluate(() => (globalThis as any).paperqaCalls); expect(followup).toHaveLength(2);
    expect(followup[1].request.messages.some((m: any) => m.role === "user" && m.content === "Compare the selected studies and scope.")).toBe(true);
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(usage.ok && usage.usage.records).toHaveLength(2);
    expect(usage.ok && usage.usage.records.every(r => r.purpose === "chat")).toBe(true);
    await fs.writeFile(info.outputPath("summary.json"), JSON.stringify({ engine: answer.grounding!.mode, sources: answer.grounding!.sourceIds.length, passages: answer.grounding!.evidence.length, modelCalls: followup.length, usageRecords: usage.ok && usage.usage.records.length }));
    await app.close(); app = await launch(root); page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app);
    const restored = await page.evaluate(() => window.notesDesktop.ai!.chats()); expect(restored.ok && restored.chats[0].messages[1].grounding).toEqual(answer.grounding);
    await page.screenshot({ path: info.outputPath("paperqa-development.png") });
    // A stopped real transport path still produces only one tracked attempt.
    await mock(app, true); await page.getByLabel("Chat message").fill("Give another explanation."); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).paperqaCalls.length), { timeout: 90000 }).toBe(1);
    await page.getByRole("button", { name: "Stop generating", exact: true }).click();
    await expect.poll(async () => { const r = await page.evaluate(() => window.notesDesktop.ai!.chats()); return r.ok && r.chats[0].messages.at(-1)?.status; }).toBe("stopped");
  } finally {
    await app.close().catch(() => undefined);
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("lancarbon-paperqa-ui-")) throw Error("Unsafe cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
