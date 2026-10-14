import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";

test("records native usage, snapshots prices, separates retries and survives offline restart", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-usage-desktop-"));
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
    const before = networkCalls;
    await page.getByRole("combobox", { name: "Usage source", exact: true }).click(); await page.getByRole("option", { name: "OpenRouter", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("2");
    await page.getByRole("combobox", { name: "Usage source", exact: true }).click(); await page.getByRole("option", { name: "All sources", exact: true }).click();
    await page.getByRole("combobox", { name: "Usage purpose", exact: true }).click(); await page.getByRole("option", { name: "Connection test", exact: true }).click();
    await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("2");
    await page.getByRole("combobox", { name: "Usage purpose", exact: true }).click(); await page.getByRole("option", { name: "All purposes", exact: true }).click();
    await page.locator(".usage-prices summary").click(); await page.locator(".ai-usage-content").evaluate(element => { element.scrollTop = 0; }); await page.screenshot({ path: info.outputPath("usage-dark.png") });
    await page.locator(".theme-option").filter({ hasText: "Light" }).click(); await expect(page.locator(".toast")).toBeHidden(); await page.screenshot({ path: info.outputPath("usage-light.png") });
    await page.setViewportSize({ width: 900, height: 650 }); await page.screenshot({ path: info.outputPath("usage-small.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(async id => { const result = await window.notesDesktop.ai!.deleteChat(id); if (!result.ok) throw Error(result.error); }, stopChat);
    expect((await page.evaluate(() => window.notesDesktop.ai!.usage())).ok).toBe(true); expect(networkCalls).toBe(before);
    const filenames = await fs.readdir(path.join(root, "Data", "Research", "Usage")); const log = (await Promise.all(filenames.map(name => fs.readFile(path.join(root, "Data", "Research", "Usage", name), "utf8")))).join(""); expect(log).not.toContain("fixture-key-private"); expect(log).not.toContain("retry accounting");
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(writing);
    await app.close(); app = await launch(true); page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "Usage", exact: true }).click(); await expect(page.locator(".usage-overview > div").first().locator("strong")).toHaveText("6");
    await page.getByRole("button", { name: "Refresh", exact: true }).click(); await expect(page.getByText(/History is available offline/)).toBeVisible(); expect(networkCalls).toBe(before);
  } finally { await app.close().catch(() => undefined); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("lancarbon-usage-desktop-")) throw Error("Unexpected test cleanup path"); await fs.rm(root, { recursive: true, force: true }); }
});
