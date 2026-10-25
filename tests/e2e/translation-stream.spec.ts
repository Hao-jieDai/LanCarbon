import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createNote } from "../../src/shared/notes";
import { DEFAULT_TRANSLATION_PROMPT } from "../../src/shared/translation";

test("streaming translation survives ordinary clicks, stops explicitly and retries without stale output", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-stream-"));
  await fs.mkdir(path.join(root, "Data"));
  const note = createNote({ id: "stream-note", title: "Stream fixture", content: "Climate change affects investment." });
  await fs.writeFile(path.join(root, "Data/notes.json"), JSON.stringify({ version: 2, notes: [note], books: [] }));
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  try {
    await app.evaluate(({ net }) => {
      const state = (globalThis as any).__translationFixture = { calls: 0, aborted: 0, streams: [] as ReadableStreamDefaultController<Uint8Array>[] };
      net.fetch = (async (_input, init) => {
        state.calls++;
        return new Response(new ReadableStream({ start(controller) {
          state.streams.push(controller);
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"气候"}}]}\n\n'));
          init?.signal?.addEventListener("abort", () => { state.aborted++; controller.error(Error("stopped")); }, { once: true });
        } }), { headers: { "content-type": "text/event-stream" } });
      }) as typeof net.fetch;
    });
    const page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await page.evaluate(async prompt => {
      const provider = await window.notesDesktop.ai!.saveProvider({ id: "others", kind: "others", name: "Fixture", baseUrl: "https://fixture.example/v1", apiKey: "fixture-private-key", models: [{ id: "translator", name: "Translator", purpose: "chat" }], defaultModel: "translator" }); if (!provider.ok) throw Error(provider.error);
      const saved = await window.notesDesktop.translation!.saveSettings({ mode: "reuse", providerId: "others", modelId: "translator", modelName: "Translator", template: "auto", prompt }); if (!saved.ok) throw Error(saved.error);
    }, DEFAULT_TRANSLATION_PROMPT);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Toggle translation", exact: true }).click();
    await page.getByLabel("Rendered preview").locator("p").evaluate(element => {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    const panel = page.getByRole("region", { name: "Selection translation" });
    await expect(panel.getByLabel("Chinese translation", { exact: true })).toHaveText("气候");
    await expect(panel.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await page.getByLabel("Rendered preview").locator("p").click();
    await page.waitForTimeout(650);
    expect(await app.evaluate(() => ({ calls: (globalThis as any).__translationFixture.calls, aborted: (globalThis as any).__translationFixture.aborted }))).toEqual({ calls: 1, aborted: 0 });
    await panel.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Translation stopped");
    const cache = await page.evaluate(() => window.notesDesktop.translation!.settings()); expect(cache.ok && cache.cache.entries).toBe(0);
    await panel.getByRole("button", { name: "Retry translation", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await expect.poll(() => app.evaluate(() => (globalThis as any).__translationFixture.calls)).toBe(2);
    await app.evaluate(() => { const stream = (globalThis as any).__translationFixture.streams[1]; stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"变化影响投资。"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":8}}\n\ndata: [DONE]\n\n')); stream.close(); });
    await expect(panel.getByLabel("Chinese translation", { exact: true })).toHaveText("气候变化影响投资。");
    await expect(panel.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    const final = await page.evaluate(() => window.notesDesktop.translation!.settings()); expect(final.ok && final.cache.entries).toBe(1);
    expect(await app.evaluate(() => (globalThis as any).__translationFixture.calls)).toBe(2);
    await page.screenshot({ path: info.outputPath("translation-finished.png") });
  } finally {
    await app.close().catch(() => undefined);
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-stream-")) throw Error("Unsafe cleanup");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
