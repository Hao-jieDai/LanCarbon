import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createNote } from "../../src/shared/notes";
import { TODO_NOTE_ID } from "../../src/shared/todo";

function selectionPdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"];
  for (let page = 0; page < 2; page++) {
    const stream = page === 0 ? "BT /F1 16 Tf 35 740 Td (Previous sentence. The policy reduced emissions.) Tj 0 -690 Td (The results suggest that) Tj ET" : "BT /F1 16 Tf 35 740 Td (the policy reduced emissions.) Tj ET";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + page * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let raw = "%PDF-1.7\n"; const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(raw.length); raw += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = raw.length;
  return raw + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
}
const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
const select = (locator: Locator, text?: string) => locator.evaluate((element, text) => {
  (document.activeElement as HTMLElement)?.blur();
  element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  const range = document.createRange(); range.selectNodeContents(element);
  if (text) {
    const start = element.textContent!.indexOf(text); if (start < 0) throw Error("Missing fixture text");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let offset = 0, begun = false;
    while (walker.nextNode()) { const node = walker.currentNode, length = node.textContent!.length;
      if (!begun && offset + length > start) { range.setStart(node, start - offset); begun = true; }
      if (begun && offset + length >= start + text.length) { range.setEnd(node, start + text.length - offset); break; }
      offset += length;
    }
  }
  getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}, text);
async function cleanup(root: string) { if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("lancarbon-reading-update-")) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

test("PDF canvas, mouse selection and search agree at multiple zoom levels; cross-page translation uses one combined source", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-reading-update-")), file = path.join(root, "Selections.pdf");
  await fs.writeFile(file, selectionPdf()); const app = await launch(root);
  try {
    const page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await app.evaluate(({ dialog, net }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      (globalThis as any).translationSources = [];
      net.fetch = async (_input, init) => { const body = JSON.parse(init!.body as string), raw = body.messages.at(-1).content; let source = raw; try { source = JSON.parse(raw).text_to_translate; } catch {}
        (globalThis as any).translationSources.push(source);
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "译文：" + source } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }); };
    }, file);
    await page.getByRole("button", { name: "Library", exact: true }).click(); await page.getByRole("button", { name: "Import PDF / EPUB", exact: true }).click(); await page.getByRole("button", { name: "Selections.pdf", exact: true }).dblclick();
    const first = page.locator('.page[data-page-number="1"]'); await expect(first.locator('.textLayer')).toContainText("Previous sentence.");
    // Courier has fixed 600/1000-em advances: coordinates come from the PDF,
    // not from the DOM text layer we are testing.
    for (const zoom of ["75%", "125%", "Fit width"]) {
      await page.getByRole("combobox", { name: "PDF zoom", exact: true }).click(); await page.getByRole("option", { name: zoom, exact: true }).click();
      await page.getByLabel("Find in PDF").fill(""); await first.locator('.textLayer span').first().scrollIntoViewIfNeeded();
      await expect.poll(() => first.evaluate(element => { const canvas = element.querySelector('canvas')!.getBoundingClientRect(), layer = element.querySelector('.textLayer')!.getBoundingClientRect(); return Math.max(Math.abs(canvas.width - layer.width), Math.abs(canvas.height - layer.height), Math.abs(canvas.x - layer.x)); })).toBeLessThan(1.5);
      const canvas = (await first.locator('canvas').first().boundingBox())!, scale = canvas.width / 595;
      const prefix = "Previous sentence. ".length, phrase = "The policy";
      const x = canvas.x + (35 + prefix * 9.6) * scale, y = canvas.y + (842 - 740 - 6) * scale;
      await page.mouse.move(x + 0.6 * scale, y); await page.mouse.down(); await page.mouse.move(x + (phrase.length * 9.6 - 0.6) * scale, y, { steps: 8 }); await page.mouse.up();
      expect(await page.evaluate(() => getSelection()?.toString())).toBe(phrase);
      await page.getByLabel("Find in PDF").fill(phrase); await expect(first.locator('.highlight.selected')).toHaveText(phrase);
      const currentCanvas = (await first.locator('canvas').first().boundingBox())!, highlight = (await first.locator('.highlight.selected').boundingBox())!;
      expect(Math.abs(highlight.x - (currentCanvas.x + (35 + prefix * 9.6) * currentCanvas.width / 595))).toBeLessThan(2.5);
    }
    await page.getByLabel("Find in PDF").fill("");
    await page.evaluate(async () => {
      const provider = await window.notesDesktop.ai!.saveProvider({ id: "siliconflow", kind: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", apiKey: "fixture-private", defaultModel: "fixture", models: [{ id: "fixture", name: "Fixture", purpose: "chat" }] }); if (!provider.ok) throw Error(provider.error);
      const settings = await window.notesDesktop.translation!.saveSettings({ mode: "reuse", providerId: "siliconflow", modelId: "fixture", modelName: "Fixture", prompt: "Translate into Chinese.", template: "standard" }); if (!settings.ok) throw Error(settings.error);
    });
    await page.getByRole("button", { name: "Toggle translation", exact: true }).click();
    await page.getByLabel("PDF page number").fill("1"); await page.getByLabel("PDF page number").press("Enter");
    await page.locator('.pdf-scroll-container').evaluate(element => { element.scrollTop = element.querySelector('.page')!.clientHeight - 180; });
    await first.locator('.textLayer span').last().scrollIntoViewIfNeeded(); await select(first.locator('.textLayer'), "The results suggest that");
    await expect(page.getByLabel("Selected English", { exact: true })).toHaveText("The results suggest that");
    await page.keyboard.press("z"); await expect(page.getByLabel("Continuous translation", { exact: true })).toBeChecked();
    await page.getByLabel("PDF page number").fill("2"); await page.getByLabel("PDF page number").press("Enter");
    const beginning = page.locator('.page[data-page-number="2"] .textLayer'); await expect(beginning).toContainText("the policy reduced emissions."); await select(beginning);
    const combined = "The results suggest that the policy reduced emissions.";
    await expect(page.getByLabel("Selected English", { exact: true })).toHaveText(combined);
    await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("译文：" + combined);
    const requests = await app.evaluate(() => (globalThis as any).translationSources as string[]); expect(requests.at(-1)).toBe(combined); expect(requests.filter(text => text === combined)).toHaveLength(1);
    await page.screenshot({ path: info.outputPath("continuous-translation.png") });
    await page.getByLabel("Find in PDF").fill("z"); await expect(page.getByLabel("Continuous translation", { exact: true })).toBeChecked(); await page.getByLabel("Find in PDF").fill("");
    await page.getByRole("button", { name: "New passage", exact: true }).click(); await select(beginning);
    await expect(page.getByLabel("Selected English", { exact: true })).toHaveText("the policy reduced emissions.");
    await page.getByLabel("Continuous translation", { exact: true }).uncheck(); await select(beginning); await expect(page.getByLabel("Selected English", { exact: true })).toHaveText("the policy reduced emissions.");
    await page.getByLabel("Continuous translation", { exact: true }).check(); await page.getByRole("tab", { name: "Workspace", exact: true }).click();
    await expect(page.getByLabel("Continuous translation", { exact: true })).not.toBeChecked(); await expect(page.getByLabel("Selected English", { exact: true })).toHaveCount(0);
  } finally { await app.close(); await cleanup(root); }
});

