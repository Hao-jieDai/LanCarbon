import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createBook } from "../../src/shared/books";
import { createNote } from "../../src/shared/notes";

test("four workspaces preserve writing, resources, selections and isolated directories", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-foundation-"));
  const data = path.join(root, "Data");
  await fs.mkdir(path.join(data, "assets"), { recursive: true });
  const bytes = Buffer.from("%PDF-1.7\nOriginal attachment fixture\n");
  const id = createHash("sha256").update(bytes).digest("hex") + ".pdf";
  await fs.writeFile(path.join(data, "assets", id), bytes);
  await fs.writeFile(path.join(data, "assets.json"), JSON.stringify({ version: 1, assets: [{ id, name: "Original.pdf", size: bytes.length, mime: "application/octet-stream", createdAt: new Date().toISOString() }] }));
  const note = createNote({ id: "foundation-writing", title: "Foundation writing", content: `[Original](assets/${id})\n\nSaved content` });
  const { book, homeNote } = createBook("Foundation Book");
  await fs.writeFile(path.join(data, "notes.json"), JSON.stringify({ version: 2, notes: [note, homeNote], books: [book] }));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])],
    env: { ...process.env, E2E_USER_DATA_DIR: "", LANCARBON_ROOT: root }
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByLabel("Note title")).toHaveValue(note.title);
    const bounds = await Promise.all(["Notes", "Books", "Research", "Library"].map(name => page.getByRole("button", { name, exact: true }).boundingBox()));
    expect(bounds[0]!.y).toBe(bounds[1]!.y); expect(bounds[2]!.y).toBe(bounds[3]!.y);
    expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y); expect(bounds[0]!.x).toBe(bounds[2]!.x);
    await page.getByLabel("Note title").fill("Edited foundation writing");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    for (const name of ["Run", "Templates", "Outputs", "Chat", "AI Settings"]) {
      await page.getByRole("navigation", { name: "Research pages" }).getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name: name === "Chat" ? "Start a conversation" : name, exact: true })).toBeVisible();
      if (["Run", "Templates", "Outputs"].includes(name)) await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
      else await expect(page.getByText("Coming soon", { exact: true })).toBeHidden();
    }
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("button", { name: "Research", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByLabel("Find Library resource").fill("Original.pdf");
    await page.getByRole("button", { name: "Original.pdf", exact: true }).click();
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: filename })) as typeof dialog.showSaveDialog; }, path.join(root, "saved-original.pdf"));
    await page.getByRole("button", { name: "Save a copy", exact: true }).click();
    await expect.poll(() => fs.readFile(path.join(root, "saved-original.pdf")).then(value => value.equals(bytes)).catch(() => false)).toBe(true);
    for (const theme of ["Light", "Dark"]) {
      await page.locator(".theme-option").filter({ hasText: theme }).click();
      await page.screenshot({ path: info.outputPath(`library-${theme.toLowerCase()}.png`) });
    }
    await page.getByRole("button", { name: "Books", exact: true }).click();
    await page.getByLabel("Select Book").selectOption(book.id);
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await page.keyboard.press("Control+q");
    await expect(page.getByLabel("Select Book")).toHaveValue(book.id);
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Edited foundation writing");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.screenshot({ path: info.outputPath("research-chat.png") });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "Start a conversation", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Original.pdf", exact: true })).toBeVisible();
    const status = await page.evaluate(() => window.notesDesktop.foundation!.inspect());
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.directories.library).toBe(path.join(root, "Library"));
      expect(status.directories.outputs).toBe(path.join(data, "Research", "Outputs"));
    }
    const saved = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8"));
    expect(saved.version).toBe(2);
    expect(saved.notes.find((item: { id: string }) => item.id === note.id).content).toBe(note.content);
    expect(await fs.readFile(path.join(root, "Library", "assets", id))).toEqual(bytes);
    for (const folder of ["Library/Imports", "Library/AI-Paper", "Data/Library", "Data/Research/Templates", "Data/Research/Outputs", "Data/Research/Records", "Data/Research/Chats"]) expect((await fs.stat(path.join(root, folder))).isDirectory()).toBe(true);
  } finally { await app.close().catch(() => undefined); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
});
