import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { createNote } from "../../src/shared/notes";
import { createBook, validateWorkspace } from "../../src/shared/books";
import { defaultRetrievalSettings } from "../../src/shared/retrieval";
import { readerPdfFixture } from "../fixtures/reader";
import { readerEpubFixture } from "../fixtures/epub";
const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
async function cleanup(root: string) { const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-grounded-ui-")) throw Error("Unsafe cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
async function mock(app: ElectronApplication) {
  await app.evaluate(({ net }) => { (globalThis as any).groundedCalls = []; net.fetch = async (url, init) => {
    const endpoint = String(url), request = init?.body ? JSON.parse(init.body as string) : {}; (globalThis as any).groundedCalls.push({ endpoint, request });
    if (endpoint.includes("/models")) return new Response(JSON.stringify({ data: [{ id: endpoint.includes("rerank") ? "fixture-rerank:free" : "fixture-embedding:free", name: "Fixture free model", architecture: { output_modalities: [endpoint.includes("rerank") ? "rerank" : "embeddings"] }, pricing: { prompt: "0", completion: "0" } }] }));
    if (endpoint.endsWith("/embeddings")) return new Response(JSON.stringify({ data: request.input.map((_text: string, index: number) => ({ index, embedding: [1, 0.1] })), usage: { prompt_tokens: request.input.length * 11, total_tokens: request.input.length * 11 } }));
    if (endpoint.endsWith("/rerank")) return new Response(JSON.stringify({ results: request.documents.map((_text: string, index: number) => ({ index, relevance_score: 1 - index / 100 })), usage: { prompt_tokens: 21, total_tokens: 21 } }));
    if (endpoint.endsWith("/chat/completions")) {
      const payload = request.messages.find((message: any) => message.role === "user" && message.content.startsWith('{"selectedSources":'));
      const evidence = payload ? JSON.parse(payload.content).evidence : [], content = evidence.length ? evidence.map((item: any) => `${item.source}: ${item.text.slice(0, 80)} [${item.citation}]`).join("\n\n") : "Ordinary chat response.";
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 } }), { headers: { "content-type": "application/json" } });
    }
    throw Error("Unexpected network request");
  }; });
}