test("upgrade and restart create one personal To do and preserve task edits and other notes", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-reading-update-")); await fs.mkdir(path.join(root, "Data"));
  const personal = createNote({ id: "personal", title: "Personal", content: "Keep my writing" });
  await fs.writeFile(path.join(root, "Data/notes.json"), JSON.stringify({ version: 2, notes: [personal], books: [] }));
  let app = await launch(root);
  try {
    let page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue("Personal");
    await page.locator('.note-card').filter({ has: page.getByRole("heading", { name: "To do", exact: true }) }).click(); await expect(page.getByLabel("Note title")).toHaveValue("To do");
    await page.getByLabel("New task", { exact: true }).fill("Review the paper / 阅读论文"); await page.getByRole("button", { name: "Add task", exact: true }).click();
    await page.getByRole("checkbox", { name: "Review the paper / 阅读论文", exact: true }).check();
    await page.getByLabel("Note title").fill("My tasks");
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(root, "Data/notes.json"), "utf8")).notes.find((n: any) => n.id === TODO_NOTE_ID)?.content).toContain("- [x] Review the paper");
    await page.screenshot({ path: info.outputPath("todo.png") }); await app.close(); app = await launch(root); page = await app.firstWindow();
    await expect(page.getByLabel("Note title")).toHaveValue("My tasks"); await expect(page.getByRole("checkbox", { name: "Review the paper / 阅读论文", exact: true })).toBeChecked();
    const saved = JSON.parse(await fs.readFile(path.join(root, "Data/notes.json"), "utf8")); expect(saved.notes.filter((n: any) => n.id === TODO_NOTE_ID)).toHaveLength(1); expect(saved.notes.find((n: any) => n.id === personal.id)).toEqual(personal);
  } finally { await app.close(); await cleanup(root); }
});
