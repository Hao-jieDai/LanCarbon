const path = require("node:path");
const { build, Platform, Arch } = require("electron-builder");

// A separate installation identity keeps acceptance upgrade/downgrade tests away
// from the daily installation's registry entries and shortcuts.
const [prepackaged, version = require("../package.json").version] = process.argv.slice(2);
if (!prepackaged || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Usage: node scripts/build-acceptance-installer.cjs APP_DIRECTORY [VERSION]");
process.env.ELECTRON_BUILDER_CACHE = path.resolve(".builder-cache");
build({
  targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
  prepackaged: path.resolve(prepackaged),
  config: {
    appId: "cn.lancarbon.stage0.acceptance",
    productName: "LanCarbon",
    executableName: "LanCarbon",
    directories: { output: path.resolve("acceptance", "installers", version) },
    extraMetadata: { version },
    win: { artifactName: `LanCarbon-${version}-x64-Acceptance-Setup.exe` },
    nsis: { oneClick: false, include: "build/installer.nsh", createDesktopShortcut: false, createStartMenuShortcut: false, runAfterFinish: false, uninstallDisplayName: "LanCarbon Stage 0 Acceptance" }
  }
}).catch(error => { console.error(error.message); process.exitCode = 1; });