test("Chat automatically prepares selected PDF/EPUB/Note/Book evidence, navigates citations and preserves scope after restart", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-grounded-ui-")), data = path.join(root, "Data"); await fs.mkdir(data);
  const pdf = path.join(root, "Climate.pdf"), epub = path.join(root, "Energy.epub"); await fs.writeFile(pdf, readerPdfFixture(4)); await fs.writeFile(epub, readerEpubFixture());
  const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets), entries = (await library.importFiles([pdf, epub])).items.map(item => item.entry);
  const note = createNote({ id: "grounded-memo", title: "Investment memo", content: "# Policy\n\nCarbon policy reduces investment by 12 percent." }), secret = createNote({ id: "unselected-secret", title: "Not selected", content: "SecretOutsideSelection" }), { book, homeNote } = createBook("Climate Book"); homeNote.content = "# Book evidence\n\nCarbon policy varies by region.\n\n# Conclusion\n\nClimate investment requires evidence.";
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote, secret], books: [book] }));
  let app = await launch(root);
  try {
    let page = await app.firstWindow(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); await page.getByRole("main").waitFor(); await mock(app);
    const configured = await page.evaluate(async () => { const ai = window.notesDesktop.ai!, provider = await ai.saveProvider({ id: "openrouter", kind: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "fixture-private-key", models: [{ id: "fixture-chat", name: "Chat fixture", purpose: "chat" }], defaultModel: "fixture-chat" }); if (!provider.ok) throw Error(provider.error); });
    void configured;
    const retrieval = await page.evaluate(settings => window.notesDesktop.retrieval!.saveSettings(settings), { ...defaultRetrievalSettings(), enabled: true, rerankEnabled: true, embedding: { mode: "reuse" as const, providerId: "openrouter", modelId: "fixture-embedding", modelName: "Embedding fixture" }, rerank: { mode: "reuse" as const, providerId: "openrouter", modelId: "fixture-rerank", modelName: "Rerank fixture" } }); expect(retrieval.ok).toBe(true);
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Workshop pages" }).getByRole("button", { name: "Knowledge base", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Chat", exact: true }).click(); await page.getByRole("button", { name: "Choose sources", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Choose chat sources" }); await picker.getByLabel("Select Climate.pdf", { exact: true }).check(); await picker.getByLabel("Select Energy.epub", { exact: true }).check(); await picker.getByLabel("Select Investment memo", { exact: true }).check(); await picker.getByLabel("Select Book: Climate Book", { exact: true }).check();
    await picker.getByRole("button", { name: "Use sources", exact: true }).click(); expect(await app.evaluate(() => (globalThis as any).groundedCalls.length)).toBe(0);
    const sourceBar = page.getByRole("group", { name: "Chat sources", exact: true }), composer = page.locator(".ai-composer");
    await expect(composer.getByRole("group", { name: "Chat sources", exact: true })).toBeVisible();
    expect((await sourceBar.boundingBox())!.y + (await sourceBar.boundingBox())!.height).toBeLessThan((await page.getByLabel("Chat message").boundingBox())!.y);
    await page.getByLabel("Chat message").fill("1. Compare the main evidence about carbon investment in these sources.\n2. Compare the methods and conclusions."); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".ai-message-assistant").last().locator(".chat-evidence summary")).toBeVisible({ timeout: 60000 }); await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0, { timeout: 60000 });
    const saved = await page.evaluate(() => window.notesDesktop.ai!.chats()); if (!saved.ok) throw Error(saved.error); const chat = saved.chats[0], reply = chat.messages.at(-1)!; expect(reply.status).toBe("complete"); expect(new Set(reply.grounding!.evidence.map(hit => hit.source.id))).toEqual(new Set([`file:${entries[0].id}`, `file:${entries[1].id}`, `note:${note.id}`, `note:${homeNote.id}`]));
    const calls = await app.evaluate(() => (globalThis as any).groundedCalls); expect(calls.some((call: any) => call.endpoint.endsWith("/embeddings"))).toBe(true); expect(calls.filter((call: any) => call.endpoint.endsWith("/rerank"))).toHaveLength(2); expect(JSON.stringify(calls)).not.toContain("SecretOutsideSelection");
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(usage.ok && new Set(usage.usage.records.map(record => record.purpose))).toEqual(new Set(["chat", "embedding", "rerank"]));
    await page.locator(".chat-evidence summary").last().click();
    for (const theme of ["Light", "Dark"]) { await page.locator(".theme-option").filter({ hasText: theme }).click(); await page.screenshot({ path: info.outputPath(`grounded-chat-${theme.toLowerCase()}.png`) }); }
    const pdfHit = reply.grounding!.evidence.find(hit => hit.chunk.anchor.page === 4)!; expect(pdfHit).toBeTruthy(); await page.getByRole("article", { name: `Evidence ${pdfHit.label}`, exact: true }).getByRole("button", { name: "Open source", exact: true }).click(); await expect(page.getByRole("region", { name: "PDF reader", exact: true })).toBeVisible(); await expect(page.getByLabel("PDF page number")).toHaveValue("4", { timeout: 30000 });
    await page.getByRole("tab", { name: "Workspace", exact: true }).click();
    const epubHit = reply.grounding!.evidence.find(hit => hit.chunk.anchor.kind === "epub" && hit.chunk.anchor.chapterIndex === 1)!; await page.getByRole("article", { name: `Evidence ${epubHit.label}`, exact: true }).getByRole("button", { name: "Open source", exact: true }).click(); await expect(page.getByRole("region", { name: "EPUB reader", exact: true })).toBeVisible(); await page.locator(".epub-prose").waitFor(); await expect(page.locator(".epub-prose .cited-passage")).toBeVisible();
    await page.getByRole("tab", { name: "Workspace", exact: true }).click(); const noteHit = reply.grounding!.evidence.find(hit => hit.source.entityId === note.id)!; await page.getByRole("article", { name: `Evidence ${noteHit.label}`, exact: true }).getByRole("button", { name: "Open source", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await page.getByLabel("Note content").fill(note.content + "\nChanged evidence."); await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("article", { name: `Evidence ${noteHit.label}`, exact: true }).getByRole("button", { name: "Open source", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("has changed");
    await app.close(); app = await launch(root); page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app); await expect(page.locator(".chat-source-bar")).toContainText("Sources · 4"); expect(await app.evaluate(() => (globalThis as any).groundedCalls.length)).toBe(0); const reloaded = await page.evaluate(() => window.notesDesktop.ai!.chats()); expect(reloaded.ok && reloaded.chats[0].messages.at(-1)!.grounding!.evidence).toEqual(reply.grounding!.evidence);
    await page.getByLabel("Chat message").fill("Hello"); await page.getByRole("button", { name: "Clear sources", exact: true }).click(); expect(await app.evaluate(() => (globalThis as any).groundedCalls.length)).toBe(0); await expect(page.getByLabel("Chat message")).toHaveValue("Hello"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText("Ordinary chat response.", { exact: true })).toBeVisible(); expect(await app.evaluate(() => (globalThis as any).groundedCalls.every((call: any) => call.endpoint.endsWith("/chat/completions")))).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("grounded-chat-small.png") }); expect(errors).toEqual([]);
    expect(await fs.readFile(await library.filePath(entries[0].id))).toEqual(readerPdfFixture(4)); expect(await fs.readFile(await library.filePath(entries[1].id))).toEqual(readerEpubFixture());
  } finally { await app.close().catch(() => undefined); await cleanup(root); }
});

