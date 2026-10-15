import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createNote } from "../../src/shared/notes";
import { DEFAULT_TRANSLATION_PROMPT } from "../../src/shared/translation";

test("long source and translation scroll independently in a compact movable window", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-scroll-")); await fs.mkdir(path.join(root, "Data"));
  const source = Array(15).fill("Climate change affects investment and energy demand.").join(" ");
  const note = createNote({ id: "scroll-writing", title: "Translation reading", content: source });
  await fs.writeFile(path.join(root, "Data/notes.json"), JSON.stringify({ version: 2, notes: [note], books: [] }));
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root } });
  try {
    await app.evaluate(({ net }) => { net.fetch = (async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "气候变化影响投资与能源需求。\n".repeat(80) } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 100, total_tokens: 140 } })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } })) as typeof net.fetch; });
    const page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await page.evaluate(async prompt => {
      const provider = await window.notesDesktop.ai!.saveProvider({ id: "others", kind: "others", name: "Fixture", baseUrl: "https://fixture.example/v1", apiKey: "fixture-private-key", models: [{ id: "translation", name: "Translation", purpose: "chat" }], defaultModel: "translation" }); if (!provider.ok) throw Error(provider.error);
      const settings = await window.notesDesktop.translation!.saveSettings({ mode: "reuse", providerId: "others", modelId: "translation", modelName: "Translation", prompt, template: "auto" }); if (!settings.ok) throw Error(settings.error);
    }, DEFAULT_TRANSLATION_PROMPT);
    await page.getByRole("button", { name: "Toggle translation", exact: true }).click();
    const emptyPanel = (await page.getByRole("region", { name: "Selection translation" }).boundingBox())!; await page.mouse.move(emptyPanel.x + 40, emptyPanel.y + 20); await page.mouse.down(); await page.mouse.move(emptyPanel.x + 40, 430, { steps: 5 }); await page.mouse.up();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByLabel("Rendered preview").locator("p").evaluate(element => {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    const selected = page.getByLabel("Selected English", { exact: true }), translated = page.getByLabel("Chinese translation", { exact: true }), panel = page.getByRole("region", { name: "Selection translation" });
    await expect(translated).toContainText("气候变化影响投资与能源需求。");
    for (const area of [selected, translated]) expect(await area.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await selected.evaluate(element => { element.scrollTop = 32; }); const selectedScroll = await selected.evaluate(element => element.scrollTop);
    await translated.evaluate(element => { element.scrollTop = 130; }); expect(await translated.evaluate(element => element.scrollTop)).toBeGreaterThan(100); expect(await selected.evaluate(element => element.scrollTop)).toBe(selectedScroll);
    expect(await panel.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true); expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(470); expect(await panel.evaluate(element => element.getBoundingClientRect().bottom <= innerHeight - 12)).toBe(true);
    for (const theme of ["Light", "Dark"]) { await page.locator(".theme-option").filter({ hasText: theme }).click(); await page.screenshot({ path: info.outputPath(`translation-scroll-${theme.toLowerCase()}.png`) }); }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600)); await expect(panel.getByRole("button", { name: "Settings", exact: true })).toBeVisible(); expect(await panel.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true); await page.screenshot({ path: info.outputPath("translation-scroll-small.png") });
    const saved = JSON.parse(await fs.readFile(path.join(root, "Data/notes.json"), "utf8")); expect(saved.notes.find((value: any) => value.id === note.id)).toEqual(note);
  } finally { await app.close().catch(() => undefined); const target = path.resolve(root); if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("lancarbon-scroll-")) await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
