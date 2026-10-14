import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";

test("configures both providers and Others, streams, switches models, preserves writing, retries and restores encrypted local chats", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-ai-desktop-"));
  const bodies: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
  let stopAttempts = 0;
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/models")) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ data: [{ id: "deepseek-ai/DeepSeek-V4-Pro", name: "DeepSeek V4 Pro" }, { id: "openai/gpt-6-luna", name: "GPT-6 Luna" }, { id: "fixture-embedding", architecture: { output_modalities: ["embeddings"] } }] })); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); bodies.push(body); const text = body.messages.at(-1)?.content || "";
    if (text === "error-test") { response.writeHead(401, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "Rejected fixture-api-key-private" } })); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(': heartbeat\n\ndata: {"choices":[{"delta":{"reasoning_content":"Fixture reasoning"}}]}\n\n');
    if (text === "stop-test" && stopAttempts++ === 0) { response.write('data: {"choices":[{"delta":{"content":"Partial reply"}}]}\n\n'); return; }
    const answer = text === "What number?" ? "The number was 42." : "**Hello**\n\n$E=mc^2$\n\n```python\nprint(42)\n```";
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(0, 8) } }] })}\n\n`);
    setTimeout(() => { if (!response.destroyed) { response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(8) }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`); } }, 350);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const launch = async () => {
    const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
    // Exercise production adapters against a deterministic local server, never real accounts.
    await app.evaluate(({ net }, address) => { const original = net.fetch.bind(net); net.fetch = (input, init) => { const url = new URL(String(input)); return original(address + url.pathname.replace(/^\/api\/v1|^\/v1/, "") + url.search, init); }; }, address);
    return app;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole("main").waitFor();
    const writing = await page.getByLabel("Note title").inputValue();
    await page.getByRole("button", { name: "Research", exact: true }).click(); await page.getByRole("button", { name: "AI Settings", exact: true }).click();
    await expect(page.getByLabel("API base address")).toHaveValue("https://api.siliconflow.cn/v1");
    await page.getByLabel("API Key", { exact: true }).fill("fixture-api-key-private");
    await page.getByRole("button", { name: "Refresh models", exact: true }).click(); await expect(page.getByText(/models found/)).toBeVisible();
    await page.getByRole("button", { name: "Add DeepSeek V4 Pro", exact: true }).click(); await page.getByRole("button", { name: "Save models", exact: true }).click(); await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Test model", exact: true }).click(); await expect(page.getByText(/Connection successful/)).toBeVisible();
    await page.getByRole("button", { name: "OpenRouter", exact: true }).click(); await expect(page.getByLabel("API base address")).toHaveValue("https://openrouter.ai/api/v1");
    await page.getByLabel("API Key", { exact: true }).fill("fixture-api-key-private"); await page.getByRole("button", { name: "Add GPT-6 Luna", exact: true }).click(); await page.getByRole("button", { name: "Save models", exact: true }).click(); await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Others", exact: true }).click(); await page.getByLabel("Configuration name").fill("Local fixture"); await page.getByLabel("API base address").fill(address + "/v1"); await page.getByLabel("API Key", { exact: true }).fill("fixture-api-key-private"); await page.getByRole("combobox", { name: "Model ID", exact: true }).fill("fixture-chat"); await page.getByLabel("Model display name").fill("Fixture Chat"); await page.getByRole("button", { name: "Add model", exact: true }).click(); await page.getByRole("button", { name: "Save models", exact: true }).click(); await expect(page.getByText("Configuration saved.", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("ai-settings-dark.png") });
    await page.getByRole("button", { name: "Chat", exact: true }).click(); await page.getByRole("combobox", { name: "Chat model", exact: true }).click(); await page.getByRole("option", { name: "SiliconFlow · DeepSeek V4 Pro", exact: true }).click();
    await page.getByLabel("Chat message").fill("Remember 42"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notes", exact: true }).click(); await expect(page.getByLabel("Note title")).toHaveValue(writing);
    await page.getByRole("button", { name: "Research", exact: true }).click(); await expect(page.locator(".ai-markdown strong")).toHaveText("Hello"); await expect(page.locator(".ai-markdown .katex")).toBeVisible(); await expect(page.locator(".ai-markdown pre")).toContainText("print(42)");
    await page.getByRole("combobox", { name: "Chat model", exact: true }).click(); await page.getByRole("option", { name: "OpenRouter · GPT-6 Luna", exact: true }).click();
    await expect(page.getByText(/history will be sent/)).toBeVisible(); await page.getByLabel("Chat message").fill("What number?"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText("The number was 42.", { exact: true })).toBeVisible();
    const request = bodies.find(body => body.messages.at(-1)?.content === "What number?")!; expect(request.model).toBe("openai/gpt-6-luna"); expect(request.messages).toHaveLength(3); expect(request.messages[0].content).toBe("Remember 42");
    await page.getByLabel("Chat message").fill("stop-test"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText("Partial reply", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Stop generating", exact: true }).click(); await expect(page.getByRole("button", { name: "Retry reply", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Retry reply", exact: true }).click(); await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeHidden();
    await page.getByLabel("Chat message").fill("error-test"); await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("API key rejected"); await expect(page.getByRole("alert")).not.toContainText("fixture-api-key-private");
    await page.getByRole("button", { name: "Rename chat", exact: true }).click(); await page.getByLabel("Chat name").fill("Model acceptance"); await page.getByRole("button", { name: "Save name", exact: true }).click(); await expect(page.locator(".ai-chat-heading p")).toHaveText("Model acceptance");
    await page.locator(".theme-option").filter({ hasText: "Light" }).click(); await page.screenshot({ path: info.outputPath("ai-chat-light.png") }); await page.setViewportSize({ width: 900, height: 650 }); await page.screenshot({ path: info.outputPath("ai-chat-small.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const providers = await page.evaluate(() => window.notesDesktop.ai!.providers()); expect(JSON.stringify(providers)).not.toContain("fixture-api-key-private"); expect(await fs.readFile(path.join(root, "Config", "ai-settings.json"), "utf8")).not.toContain("fixture-api-key-private");
    await app.close(); app = await launch(); page = await app.firstWindow(); await expect(page.locator(".ai-chat-heading p")).toHaveText("Model acceptance"); await expect(page.getByText("The number was 42.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "AI Settings", exact: true }).first().click(); await page.getByRole("button", { name: "SiliconFlow", exact: true }).click(); await expect(page.getByLabel("API Key", { exact: true })).toHaveValue(""); await expect(page.getByLabel("API Key", { exact: true })).toHaveAttribute("placeholder", /Saved securely/); await page.getByRole("button", { name: "Test model", exact: true }).click(); await expect(page.getByText(/Connection successful/)).toBeVisible();
    await page.getByRole("button", { name: "Chat", exact: true }).click(); await page.getByRole("button", { name: "Delete chat", exact: true }).click(); await page.getByRole("button", { name: "Delete conversation", exact: true }).click(); await expect(page.getByText("Start a conversation", { exact: true })).toBeVisible();
  } finally { await app.close().catch(() => undefined); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
