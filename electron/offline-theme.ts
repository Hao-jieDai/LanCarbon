import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const CACHE_VERSION = "book-theme-1.3.1-runtime-1";

async function validCache(directory: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await fs.readFile(path.join(directory, ".lancarbon-theme-cache.json"), "utf8"));
    return marker.version === CACHE_VERSION
      && (await fs.stat(path.join(directory, "site", "myst", "book-theme", "template.yml"))).isFile()
      && (await fs.stat(path.join(directory, "site", "myst", "book-theme", "build", "index.js"))).isFile();
  } catch { return false; }
}

export async function prepareOfflineBookTheme(archive: string, cacheRoot: string): Promise<string> {
  if (!(await fs.stat(archive).catch(() => null))?.isFile()) throw new Error("The bundled offline Book Theme is missing. Reinstall LanCarbon.");
  const destination = path.join(cacheRoot, CACHE_VERSION);
  if (await validCache(destination)) return destination;
  await fs.mkdir(cacheRoot, { recursive: true });
  const staging = path.join(cacheRoot, `${CACHE_VERSION}.preparing-${process.pid}-${Date.now()}`);
  await fs.mkdir(staging, { recursive: true });
  try {
    await run("tar.exe", ["-xf", archive, "-C", staging], { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
    await fs.writeFile(path.join(staging, ".lancarbon-theme-cache.json"), JSON.stringify({ version: CACHE_VERSION }, null, 2), "utf8");
    if (!await validCache(staging)) throw new Error("The extracted Book Theme is incomplete");
    await fs.rm(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    await fs.rename(staging, destination);
    return destination;
  } catch (error) {
    throw new Error(`Could not prepare the bundled offline Book Theme: ${error instanceof Error ? error.message : "archive extraction failed"}`);
  } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined); }
}
