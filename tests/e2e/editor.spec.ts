import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// Exercise Chromium layout and real keyboard input, not CodeMirror dispatch or fill.
async function expectEditorLayout(page: Page) {
  await expect(page.getByLabel("Note content")).toBeVisible();
  await expect(page.locator(".cm-scroller")).toHaveCSS("display", "flex");
  await expect(page.locator(".cm-content")).toHaveCSS("white-space", "break-spaces");
  const gutter = await page.locator(".cm-gutters").boundingBox();
  const content = await page.locator(".cm-content").boundingBox();
  expect(gutter).not.toBeNull(); expect(content).not.toBeNull();
  expect(content!.x).toBeGreaterThanOrEqual(gutter!.x + gutter!.width - 1);
  expect(Math.abs(content!.y - gutter!.y)).toBeLessThan(2);
  const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(content!.y).toBeLessThan(viewport.height - 80);
  expect(content!.width).toBeGreaterThan(200);
}

test("Edit layout, keyboard, composition, mode navigation and restart recovery", async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-editor-"));
  const now = new Date().toISOString();
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 1, notes: [
    { id: "legacy", title: "Existing source", content: "# Existing source\n\n中文原始正文", tags: [], pinned: false, createdAt: now, updatedAt: now },
    { id: "long", title: "Long source", content: Array.from({ length: 500 }, (_, i) => `Text ${i + 1} 中文内容`).join("\n"), tags: [], pinned: false, createdAt: now, updatedAt: now }
  ] }));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: directory }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expectEditorLayout(page);
    const securityPolicy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(securityPolicy).toMatch(/script-src 'self';/);
    expect(securityPolicy).not.toContain("'unsafe-eval'");
    await page.getByRole("button", { name: /ReadMe/ }).click();
    await expectEditorLayout(page);
    await page.screenshot({ path: testInfo.outputPath("readme-fixed.png") });
    await page.getByRole("button", { name: /Long source/ }).click();
    await expectEditorLayout(page);
    await page.getByLabel("Note content").click();
    await page.getByLabel("Note content").press("Control+End");
    await expect(page.locator(".cm-line").last()).toHaveText("Text 500 中文内容");
    await expect.poll(() => page.locator(".cm-scroller").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const lastLine = await page.locator(".cm-line").last().boundingBox();
    const scroller = await page.locator(".cm-scroller").boundingBox();
    expect(lastLine!.y).toBeGreaterThanOrEqual(scroller!.y);
    // Windows fractional display scaling can leave a few pixels of line padding outside the viewport.
    expect(lastLine!.y + lastLine!.height).toBeLessThanOrEqual(scroller!.y + scroller!.height + 4);
    await page.getByRole("button", { name: /New Note/ }).first().click();
    await page.getByLabel("Note title").fill("Keyboard regression");
    const editor = page.getByLabel("Note content");
    await editor.click();
    await page.keyboard.type("First line");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second line");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    // Chromium composition path, including replacement of a pending composition.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "zhongwen", selectionStart: 8, selectionEnd: 8 });
    await cdp.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
    await cdp.send("Input.insertText", { text: "中文输入" });
    await cdp.detach();
    const expected = "First line\nSecond line\n\n中文输入";
    await expect(page.locator(".cm-line")).toHaveText(["First line", "Second line", "", "中文输入"]);
    const first = await page.locator(".cm-line").nth(0).boundingBox();
    const second = await page.locator(".cm-line").nth(1).boundingBox();
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
    await editor.press("Enter");
    await editor.press("Tab");
    await page.keyboard.type("Indented");
    await expect(page.locator(".cm-line").last()).toHaveText("  Indented");
    await editor.press("Shift+Tab");
    await expect(page.locator(".cm-line").last()).toHaveText("Indented");
    await editor.press("Control+z");
    // Fast consecutive typing/indent changes may form one undo group.
    await expect(page.locator(".cm-line").last()).not.toHaveText("Indented");
    await editor.press("Control+y");
    await expect(page.locator(".cm-line").last()).toHaveText("Indented");
    await editor.press("Home"); await editor.press("Shift+End"); await editor.press("Backspace"); await editor.press("Backspace");
    await expect(page.locator(".cm-line")).toHaveText(["First line", "Second line", "", "中文输入"]);
    await expect.poll(async () => {
      const workspace = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
      return workspace.notes.find((note: { title: string }) => note.title === "Keyboard regression")?.content;
    }).toBe(expected);
    await page.screenshot({ path: testInfo.outputPath("edit-fixed.png") });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: /Existing source/ }).click();
    await expect(page.getByLabel("Rendered preview")).toBeVisible();
    await expect(editor).toBeHidden();
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    await page.getByLabel("New Book").click();
    await page.getByLabel("Book Name").fill("Editor test book");
    await page.getByRole("button", { name: "Create Book" }).click();
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "＋ Section" }).click();
    await expect(page.getByLabel("Rendered preview")).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expectEditorLayout(page);
    await page.getByLabel("Note title").fill("Editable section");
    await editor.click(); await editor.press("Control+a"); await page.keyboard.type("Book text"); await editor.press("Enter"); await page.keyboard.insertText("章节正文");
    await expect(page.locator(".cm-line")).toHaveText(["Book text", "章节正文"]);
    await page.getByRole("button", { name: "＋ Child Page" }).click();
    await expectEditorLayout(page);
    await page.getByRole("button", { name: /Editable section/ }).click();
    await expect(page.locator(".cm-line")).toHaveText(["Book text", "章节正文"]);
    await page.getByRole("button", { name: /Dark/, exact: false }).click();
    await expectEditorLayout(page);
    await page.getByRole("button", { name: /Light/, exact: false }).click();
    await expectEditorLayout(page);
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: /Keyboard regression/ }).click();
    await expectEditorLayout(page);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole("button", { name: /Keyboard regression/ }).click();
    await expectEditorLayout(page);
    await expect(page.locator(".cm-line")).toHaveText(["First line", "Second line", "", "中文输入"]);
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    await page.getByRole("button", { name: /Editable section/ }).click();
    await expectEditorLayout(page);
    await expect(page.locator(".cm-line")).toHaveText(["Book text", "章节正文"]);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