test("source import reuses Library originals, catalogues stay role-specific and Stop cancels paid preparation before Chat", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-grounded-ui-")), data = path.join(root, "Data"), file = path.join(root, "Import.pdf"); await fs.mkdir(data); await fs.writeFile(file, readerPdfFixture(2));
  const note = createNote({ id: "cancel-note", title: "Cancel memo", content: "Carbon investment evidence." }); await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note], books: [] }));
  const app = await launch(root);
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app);
    await page.evaluate(async () => { const result = await window.notesDesktop.ai!.saveProvider({ id: "openrouter", kind: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "fixture-private-key", models: [{ id: "fixture-chat", name: "Chat fixture", purpose: "chat" }], defaultModel: "fixture-chat" }); if (!result.ok) throw Error(result.error); });
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "AI Settings", exact: true }).click(); await page.getByRole("tab", { name: "Retrieval", exact: true }).click();
    await page.getByRole("combobox", { name: "Embedding service", exact: true }).click(); await page.getByRole("option", { name: "OpenRouter", exact: true }).click(); await page.getByRole("button", { name: "Refresh Embedding models", exact: true }).click(); await expect(page.getByText("Embedding catalogue refreshed. Choose a model, save and test it.", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Embedding model ID", exact: true }).click(); await page.getByRole("option", { name: "fixture-embedding:free · Free", exact: true }).click(); await page.getByLabel("Enable semantic retrieval", { exact: true }).check(); await page.getByRole("button", { name: "Save retrieval settings", exact: true }).click();
    const providers = await page.evaluate(() => window.notesDesktop.ai!.providers()); expect(providers.ok && providers.providers.find(provider => provider.id === "openrouter")!.models.map(model => model.id)).toEqual(["fixture-chat"]);
    await page.getByRole("button", { name: "Chat", exact: true }).click(); await page.getByRole("button", { name: "Choose sources", exact: true }).click(); await page.getByLabel("Select Cancel memo", { exact: true }).check();
    await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [filename] })) as typeof dialog.showOpenDialog; }, file);
    await page.getByRole("dialog", { name: "Choose chat sources" }).getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await expect(page.locator(".chat-source-bar")).toContainText("Sources · 2");
    await page.getByRole("button", { name: "Sources · 2", exact: true }).click(); await page.getByRole("dialog", { name: "Choose chat sources" }).getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await expect(page.locator(".chat-source-bar")).toContainText("Sources · 2"); const library = await page.evaluate(() => window.notesDesktop.library!.list()); expect(library.ok && library.entries.filter(entry => entry.source === "import").length).toBe(1);
    await app.evaluate(({ net }) => { const original = net.fetch; net.fetch = (url, init) => String(url).endsWith("/embeddings") ? new Promise<Response>((_resolve, reject) => { (globalThis as any).blockedEmbedding = true; init!.signal!.addEventListener("abort", () => reject(Error("Stopped")), { once: true }); }) : original(url, init); });
    await page.getByLabel("Chat message").fill("Summarize carbon investment"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => app.evaluate(() => !!(globalThis as any).blockedEmbedding), { timeout: 30000 }).toBe(true); await page.getByRole("button", { name: "Stop generating", exact: true }).click(); await expect(page.getByRole("button", { name: "Retry reply", exact: true })).toBeVisible();
    const stopped = await page.evaluate(() => window.notesDesktop.ai!.chats()); expect(stopped.ok && stopped.chats[0].messages.at(-1)!.status).toBe("stopped"); expect(await app.evaluate(() => (globalThis as any).groundedCalls.some((call: any) => call.endpoint.endsWith("/chat/completions")))).toBe(false);
    await mock(app); await page.getByRole("button", { name: "Retry reply", exact: true }).click(); await expect.poll(async()=>{const result=await page.evaluate(()=>window.notesDesktop.ai!.chats());return result.ok && result.chats[0].messages.at(-1)!.status;},{timeout:30000}).toBe("complete"); const retried = await page.evaluate(() => window.notesDesktop.ai!.chats()); expect(retried.ok && retried.chats[0].messages.filter(message => message.role === "user").length).toBe(1); expect(retried.ok && retried.chats[0].messages.at(-1)!.status).toBe("complete");
  } finally { await app.close().catch(() => undefined); await cleanup(root); }
});

