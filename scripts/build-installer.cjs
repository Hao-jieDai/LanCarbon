const { spawnSync } = require("node:child_process");
const path = require("node:path");

const executable = process.execPath;
const builderCli = path.join(process.cwd(), "node_modules", "electron-builder", "cli.js");

const result = spawnSync(executable, [builderCli, "--win", "nsis", "--x64"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: path.join(process.cwd(), ".builder-cache")
  }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
