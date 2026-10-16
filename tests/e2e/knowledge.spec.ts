import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { createNote } from "../../src/shared/notes";
import { createBook } from "../../src/shared/books";
import { emptyKnowledgeScope } from "../../src/shared/knowledge";
import { readerPdfFixture, imagePdfFixture } from "../fixtures/reader";
import { readerEpubFixture } from "../fixtures/epub";

const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root } });
async function cleanup(root: string) { const target = path.resolve(root); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-knowledge-ui-")) throw Error("Unsafe test cleanup"); await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }); }
async function inspect(page: Page) { const result = await page.evaluate(() => window.notesDesktop.knowledge!.inspect()); if (!result.ok) throw Error(result.error); return result.view; }
async function settled(page: Page) { await expect.poll(async () => { const view = await inspect(page); return view.enabled && !view.running && view.records.every(record => !["pending", "processing"].includes(record.status)); }, { timeout: 45000 }).toBe(true); return inspect(page); }
async function openKnowledge(page: Page) { await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("navigation", { name: "Workshop pages" }).getByRole("button", { name: "Knowledge base", exact: true }).click(); await expect(page.getByRole("heading", { name: "Knowledge base", exact: true })).toBeVisible(); }

test("local knowledge indexes real PDF/EPUB and shared writing, persists and updates without AI calls", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-knowledge-ui-")), data = path.join(root, "Data"); await fs.mkdir(data);
  const pdf = path.join(root, "Research.pdf"), epub = path.join(root, "Reading.epub"); await fs.writeFile(pdf, readerPdfFixture()); await fs.writeFile(epub, readerEpubFixture());
  const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets);
  const imported = await library.importFiles([pdf, epub]), paper = imported.items[0].entry, ebook = imported.items[1].entry, linked = await assets.importFile(await library.filePath(paper.id), false);
  const note = createNote({ id: "knowledge-personal", title: "Energy memo", content: `# Policy\n\nStrandedAssetSignal and 搁浅资产.\n\n[Paper](assets/${linked.id})` }), { book, homeNote } = createBook("Knowledge Book"); homeNote.content = `# Evidence\n\nBookPolicySignal\n\n[Shared paper](assets/${linked.id})`;
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote], books: [book] }));
  let app = await launch(root);
  try {
    let page = await app.firstWindow(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await page.getByRole("main").waitFor();
    await app.evaluate(({ net }) => { (globalThis as any).knowledgeNetworkCalls = 0; net.fetch = async () => { (globalThis as any).knowledgeNetworkCalls++; throw Error("Knowledge extraction must stay offline"); }; });
    await openKnowledge(page); expect((await inspect(page)).selectedIds).toEqual([]);
    await page.getByRole("tab", { name: "Notes", exact: true }).click(); await page.getByLabel("Include Energy memo", { exact: true }).check();
    await page.getByRole("tab", { name: "Books", exact: true }).click(); await page.getByLabel("Include Book: Knowledge Book", { exact: true }).check();
    await page.getByRole("tab", { name: "Library", exact: true }).click(); await expect(page.getByLabel("Include Research.pdf", { exact: true })).toBeChecked(); await expect(page.getByLabel("Include Research.pdf", { exact: true })).toBeDisabled(); await page.getByLabel("Include Reading.epub", { exact: true }).check();
    await page.getByRole("button", { name: "Build index", exact: true }).click(); let view = await settled(page); expect(view.records).toHaveLength(4); expect(view.records.map(record => record.status)).toEqual(["ready", "ready", "ready", "ready"]); expect(view.selectedIds.filter(id => id === `file:${paper.id}`)).toHaveLength(1);
    await page.getByRole("button", { name: "Preview Research.pdf", exact: true }).click(); const preview = page.getByRole("region", { name: "Extracted text preview", exact: true }); await expect(preview).toContainText("Climate investment page 4."); await expect(preview).toContainText("Page 4");
    await page.getByRole("button", { name: "Preview Reading.epub", exact: true }).click(); await expect(preview).toContainText("Climate change affects investment."); for (let i = 0; i < 3; i++) await preview.getByRole("button", { name: "Next", exact: true }).click(); await expect(preview).toContainText("Energy transition evidence"); await expect(preview).toContainText("Paragraph");
    await page.getByLabel("Search extracted text", { exact: true }).fill("搁浅资产"); await page.getByRole("button", { name: "Search", exact: true }).click(); await expect(preview).toContainText("Energy memo"); await expect(preview).toContainText("Lines 3");
    for (const theme of ["Light", "Dark"]) { await page.locator(".theme-option").filter({ hasText: theme }).click(); await page.screenshot({ path: info.outputPath(`knowledge-${theme.toLowerCase()}.png`) }); }
    const originalIndexedAt = view.records.find(record => record.sourceId === `file:${paper.id}`)!.indexedAt;
    const renamed = await page.evaluate(id => window.notesDesktop.library!.rename(id, "Evidence.pdf"), paper.id); expect(renamed.ok).toBe(true); view = await inspect(page); expect(view.records.find(record => record.sourceId === `file:${paper.id}`)!.indexedAt).toBe(originalIndexedAt); await page.getByRole("button", { name: "Refresh", exact: true }).click(); await expect(page.getByRole("button", { name: "Preview Evidence.pdf", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(note.title); await page.getByLabel("Note content").fill("# Updated\n\nReplacementPolicySignal and 中文证据。"); await openKnowledge(page); view = await settled(page);
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.knowledge!.search("ReplacementPolicySignal")); return result.ok && result.hits[0]?.source.entityId; }, { timeout: 15000 }).toBe(note.id); const old = await page.evaluate(() => window.notesDesktop.knowledge!.search("StrandedAssetSignal")); expect(old.ok && old.total).toBe(0);
    expect(await fs.readFile(await library.filePath(paper.id))).toEqual(readerPdfFixture()); expect(await fs.readFile(await library.filePath(ebook.id))).toEqual(readerEpubFixture());
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(usage.ok && usage.usage.summary.requests).toBe(0); expect(await app.evaluate(() => (globalThis as any).knowledgeNetworkCalls)).toBe(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("knowledge-small.png") });
    await app.close(); app = await launch(root); page = await app.firstWindow(); await page.getByRole("main").waitFor(); await openKnowledge(page); view = await settled(page); expect(view.scope.bookIds).toEqual([book.id]); expect(view.records.find(record => record.sourceId === `file:${paper.id}`)!.indexedAt).toBe(originalIndexedAt);
    const relocated = path.join(root, "RelocatedData"); await app.evaluate(({ dialog }, destination) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [destination] })) as typeof dialog.showOpenDialog; }, relocated); const moved = await page.evaluate(() => window.notesDesktop.changeDataLocation()); expect(moved.ok).toBe(true); view = await settled(page); expect(view.records.find(record => record.sourceId === `file:${paper.id}`)!.indexedAt).toBe(originalIndexedAt); const movedSearch = await page.evaluate(() => window.notesDesktop.knowledge!.search("ReplacementPolicySignal")); expect(movedSearch.ok && movedSearch.total).toBe(1); expect((await fs.stat(path.join(relocated, "Research/Knowledge/manifest.json"))).isFile()).toBe(true);
    await page.getByRole("button", { name: "Clear index", exact: true }).click(); await page.getByRole("dialog", { name: "Clear text index" }).getByRole("button", { name: "Clear index", exact: true }).click(); expect((await inspect(page)).bytes).toBe(0); expect(await fs.readFile(pdf)).toEqual(readerPdfFixture()); const saved = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8")); expect(saved.notes.find((n: any) => n.id === homeNote.id).content).toBe(homeNote.content);
    await page.getByRole("button", { name: "Build index", exact: true }).click(); await settled(page); await page.getByRole("button", { name: "Clear selection", exact: true }).click(); await expect(page.getByRole("button", { name: "Update index", exact: true })).toBeEnabled(); await page.getByRole("button", { name: "Update index", exact: true }).click(); await expect.poll(async () => (await inspect(page)).records).toEqual([]); expect(errors).toEqual([]);
  } finally { await app.close().catch(() => undefined); await cleanup(root); }
});

