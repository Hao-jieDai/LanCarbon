import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetStore } from "../../electron/assets";
import { LibraryStore } from "../../electron/library";
import { readerPdfFixture } from "../fixtures/reader";
import { readerEpubFixture } from "../fixtures/epub";
const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
const select = (locator: Locator) => locator.evaluate(element => {
  (document.activeElement as HTMLElement)?.blur(); const range = document.createRange(); range.selectNodeContents(element); getSelection()!.removeAllRanges(); getSelection()!.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
async function fixture(epub: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-annotations-e2e-")), data = path.join(root, "Data"), file = path.join(root, epub ? "Reading.epub" : "Reading.pdf"), bytes = epub ? readerEpubFixture() : readerPdfFixture();
  await fs.writeFile(file, bytes); const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets), entry = (await library.importFiles([file])).items[0].entry;
  return { root, data, file, bytes, entry };
}
async function cleanup(root: string) { if (path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("lancarbon-annotations-e2e-")) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
test("PDF annotation geometry survives zoom, restart, export and return links; edits and deletion persist", async ({}, info) => {
  const f = await fixture(false); let app = await launch(f.root);
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.evaluate(id => window.dispatchEvent(new CustomEvent("lancarbon:open-pdf", { detail: { id } })), f.entry.id);
    const line = page.locator('.page[data-page-number="1"] .textLayer span').filter({ hasText: "Climate investment page 1." }).first();
    await expect(line).toBeVisible(); await expect(page.getByRole("button", { name: "Annotations (0)", exact: true })).toBeVisible();
    await select(line); await page.getByRole("toolbar", { name: "Annotate selection" }).getByRole("button", { name: "Highlight", exact: true }).click();
    await page.getByLabel("Annotation comment", { exact: true }).fill("Review the investment assumptions."); await page.getByRole("button", { name: "Save annotation", exact: true }).click();
    await expect(page.getByLabel("Reading annotations", { exact: true })).toContainText("Review the investment assumptions."); await page.getByRole("button", { name: "Close annotations", exact: true }).click();
    for (const zoom of ["75%", "125%", "Fit width"]) {
      await page.getByRole("combobox", { name: "PDF zoom", exact: true }).click(); await page.getByRole("option", { name: zoom, exact: true }).click();
      await expect.poll(() => page.locator('.page[data-page-number="1"]').evaluate(root => {
        const text = Array.from(root.querySelectorAll('.textLayer span')).find(e => e.textContent === "Climate investment page 1."); const mark = root.querySelector('.reader-annotation-mark'); if (!text || !mark) return 999;
        const range = document.createRange(); range.selectNodeContents(text); const r = range.getBoundingClientRect(), m = mark.getBoundingClientRect(); return Math.max(Math.abs(r.x - m.x), Math.abs(r.y - m.y), Math.abs(r.width - m.width), Math.abs(r.height - m.height));
      })).toBeLessThan(2);
    }
    await page.screenshot({ path: info.outputPath("pdf-annotation-zoom.png") });
    await app.close(); app = await launch(f.root); page = await app.firstWindow(); await expect(page.getByRole("button", { name: "Annotations (1)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Annotations (1)", exact: true }).click(); await page.getByRole("button", { name: "Export all to Note", exact: true }).click(); await page.getByRole("button", { name: "Create new Note", exact: true }).click();
    await expect(page.getByLabel("Rendered preview")).toContainText("PDF file page 1"); await expect(page.getByLabel("Rendered preview")).toContainText("Review the investment assumptions.");
    await page.getByLabel("Rendered preview").getByRole("link", { name: "Return to original", exact: true }).click(); await expect(page.getByLabel("Reading annotations", { exact: true })).toBeVisible();
    await expect(page.locator('.reader-annotation-mark.focused').first()).toBeVisible();
    await page.getByRole("button", { name: "Export all to Note", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Export annotations", exact: true })).toContainText("already been exported"); await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByLabel("Reading annotations", { exact: true }).getByRole("button", { name: "Edit", exact: true }).click(); await page.getByLabel("Annotation style", { exact: true }).selectOption("underline"); await page.getByLabel("Annotation comment", { exact: true }).fill("Revised comment"); await page.getByRole("button", { name: "Save annotation", exact: true }).click(); await expect(page.locator('.reader-annotation-mark.underline').first()).toBeVisible();
    await page.getByLabel("Reading annotations", { exact: true }).getByRole("button", { name: "Manage / delete", exact: true }).click(); await page.getByRole("button", { name: "Delete annotation", exact: true }).click(); await expect(page.getByRole("button", { name: "Annotations (0)", exact: true })).toBeVisible();
    expect(await fs.readFile(f.file)).toEqual(f.bytes);
  } finally { await app.close().catch(() => undefined); await cleanup(f.root); }
});
test("cross-page PDF comments export both page locations and return to a later page", async () => {
  const f = await fixture(false), app = await launch(f.root);
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor(); await page.evaluate(id => window.dispatchEvent(new CustomEvent("lancarbon:open-pdf", { detail: { id } })), f.entry.id);
    await expect(page.getByRole("button", { name: "Annotations (0)", exact: true })).toBeVisible();
    for (const number of [3, 4]) { await page.getByLabel("PDF page number", { exact: true }).fill(String(number)); await page.getByLabel("PDF page number", { exact: true }).press("Enter"); await expect(page.locator(`.page[data-page-number="${number}"] .textLayer`)).toContainText(`Climate investment page ${number}.`); }
    await page.locator('.pdfViewer').evaluate(root => {
      const start = root.querySelector('.page[data-page-number="3"] .textLayer span')!, end = root.querySelector('.page[data-page-number="4"] .textLayer span')!;
      const range = document.createRange(); range.setStart(start.firstChild!, 0); range.setEnd(end.firstChild!, end.firstChild!.textContent!.length); (document.activeElement as HTMLElement)?.blur(); getSelection()!.removeAllRanges(); getSelection()!.addRange(range); end.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.getByRole("toolbar", { name: "Annotate selection" }).getByRole("button", { name: "Comment", exact: true }).click(); await expect(page.getByRole("button", { name: "Save annotation", exact: true })).toBeDisabled(); await page.getByLabel("Annotation comment", { exact: true }).fill("Compare evidence across the page break."); await page.getByRole("button", { name: "Save annotation", exact: true }).click();
    await expect(page.getByLabel("Reading annotations", { exact: true })).toContainText("PDF file pages 3, 4");
    await page.getByRole("button", { name: "Export all to Note", exact: true }).click(); await page.getByRole("button", { name: "Create new Note", exact: true }).click(); await expect(page.getByLabel("Rendered preview")).toContainText("PDF file pages 3, 4");
    await page.getByLabel("Rendered preview").getByRole("link", { name: "Return to original", exact: true }).click(); await expect(page.getByLabel("PDF page number", { exact: true })).toHaveValue("3"); await expect(page.locator('.page[data-page-number="3"] .reader-annotation-mark.comment').first()).toBeVisible();
  } finally { await app.close().catch(() => undefined); await cleanup(f.root); }
});
test("EPUB annotations follow chapter text through reflow and search, export selected items, and refuse stale locations", async ({}, info) => {
  const f = await fixture(true), app = await launch(f.root);
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor(); await page.evaluate(id => window.dispatchEvent(new CustomEvent("lancarbon:open-pdf", { detail: { id } })), f.entry.id);
    const paragraph = page.locator('.epub-prose p').filter({ hasText: "Climate change affects investment." }).first(); await expect(paragraph).toBeVisible(); await expect(page.getByRole("button", { name: "Annotations (0)", exact: true })).toBeVisible();
    await select(paragraph); await page.getByRole("toolbar", { name: "Annotate selection" }).getByRole("button", { name: "Underline", exact: true }).click(); await page.getByRole("button", { name: "Save annotation", exact: true }).click(); await page.getByRole("button", { name: "Close annotations", exact: true }).click();
    for (const size of ["32 px", "14 px"]) {
      await page.getByLabel("EPUB font size", { exact: true }).click(); await page.getByRole("option", { name: size, exact: true }).click();
      await expect.poll(() => paragraph.evaluate(p => { const range = document.createRange(); range.selectNodeContents(p); const text = range.getClientRects()[0], mark = p.closest('.epub-prose')!.querySelector('.reader-annotation-mark')?.getBoundingClientRect(); return mark ? Math.max(Math.abs(text.x - mark.x), Math.abs(text.y - mark.y)) : 999; })).toBeLessThan(2);
    }
    await page.getByLabel("Find in EPUB").fill("Climate change"); await page.getByLabel("EPUB contents", { exact: true }).getByRole("button").first().click(); await expect(page.locator('.epub-match').first()).toBeVisible(); await expect(page.locator('.reader-annotation-mark').first()).toBeVisible();
    await page.getByRole("button", { name: "Next EPUB chapter", exact: true }).click(); await expect(page.locator('.epub-prose')).toContainText("Energy transition evidence"); await expect(page.locator('.reader-annotation-mark')).toHaveCount(0);
    await page.getByRole("button", { name: "Annotations (1)", exact: true }).click(); await page.getByLabel("Reading annotations", { exact: true }).getByRole("button", { name: /Chapter 1:/ }).click(); await expect(paragraph).toBeVisible(); await expect(page.locator('.reader-annotation-mark').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("epub-annotation-panel.png") });
    await page.getByLabel("Reading annotations", { exact: true }).getByRole("checkbox").check(); await page.getByRole("button", { name: "Export selected (1)", exact: true }).click(); await page.getByRole("button", { name: "Create new Note", exact: true }).click(); await expect(page.getByLabel("Rendered preview")).toContainText("Paragraph"); await page.getByLabel("Rendered preview").getByRole("link", { name: "Return to original", exact: true }).click(); await expect(paragraph).toBeVisible();
    // Replace the source via the normal Library version API in the main process.
    const updatedLibrary = new LibraryStore(f.data, path.join(f.root, "Library"), new AssetStore(f.data, path.join(f.root, "Library/assets")));
    await updatedLibrary.updateVersion(f.entry.id, readerEpubFixture("New edition"));
    await page.evaluate(id => window.dispatchEvent(new CustomEvent("lancarbon:open-pdf", { detail: { id, annotationId: "00000000-0000-0000-0000-000000000000" } })), f.entry.id);
    await expect(page.locator('.epub-prose')).toContainText("New edition"); await expect(page.getByLabel("Reading annotations", { exact: true })).toContainText("Earlier file version"); await expect(page.locator('.reader-annotation-mark')).toHaveCount(0);
    expect(await fs.readFile(f.file)).toEqual(f.bytes);
  } finally { await app.close().catch(() => undefined); await cleanup(f.root); }
});
