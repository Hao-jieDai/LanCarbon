const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

const COMPONENTS = ["Data", "Config", "Library", "Builds", "Exports", "PDFs"];
const MANIFEST = "recovery.json";
const hash = bytes => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
};

async function filesIn(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error("Backup refuses linked files or folders: " + entry.name);
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error("Unsupported backup entry: " + entry.name);
  }
  return files;
}

async function requireEmpty(directory) {
  const stat = await fs.lstat(directory).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.readdir(directory)).length)) {
    throw new Error("Choose a new, empty destination. Existing files are never overwritten.");
  }
}

async function canonicalDestination(directory) {
  const stat = await fs.lstat(directory).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (stat?.isSymbolicLink()) throw new Error("Destination must not be a linked folder");
  if (stat) return fs.realpath(directory);
  const parent = path.dirname(directory);
  if (parent === directory) throw new Error("Destination has no existing parent");
  return path.join(await canonicalDestination(parent), path.basename(directory));
}

function payloadPath(directory, relative) {
  if (typeof relative !== "string" || relative.includes("\\") || relative.includes(":") || relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid backup path");
  const resolved = path.resolve(directory, relative);
  if (!inside(directory, resolved)) throw new Error("Backup path leaves its folder");
  return resolved;
}

async function createSnapshot({ root, destination, installer }) {
  const originalRoot = path.resolve(root);
  root = await fs.realpath(path.resolve(root));
  destination = await canonicalDestination(path.resolve(destination));
  await requireEmpty(destination);
  let data = path.join(root, "Data");
  const configPath = path.join(root, "Config", "data-location.json");
  const configured = await fs.readFile(configPath, "utf8").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (configured) {
    const value = JSON.parse(configured);
    if (value.version !== 1 || typeof value.path !== "string" || !path.isAbsolute(value.path)) throw new Error("Unrecognized data-location configuration");
    data = value.path;
  }
  const originalData = data;
  data = await fs.realpath(data);
  const workspace = JSON.parse(await fs.readFile(path.join(data, "notes.json"), "utf8"));
  if (workspace.version !== 2 || !Array.isArray(workspace.notes) || !Array.isArray(workspace.books)) throw new Error("Unrecognized workspace: stop before backing up or upgrading");
  const sources = Object.fromEntries(COMPONENTS.map(name => [name, name === "Data" ? data : path.join(root, name)]));
  for (const source of Object.values(sources)) {
    if (inside(source, destination) || inside(destination, source)) throw new Error("Backup destination must be separate from the source folders");
    const stat = await fs.lstat(source).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error("Backup refuses linked source folders");
  }
  const manifest = { version: 1, createdAt: new Date().toISOString(), root, data, originalRoot, originalData, workspaceVersion: workspace.version, sources, files: [] };
  const copy = async (source, relative) => {
    const before = await fs.stat(source);
    const bytes = await fs.readFile(source);
    const target = payloadPath(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
    const after = await fs.stat(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || hash(await fs.readFile(source)) !== hash(bytes)) throw new Error("Source changed while backing up. Close LanCarbon and use a new destination.");
    manifest.files.push({ path: relative, size: bytes.length, sha256: hash(bytes) });
  };
  for (const [component, source] of Object.entries(sources)) {
    const files = await filesIn(source);
    for (const relative of files) await copy(path.join(source, relative), component + "/" + relative);
    if (JSON.stringify(await filesIn(source)) !== JSON.stringify(files)) throw new Error("Source file list changed during backup");
  }
  if (installer) {
    if (!/^LanCarbon-\d+\.\d+\.\d+-x64-Setup\.exe$/.test(path.basename(installer))) throw new Error("Choose a recognized LanCarbon installer");
    await copy(path.resolve(installer), "Installer/" + path.basename(installer));
  }
  await fs.writeFile(path.join(destination, MANIFEST), JSON.stringify(manifest, null, 2), { flag: "wx" });
  await verifySnapshot(destination);
  return manifest;
}

async function verifySnapshot(directory) {
  directory = await fs.realpath(path.resolve(directory));
  const manifest = JSON.parse(await fs.readFile(path.join(directory, MANIFEST), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid or incomplete recovery manifest");
  const expected = new Set([MANIFEST]);
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || ![...COMPONENTS, "Installer"].includes(entry.path.split("/")[0]) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[A-F0-9]{64}$/.test(entry.sha256) || expected.has(entry.path)) throw new Error("Invalid recovery file entry");
    expected.add(entry.path);
    const file = payloadPath(directory, entry.path);
    const actual = await fs.realpath(file);
    if (!inside(directory, actual)) throw new Error("Recovery file leaves the snapshot");
    const bytes = await fs.readFile(file);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error("Recovery file failed SHA-256 verification: " + entry.path);
  }
  const actualFiles = await filesIn(directory);
  if (actualFiles.length !== expected.size || actualFiles.some(file => !expected.has(file))) throw new Error("Recovery snapshot contains unexpected files");
  if (!expected.has("Data/notes.json")) throw new Error("Recovery snapshot has no workspace");
  return manifest;
}

async function restoreSnapshot({ backup, target }) {
  backup = await fs.realpath(path.resolve(backup));
  target = await canonicalDestination(path.resolve(target));
  if (inside(backup, target) || inside(target, backup)) throw new Error("Restore destination must be separate from its snapshot");
  await requireEmpty(target);
  // Validate every byte before creating anything in the destination.
  const manifest = await verifySnapshot(backup);
  for (const entry of manifest.files.filter(entry => !entry.path.startsWith("Installer/"))) {
    const destination = payloadPath(target, entry.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(payloadPath(backup, entry.path), destination, 1);
    if (hash(await fs.readFile(destination)) !== entry.sha256) throw new Error("Restored file verification failed");
  }
  const rebase = value => {
    if (typeof value === "string" && path.isAbsolute(value)) {
      for (const original of [manifest.data, manifest.originalData].filter(Boolean)) if (inside(original, value)) return path.join(target, "Data", path.relative(original, value));
      for (const original of [manifest.root, manifest.originalRoot].filter(Boolean)) if (inside(original, value)) return path.join(target, path.relative(original, value));
    }
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebase(item)]));
    return value;
  };
  for (const name of ["data-location.json", "build-location.json", "export-location.json"]) {
    const file = path.join(target, "Config", name);
    const bytes = await fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (bytes) await fs.writeFile(file, JSON.stringify(rebase(JSON.parse(bytes)), null, 2));
  }
  return { target, files: manifest.files.filter(entry => !entry.path.startsWith("Installer/")).length };
}

module.exports = { createSnapshot, verifySnapshot, restoreSnapshot };
if (require.main === module) {
  const [command, ...arguments_] = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!/^--[a-z]+$/.test(arguments_[index]) || !arguments_[index + 1]) throw new Error("Expected --name value arguments");
    options[arguments_[index].slice(2)] = arguments_[index + 1];
  }
  Promise.resolve().then(async () => {
    if (command === "backup" && options.root && options.destination) {
      const result = await createSnapshot(options);
      console.log(JSON.stringify({ destination: path.resolve(options.destination), verifiedFiles: result.files.length, bytes: result.files.reduce((total, file) => total + file.size, 0) }));
    } else if (command === "verify" && options.backup) {
      const result = await verifySnapshot(options.backup);
      console.log(JSON.stringify({ verifiedFiles: result.files.length, createdAt: result.createdAt }));
    } else if (command === "restore" && options.backup && options.target) console.log(JSON.stringify(await restoreSnapshot(options)));
    else throw new Error("Usage: backup --root PATH --destination PATH [--installer PATH] | verify --backup PATH | restore --backup PATH --target EMPTY_PATH");
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
