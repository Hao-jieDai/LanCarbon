import { promises as fs } from "node:fs";
import path from "node:path";

interface BuildPreferences { version: 1; parent?: string; destinations: Record<string, string> }

export class BuildLocation {
  private readonly file: string;
  constructor(private readonly directory: string, private readonly fallback: string) { this.file = path.join(directory, "build-location.json"); }

  private async loadFile(): Promise<BuildPreferences> {
    try {
      const value = JSON.parse(await fs.readFile(this.file, "utf8")) as Partial<BuildPreferences>;
      if (value.version === 1 && (!value.parent || path.isAbsolute(value.parent)) && value.destinations && typeof value.destinations === "object") {
        return { version: 1, parent: value.parent, destinations: Object.fromEntries(Object.entries(value.destinations).filter((entry): entry is [string, string] => typeof entry[1] === "string" && path.isAbsolute(entry[1]))) };
      }
    } catch { /* Missing or corrupt preferences use safe defaults. */ }
    return { version: 1, destinations: {} };
  }

  async parent(): Promise<string> {
    const value = await this.loadFile();
    if (value.parent && (await fs.stat(value.parent).catch(() => null))?.isDirectory()) return value.parent;
    return this.fallback;
  }

  async destination(bookId: string): Promise<string | undefined> { return (await this.loadFile()).destinations[bookId]; }

  async save(bookId: string, parent: string, destination: string): Promise<void> {
    if (![parent, destination].every(path.isAbsolute)) throw new Error("Build paths must be absolute");
    const current = await this.loadFile();
    const next: BuildPreferences = { version: 1, parent, destinations: { ...current.destinations, [bookId]: destination } };
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(temporary, this.file);
  }
}
