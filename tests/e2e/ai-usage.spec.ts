import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";

test("records native usage, snapshots prices, separates retries and survives offline restart", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-usage-desktop-"));
  await fs.mkdir(path.join(root, "Config"), { recursive: true });
  await fs.writeFile(path.join(root, "Config", "ai-pricing.json"), JSON.stringify({ version: 1, prices: [{ providerId: "others-old", baseUrl: "https://old.example/v1", modelId: "removed-model", currency: "USD", input: 1, output: 1, updatedAt: "2026-01-01T00:00:00Z" }] }));
  let networkCalls = 0, attempts = 0;
  const server = createServer(async (request, response) => {
    networkCalls++; let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), text = body.messages.at(-1)?.content;
    if (text === "retry accounting" && attempts++ === 0) { response.writeHead(429, { "content-type": "application/json", "Retry-After": "1" }); response.end('{"error":{"message":"Fixture busy"}}'); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write('data: {"choices":[{"delta":{"content":"Fixture reply"}}]}\n\n');
    if (text === "stop accounting") return;
    const usage = body.model === "fixture-or" ? { prompt_tokens: 20, completion_tokens: 10, cost: 0.004 } : body.model === "fixture-free" ? { prompt_tokens: 5, completion_tokens: 3 } : { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 20 } };
    setTimeout(() => response.end(`data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`), 120);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const launch = async (offline = false) => {
    const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
    await app.evaluate(({ net }, { address, offline }) => { const original = net.fetch.bind(net); net.fetch = (input, init) => { if (offline) throw new Error("Network disabled for offline verification"); return original(address + "/chat/completions", init); }; }, { address, offline });
    return app;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const cleaned = await page.evaluate(() => window.notesDesktop.ai!.prices()); expect(cleaned.ok && cleaned.prices.length).toBe(0);
    const writing = await page.getByLabel("Note title").inputValue();
    await page.evaluate(async () => {
      const api = window.notesDesktop.ai!, loaded = await api.providers(); if (!loaded.ok) throw Error(loaded.error);
      for (const [id, kind, name, baseUrl, modelId, modelName] of [
        ["siliconflow", "siliconflow", "SiliconFlow", "https://api.siliconflow.cn/v1", "fixture-sf", "Fixture SF"],
        ["openrouter", "openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "fixture-or", "Fixture OR"],
        ["others-fixture", "others", "BigModel fixture", "https://open.bigmodel.cn/api/paas/v4", "fixture-free", "Fixture Free"]
      ] as const) { const result = await api.saveProvider({ id, kind, name, baseUrl, models: [{ id: modelId, name: modelName, purpose: "chat" }], defaultModel: modelId, apiKey: "fixture-key-private" }); if (!result.ok) throw Error(result.error); }
      const result = await api.test("siliconflow", "fixture-sf"); if (!result.ok) throw Error(result.error);
    });
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Usage", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("1");
    await expect(page.getByText(/1 without known costs/)).toBeVisible();
    await page.locator(".usage-prices summary").click();
    await page.getByRole("combobox", { name: "Price model", exact: true }).click(); await page.getByRole("option", { name: "SiliconFlow · Fixture SF", exact: true }).click();
    await page.getByLabel("Input price", { exact: true }).fill("2"); await page.getByLabel("Output price", { exact: true }).fill("8"); await page.getByLabel("Cache read price", { exact: true }).fill("0.5"); await page.getByLabel("Cache write price", { exact: true }).fill("3"); await page.getByRole("button", { name: "Save price", exact: true }).click(); await expect(page.getByText("Price saved for future requests.")).toBeVisible();
    await page.evaluate(async () => { const result = await window.notesDesktop.ai!.test("siliconflow", "fixture-sf"); if (!result.ok) throw Error(result.error); });
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("2");
    await page.evaluate(async () => {
      const api = window.notesDesktop.ai!;
      const price = await api.savePrice({ providerId: "others-fixture", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelId: "fixture-free", currency: "CNY", input: 0, output: 0 }); if (!price.ok) throw Error(price.error);
      const chat = await api.createChat("openrouter", "fixture-or"); if (!chat.ok) throw Error(chat.error);
      const result = await api.send(chat.chat.id, "openrouter", "fixture-or", "retry accounting"); if (!result.ok) throw Error(result.error);
    });
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); return result.ok ? result.usage.summary.requests : 0; }).toBe(4);
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); return result.ok ? result.usage.summary.pending : -1; }).toBe(0);
    await page.evaluate(async () => {
      const api = window.notesDesktop.ai!, chat = await api.createChat("others-fixture", "fixture-free"); if (!chat.ok) throw Error(chat.error);
      const result = await api.send(chat.chat.id, "others-fixture", "fixture-free", "free accounting"); if (!result.ok) throw Error(result.error);
    });
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); return result.ok ? result.usage.summary.requests : 0; }).toBe(5);
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); return result.ok ? result.usage.summary.pending : -1; }).toBe(0);
    const stopChat = await page.evaluate(async () => { const api = window.notesDesktop.ai!, chat = await api.createChat("siliconflow", "fixture-sf"); if (!chat.ok) throw Error(chat.error); const result = await api.send(chat.chat.id, "siliconflow", "fixture-sf", "stop accounting"); if (!result.ok) throw Error(result.error); return chat.chat.id; });
    await expect.poll(async () => { const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); return result.ok ? result.usage.summary.pending : -1; }).toBe(1);
    await page.evaluate(async id => { const result = await window.notesDesktop.ai!.stop(id); if (!result.ok) throw Error(result.error); }, stopChat);
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("6");
    const result = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(result.ok).toBe(true); if (!result.ok) throw Error(result.error);
    expect(result.usage.summary).toMatchObject({ requests: 6, inputTokens: 225, outputTokens: 113, totalTokens: 338, unknownTokens: 2, unknownCosts: 3, pending: 0 });
    expect(result.usage.summary.costs.find(value => value.currency === "USD")).toMatchObject({ reported: 0.004, estimated: 0, reportedRequests: 1, estimatedRequests: 0 }); expect(result.usage.summary.costs.find(value => value.currency === "CNY")).toMatchObject({ reported: 0, estimated: 0.00052, reportedRequests: 0, estimatedRequests: 2 });
    expect(result.usage.records.filter(record => record.status === "stopped")).toHaveLength(1); expect(result.usage.records.filter(record => record.attempt === 2)).toHaveLength(1);
    await expect(page.locator(".usage-overview > div")).toHaveCount(3);
    await expect(page.locator(".usage-overview > div > span")).toHaveText(["Requests", "Tokens", "Costs"]);
    await expect(page.locator(".usage-overview > div").nth(1).locator("strong")).toHaveText("338");
    await expect(page.locator(".usage-overview > div").nth(2).locator("strong")).toHaveText("≈ ¥0.02852");
    await expect(page.getByRole("table", { name: "Usage by source and model" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "All time", exact: true })).toHaveCount(0);
    await expect(page.locator(".usage-hours button")).toHaveCount(24);
    expect(await page.locator('.usage-hours button').evaluateAll(cells => cells.every(cell => { const rect = cell.getBoundingClientRect(); return rect.width === rect.height && rect.width === 32; }))).toBe(true);
    expect(await page.locator('.usage-hours').evaluate(element => { const grid = element.getBoundingClientRect(), frame = element.closest('.usage-activity')!.getBoundingClientRect(); return Math.abs(grid.left + grid.width / 2 - frame.left - frame.width / 2) < 2 && grid.width < frame.width; })).toBe(true);
    expect(await page.getByRole("table", { name: "Usage requests" }).locator("tbody tr td:nth-child(3) small").count()).toBe(0);
    expect(await page.locator(".usage-overview > div").evaluateAll(cards => cards.every(card => { const title = card.querySelector("span")!.getBoundingClientRect(), amount = card.querySelector("strong")!.getBoundingClientRect(); return Math.abs((title.top + title.bottom) / 2 - (amount.top + amount.bottom) / 2) < 2; }))).toBe(true);
    await page.locator('.usage-hours button:not([data-tokens="0"])').first().hover(); await expect(page.getByRole("tooltip")).toContainText("Tokens"); await expect(page.getByRole("tooltip")).toContainText("Costs");
    await page.getByLabel("USD to CNY exchange rate").fill("6.8"); await page.getByRole("button", { name: "Save exchange rate", exact: true }).click();
    await expect(page.locator(".usage-overview > div").nth(2).locator("strong")).toHaveText("≈ ¥0.02772");
    const converted = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(converted.ok && converted.usage.records).toEqual(result.usage.records);
    const before = networkCalls;
    await page.getByRole("combobox", { name: "Usage source", exact: true }).click(); await page.getByRole("option", { name: "OpenRouter", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("2");
    await page.getByRole("combobox", { name: "Usage source", exact: true }).click(); await page.getByRole("option", { name: "All sources", exact: true }).click();
    await page.getByRole("combobox", { name: "Usage purpose", exact: true }).click(); await page.getByRole("option", { name: "Connection test", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("2");
    await page.getByRole("combobox", { name: "Usage purpose", exact: true }).click(); await page.getByRole("option", { name: "All purposes", exact: true }).click();
    await page.getByRole("button", { name: "Last 7 days", exact: true }).click(); await expect(page.getByRole("button", { name: "Hourly", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Daily", exact: true }).click(); await expect(page.locator(".usage-days button")).toHaveCount(365);
    await expect.poll(async () => Number(await page.locator('.usage-days button:not([data-tokens="0"])').first().getAttribute('data-tokens'))).toBe(338);
    await page.locator('.usage-days button:not([data-tokens="0"])').first().hover(); await expect(page.getByRole("tooltip")).toContainText("Tokens 338"); await expect(page.getByRole("tooltip")).toContainText("¥0.02772");
    await page.getByRole("button", { name: "Last 30 days", exact: true }).click(); await expect(page.getByRole("button", { name: "Daily", exact: true })).toHaveAttribute("aria-pressed", "true");
    const today = await page.getByLabel("Usage to", { exact: true }).inputValue();
    await page.getByLabel("Usage from", { exact: true }).fill("2025-01-01"); await page.getByLabel("Usage to", { exact: true }).fill("2025-12-31"); await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("0");
    await expect(page.getByLabel("Heatmap year", { exact: true })).toHaveValue("2026"); await expect(page.locator(".usage-days button")).toHaveCount(365); await expect(page.locator('.usage-days button:not([data-tokens="0"])')).toHaveCount(1);
    await page.getByLabel("Heatmap year", { exact: true }).fill("2024"); await expect(page.locator(".usage-days button")).toHaveCount(366);
    await page.getByLabel("Heatmap year", { exact: true }).fill("2025"); await expect(page.locator(".usage-days button")).toHaveCount(365);
    await page.getByRole("button", { name: "Hourly", exact: true }).click(); await page.getByLabel("Heatmap day", { exact: true }).fill("2025-12-31"); await expect(page.locator('.usage-hours button:not([data-tokens="0"])')).toHaveCount(0);
    await page.getByRole("button", { name: "Daily", exact: true }).click(); await page.getByLabel("Heatmap year", { exact: true }).fill("2026"); await page.getByLabel("Usage from", { exact: true }).fill("2026-01-01"); await page.getByLabel("Usage to", { exact: true }).fill(today);
    await page.locator(".usage-prices summary").click(); await page.locator(".ai-usage-content").evaluate(element => { element.scrollTop = 0; }); await expect(page.getByRole('region', { name: 'Token activity' })).toHaveAttribute('aria-busy', 'false'); await page.screenshot({ path: info.outputPath("usage-daily.png") });
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: "Daily", exact: true })).toHaveAttribute("aria-pressed", "true"); await expect(page.locator(".usage-days button")).toHaveCount(365);
    await page.getByRole("button", { name: "Open Usage from calendar", exact: true }).click(); const calendar = page.getByRole('dialog', { name: 'Usage from calendar', exact: true }); await expect(calendar).toBeVisible();
    await page.screenshot({ path: info.outputPath('calendar-dark.png') });
    await calendar.getByRole('combobox', { name: 'Usage from year', exact: true }).click(); await calendar.getByRole('option', { name: '2025', exact: true }).click();
    await calendar.getByRole('combobox', { name: 'Usage from month', exact: true }).click(); await calendar.getByRole('option', { name: 'Sep', exact: true }).click(); await calendar.getByRole('gridcell', { name: '2025-09-16', exact: true }).click(); await expect(page.getByLabel('Usage from', { exact: true })).toHaveValue('2025-09-16');
    await page.getByRole("button", { name: "Today", exact: true }).click(); await page.getByRole("button", { name: "Hourly", exact: true }).click(); await expect(page.getByLabel('Heatmap day', { exact: true })).toHaveValue('2025-12-31'); await page.getByLabel('Heatmap day', { exact: true }).fill(today);
    await page.locator(".usage-prices summary").click();
    await page.locator(".usage-prices summary").click(); await page.locator(".ai-usage-content").evaluate(element => { element.scrollTop = 0; }); await page.screenshot({ path: info.outputPath("usage-dark.png") });
    await page.locator(".theme-option").filter({ hasText: "Light" }).click(); await expect(page.locator(".toast")).not.toHaveClass(/show/); await page.screenshot({ path: info.outputPath("usage-light.png") });
    await page.getByRole("button", { name: "Open Heatmap day calendar", exact: true }).click(); await page.screenshot({ path: info.outputPath('calendar-light.png') }); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Heatmap day calendar' })).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 650 }); await page.screenshot({ path: info.outputPath("usage-small.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(async id => { const result = await window.notesDesktop.ai!.deleteChat(id); if (!result.ok) throw Error(result.error); }, stopChat);
    expect((await page.evaluate(() => window.notesDesktop.ai!.usage())).ok).toBe(true); expect(networkCalls).toBe(before);
    const filenames = await fs.readdir(path.join(root, "Data", "Research", "Usage")); const log = (await Promise.all(filenames.map(name => fs.readFile(path.join(root, "Data", "Research", "Usage", name), "utf8")))).join(""); expect(log).not.toContain("fixture-key-private"); expect(log).not.toContain("retry accounting");
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(writing);
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("navigation", { name: "Research pages" }).getByRole("button", { name: "AI Settings", exact: true }).click();
    await page.getByRole("button", { name: "Remove Fixture SF", exact: true }).click(); await page.getByRole("button", { name: "Save configuration", exact: true }).click(); await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    const pruned = await page.evaluate(() => window.notesDesktop.ai!.prices()); expect(pruned.ok && pruned.prices.map(price => price.modelId)).toEqual(["fixture-free"]);
    const preserved = await page.evaluate(() => window.notesDesktop.ai!.usage()); expect(preserved.ok && preserved.usage.summary.costs).toEqual(result.usage.summary.costs);
    const removedService = await page.evaluate(() => window.notesDesktop.ai!.removeProvider("others-fixture")); expect(removedService.ok).toBe(true);
    const emptyPrices = await page.evaluate(() => window.notesDesktop.ai!.prices()); expect(emptyPrices.ok && emptyPrices.prices).toEqual([]);
    await app.close(); app = await launch(true); page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Usage", exact: true }).click(); await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("6");
    await expect(page.locator(".usage-overview > div").nth(2).locator("strong")).toHaveText("≈ ¥0.02772");
    await page.getByRole("button", { name: "Refresh", exact: true }).click(); await expect(page.getByText(/History is available offline/)).toBeVisible(); expect(networkCalls).toBe(before);
  } finally { await app.close().catch(() => undefined); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-usage-desktop-")) throw Error("Unexpected test cleanup path"); await fs.rm(root, { recursive: true, force: true }); }
});
