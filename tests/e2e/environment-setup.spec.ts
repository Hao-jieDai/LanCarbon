import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("opens Environment Setup without blocking local writing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-environment-e2e-"));
  const app = await electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: root }
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Environment Setup", exact: true }).click();
    const panel = page.getByRole("region", { name: "Environment Setup" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(path.join(root, "Tools"), { exact: true })).toBeVisible({ timeout: 20_000 });
    for (const label of ["Python", "Jupyter Book 2", "Git", "GitHub CLI", "GitHub account", "GitHub connection"]) await expect(panel.getByText(label, { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Close Environment Setup" }).click();
    await page.getByRole("button", { name: /New Note/ }).first().click();
    await page.getByLabel("Note title").fill("Writing without setup changes");
    await expect(page.getByLabel("Note title")).toHaveValue("Writing without setup changes");
  } finally {
    await app.close(); await fs.rm(root, { recursive: true, force: true });
  }
});
