const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { _electron: electron } = require("playwright");
const { verifySnapshot } = require("./workspace-recovery.cjs");

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
}
function personal(workspace) {
  const official = workspace.books.find(book => book.id === "lancarbon-from-zero-to-one");
  const managed = new Set(Object.values(official?.pages ?? {}).map(page => page.noteId));
  managed.add("lancarbon-release-readme");
  return ordered({
    notes: workspace.notes.filter(note => !managed.has(note.id)).sort((a, b) => a.id.localeCompare(b.id)),
    books: workspace.books.filter(book => book.id !== "lancarbon-from-zero-to-one").sort((a, b) => a.id.localeCompare(b.id))
  });
}

async function verify(root, backup, expectedVersion, reportDirectory) {
  root = path.resolve(root); backup = path.resolve(backup);
  const manifest = await verifySnapshot(backup);
  const initial = JSON.parse(await fs.readFile(path.join(backup, "Data", "notes.json"), "utf8"));
  const expectedPersonal = personal(initial);
  const app = await electron.launch({
    executablePath: path.join(root, "Application", "LanCarbon.exe"),
    args: ["--in-process-gpu", "--disable-gpu", "--no-sandbox"],
    env: { ...process.env, LANCARBON_ROOT: root, E2E_USER_DATA_DIR: "" }
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("main", { name: "LanCarbon application" }).waitFor({ timeout: 30000 });
    const version = await app.evaluate(({ app }) => app.getVersion());
    if (version !== expectedVersion) throw new Error("Unexpected installed application version: " + version);
    const data = await page.evaluate(() => window.notesDesktop.getDataLocation());
    if (!data.ok || await fs.realpath(data.path) !== await fs.realpath(path.join(root, "Data"))) throw new Error("Application is not using the expected data folder");
    const result = await page.evaluate(() => window.notesDesktop.loadWorkspace());
    if (!result.ok || JSON.stringify(personal(result.workspace)) !== JSON.stringify(expectedPersonal)) throw new Error("Personal Notes, Books or publishing bindings changed");
    if (Number(expectedVersion.split(".")[0]) >= 2) {
      for (const name of ["Notes", "Books", "Research", "Library"]) await page.getByRole("button", { name, exact: true }).waitFor();
      const tutorial = result.workspace.books.find(book => book.id === "lancarbon-from-zero-to-one");
      if (!tutorial?.pages["tutorial-page-s6"]) throw new Error("The independent Research and Library tutorial chapter is missing");
    }
  } finally { await app.close(); }
  // Managed tutorial assets can refresh; personal originals must remain byte-identical.
  const officialAssets = JSON.parse(await fs.readFile(path.resolve("resources/starter-content/assets.json"), "utf8"));
  const officialFiles = new Set(officialAssets.assets.map(asset => asset.file ?? asset.id));
  let resources = 0;
  for (const entry of manifest.files.filter(entry => (entry.path.startsWith("Data/assets/") || entry.path.startsWith("Library/assets/")) && !officialFiles.has(path.basename(entry.path)))) {
    const managedLibrary = Number(expectedVersion.split(".")[0]) > 2 || (Number(expectedVersion.split(".")[0]) === 2 && (Number(expectedVersion.split(".")[1]) > 1 || Number(expectedVersion.split(".")[2]) >= 1));
    const resourcePath = managedLibrary && entry.path.startsWith("Data/assets/") ? "Library/assets/" + entry.path.slice("Data/assets/".length) : entry.path;
    const bytes = await fs.readFile(path.join(root, resourcePath));
    if (createHash("sha256").update(bytes).digest("hex").toUpperCase() !== entry.sha256) throw new Error("A personal original changed");
    resources++;
  }
  const saved = JSON.parse(await fs.readFile(path.join(root, "Data", "notes.json"), "utf8"));
  if (JSON.stringify(personal(saved)) !== JSON.stringify(expectedPersonal)) throw new Error("Saved user writing changed");
  if (expectedVersion !== "2.1.0" && Number(expectedVersion.split(".")[0]) >= 2 && await fs.stat(path.join(root, "Data", "assets")).catch(() => null)) throw new Error("Legacy Data/assets was not retired");
  const summary = { version: expectedVersion, root, personalNotes: expectedPersonal.notes.length, personalBooks: expectedPersonal.books.length, personalResourceFiles: resources, userDataPreserved: true };
  const reports = path.resolve(reportDirectory ?? path.dirname(root));
  await fs.mkdir(reports, { recursive: true });
  await fs.writeFile(path.join(reports, `verified-${expectedVersion}-${Date.now()}.json`), JSON.stringify(summary, null, 2));
  return summary;
}
if (require.main === module) {
  const [root, backup, version, reportDirectory] = process.argv.slice(2);
  if (!root || !backup || !version) throw new Error("Usage: node scripts/verify-acceptance-workspace.cjs ROOT BACKUP VERSION [REPORT_DIRECTORY]");
  verify(root, backup, version, reportDirectory).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
