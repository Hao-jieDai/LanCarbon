import path from "node:path";
import { existsSync } from "node:fs";

export interface LanCarbonDirectories {
  root: string;
  application: string;
  data: string;
  config: string;
  cache: string;
  temp: string;
  builds: string;
  exports: string;
  tools: string;
}

function fromRoot(root: string): LanCarbonDirectories {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    application: path.join(resolved, "Application"),
    data: path.join(resolved, "Data"),
    config: path.join(resolved, "Config"),
    cache: path.join(resolved, "Cache"),
    temp: path.join(resolved, "Temp"),
    builds: path.join(resolved, "Builds"),
    exports: path.join(resolved, "Exports"),
    tools: path.join(resolved, "Tools")
  };
}

export function resolveLanCarbonDirectories(options: {
  executable: string;
  packaged: boolean;
  platform: NodeJS.Platform;
  appData: string;
  overrideRoot?: string;
  e2eDirectory?: string;
  windowsDDriveAvailable?: boolean;
}): LanCarbonDirectories {
  if (options.e2eDirectory) {
    const directory = path.resolve(options.e2eDirectory);
    return { ...fromRoot(directory), application: directory, data: directory, config: directory };
  }
  if (options.overrideRoot) return fromRoot(options.overrideRoot);
  if (options.platform === "win32") {
    const executableDirectory = path.dirname(path.resolve(options.executable));
    if (options.packaged && path.basename(executableDirectory).toLocaleLowerCase("en-US") === "application") {
      return fromRoot(path.dirname(executableDirectory));
    }
    const hasDDrive = options.windowsDDriveAvailable ?? existsSync("D:\\");
    return fromRoot(hasDDrive ? "D:\\LanCarbon" : path.join(options.appData, "LanCarbon"));
  }
  return fromRoot(path.join(options.appData, "LanCarbon"));
}

export function directoryList(directories: LanCarbonDirectories): string[] {
  return [directories.root, directories.application, directories.data, directories.config, directories.cache, directories.temp, directories.builds, directories.exports, directories.tools];
}
