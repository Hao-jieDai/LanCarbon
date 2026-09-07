// Run from the repository root after npm run build.
// Optional --cli additionally validates the exported sample with Jupyter Book.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const net = require("node:net");
const { createBook, addNoteToBook } = require("../../dist-electron/src/shared/books.js");
const { createNote } = require("../../dist-electron/src/shared/notes.js");
const { exportBookToDirectory } = require("../../dist-electron/electron/book-exporter.js");
const run = promisify(execFile);

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-syntax-"));
  let application;
  let server;
  try {
    let { book, homeNote } = createBook("LanCarbon Syntax Acceptance");
    homeNote.content = await fs.readFile(path.join(__dirname, "index.md"), "utf8");
    book.pages[book.homePageId].metadata.label = "acceptance-home";
    const notes = [homeNote];
    for (const [title, file] of [["Syntax Lab", "syntax-lab.md"], ["Reference Lab", "reference-lab.md"]]) {
      const note = createNote({ title, content: await fs.readFile(path.join(__dirname, file), "utf8") });
      notes.push(note); book = addNoteToBook(book, note);
      Object.values(book.pages).find(page => page.noteId === note.id).exportPath = file;
      Object.values(book.pages).find(page => page.noteId === note.id).metadata.label = file === "syntax-lab.md" ? "acceptance-syntax-page" : "acceptance-reference-page";
    }
    book.settings.authors = [{ name: "Example Author" }];
    const workspace = { version: 2, notes, books: [book] };
    const dataDirectory = path.join(temporary, "data");
    const exportDirectory = path.join(temporary, "export");
    await fs.mkdir(dataDirectory); await fs.mkdir(exportDirectory);
    await fs.writeFile(path.join(dataDirectory, "notes.json"), JSON.stringify(workspace));
    application = await electron.launch({
      ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}),
      args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox", ...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname, "../..")])],
      env: { ...process.env, E2E_USER_DATA_DIR: dataDirectory }
    });
    const page = await application.firstWindow();
    await page.getByRole("button", { name: "Jupyter Book", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    for (const title of ["LanCarbon Syntax Acceptance", "Syntax Lab", "Reference Lab"]) {
      await page.locator(".book-page-row").filter({ hasText: title }).click();
      const preview = page.getByLabel("Rendered preview");
      await expect(preview).toBeVisible();
      const warnings = await preview.locator(".preview-diagnostics").allTextContents();
      if (warnings.length) throw new Error(`${title}: ${warnings.join("\n")}`);
      await expect(preview.locator(".preview-unresolved,.math-error,.preview-error")).toHaveCount(0);
      if (title === "Syntax Lab") {
        for (const selector of ["strong", "em", "strong em", "u", "del", "abbr", "sub", "sup", "kbd", "h1", "h2", "h3", "h4", "h5", "ul", "ol", "dl", "blockquote blockquote", "hr", "pre code", ".katex", ".warning", ".note .tip"]) {
          if (!await preview.locator(selector).count()) throw new Error(`Missing rendered syntax: ${selector}`);
        }
        await expect(preview.locator("table")).toHaveCount(3);
        const dropdown = preview.locator("details").filter({ hasText: "Expand the answer" });
        await dropdown.locator("summary").click();
        await expect(dropdown.locator(".katex")).toBeVisible();
        const opened = preview.locator("details").filter({ hasText: "Initially open" });
        await expect(opened).toHaveAttribute("open", "");
        await fs.mkdir(path.resolve("test-results/syntax-sample"), { recursive: true });
        await page.screenshot({ path: path.resolve("test-results/syntax-sample/preview.png") });
        console.log("Syntax Lab: all structural assertions passed");
      }
    }
    const preview = page.getByLabel("Rendered preview");
    const references = await preview.locator("a[data-preview-note]").evaluateAll(links => links.map(link => ({ text: link.textContent, note: link.dataset.previewNote, anchor: link.dataset.previewAnchor })));
    for (const [index, reference] of references.entries()) {
      await page.locator(".book-page-row").filter({ hasText: "Reference Lab" }).click();
      const targetTitle = notes.find(note => note.id === reference.note).title;
      await preview.locator("a[data-preview-note]").nth(index).click();
      await expect(page.getByLabel("Note title")).toHaveValue(targetTitle);
      if (reference.anchor) await expect(preview.locator(`[id="${reference.anchor}"]`)).toHaveCount(1);
    }
    console.log(`Reference Lab: ${references.length} reference jumps passed`);
    await application.close(); application = undefined;
    await exportBookToDirectory(workspace, book.id, exportDirectory);
    console.log("Application export: passed");
    if (process.argv.includes("--cli")) {
      const result = await run("jupyter", ["book", "build", "--html", "--strict"], { cwd: exportDirectory, windowsHide: true, timeout: 120000, maxBuffer: 5e6 });
      console.log(result.stdout); console.log(result.stderr);
      if (/⚠️|No target for internal reference|Link text is empty/.test(result.stdout + result.stderr)) throw new Error("The strict build returned content warnings; this sample is not accepted yet.");
      const port = await new Promise((resolve, reject) => {
        const listener = net.createServer(); listener.on("error", reject);
        listener.listen(0, "127.0.0.1", () => { const port = listener.address().port; listener.close(() => resolve(port)); });
      });
      server = spawn("jupyter", ["book", "start", "--headless", "--server-port", String(port)], { cwd: exportDirectory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      server.stdout.on("data", data => { output += data; }); server.stderr.on("data", data => { output += data; });
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (server.exitCode !== null) throw new Error(output);
        try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error(`Website did not start: ${output}`);
      console.log("Jupyter Book strict build and HTTP preview: passed");
    }
  } finally {
    if (application) await application.close().catch(() => {});
    if (server?.pid) await run("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
