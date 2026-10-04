import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RELEASE_VERSION } from "../../src/shared/notes";

test("formatting toolbar: keyboard, dialogs, preview, responsive layout and persistence", async ({}, testInfo) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-toolbar-"));
  const now = new Date().toISOString();
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify({ version: 1, notes: [
    { id: "toolbar", title: "Toolbar acceptance", content: "开始写作", tags: [], pinned: true, createdAt: now, updatedAt: now },
    { id: "other", title: "Other note", content: "另一篇", tags: [], pinned: false, createdAt: now, updatedAt: now }
  ] }));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: directory }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe(RELEASE_VERSION);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.isSpellCheckerEnabled())).toBe(false);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.getByRole("button", { name: /Toolbar acceptance/ }).click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    const toolbar = page.getByRole("group", { name: "Formatting toolbar" });
    const expectNoSpellcheck = async () => {
      expect(await page.locator("input, textarea, [contenteditable='true']").evaluateAll(elements => elements.filter(el => (el as HTMLElement).spellcheck).map(el => el.getAttribute("aria-label") || el.tagName))).toEqual([]);
    };
    await expectNoSpellcheck();
    for (const name of ["Underline", "Strikethrough", "Superscript", "Subscript", "Divider", "Align", "Abbr", "Keyboard", "Directives"]) {
      await expect(toolbar.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(toolbar.getByRole("button", { name: "More tools", exact: true })).toHaveCount(0);
    expect(await toolbar.locator("button").evaluateAll(buttons => {
      const labels = buttons.map(button => button.getAttribute("aria-label"));
      return labels.slice(labels.indexOf("Superscript"), labels.indexOf("Keyboard") + 1);
    })).toEqual(["Superscript", "Subscript", "Align", "Abbr", "Keyboard"]);
    expect(await page.locator(".editor").evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(48);
    const expectSingleRow = async () => {
      await expect.poll(() => toolbar.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return [...el.querySelectorAll("button")].every(button => {
          if (button.closest("[data-collapsed]")) return true;
          const box = button.getBoundingClientRect();
          return box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom;
        });
      })).toBe(true);
    };
    const expectSpaceUsed = async () => {
      await expect.poll(() => toolbar.evaluate(el => {
        const style = getComputedStyle(el), gap = parseFloat(style.columnGap);
        const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const controls = [...el.querySelectorAll<HTMLElement>("[data-format-item]")];
        const width = (control: HTMLElement) => control.getBoundingClientRect().width + (parseFloat(getComputedStyle(control).marginLeft) || 0);
        const visible = controls.filter(control => !control.hasAttribute("data-collapsed"));
        const used = visible.reduce((sum, control) => sum + width(control), 0) + (visible.length - 1) * gap;
        const hidden = controls.filter(control => control.hasAttribute("data-collapsed") && control.dataset.formatItem !== "overflow");
        return hidden.every(control => used + gap + width(control) > available);
      })).toBe(true);
    };
    await expectSingleRow();
    for (const width of [900, 924, 1034, 1224, 1380, 1454, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectSingleRow();
      await expectSpaceUsed();
      if (width === 1454) await page.screenshot({ path: testInfo.outputPath("toolbar-1454.png") });
    }
    await expect(toolbar.getByRole("button", { name: "Superscript", exact: true }).locator("sup")).toHaveText("2");
    await expect(toolbar.getByRole("button", { name: "Subscript", exact: true }).locator("sub")).toHaveText("2");
    await expect(toolbar.getByRole("button", { name: "More tools", exact: true })).toHaveCount(0);
    const expectThemePopup = async () => {
      expect(await page.locator(".themed-select-popup").evaluate(el => {
        const probe = document.createElement("div"); probe.style.backgroundColor = "var(--surface)";
        el.append(probe); const expected = getComputedStyle(probe).backgroundColor; probe.remove();
        return getComputedStyle(el).backgroundColor === expected;
      })).toBe(true);
    };
    const editor = page.getByLabel("Note content");
    await editor.click(); await editor.press("Control+Home"); await editor.press("Control+Shift+End");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(editor).toContainText("**开始写作**");
    await expect(editor).toBeFocused();
    await editor.press("Control+b"); await expect(editor).toContainText("开始写作");
    await expect(editor).not.toContainText("**");
    await page.getByLabel("Paragraph style").click(); await page.getByRole("option", { name: "Heading 2", exact: true }).click(); await expect(editor).toContainText("## 开始写作");
    await editor.press("Control+End"); await editor.press("Enter"); await editor.press("Enter");
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSpellcheck();
    await page.getByLabel("Header 1", { exact: true }).fill("项目");
    await page.getByLabel("Header 2", { exact: true }).fill("数量");
    await page.getByLabel("Row 1, column 1", { exact: true }).fill("笔记");
    await page.getByLabel("Row 1, column 1", { exact: true }).press("Tab");
    await expect(page.getByLabel("Row 1, column 2", { exact: true })).toBeFocused();
    await page.getByLabel("Row 1, column 2", { exact: true }).fill("3");
    await page.getByLabel("Column 2 alignment", { exact: true }).click();
    await expectThemePopup();
    await page.screenshot({ path: testInfo.outputPath("alignment-menu-dark.png") });
    await page.getByRole("option", { name: "Right", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("table-dark.png") });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(editor).toContainText("| 笔记 | 3 |");
    await editor.press("Control+End");
    await page.getByRole("button", { name: "Math", exact: true }).click();
    await expectNoSpellcheck();
    await page.getByRole("button", { name: "Fraction", exact: true }).click();
    await expect(page.getByLabel("Formula")).toBeFocused();
    await page.getByLabel("Formula").press("2");
    await expect(page.getByLabel("Formula")).toHaveValue("\\frac{2}{b}");
    await page.getByLabel("Math display").click(); await page.getByRole("option", { name: "Display", exact: true }).click();
    await expect(page.getByLabel("Math preview").locator(".katex")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("formula-dark.png") });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toBeFocused();
    await editor.press("Control+End");
    await editor.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Link", exact: true })).toBeVisible();
    await page.getByLabel("Link text").fill("参考资料");
    await page.getByLabel("Link URL").fill("https://example.com");
    await expectNoSpellcheck();
    await page.screenshot({ path: testInfo.outputPath("link-spellcheck-off.png") });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toBeFocused();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("group", { name: "Formatting toolbar" })).toBeHidden();
    await expect(page.getByLabel("Rendered preview").locator("h2")).toHaveText("开始写作");
    await expect(page.getByLabel("Rendered preview").locator("table")).toContainText("笔记");
    await expect(page.getByLabel("Rendered preview").locator("tbody tr").first().locator("td").nth(1)).toHaveCSS("text-align", "right");
    await expect(page.getByLabel("Rendered preview").locator(".katex")).toHaveCount(1);
    await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("preview-dark.png") });
    await page.getByRole("button", { name: "☀ Light", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("preview-light.png") });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("toolbar-light.png") });
    await toolbar.getByRole("button", { name: "Code", exact: true }).click();
    await page.getByRole("menuitem", { name: "Code block", exact: true }).click();
    const language = page.getByRole("combobox", { name: "Code language" });
    await language.fill("py");
    await expectNoSpellcheck();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    await language.press("ArrowDown"); await language.press("Enter");
    await expect(language).toHaveValue("python");
    await language.click(); await expectThemePopup();
    await page.screenshot({ path: testInfo.outputPath("language-menu-light.png") });
    await language.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await language.fill("rust"); await language.press("Enter");
    await expect(language).toHaveValue("rust");
    await page.keyboard.press("Escape"); await expect(editor).toBeFocused();
    await toolbar.getByRole("button", { name: "Math", exact: true }).click();
    await page.getByLabel("Math display").click(); await expectThemePopup();
    await page.screenshot({ path: testInfo.outputPath("math-menu-light.png") });
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await expect(editor).toBeFocused();
    await editor.press("Control+Home"); await editor.press("ArrowDown"); await editor.press("ArrowDown");
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByLabel("Header 1", { exact: true })).toHaveValue("项目");
    await page.getByLabel("Row 1, column 2", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toContainText("| 笔记 | 4 |");
    await editor.press("Control+z"); await expect(editor).toContainText("| 笔记 | 3 |");
    await editor.press("Control+Shift+Z"); await expect(editor).toContainText("| 笔记 | 4 |");
    await editor.press("Control+End"); await editor.press("Enter");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "zhongwen", selectionStart: 8, selectionEnd: 8 });
    await cdp.send("Input.insertText", { text: "中文输入" });
    await expect(editor).toContainText("中文输入");
    await editor.press("Control+End"); await editor.press("Enter"); await editor.press("Enter");
    await page.keyboard.insertText("IPCC");
    for (let i = 0; i < 4; i++) await editor.press("Shift+ArrowLeft");
    await toolbar.getByRole("button", { name: "Abbr", exact: true }).click();
    await expect(page.getByLabel("Abbreviation text")).toHaveValue("IPCC");
    await page.getByLabel("Full meaning").fill("Intergovernmental Panel on Climate Change");
    await expectNoSpellcheck();
    await page.screenshot({ path: testInfo.outputPath("abbreviation-light.png") });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toContainText("{abbr}`IPCC (Intergovernmental Panel on Climate Change)`");
    await editor.press("Control+z"); await expect(editor).not.toContainText("{abbr}");
    await editor.press("Control+Shift+Z"); await expect(editor).toContainText("{abbr}");
    await editor.press("Control+End"); await editor.press("Enter"); await editor.press("Enter");
    await page.keyboard.insertText("Centered line");
    await toolbar.getByRole("button", { name: "Align", exact: true }).click();
    await page.getByRole("menuitem", { name: "Align center", exact: true }).click();
    await expect(editor).toContainText(":class: lc-align-center");
    await editor.press("Control+End"); await editor.press("Enter"); await editor.press("Enter");
    await toolbar.getByRole("button", { name: "Keyboard", exact: true }).click();
    await page.getByLabel("Keyboard shortcut").fill("Ctrl+F");
    await expectNoSpellcheck();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toContainText("{kbd}`Ctrl+F`");
    for (const label of ["Note", "Tip", "Important", "Warning", "Caution", "Admonition", "Nested blocks", "Dropdown", "Initially open"]) {
      await editor.press("Control+End"); await editor.press("Enter"); await editor.press("Enter");
      await toolbar.getByRole("button", { name: "Directives", exact: true }).click();
      await expect(page.getByRole("menuitem")).toHaveCount(9);
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      await page.getByLabel(label === "Dropdown" ? "Dropdown title" : "Block title", { exact: true }).fill(label + " title");
      await page.getByLabel("Block content", { exact: true }).fill(label + " **body**");
      if (label === "Nested blocks") {
        await page.getByLabel("Inner title", { exact: true }).fill("Inner tip");
        await page.getByLabel("Inner content", { exact: true }).fill("Nested *content*");
        await page.screenshot({ path: testInfo.outputPath("nested-blocks-light.png") });
      }
      await expectNoSpellcheck();
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(editor).toBeFocused();
    }
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const rendered = page.getByLabel("Rendered preview");
    await expect(rendered.locator("abbr")).toHaveAttribute("title", "Intergovernmental Panel on Climate Change");
    await expect(rendered.locator("kbd")).toHaveText("Ctrl+F");
    await expect(rendered.locator(".lc-align-center")).toHaveCSS("text-align", "center");
    await expect(rendered.locator(".note .tip")).toContainText("Nested content");
    await expect(rendered.locator("details[open] summary")).toHaveText("Initially open title");
    await expect(rendered.locator("details:not([open]) summary")).toHaveText("Dropdown title");
    await rendered.locator("details[open] summary").click();
    await expect(rendered.locator("details[open]")).toHaveCount(0);
    await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.setViewportSize({ width: 620, height: 780 });
    await expect(page.getByRole("button", { name: "Table", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Math", exact: true })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "More tools", exact: true })).toBeVisible();
    await expectSingleRow();
    await toolbar.getByRole("button", { name: "More tools", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Keyboard", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Dropdown", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await toolbar.getByRole("button", { name: "Directives", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("directives-narrow.png"), animations: "disabled" });
    await expect(page.getByRole("menuitem", { name: "Initially open", exact: true })).toBeInViewport();
    await expect(page.getByRole("menuitem", { name: "Dropdown", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Underline", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await page.locator(".sidebar").boundingBox())!.x + (await page.locator(".sidebar").boundingBox())!.width).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("toolbar-narrow.png"), animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Open notes list" }).click();
    await expect.poll(() => page.evaluate(() => {
      const toolbar = document.querySelector(".format-toolbar")!.getBoundingClientRect();
      return !!document.elementFromPoint(110, toolbar.y + toolbar.height / 2)?.closest(".sidebar");
    })).toBe(true);
    await page.locator(".sidebar").getByRole("button", { name: "Close notes list" }).click();
    // Focus remains inside the modal; Escape cancels and restores the source caret.
    await page.getByRole("button", { name: "Math", exact: true }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Close panel" })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(editor).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 850 });
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const saved = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    const content = saved.notes.find((note: { id: string }) => note.id === "toolbar").content;
    expect(content).toContain("| 笔记 | 4 |"); expect(content).toContain("\\frac{2}{b}");
    expect(errors).toEqual([]);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole("button", { name: /Toolbar acceptance/ }).click();
    await expect(page.getByLabel("Note content")).toContainText("| 笔记 | 4 |");
    await expect(page.getByLabel("Note content")).toContainText("中文输入");
  } finally {
    await app.close().catch(() => undefined);
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("lancarbon-toolbar-")) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
