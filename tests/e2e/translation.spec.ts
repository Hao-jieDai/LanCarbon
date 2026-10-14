import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createNote } from "../../src/shared/notes";
import { createBook } from "../../src/shared/books";

test("global selection translation protects writing, keys, cache and usage across workspaces", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-translation-"));
  await fs.mkdir(path.join(root, "Data"), { recursive: true });
  const note = createNote({ id: "translation-writing", title: "Translation note", content: "# Reading\n\nstranded assets" });
  const { book, homeNote } = createBook("Translation Book"); homeNote.content = "# Reading\n\ncarbon pricing";
  await fs.writeFile(path.join(root, "Data/notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote], books: [book] }));
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    if (request.url === "/models") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ id: "tencent/Hunyuan-MT-7B" }, { id: "fixture-translation" }] })); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    let source = body.messages.at(-1).content;
    try { source = JSON.parse(source).text_to_translate; } catch { source = source.split("\n\n").at(-1); }
    const translated = source === "stranded assets" ? "搁浅资产" : source === "carbon pricing" ? "碳定价" : source.startsWith("Your Notes") ? "可通过工作区按钮访问笔记和书籍。" : source === "Your source materials" ? "你的源材料" : source.startsWith("This workspace") ? "较早的回复" : "气候变化影响投资。";
    response.writeHead(200, { "content-type": "text/event-stream" });
    const timer = setTimeout(() => response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: translated } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 } })}\n\ndata: [DONE]\n\n`), source.startsWith("This workspace") ? 2500 : 60);
    response.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const launch = async () => {
    const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
    await app.evaluate(({ net }, address) => { const original = net.fetch.bind(net); net.fetch = (input, init) => { const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url; if (!/^https?:/.test(url)) return original(input, init); return original(address + (new URL(url).pathname.endsWith("/models") ? "/models" : "/chat/completions"), init); }; }, address);
    return app;
  };
  const select = async (locator: Locator) => locator.evaluate(element => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    await page.evaluate(async () => { const result = await window.notesDesktop.ai!.saveProvider({ id: "siliconflow", kind: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", models: [{ id: "chat-model", name: "Chat model", purpose: "chat" }], defaultModel: "chat-model", apiKey: "fixture-chat-private" }); if (!result.ok) throw Error(result.error); });
    const selectEditor = async () => { await page.getByLabel("Note content", { exact: true }).click(); await page.keyboard.press("Control+End"); await page.keyboard.press("Home"); await page.keyboard.press("Shift+End"); };
    await selectEditor(); await page.waitForTimeout(550); expect(requests).toHaveLength(0);
    await expect(page.getByRole("region", { name: "Selection translation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Translation Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Translation service", exact: true }).click(); await page.getByRole("option", { name: "SiliconFlow", exact: true }).click();
    await page.getByRole("button", { name: "Refresh translation models", exact: true }).click(); await expect(page.getByText(/2 models found/)).toBeVisible();
    await page.getByRole("combobox", { name: "Translation model ID", exact: true }).fill("tencent/Hunyuan-MT-7B"); await page.getByLabel("Translation model display name", { exact: true }).fill("Hunyuan MT");
    await page.getByRole("button", { name: "Save translation settings", exact: true }).click(); await expect(page.getByText("Translation settings saved.", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("translation-settings-dark.png") });
    const originalChat = await fs.readFile(path.join(root, "Config/ai-settings.json"), "utf8");
    await page.evaluate(async () => { const result = await window.notesDesktop.ai!.savePrice({ providerId: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", modelId: "tencent/Hunyuan-MT-7B", currency: "CNY", input: 0, output: 0 }); if (!result.ok) throw Error(result.error); });
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await page.getByRole("button", { name: "Toggle translation", exact: true }).click(); await selectEditor();
    await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("搁浅资产"); expect(requests).toHaveLength(1); expect(requests[0].messages).toHaveLength(1); expect(requests[0].messages[0].role).toBe("user");
    await page.getByRole("button", { name: "Preview", exact: true }).click(); await select(page.getByLabel("Rendered preview").getByText("stranded assets", { exact: true }));
    await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("搁浅资产"); await expect(page.locator(".translation-model")).toContainText("Saved result"); expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Books", exact: true }).click(); await page.getByLabel("Select Book").selectOption(book.id); await page.getByRole("button", { name: "Edit", exact: true }).click(); await selectEditor();
    await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("碳定价"); expect(requests).toHaveLength(2);
    await page.getByRole("button", { name: "Preview", exact: true }).click(); await select(page.getByLabel("Rendered preview").getByText("carbon pricing", { exact: true }));
    await expect(page.locator(".translation-model")).toContainText("Saved result"); expect(requests).toHaveLength(2);
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Run", exact: true }).click();
    await select(page.getByText(/^This workspace is ready/)); await expect.poll(() => requests.length).toBe(3);
    await select(page.getByText("Your Notes and Books are available from the workspace buttons.", { exact: true })); await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("可通过工作区按钮访问笔记和书籍。");
    await page.waitForTimeout(2600); await expect(page.getByLabel("Chinese translation", { exact: true })).not.toHaveText("较早的回复"); expect(requests).toHaveLength(4);
    await page.getByRole("button", { name: "Library", exact: true }).click(); await select(page.getByRole("heading", { name: "Your source materials", exact: true }));
    await expect(page.getByLabel("Chinese translation", { exact: true })).toHaveText("你的源材料"); expect(requests).toHaveLength(5);
    const panel = page.getByRole("region", { name: "Selection translation" }), before = (await panel.boundingBox())!;
    await page.mouse.move(before.x + 40, before.y + 20); await page.mouse.down(); await page.mouse.move(before.x - 90, before.y - 80); await page.mouse.up();
    expect((await panel.boundingBox())!.x).toBeLessThan(before.x - 80);
    await page.screenshot({ path: info.outputPath("translation-library-dark.png") }); await page.locator(".theme-option").filter({ hasText: "Light" }).click(); await page.screenshot({ path: info.outputPath("translation-library-light.png") });
    await page.keyboard.press("Control+Alt+t"); await expect(panel).toHaveCount(0); await select(page.getByRole("heading", { name: "Your source materials", exact: true })); await page.waitForTimeout(550); expect(requests).toHaveLength(5);
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Translation Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Translation connection", exact: true }).click(); await page.getByRole("option", { name: "Separate translation connection", exact: true }).click();
    await page.getByRole("combobox", { name: "Translation service", exact: true }).click(); await page.getByRole("option", { name: "Others Translation · Key needed", exact: true }).click();
    await page.getByLabel("Translation API base address", { exact: true }).fill("https://translation.example/v1"); await page.getByLabel("Translation API Key", { exact: true }).fill("fixture-translation-private");
    await page.getByRole("button", { name: "Toggle translation", exact: true }).click(); await page.getByLabel("Translation API Key", { exact: true }).click(); await page.keyboard.press("Control+a"); await page.waitForTimeout(550); expect(requests).toHaveLength(5);
    await page.getByRole("combobox", { name: "Translation model ID", exact: true }).fill("fixture-translation"); await page.getByRole("button", { name: "Save translation settings", exact: true }).click(); await expect(page.getByText("Translation settings saved.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Saved translation API key")).toHaveText("fixt••••••••vate"); expect(await fs.readFile(path.join(root, "Config/ai-settings.json"), "utf8")).toBe(originalChat);
    expect(await fs.readFile(path.join(root, "Config/translation-connections.json"), "utf8")).not.toContain("fixture-translation-private");
    await page.getByRole("button", { name: "Test translation", exact: true }).click(); await expect(page.getByText("Translation test: 气候变化影响投资。", { exact: true })).toBeVisible(); expect(requests).toHaveLength(6); expect(requests[5].messages[0].role).toBe("system");
    await page.getByRole("button", { name: "Clear translation cache", exact: true }).click(); await expect(page.getByText("Saved translations cleared.", { exact: true })).toBeVisible(); await expect(page.getByText(/0 saved results/)).toBeVisible();
    await page.getByRole("button", { name: "Usage", exact: true }).click(); await page.getByRole("combobox", { name: "Usage purpose", exact: true }).click(); await page.getByRole("option", { name: "Translation", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("6");
    const rows = await page.locator(".usage-hours button").evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top))); expect([...new Set(rows)].map(row => rows.filter(value => value === row).length)).toEqual([8, 8, 8]);
    const usage = await page.evaluate(() => window.notesDesktop.ai!.usage({ purpose: "translation" })); if (!usage.ok) throw Error(usage.error);
    expect(usage.usage.summary).toMatchObject({ requests: 6, totalTokens: 130, pending: 0 }); expect(usage.usage.records.filter(record => record.status === "stopped")).toHaveLength(1);
    await page.setViewportSize({ width: 900, height: 650 }); await page.screenshot({ path: info.outputPath("translation-usage-small.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await expect(page.getByRole("region", { name: "Selection translation" })).toHaveCount(0); await expect(page.getByRole("button", { name: "Toggle translation", exact: true })).toBeVisible();
    const settings = await page.evaluate(() => window.notesDesktop.translation!.settings()); expect(settings.ok && settings.settings.modelId).toBe("fixture-translation"); expect(requests).toHaveLength(6);
    const saved = JSON.parse(await fs.readFile(path.join(root, "Data/notes.json"), "utf8")); expect(saved.notes.find((value: any) => value.id === note.id).content).toBe(note.content); expect(saved.notes.find((value: any) => value.id === homeNote.id).content).toBe(homeNote.content);
  } finally { await app.close().catch(() => undefined); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); const target = path.resolve(root); if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("lancarbon-translation-")) await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
