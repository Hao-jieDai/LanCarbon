import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBook } from "../../src/shared/books";

test("Phase 2C offline mathematics, directives, references, source safety and restart", async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-preview-"));
  const { book, homeNote } = createBook("LanCarbon Guide");
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 2, notes: [homeNote], books: [book] }));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: directory }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = []; const remoteRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.context().route(/^https?:/, route => { remoteRequests.push(route.request().url()); return route.abort(); });
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    for (const title of ["Editing and Formatting", "Tables and Mathematics", "Directives and Roles"]) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await expect(page.getByLabel("Note title")).toHaveValue(title);
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await expect(page.getByLabel("Rendered preview").getByRole("heading", { name: "English", exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Rendered preview").getByRole("heading", { name: "中文", exact: true })).toHaveCount(0);
      await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
      if (title === "Editing and Formatting") await page.screenshot({ path: testInfo.outputPath("toolbar-guide.png") });
    }
    await page.getByRole("button", { name: /Tables and Mathematics/ }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Tables and Mathematics");
    const before = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".katex")).toHaveCount(4);
    await expect(page.locator(".preview-equation")).toHaveCount(2);
    await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "KaTeX_Main"'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("math-dark.png") });
    await page.getByRole("button", { name: /Light/ }).click();
    await page.screenshot({ path: testInfo.outputPath("math-light.png") });
    await page.getByRole("button", { name: /Directives and Roles/ }).click();
    await expect(page.locator(".admonition.note .admonition.tip")).toBeVisible();
    await expect(page.locator(".warning .admonition-title")).toHaveCount(1);
    await page.getByText("Open this example", { exact: true }).click();
    await expect(page.getByLabel("Rendered preview").getByText("You can expand this block with the mouse or keyboard.", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("directives-light.png") });
    await page.getByRole("button", { name: /Cross References/ }).click();
    await page.getByRole("link", { name: "A local reference target", exact: true }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Cross References");
    await page.getByRole("link", { name: "Read the formula", exact: true }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Tables and Mathematics");
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute("aria-pressed", "true");
    const target = await page.locator("#lc-target-guide-carbon-balance").boundingBox();
    const scroller = await page.getByLabel("Rendered preview").boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(scroller!.y);
    expect(target!.y).toBeLessThan(scroller!.y + scroller!.height);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".cm-scroller")).toHaveCSS("display", "flex");
    await expect(page.getByLabel("Note content")).toContainText("guide-carbon-balance");
    await page.getByRole("button", { name: "＋ Child Page" }).click();
    await page.getByLabel("Note title").fill("Preview errors sample");
    const source = '$\\invalidCommand{x}$\n\n[](#not-found)\n\n```{unknown-block}\nPreserve my content\n```\n\n<script>window.hacked = true</script>\n\n[External](https://example.com)';
    await page.getByLabel("Note content").fill(source);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".preview-diagnostics")).toBeVisible();
    await expect(page.locator(".preview-unresolved")).toHaveText("#not-found");
    await expect(page.locator(".math-error")).toContainText("invalidCommand");
    await expect(page.locator(".preview-body")).toContainText("Preserve my content");
    await page.getByRole("link", { name: "External", exact: true }).click();
    await expect(page.locator(".preview-link-message")).toContainText("External links are disabled");
    expect(await page.evaluate(() => "hacked" in window)).toBe(false);
    expect(remoteRequests).toEqual([]); expect(errors).toEqual([]);
    const after = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    for (const note of before.notes) expect(after.notes.find((item: { id: string }) => item.id === note.id)?.content).toBe(note.content);
    expect(after.notes.find((note: { title: string }) => note.title === "Preview errors sample")?.content).toBe(source);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    await page.getByRole("button", { name: /Preview errors sample/ }).click();
    await expect(page.locator(".cm-scroller")).toHaveCSS("display", "flex");
    await expect(page.getByLabel("Note content")).toContainText("Preserve my content");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".math-error")).toContainText("invalidCommand");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Note content").fill("$x^2$\n\nCorrected source");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
    await expect(page.locator(".katex")).toHaveCount(1);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
