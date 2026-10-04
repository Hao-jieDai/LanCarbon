import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBook } from "../../src/shared/books";

test("Book and confirmed export folder survive restart; cancel preserves the folder", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-preferences-"));
  const destination = path.join(directory, "export");
  await fs.mkdir(destination);
  const first = createBook("Older Book"), second = createBook("Current Book");
  const workspace = { version: 2, notes: [first.homeNote, second.homeNote], books: [first.book, second.book] };
  await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify(workspace));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
    env: { ...process.env, E2E_USER_DATA_DIR: directory, E2E_EXPORT_DIR: "" }
  });
  const mockDialog = async (app: ElectronApplication, canceled: boolean) => app.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = (async (...args: unknown[]) => {
      (globalThis as unknown as { exportOptions: unknown }).exportOptions = args.at(-1);
      return { canceled: value.canceled, filePaths: value.canceled ? [] : [value.destination] };
    }) as typeof dialog.showOpenDialog;
  }, { canceled, destination });
  const defaultPath = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { exportOptions?: { defaultPath: string } }).exportOptions?.defaultPath);
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "Books", exact: true }).click();
    await expect(page.getByLabel("Select Book")).toHaveValue(first.book.id);
    await page.getByLabel("Select Book").selectOption(second.book.id);
    await mockDialog(app, false);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("Exported to");
    if (process.platform === "win32") expect(await defaultPath(app)).toBe(path.join(directory, "Exports"));
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await page.getByRole("button", { name: "Books", exact: true }).click();
    await expect(page.getByLabel("Select Book")).toHaveValue(second.book.id);
    await expect(page.getByLabel("Note title")).toHaveValue("Current Book");
    const before = await fs.readFile(path.join(directory, "export-location.json"), "utf8");
    await mockDialog(app, true);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => defaultPath(app)).toBe(destination);
    expect(await fs.readFile(path.join(directory, "export-location.json"), "utf8")).toBe(before);
    await app.close();
    // A removed book and unavailable directory must not break the next launch.
    const saved = JSON.parse(await fs.readFile(path.join(directory, "notes.json"), "utf8"));
    saved.books = [first.book];
    await fs.writeFile(path.join(directory, "notes.json"), JSON.stringify(saved));
    await fs.rename(destination, path.join(directory, "moved-export"));
    app = await launch(); page = await app.firstWindow();
    await page.getByRole("button", { name: "Books", exact: true }).click();
    await expect(page.getByLabel("Select Book")).toHaveValue(first.book.id);
    await mockDialog(app, true);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    if (process.platform === "win32") await expect.poll(() => defaultPath(app)).toBe(path.join(directory, "Exports"));
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
