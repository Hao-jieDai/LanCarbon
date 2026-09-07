import { promises as fs } from "node:fs";
import path from "node:path";

interface DataLocationConfig {
  version: 1;
  path: string;
}

export class DataLocationManager {
  private readonly configPath: string;

  constructor(
    private readonly configDirectory: string,
    private readonly legacyDirectory: string,
    private readonly defaultDirectory: string
  ) {
    this.configPath = path.join(configDirectory, "data-location.json");
  }

  async resolve(): Promise<string> {
    const configured = await this.readConfiguredPath();
    if (configured) return configured;
    try {
      await this.copyWorkspaceIfNeeded(this.legacyDirectory, this.defaultDirectory);
      await this.save(this.defaultDirectory);
      return this.defaultDirectory;
    } catch {
      // A missing/unavailable D: drive must never make an existing workspace
      // appear empty. Keep using the legacy location and retry next launch.
      return this.legacyDirectory;
    }
  }

  async save(directory: string): Promise<void> {
    const resolved = path.resolve(directory);
    if (!path.isAbsolute(resolved)) throw new Error("The data location must be an absolute path");
    await fs.mkdir(this.configDirectory, { recursive: true });
    const temporary = `${this.configPath}.tmp`;
    const config: DataLocationConfig = { version: 1, path: resolved };
    await fs.writeFile(temporary, JSON.stringify(config, null, 2), "utf8");
    await fs.rename(temporary, this.configPath);
  }

  async prepareTarget(sourceDirectory: string, targetDirectory: string): Promise<void> {
    const source = path.resolve(sourceDirectory);
    const target = path.resolve(targetDirectory);
    if (source.toLocaleLowerCase("en-US") === target.toLocaleLowerCase("en-US")) return;
    const targetWorkspace = path.join(target, "notes.json");
    try {
      await fs.access(targetWorkspace);
      throw new Error("The selected folder already contains notes.json. Choose another folder to avoid overwriting data.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.copyWorkspaceIfNeeded(source, target);
    // Resources travel with the workspace; never merge into an unrelated catalog.
    for (const name of ["assets.json", "assets"]) {
      const sourcePath = path.join(source, name), targetPath = path.join(target, name);
      if (!(await fs.stat(sourcePath).catch(() => null))) continue;
      if (await fs.stat(targetPath).catch(() => null)) throw new Error("The selected folder already contains resources. Choose an empty data folder.");
      await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });
    }
  }

  private async readConfiguredPath(): Promise<string | null> {
    try {
      const value = JSON.parse(await fs.readFile(this.configPath, "utf8")) as Partial<DataLocationConfig>;
      return value.version === 1 && typeof value.path === "string" && path.isAbsolute(value.path)
        ? path.resolve(value.path)
        : null;
    } catch {
      return null;
    }
  }

  private async copyWorkspaceIfNeeded(sourceDirectory: string, targetDirectory: string): Promise<void> {
    const source = path.join(sourceDirectory, "notes.json");
    const target = path.join(targetDirectory, "notes.json");
    try {
      await fs.access(target);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      const raw = await fs.readFile(source, "utf8");
      JSON.parse(raw);
      await fs.mkdir(targetDirectory, { recursive: true });
      const temporary = `${target}.migration-${process.pid}.tmp`;
      await fs.writeFile(temporary, raw, "utf8");
      await fs.rename(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await fs.mkdir(targetDirectory, { recursive: true });
        return;
      }
      throw error;
    }
  }
}
