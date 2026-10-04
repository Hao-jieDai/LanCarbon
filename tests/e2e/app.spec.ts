import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const appPath = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);

async function launch(dataDirectory: string, exportDirectory: string): Promise<{ application: ElectronApplication; page: Page }> {
  const application = await electron.launch({
    // CI hosts may not expose the Windows GPU/runtime sandbox primitives. The
    // production BrowserWindow configuration is still asserted below.
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", appPath],
    env: { ...process.env, E2E_USER_DATA_DIR: dataDirectory, E2E_EXPORT_DIR: exportDirectory }
  });
  return { application, page: await application.firstWindow() };
}

test("从 v1 启动并完成 Book 组织、导出、严格构建和重启恢复", async () => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-e2e-"));
  const exportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-book-export-"));
  const guideExportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-guide-export-"));
  const now = new Date().toISOString();
  await fs.writeFile(path.join(dataDirectory, "notes.json"), JSON.stringify({ version: 1, notes: [{
    id: "legacy-note", title: "旧版笔记", content: "v1 原始正文", tags: ["迁移"], pinned: false, createdAt: now, updatedAt: now
  }] }), "utf8");
  let session = await launch(dataDirectory, exportDirectory);
  try {
    await expect(session.page).toHaveTitle("LanCarbon");
    await expect(session.page.getByText("LanCarbon", { exact: true })).toBeVisible();
    await expect(session.page.getByRole("button", { name: /ReadMe/ })).toBeVisible();
    await expect(session.page.getByLabel("Note title")).toHaveValue("旧版笔记");
    const preferences = await session.application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): { contextIsolation?: boolean; nodeIntegration?: boolean; sandbox?: boolean };
      };
      return contents.getLastWebPreferences();
    });
    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    expect(preferences.sandbox).toBe(true);

    await session.page.getByRole("button", { name: /New Note/ }).first().click();
    await session.page.getByLabel("Note title").fill("重启后仍存在");
    const editor = session.page.getByLabel("Note content");
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor).toHaveAttribute("spellcheck", "false");
    await expect(session.page.locator(".cm-lineNumbers")).toBeVisible();
    await editor.fill("# 桌面端\n\n中文与 Markdown 持久化正文");
    await editor.press("Control+f");
    await expect(session.page.locator(".cm-search")).toBeVisible();
    await editor.press("Escape");
    await session.page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(session.page.getByLabel("Rendered preview").getByRole("heading", { name: "桌面端" })).toBeVisible();
    await session.page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(session.page.getByText("All changes saved", { exact: true })).toBeVisible();

    await session.page.getByRole("button", { name: "Books", exact: true }).click();
    await session.page.getByLabel("New Book").click();
    await session.page.getByLabel("Book Name").fill("LanCarbon Guide");
    await session.page.getByRole("button", { name: "Create Book" }).click();
    await expect(session.page.getByLabel("Note title")).toHaveValue("LanCarbon Guide");
    await session.page.getByRole("button", { name: "＋ Section" }).click();
    await session.page.getByLabel("Note title").fill("E2E Section");
    await session.page.getByLabel("Note content").fill("# Strict Build\n\nJupyter Book 2 export test.");
    await expect(session.page.getByText("All changes saved", { exact: true })).toBeVisible();
    await session.page.getByRole("button", { name: "＋ Child Page" }).click();
    await session.page.getByLabel("Note title").fill("Renewable Energy");
    await session.page.getByRole("button", { name: "E2E Section", exact: true }).click();
    await session.page.getByRole("button", { name: "＋ Child Page" }).click();
    await session.page.getByLabel("Note title").fill("Carbon Removal");
    await expect(session.page.getByText("All changes saved", { exact: true })).toBeVisible();

    const renewableRow = session.page.getByRole("button", { name: /Renewable Energy/ });
    const removalRow = session.page.getByRole("button", { name: /Carbon Removal/ });
    const renewableBox = await renewableRow.boundingBox(); const removalBox = await removalRow.boundingBox();
    if (!renewableBox || !removalBox) throw new Error("Could not locate the nested drag rows");
    await session.page.mouse.move(renewableBox.x + renewableBox.width / 2, renewableBox.y + renewableBox.height / 2);
    await session.page.mouse.down();
    await session.page.mouse.move(removalBox.x + removalBox.width / 2, removalBox.y + removalBox.height * .88, { steps: 8 });
    await session.page.mouse.up();
    await expect.poll(async () => session.page.locator(".book-page-row").allTextContents()).toEqual(["LanCarbon Guide", "E2E Section", "Carbon Removal", "Renewable Energy"]);

    await session.page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(session.page.locator(".toast")).toContainText("Exported to");
    await expect.poll(async () => fs.readdir(exportDirectory)).toContain("myst.yml");
    await session.application.close();

    session = await launch(dataDirectory, guideExportDirectory);
    await session.page.getByRole("button", { name: "Books", exact: true }).click();
    await expect(session.page.getByRole("button", { name: "Phase 2 Reference", exact: true })).toBeVisible();
    for (const title of ["Editing and Formatting", "Tables and Mathematics", "Directives and Roles", "Cross References", "Syntax Lab"]) {
      await expect(session.page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
    }
    await expect(session.page.getByRole("button", { name: /Phase 2 Acceptance/ })).toBeVisible();
    await session.page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(session.page.locator(".toast")).toContainText("Exported to");
    await expect(session.page.getByRole("button", { name: "E2E Section", exact: true })).toBeVisible();
    await expect(session.page.getByRole("button", { name: /Carbon Removal/ })).toBeVisible();
    await session.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(session.page.getByRole("option", { name: "LanCarbon Guide" })).toHaveCount(0);
    await session.page.getByRole("button", { name: /重启后仍存在/ }).click();
    await expect(session.page.getByLabel("Note content")).toContainText("中文与 Markdown 持久化正文");
    await session.page.locator('button[aria-label="Delete note"]').click();
    await expect(session.page.getByRole("button", { name: /重启后仍存在/ })).toHaveCount(0);
    await session.page.getByRole("button", { name: /New Note/ }).first().click();
    await session.page.getByLabel("Note title").fill("Editable after deletion");
    await expect(session.page.getByLabel("Note title")).toHaveValue("Editable after deletion");
    await expect(session.page.getByText("All changes saved", { exact: true })).toBeVisible();
    // Run network-dependent validation last so template outages cannot mask local regressions.
    await test.step("Official Jupyter Book strict build", async () => {
      await fs.mkdir(path.join(guideExportDirectory, "_build"), { recursive: true });
      await fs.symlink(path.resolve(".builder-cache/phase3-build/_build/templates"), path.join(guideExportDirectory, "_build", "templates"), "junction");
      await execFileAsync("jupyter", ["book", "build", "--html", "--strict"], {
        cwd: guideExportDirectory,
        timeout: 120_000,
        windowsHide: true
      });
    });
  } finally {
    await session.application.close().catch(() => undefined);
    await fs.unlink(path.join(guideExportDirectory, "_build", "templates")).catch(() => undefined);
    await fs.rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    await fs.rm(exportDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    await fs.rm(guideExportDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
