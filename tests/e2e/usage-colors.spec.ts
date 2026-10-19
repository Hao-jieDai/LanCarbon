import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AIPriceStore, AIUsageStore } from "../../electron/ai-usage";

test("hourly and yearly activity show eight distinguishable bands in both themes without network calls", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-color-desktop-"));
  const usage = new AIUsageStore(path.join(root, "Data"), new AIPriceStore(path.join(root, "Config")));
  const volumes = [3, 15, 63, 255, 1023, 4095, 16383, 65535], today = new Date();
  for (let i = 0; i < 16; i++) {
    const date = i < 8 ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), i) : new Date(today.getFullYear(), 0, i - 7, 12);
    const id = "color-" + i;
    await usage.record({ type: "start", request: { id, startedAt: date.toISOString(), providerId: "fixture", providerName: "Fixture", baseUrl: "https://fixture.invalid/v1", modelId: "fixture", modelName: "Fixture", purpose: "chat", attempt: 1 } });
    await usage.record({ type: "finish", id, completedAt: date.toISOString(), status: "complete", usage: { totalTokens: volumes[i % 8], reportedCost: 0, currency: "CNY" } });
  }
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])], env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" } });
  try {
    await app.evaluate(({ net }) => { net.fetch = async () => { throw Error("No network calls in color verification"); }; });
    const page = await app.firstWindow(); await page.getByRole("main").waitFor(); await page.setViewportSize({ width: 1800, height: 1000 });
    await page.getByRole("button", { name: "Workshop", exact: true }).click(); await page.getByRole("button", { name: "Usage", exact: true }).click();
    for (const theme of ["Dark", "Light"]) {
      await page.locator(".theme-option").filter({ hasText: theme }).click();
      for (const mode of ["Hourly", "Daily"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        await expect(page.getByRole("region", { name: "Token activity" })).toHaveAttribute("aria-busy", "false");
        const selector = mode === "Hourly" ? ".usage-hours button" : ".usage-days button";
        await expect.poll(() => page.locator(selector).evaluateAll(cells => new Set(cells.map(cell => getComputedStyle(cell).backgroundColor)).size)).toBe(9);
        await page.getByRole("region", { name: "Token activity" }).screenshot({ path: info.outputPath(`${mode.toLowerCase()}-${theme.toLowerCase()}.png`) });
      }
    }
  } finally {
    await app.close();
    const target = path.resolve(root);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("lancarbon-color-desktop-")) throw Error("Unsafe color-test cleanup");
    await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
