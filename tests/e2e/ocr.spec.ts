import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { brokenNumericPdfFixture, scannedPdfFixture } from "../fixtures/ocr-pdf";
import { emptyKnowledgeScope } from "../../src/shared/knowledge";
test("recovers missing numeric signs from page images instead of indexing unsigned native numbers", async () => {
  test.setTimeout(180000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-glyph-e2e-")); await fs.mkdir(path.join(root, "Data"));
  const bytes = brokenNumericPdfFixture(), file = path.join(root, "Measured changes.pdf"); await fs.writeFile(file, bytes);
  const app = await electron.launch({args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", path.resolve(".")], env: {...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: ""}});
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await app.evaluate(({dialog, net}, file) => { dialog.showOpenDialog = (async () => ({canceled: false, filePaths: [file]})) as typeof dialog.showOpenDialog; net.fetch = async () => {throw Error("Glyph recovery must stay offline");}; }, file);
    await page.getByRole("button", {name: "Library", exact: true}).click(); await page.getByRole("button", {name: "Import PDF / EPUB", exact: true}).click();
    await expect(page.getByRole("button", {name: "Measured changes.pdf", exact: true})).toBeVisible();
    const entries = await page.evaluate(() => window.notesDesktop.library!.list()); if (!entries.ok) throw Error(entries.error);
    const id = entries.entries.find(e => e.name === "Measured changes.pdf")!.id;
    await page.evaluate(scope => window.notesDesktop.knowledge!.start(scope), {...emptyKnowledgeScope(), fileIds: [id], autoUpdate: false});
    await expect.poll(async () => { const r = await page.evaluate(() => window.notesDesktop.knowledge!.inspect()); return r.ok && !r.view.running && r.view.records.find(x => x.sourceId === `file:${id}`)?.status; }, {timeout: 120000}).toBe("ready");
    for (const [query, amount, number] of [["Clinical temperature", "4.7", 1], ["River level", "6.2", 2]] as const) {
      const r = await page.evaluate(query => window.notesDesktop.knowledge!.search(query), query);
      expect(r.ok && r.hits.some(h => h.chunk.anchor.page === number && h.chunk.anchor.method === "ocr" && new RegExp(`[-−–—]\\s*${amount.replace(".", "\\.")}`).test(h.chunk.text))).toBe(true);
    }
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(usage.ok && usage.usage.summary.requests).toBe(0);
    expect(await fs.readFile(file)).toEqual(bytes);
  } finally {await app.close(); await fs.rm(root, {recursive: true, force: true});}
});
test("recognizes English/Chinese scanned pages locally, shares text with indexing and preserves native pages and originals", async ({}, info) => {
  test.setTimeout(300000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ocr-e2e-")); await fs.mkdir(path.join(root, "Data"));
  const launch = () => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const images = await page.evaluate(() => [["Climate investment evidence", "MIX losses: CNY 339.03 billion.", "Discount rate: 4.66 percent."], ["能源转型与搁浅资产", "气候变化影响投资决策。", "损失总额为3390.3亿元。"]].map(lines => {
      const canvas = document.createElement("canvas"); canvas.width = 1190; canvas.height = 1684; const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "black"; context.font = '48px "Microsoft YaHei", Arial'; lines.forEach((line, i) => context.fillText(line, 80, 180 + i * 110)); return canvas.toDataURL("image/jpeg", 0.98).split(",")[1];
    }));
    const bytes = scannedPdfFixture(images.map(image => Buffer.from(image, "base64"))), file = path.join(root, "Scanned evidence.pdf"); await fs.writeFile(file, bytes);
    const external: string[] = []; page.on("request", request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await app.evaluate(({ dialog, net }, file) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog; net.fetch = async () => { throw Error("OCR must stay offline"); }; }, file);
    await page.getByRole("button", { name: "Library", exact: true }).click(); await page.getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await page.getByRole("button", { name: "Scanned evidence.pdf", exact: true }).dblclick();
    await expect(page.getByLabel("PDF page number")).toBeEnabled();
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer')).toContainText("339.03", { timeout: 120000 });
    await page.screenshot({ path: info.outputPath("scanned-english.png") });
    await page.getByRole("button", { name: "PDF OCR", exact: true }).click(); await page.getByRole("menuitem", { name: "Recognize page", exact: true }).click();
    await page.getByRole("button", { name: "Stop OCR", exact: true }).click(); await expect(page.getByRole("button", { name: "Stop OCR", exact: true })).toHaveCount(0, { timeout: 15000 });
    const entries = await page.evaluate(() => window.notesDesktop.library!.list()); expect(entries.ok).toBe(true); if (!entries.ok) throw Error(entries.error);
    const id = entries.entries.find(entry => entry.name === "Scanned evidence.pdf")!.id;
    const index = await page.evaluate(scope => window.notesDesktop.knowledge!.start(scope), { ...emptyKnowledgeScope(), fileIds: [id], autoUpdate: false }); expect(index.ok).toBe(true);
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.knowledge!.inspect()); return result.ok && !result.view.running && result.view.records.find(r => r.sourceId === `file:${id}`)?.status; }, { timeout: 120000, intervals: [500, 1000] }).toBe("ready");
    const chinese = await page.evaluate(() => window.notesDesktop.knowledge!.search("3390.3")); expect(chinese.ok && chinese.hits[0].chunk.anchor).toMatchObject({ kind: "pdf", page: 2, method: "ocr" });
    expect(chinese.ok && chinese.hits[0].chunk.text.replace(/\s/g, "")).toContain("气候变化影响投资决策");
    const native = await page.evaluate(() => window.notesDesktop.knowledge!.search("Native policy")); expect(native.ok && native.hits[0].chunk.anchor.method).toBeUndefined();
    // Reopen to attach the OCR cached by the indexer, then exercise the normal PDF find/text layer.
    await page.getByRole("tab", { name: "Workspace", exact: true }).click(); await page.getByRole("button", { name: "Scanned evidence.pdf", exact: true }).dblclick();
    await page.getByLabel("Find in PDF").fill("3390.3"); await expect(page.locator(".pdf-find [role=status]")).toContainText("/ 1", { timeout: 20000 });
    await expect(page.getByLabel("PDF page number")).toHaveValue("2"); await expect(page.locator('.pdfViewer .page[data-page-number="2"] .textLayer')).toContainText("3390.3");
    const selection = await page.evaluate(() => { const element = document.querySelector('.pdfViewer .page[data-page-number="2"] .textLayer span')!, range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); return selection.toString(); }); expect(selection.length).toBeGreaterThan(2);
    await page.screenshot({ path: info.outputPath("scanned-chinese.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 700)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("scanned-narrow.png") });
    const stats = await page.evaluate(() => window.notesDesktop.reader!.ocrStats()); expect(stats.ok && stats.stats.pages).toBe(2); expect(external).toEqual([]);
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(usage.ok && usage.usage.summary.requests).toBe(0); expect(await fs.readFile(file)).toEqual(bytes);
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole("main").waitFor(); const restored = await page.evaluate(() => window.notesDesktop.reader!.ocrStats()); expect(restored).toEqual(stats);
    const cleared = await page.evaluate(() => window.notesDesktop.reader!.clearOcr()); expect(cleared.ok).toBe(true); const empty = await page.evaluate(() => window.notesDesktop.reader!.ocrStats()); expect(empty.ok && empty.stats.pages).toBe(0); expect(await fs.readFile(file)).toEqual(bytes);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
