import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBook } from "../../src/shared/books";

test("shows per-Book Phase 5A checks and Phase 5B repository setup", async ({}, testInfo) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-github-e2e-"));
  const { book, homeNote } = createBook("Online Guide");
  await fs.writeFile(path.join(root, "notes.json"), JSON.stringify({ version: 2, books: [book], notes: [homeNote] }));
  const app = await electron.launch({ ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}), args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])], env: { ...process.env, E2E_USER_DATA_DIR: root } });
  try {
    const page = await app.firstWindow(); await page.getByRole("button", { name: "Jupyter Book", exact: true }).click(); await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GitHub Publishing" })).toBeVisible();
    for (const label of ["Git", "GitHub CLI", "GitHub account", "Book website build", "Repository binding", "GitHub Pages"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "GitHub repository", exact: true })).toHaveValue("Online-Guide");
    await expect(page.getByLabel("GitHub Pages branch")).toHaveValue("gh-pages");
    await page.screenshot({ path: testInfo.outputPath("github-publishing-dark.png"), animations: "disabled" });
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "☀ Light", exact: true }).click(); await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GitHub Publishing" })).toBeVisible();
    await expect(page.getByText("Git", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("github-publishing-light.png"), animations: "disabled" });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
});