test("unreadable formats fail individually and stopped indexing resumes safely", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-knowledge-ui-")), data = path.join(root, "Data"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets), scan = path.join(root, "Scan.pdf"), broken = path.join(root, "Broken.pdf"), good = path.join(root, "Good.pdf");
  await fs.writeFile(scan, imagePdfFixture()); await fs.writeFile(broken, "%PDF-1.7\nInvalid document\n"); await fs.writeFile(good, readerPdfFixture(20)); const imports = await library.importFiles([scan, broken, good]), word = await assets.importBytes("Draft.docx", Buffer.from("PK unsupported"), false), scope = { ...emptyKnowledgeScope(), fileIds: [...imports.items.map(item => item.entry.id), word.id] };
  let app = await launch(root);
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor(); await openKnowledge(page);
    const start = await page.evaluate(scope => window.notesDesktop.knowledge!.start(scope), scope); expect(start.ok).toBe(true); const stop = await page.evaluate(() => window.notesDesktop.knowledge!.stop()); expect(stop.ok).toBe(true); expect((await inspect(page)).paused).toBe(true);
    const restarted = await page.evaluate(scope => window.notesDesktop.knowledge!.start(scope), scope); expect(restarted.ok).toBe(true); const view = await settled(page), record = (id: string) => view.records.find(record => record.sourceId === `file:${id}`)!;
    expect(record(imports.items[0].entry.id).status).toBe("failed"); expect(record(imports.items[0].entry.id).message).toMatch(/OCR|selectable|readable/i); expect(record(imports.items[1].entry.id).status).toBe("failed"); expect(record(imports.items[2].entry.id).status).toBe("ready"); expect(record(word.id).status).toBe("unsupported");
    const result = await page.evaluate(() => window.notesDesktop.knowledge!.search("page 20")); expect(result.ok && result.hits.some(hit => hit.chunk.anchor.page === 20)).toBe(true); expect(await fs.readFile(broken, "utf8")).toBe("%PDF-1.7\nInvalid document\n");
    const goodId = imports.items[2].entry.id, previousFingerprint = record(goodId).fingerprint;
    await app.evaluate(({ shell }) => { shell.openPath = async file => { (globalThis as any).knowledgeWorkingCopy = file; return ""; }; }); const opened = await page.evaluate(id => window.notesDesktop.library!.open(id), goodId); expect(opened.ok).toBe(true); const working = await app.evaluate(() => (globalThis as any).knowledgeWorkingCopy) as string; await fs.writeFile(working, readerPdfFixture(6)); await fs.utimes(working, new Date(Date.now() - 2000), new Date(Date.now() - 2000));
    await expect.poll(async () => { const current = (await inspect(page)).records.find(r => r.sourceId === `file:${goodId}`); return current?.status === "ready" && current.fingerprint !== previousFingerprint; }, { timeout: 20000 }).toBe(true);
    const latest = await page.evaluate(id => window.notesDesktop.knowledge!.preview(`file:${id}`), goodId); expect(latest.ok && latest.total).toBe(6); expect(latest.ok && latest.hits.some(hit => hit.chunk.anchor.page === 20)).toBe(false);
    await fs.unlink(await library.filePath(goodId)); await expect.poll(async () => (await inspect(page)).records.find(r => r.sourceId === `file:${goodId}`)?.status, { timeout: 10000 }).toBe("missing"); const missing = await page.evaluate(() => window.notesDesktop.knowledge!.search("investment")); expect(missing.ok && missing.total).toBe(0);
    const parserWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes("knowledge.html")).length); expect(parserWindows).toBe(0);
  } finally { await app.close().catch(() => undefined); await cleanup(root); }
});