test("source trees select Books and nested folders, retain exceptions beyond twenty pages and reveal search paths", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-grounded-ui-")), data = path.join(root, "Data"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets);
  const folder = await library.createFolder("Literature", null), nested = await library.createFolder("Refineries", folder.id), pdf = path.join(root, "Scope.pdf");
  await fs.writeFile(pdf, readerPdfFixture()); const imported = (await library.importFiles([pdf], nested.id)).items[0].entry;
  const { book, homeNote } = createBook("Selection handbook"), template = book.pages[book.homePageId], chapter = createNote({ id: "selection-chapter", title: "Methods", content: "Method overview." });
  const pages = Array.from({ length: 24 }, (_, i) => createNote({ id: `selection-page-${i}`, title: i === 23 ? "Last detail" : `Detail ${i}`, content: `Evidence item ${i}.` }));
  book.pages.chapter = { ...template, id: "chapter", noteId: chapter.id, exportPath: "methods.md", metadata: { ...template.metadata, shortTitle: "Methods" }, children: pages.map(note => note.id) }; book.rootPageIds = [book.homePageId, "chapter"];
  for (const note of pages) book.pages[note.id] = { ...template, id: note.id, noteId: note.id, exportPath: `${note.id}.md`, metadata: { ...template.metadata, shortTitle: note.title }, children: [] };
  const workspace = { version: 2 as const, notes: [homeNote, chapter, ...pages], books: [book] }; expect(validateWorkspace(workspace)).toEqual([]);
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify(workspace));
  let app = await launch(root);
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app);
    await page.evaluate(async () => { const result = await window.notesDesktop.ai!.saveProvider({ id: "siliconflow", kind: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", apiKey: "fixture-private-key", models: [{ id: "fixture-chat", name: "Chat fixture", purpose: "chat" }], defaultModel: "fixture-chat" }); if (!result.ok) throw Error(result.error); });
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Chat", exact: true }).click(); await page.getByRole("button", { name: "Choose sources", exact: true }).click();
    let picker = page.getByRole("dialog", { name: "Choose chat sources" });
    await expect(picker.getByLabel("Select Last detail", { exact: true })).toHaveCount(0); await expect(picker.getByLabel("Select Scope.pdf", { exact: true })).toHaveCount(0);
    await picker.getByLabel("Select Book: Selection handbook", { exact: true }).check(); await expect(picker).toContainText("26 sources selected");
    await picker.getByRole("button", { name: "Expand Book: Selection handbook", exact: true }).click(); await picker.getByRole("button", { name: "Expand Methods", exact: true }).click();
    await picker.getByLabel("Select Last detail", { exact: true }).uncheck(); await expect(picker.getByLabel("Select Book: Selection handbook", { exact: true })).toHaveAttribute("aria-checked", "mixed");
    await picker.getByRole("button", { name: "Expand Folder: Literature", exact: true }).click(); await picker.getByRole("button", { name: "Expand Folder: Refineries", exact: true }).click(); await picker.getByLabel("Select Folder: Literature", { exact: true }).check();
    await expect(picker.getByLabel("Select Scope.pdf", { exact: true })).toBeChecked();
    await picker.getByRole("button", { name: "Collapse Book: Selection handbook", exact: true }).click();
    await picker.getByLabel("Find chat sources", { exact: true }).fill("Last detail"); await expect(picker.getByLabel("Select Last detail", { exact: true })).not.toBeChecked(); await expect(picker).toContainText("26 sources selected");
    await picker.getByLabel("Find chat sources", { exact: true }).fill("");
    await picker.getByRole("button", { name: "Use sources", exact: true }).click();
    await expect(picker).toBeHidden();
    const saved = await page.evaluate(() => window.notesDesktop.ai!.chats()); if (!saved.ok) throw Error(saved.error);
    expect(saved.chats[0].sourceScope!.excludedNoteIds).toContain(pages[23].id); expect(saved.chats[0].sourceScope!.folderIds).toContain(folder.id);
    await app.close(); app = await launch(root); page = await app.firstWindow(); await page.getByRole("main").waitFor(); await mock(app);
    await page.getByRole("button", { name: "Sources · 26", exact: true }).click(); picker = page.getByRole("dialog", { name: "Choose chat sources" });
    await picker.getByRole("button", { name: "Expand Book: Selection handbook", exact: true }).click(); await picker.getByRole("button", { name: "Expand Folder: Literature", exact: true }).click();
    for (const theme of ["Light", "Dark"]) { await page.evaluate(theme => { document.body.classList.toggle("dark", theme === "Dark"); document.documentElement.setAttribute("data-theme", theme.toLowerCase()); }, theme); await page.screenshot({ path: info.outputPath(`source-tree-${theme.toLowerCase()}.png`) }); }
    expect(await app.evaluate(() => (globalThis as any).groundedCalls.length)).toBe(0);
    expect(await fs.readFile(await library.filePath(imported.id))).toEqual(readerPdfFixture());
  } finally { await app.close().catch(() => undefined); await cleanup(root); }
});
