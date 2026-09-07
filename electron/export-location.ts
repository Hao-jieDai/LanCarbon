import { promises as fs } from "node:fs";
import path from "node:path";

/** A dialog preference, independent of the workspace and its exported files. */
export class ExportLocation {
  private readonly file: string;
  constructor(private readonly directory: string, private readonly fallback: string) {
    this.file = path.join(directory, "export-location.json");
  }

  async load(): Promise<string> {
    try {
      const value = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (value.version === 1 && typeof value.path === "string" && path.isAbsolute(value.path)
        && (await fs.stat(value.path)).isDirectory()) return value.path;
    } catch { /* Missing, corrupt or unavailable saved directory: use the default. */ }
    return this.fallback;
  }

  async save(directory: string): Promise<void> {
    if (!path.isAbsolute(directory)) throw new Error("The export folder must be an absolute path");
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ version: 1, path: directory }, null, 2), "utf8");
    await fs.rename(temporary, this.file);
  }
}
