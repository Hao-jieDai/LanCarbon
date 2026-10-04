import { app, BrowserWindow, dialog, ipcMain, net, screen, shell } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { AssetStore, type ResolveConflict } from "./assets";
import { MAX_ASSET_BYTES, resourceUsages, type AssetConflictChoice } from "../src/shared/assets";
import { exportPagePdf, pdfFileName } from "./pdf-exporter";
import { withoutResources } from "../src/shared/removeResourceReferences";
import { exportBookToDirectory } from "./book-exporter";
import { bookSourceHash, buildBookForPublication, buildBookInParent, preflightBook } from "./book-builder";
import { BuildLocation } from "./build-location";
import { prepareOfflineBookTheme } from "./offline-theme";
import { DataLocationManager } from "./data-location";
import { ExportLocation } from "./export-location";
import { NotesStore } from "./storage";
import { WebsiteServerManager } from "./website-server";
import { GitHubPublishingService } from "./github-publishing";
import { startGitHubSignIn } from "./github-sign-in";
import type { WindowPreferences, WorkspaceFile } from "../src/shared/types";
import { MAX_BIB_BYTES, parseBibTeX } from "../src/shared/bibliography";
import { directoryList, resolveLanCarbonDirectories } from "./app-directories";
import { EnvironmentManager } from "./environment-manager";
import type { EnvironmentToolId } from "../src/shared/types";

let mainWindow: BrowserWindow | null = null;
const websiteServers = new WebsiteServerManager();
let store: NotesStore;
let preferencesStore: NotesStore;
let dataLocationManager: DataLocationManager;
let dataDirectory: string;
let saveWindowTimer: NodeJS.Timeout | undefined;
let environmentManager: EnvironmentManager;

const directories = resolveLanCarbonDirectories({
  executable: process.execPath,
  packaged: app.isPackaged,
  platform: process.platform,
  appData: app.getPath("appData"),
  overrideRoot: process.env.LANCARBON_ROOT,
  e2eDirectory: process.env.E2E_USER_DATA_DIR
});
for (const directory of directoryList(directories)) mkdirSync(directory, { recursive: true });
app.setPath("userData", directories.config);
app.setPath("sessionData", directories.cache);
app.setPath("temp", directories.temp);
app.setPath("logs", path.join(directories.config, "Logs"));
app.setPath("crashDumps", path.join(directories.cache, "CrashDumps"));

function isVisibleOnSomeDisplay(preferences: WindowPreferences): boolean {
  if (preferences.x === undefined || preferences.y === undefined) return true;
  return screen.getAllDisplays().some(display => {
    const { x, y, width, height } = display.workArea;
    return preferences.x! < x + width && preferences.x! + 100 > x && preferences.y! < y + height && preferences.y! + 100 > y;
  });
}

async function createWindow(): Promise<void> {
  const preferences = await preferencesStore.loadWindowPreferences();
  const safePreferences = preferences && isVisibleOnSomeDisplay(preferences) ? preferences : null;
  mainWindow = new BrowserWindow({
    width: safePreferences?.width ?? 1180,
    height: safePreferences?.height ?? 780,
    ...(safePreferences?.x !== undefined ? { x: safePreferences.x } : {}),
    ...(safePreferences?.y !== undefined ? { y: safePreferences.y } : {}),
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b090a",
    title: "LanCarbon",
    icon: path.join(__dirname, "../../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: true
    }
  });

  mainWindow.webContents.session.setSpellCheckerEnabled(false);
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    // Keep Ctrl+Q in the renderer instead of Electron's native Quit accelerator.
    mainWindow?.webContents.setIgnoreMenuShortcuts(input.control && !input.meta && !input.alt && !input.shift && input.key.toLowerCase() === "q");
  });
  if (safePreferences?.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const persistBounds = (): void => {
    if (!mainWindow) return;
    clearTimeout(saveWindowTimer);
    saveWindowTimer = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getNormalBounds();
      void preferencesStore.saveWindowPreferences({ ...bounds, maximized: mainWindow.isMaximized() });
    }, 250);
  };
  mainWindow.on("resize", persistBounds);
  mainWindow.on("move", persistBounds);
  mainWindow.on("maximize", persistBounds);
  mainWindow.on("unmaximize", persistBounds);
  mainWindow.on("close", () => {
    if (!mainWindow) return;
    clearTimeout(saveWindowTimer);
    const bounds = mainWindow.getNormalBounds();
    void preferencesStore.saveWindowPreferences({ ...bounds, maximized: mainWindow.isMaximized() });
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => {
  const configurationDirectory = app.getPath("userData");
  environmentManager = new EnvironmentManager(directories.tools, directories.temp, path.join(configurationDirectory, "Logs", "environment-setup.log"), net.fetch as unknown as typeof fetch, progress => mainWindow?.webContents.send("environment:progress", progress));
  const managedEnvironment = environmentManager.environment(); process.env.Path = managedEnvironment.Path; process.env.PATH = managedEnvironment.PATH;
  preferencesStore = new NotesStore(configurationDirectory);
  const exportLocation = new ExportLocation(configurationDirectory, directories.exports);
  const buildLocation = new BuildLocation(configurationDirectory, directories.builds);
  const githubPublishing = new GitHubPublishingService(undefined, undefined, directories.temp);
  const bundledTemplateArchive = app.isPackaged ? path.join(process.resourcesPath, "book-theme-runtime.zip") : path.resolve("build", "book-theme-runtime.zip");
  const bundledStarterContent = app.isPackaged ? path.join(process.resourcesPath, "starter-content") : path.resolve("resources", "starter-content");
  const savedBuild = async (bookId: string, currentWorkspace?: WorkspaceFile) => {
    const destination = await buildLocation.destination(bookId);
    if (!destination || !(await fs.stat(destination).catch(() => null))?.isDirectory()) return undefined;
    try {
      const marker = JSON.parse(await fs.readFile(path.join(destination, ".lancarbon-build.json"), "utf8"));
      const htmlPath = path.join(destination, "_build", "html");
      if (marker.bookId !== bookId || !(await fs.stat(path.join(htmlPath, "index.html")).catch(() => null))?.isFile()) return undefined;
      const workspace = currentWorkspace ?? (await store.loadWorkspace()).workspace;
      let sourceStatus: "current" | "outdated" = "outdated";
      try { sourceStatus = typeof marker.sourceHash === "string" && marker.sourceHash === bookSourceHash(workspace, bookId) ? "current" : "outdated"; }
      catch { sourceStatus = "outdated"; }
      return { destination, htmlPath, sourceStatus, builtAt: typeof marker.builtAt === "string" ? marker.builtAt : undefined };
    } catch { return undefined; }
  };
  dataLocationManager = new DataLocationManager(configurationDirectory, directories.data, directories.data);
  dataDirectory = await dataLocationManager.resolve();
  store = new NotesStore(dataDirectory, bundledStarterContent);
  let assetsDirectory = dataDirectory;
  let assetsManager = new AssetStore(dataDirectory);
  const assetStore = () => {
    if (assetsDirectory !== dataDirectory) { assetsDirectory = dataDirectory; assetsManager = new AssetStore(dataDirectory); }
    return assetsManager;
  };
  const runManagedBuild = async (bookId: string, chooseLocation = false) => {
    if (!mainWindow) throw new Error("The main window is unavailable");
    const { workspace } = await store.loadWorkspace();
    const previous = await buildLocation.destination(bookId);
    const saved = await savedBuild(bookId, workspace);
    let parent: string;
    if (!chooseLocation && saved) parent = path.dirname(saved.destination);
    else {
      const testParent = process.env.E2E_BUILD_PARENT;
      const selection = testParent ? { canceled: false, filePaths: [testParent] } : await dialog.showOpenDialog(mainWindow, {
        title: chooseLocation ? "Choose a new parent folder for the managed Book build" : "Choose a parent folder for the managed Book build",
        buttonLabel: "Build Here", properties: ["openDirectory", "createDirectory"], defaultPath: saved ? path.dirname(saved.destination) : await buildLocation.parent()
      });
      if (selection.canceled || !selection.filePaths[0]) return undefined;
      parent = path.resolve(selection.filePaths[0]);
    }
    const reusable = previous && path.dirname(path.resolve(previous)) === parent ? previous : undefined;
    const templateCache = process.env.E2E_BUILD_TEMPLATES || await prepareOfflineBookTheme(bundledTemplateArchive, path.join(directories.cache, "BookTheme"));
    const result = await buildBookInParent(workspace, bookId, parent, assetStore(), reusable, undefined, templateCache);
    await buildLocation.save(bookId, parent, result.destination);
    return result;
  };
  const assetError = (error: unknown) => ({ ok: false, canceled: error instanceof Error && error.message === "Import canceled", error: error instanceof Error ? error.message : "Resource operation failed" });
  const describeUses = async (ids: string[]) => {
    const {workspace} = await store.loadWorkspace();
    return resourceUsages(workspace.notes,workspace.books).filter(ref => ids.includes(ref.id));
  };
  const resolveConflict: ResolveConflict = async (existing,incoming) => {
    if (!mainWindow) return "cancel";
    const parent = mainWindow;
    const refs = await describeUses([existing.id]);
    const id = randomUUID();
    let cancel = () => {};
    try {
      return await new Promise<AssetConflictChoice>(resolve => {
        cancel = () => resolve("cancel");
        pendingConflicts.set(id, { sender: parent.webContents.id, resolve });
        parent.once("closed", cancel); parent.webContents.once("render-process-gone", cancel);
        parent.webContents.send("assets:conflict", { id, existing, incoming, uses: refs });
      });
    } finally {
      pendingConflicts.delete(id); parent.removeListener("closed", cancel);
      if (!parent.isDestroyed()) parent.webContents.removeListener("render-process-gone", cancel);
    }
  };
  const pendingConflicts = new Map<string, { sender: number; resolve(choice: AssetConflictChoice): void }>();
  ipcMain.handle("assets:resolve-conflict", (event, id: string, choice: AssetConflictChoice) => {
    const pending = pendingConflicts.get(id);
    if (!pending || pending.sender !== event.sender.id || !["replace", "keep", "cancel"].includes(choice)) return { ok: false, error: "This resource conflict is no longer active" };
    pendingConflicts.delete(id); pending.resolve(choice); return { ok: true };
  });
  ipcMain.handle("assets:remove", async (_event, ids: string[]) => {
    try {
      let workspace: WorkspaceFile | undefined;
      const removed = await assetStore().remove(ids,async assets => {
        if (!mainWindow) return false;
        const refs = await describeUses(assets.map(a=>a.id));
        const result = await dialog.showMessageBox(mainWindow,{type:"warning",title:"Delete resources",message:`Permanently delete ${assets.length} resource${assets.length === 1 ? "" : "s"}?`,
          detail:`${assets.map(a=>a.name).join("\n")}\n\n${refs.length ? `These ${refs.length} references across ALL Notes and Books will be removed together with the resource:\n` + refs.map(ref=>`${ref.location} / ${ref.title}${ref.line ? ` — line ${ref.line}` : ""}`).join("\n") : "No current references. This removes the managed copies from disk."}\n\nThis cannot be undone.`,buttons:["Delete permanently","Cancel"],defaultId:1,cancelId:1,noLink:true});
        return result.response === 0;
      },async () => {
        const previous=(await store.loadWorkspace()).workspace;
        workspace=withoutResources(previous,ids);
        await store.saveWorkspace(workspace);
        return () => store.saveWorkspace(previous);
      });
      return {ok:true,removed,workspace};
    } catch (e) { return assetError(e); }
  });
  ipcMain.handle("assets:list", async () => { try { return { ok: true, assets: await assetStore().list() }; } catch (e) { return assetError(e); } });
  ipcMain.handle("assets:choose-bibliography",async()=>{
    try{
      if(!mainWindow)throw new Error("The editor is closed");
      const choice=await dialog.showOpenDialog(mainWindow,{title:"Import BibTeX bibliography",properties:["openFile"],filters:[{name:"BibTeX bibliography",extensions:["bib"]}]});
      if(choice.canceled||!choice.filePaths[0])return {ok:false,canceled:true,error:"Import canceled"};
      const file=choice.filePaths[0],stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BIB_BYTES)throw new Error("BibTeX files must be 5 MB or smaller");
      const bytes=await fs.readFile(file),source=new TextDecoder("utf-8",{fatal:true}).decode(bytes),entries=parseBibTeX(source);
      const asset=await assetStore().importBytes(path.basename(file),bytes,false,resolveConflict);
      return {ok:true,source:{assetId:asset.id,name:asset.name,entries}};
    }catch(e){return assetError(e);}
  });
  ipcMain.handle("assets:choose", async (_event, imageOnly: boolean) => {
    try {
      if (!mainWindow) throw new Error("The editor is closed");
      const choice = await dialog.showOpenDialog(mainWindow, { title: imageOnly ? "Insert images" : "Insert attachments", properties: ["openFile", "multiSelections"], ...(imageOnly ? { filters: [{ name: "Images", extensions: ["png","jpg","jpeg","gif","webp"] }] } : {}) });
      if (choice.canceled) return { ok: false, canceled: true, error: "Import canceled" };
      if (choice.filePaths.length > 20) throw new Error("Import up to 20 files at a time");
      const manager = assetStore();
      const assets = [];
      for (const file of choice.filePaths) { try { assets.push(await manager.importFile(file, imageOnly,resolveConflict)); } catch (e) { if (!(e instanceof Error) || e.message !== "Import canceled") throw e; } }
      return { ok: true, assets };
    } catch (e) { return assetError(e); }
  });
  ipcMain.handle("assets:import", async (_event, name: string, base64: string, imageOnly: boolean) => {
    try {
      if (typeof name !== "string" || name.length > 500 || typeof base64 !== "string" || base64.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("Invalid file data");
      return { ok: true, asset: await assetStore().importBytes(name, Buffer.from(base64,"base64"), imageOnly,resolveConflict) };
    } catch (e) { return assetError(e); }
  });
  ipcMain.handle("assets:image", async (_event, id: string) => {
    try {
      const { asset, bytes } = await assetStore().read(id);
      if (!/^image\/(png|jpeg|gif|webp)$/.test(asset.mime)) throw new Error("This resource is an attachment");
      return { ok: true, url: `data:${asset.mime};base64,${bytes.toString("base64")}` };
    } catch (e) { return assetError(e); }
  });
  ipcMain.handle("assets:save-copy", async (_event, id: string) => {
    try {
      if (!mainWindow) throw new Error("The editor is closed");
      const { asset, bytes } = await assetStore().read(id);
      const choice = await dialog.showSaveDialog(mainWindow, { title: "Save a copy", defaultPath: path.join(directories.exports, path.basename(asset.name)) });
      if (choice.canceled || !choice.filePath) return { ok: true };
      await fs.writeFile(choice.filePath, bytes);
      return { ok: true };
    } catch (e) { return assetError(e); }
  });
  ipcMain.handle("workspace:load", async () => {
    try {
      return { ok: true, ...(await store.loadWorkspace()) };
    } catch (error) {
      return { ok: false, workspace: { version: 2, notes: [], books: [] }, isFirstRun: false, migrated: false, error: error instanceof Error ? error.message : "Failed to load the workspace" };
    }
  });
  ipcMain.handle("workspace:save", async (_event, workspace: WorkspaceFile) => {
    try {
      await store.saveWorkspace(workspace);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Failed to save notes" };
    }
  });
  ipcMain.handle("data-location:get", () => ({ ok: true, path: dataDirectory }));
  ipcMain.handle("data-location:change", async () => {
    if (!mainWindow) return { ok: false, error: "The main window is unavailable" };
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Choose LanCarbon data folder", buttonLabel: "Use This Folder", properties: ["openDirectory", "createDirectory"]
    });
    if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true, error: "Data location change canceled" };
    const target = path.resolve(selection.filePaths[0]);
    try {
      await dataLocationManager.prepareTarget(dataDirectory, target);
      const current = await store.loadWorkspace();
      const targetStore = new NotesStore(target);
      await targetStore.saveWorkspace(current.workspace);
      const verification = await targetStore.loadWorkspace();
      if (JSON.stringify(verification.workspace) !== JSON.stringify(current.workspace)) {
        throw new Error("The copied workspace could not be verified");
      }
      await dataLocationManager.save(target);
      store = targetStore;
      dataDirectory = target;
      return { ok: true, path: target };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Failed to change the data location" };
    }
  });
  ipcMain.handle("data-location:open", async () => {
    try {
      await shell.openPath(dataDirectory).then(error => { if (error) throw new Error(error); });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Failed to open the data folder" };
    }
  });
  ipcMain.handle("book:export", async (_event, bookId: string) => {
    if (!mainWindow) return { ok: false, error: "The main window is unavailable" };
    const testDestination = process.env.E2E_EXPORT_DIR;
    const selection = testDestination ? { canceled: false, filePaths: [testDestination] } : await dialog.showOpenDialog(mainWindow, {
      title: "Choose an empty folder for Jupyter Book", buttonLabel: "Export Here", properties: ["openDirectory", "createDirectory"],
      defaultPath: await exportLocation.load()
    });
    if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true, error: "Export canceled" };
    try {
      await exportLocation.save(selection.filePaths[0]);
      const { workspace } = await store.loadWorkspace();
      await exportBookToDirectory(workspace, bookId, selection.filePaths[0], assetStore());
      return { ok: true, destination: selection.filePaths[0] };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Failed to export Jupyter Book" };
    }
  });
  ipcMain.handle("book:build-environment", async () => {
    try {
      const items = await environmentManager.inspect("build");
      return { ok: true, checks: items.filter(item => item.id === "python" || item.id === "node" || item.id === "jupyter-book").map(item => ({ id: item.id, label: item.label, status: item.status === "pass" ? "pass" as const : "error" as const, detail: item.detail })) };
    }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to inspect the build environment" }; }
  });
  ipcMain.handle("environment:inspect", async () => {
    try { return { ok: true, root: directories.root, toolsPath: directories.tools, logPath: path.join(configurationDirectory, "Logs", "environment-setup.log"), items: await environmentManager.inspect() }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to inspect the environment" }; }
  });
  ipcMain.handle("environment:install", async (_event, id: EnvironmentToolId) => {
    if (!["python", "node", "jupyter-book", "git", "github-cli"].includes(id)) return { ok: false, error: "Unsupported environment tool." };
    return environmentManager.install(id);
  });
  let pdfExporting = false;
  ipcMain.handle("page:export-pdf", async (event, noteId: string) => {
    if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return { ok: false, error: "The main window is unavailable" };
    if (pdfExporting) return { ok: false, error: "A PDF export is already in progress" };
    pdfExporting = true;
    try {
      if (typeof noteId !== "string") throw new Error("Invalid page selection");
      const { workspace } = await store.loadWorkspace();
      const note = workspace.notes.find(item => item.id === noteId);
      if (!note) throw new Error("The selected page no longer exists");
      const selection = await dialog.showSaveDialog(mainWindow, { title: "Export current page as PDF", defaultPath: path.join(directories.exports, pdfFileName(note.title)), filters: [{ name: "PDF document", extensions: ["pdf"] }], properties: ["showOverwriteConfirmation", "createDirectory"] });
      if (selection.canceled || !selection.filePath) return { ok: false, canceled: true, error: "PDF export canceled" };
      const destination = /\.pdf$/i.test(selection.filePath) ? selection.filePath : `${selection.filePath}.pdf`;
      const warnings = await exportPagePdf(workspace, noteId, destination, assetStore());
      return { ok: true, destination, warnings };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Failed to export PDF" };
    } finally { pdfExporting = false; }
  });
  ipcMain.handle("environment:repair-permissions", () => environmentManager.repairPermissions());
  ipcMain.handle("environment:cancel", () => { environmentManager.cancel(); return { ok: true }; });
  ipcMain.handle("environment:instructions", async (_event, id: EnvironmentToolId) => {
    try {
      if (!["python", "node", "jupyter-book", "git", "github-cli"].includes(id)) throw new Error("Unsupported environment tool.");
      await shell.openExternal(environmentManager.manualUrl(id)); return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open installation instructions" }; }
  });
  ipcMain.handle("environment:open-log", async () => {
    try {
      const log = path.join(configurationDirectory, "Logs", "environment-setup.log"); await fs.mkdir(path.dirname(log), { recursive: true }); await fs.appendFile(log, "", "utf8");
      const error = await shell.openPath(log); if (error) throw new Error(error); return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open the environment log" }; }
  });
  ipcMain.handle("book:validate", async (_event, bookId: string) => {
    try {
      const { workspace } = await store.loadWorkspace();
      return { ok: true, issues: await preflightBook(workspace, bookId, assetStore()) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to validate the Book" }; }
  });
  ipcMain.handle("book:build", async (_event, bookId: string, options?: { chooseLocation?: boolean }) => {
    try {
      const result = await runManagedBuild(bookId, options?.chooseLocation === true);
      if (!result) return { ok: false, canceled: true, error: "Build canceled" };
      return { ok: true, ...result, sourceStatus: "current", url: await websiteServers.serve(bookId, result.htmlPath) };
    } catch (error) {
      const failure = error as Error & { issues?: unknown; log?: string };
      return { ok: false, error: failure.message || "Failed to build Jupyter Book", ...(Array.isArray(failure.issues) ? { issues: failure.issues } : {}), ...(failure.log ? { log: failure.log.slice(-100_000) } : {}) };
    }
  });
  ipcMain.handle("book:open-build", async (_event, bookId: string) => {
    try {
      const saved = await savedBuild(bookId); if (!saved) throw new Error("This Book does not have a completed build yet");
      const error = await shell.openPath(saved.destination); if (error) throw new Error(error);
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open the build folder" }; }
  });
  ipcMain.handle("book:open-website", async (_event, bookId: string) => {
    try {
      const url = websiteServers.url(bookId); if (!url) throw new Error("Build this Book to start its local website");
      await shell.openExternal(url); return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open the local website" }; }
  });
  ipcMain.handle("book:website-status", async (_event, bookId: string) => {
    try {
      const saved = await savedBuild(bookId); if (!saved) return { ok: true, built: false, running: false };
      const url = websiteServers.url(bookId); return { ok: true, built: true, running: Boolean(url), htmlPath: saved.htmlPath, destination: saved.destination, sourceStatus: saved.sourceStatus, ...(saved.builtAt ? { builtAt: saved.builtAt } : {}), ...(url ? { url } : {}) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to inspect the local website" }; }
  });
  ipcMain.handle("book:website-start", async (_event, bookId: string) => {
    try {
      const saved = await savedBuild(bookId); if (!saved) throw new Error("This Book does not have a completed build yet");
      const url = await websiteServers.serve(bookId, saved.htmlPath); return { ok: true, built: true, running: true, htmlPath: saved.htmlPath, destination: saved.destination, sourceStatus: saved.sourceStatus, ...(saved.builtAt ? { builtAt: saved.builtAt } : {}), url };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to start the local website" }; }
  });
  ipcMain.handle("book:website-stop", async (_event, bookId: string) => {
    try {
      await websiteServers.stop(bookId); const saved = await savedBuild(bookId);
      return saved ? { ok: true, built: true, running: false, htmlPath: saved.htmlPath, destination: saved.destination, sourceStatus: saved.sourceStatus, ...(saved.builtAt ? { builtAt: saved.builtAt } : {}) } : { ok: true, built: false, running: false };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to stop the local website" }; }
  });
  ipcMain.handle("github:inspect", async (_event, bookId: string) => {
    try {
      const { workspace } = await store.loadWorkspace(); const book = workspace.books.find(item => item.id === bookId);
      if (!book) throw new Error("The selected Book no longer exists");
      const built = await savedBuild(bookId, workspace);
      return { ok: true, ...(await githubPublishing.inspect(book.settings.publishing, built?.sourceStatus ?? "missing")) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to inspect GitHub publishing" }; }
  });
  ipcMain.handle("github:setup", async (_event, bookId: string, request: import("../src/shared/types").GitHubSetupRequest) => {
    try {
      const { workspace } = await store.loadWorkspace();
      if (!workspace.books.some(item => item.id === bookId)) throw new Error("The selected Book no longer exists");
      return { ok: true, binding: await githubPublishing.setup(request) };
    } catch (error) {
      const failure = error as Error & { repositoryUrl?: string };
      return { ok: false, error: failure.message || "GitHub repository setup failed", ...(failure.repositoryUrl ? { repositoryUrl: failure.repositoryUrl } : {}) };
    }
  });
  ipcMain.handle("github:publish", async (_event, bookId: string) => {
    try {
      const { workspace } = await store.loadWorkspace(); const book = workspace.books.find(item => item.id === bookId);
      if (!book) throw new Error("The selected Book no longer exists");
      if (!book.settings.publishing) throw new Error("Connect this Book to a GitHub repository before publishing.");
      let built = await savedBuild(bookId, workspace); let rebuilt = false;
      if (!built || built.sourceStatus === "outdated") {
        const buildResult = await runManagedBuild(bookId);
        if (!buildResult) return { ok: false, canceled: true, error: "Build canceled" };
        await websiteServers.serve(bookId, buildResult.htmlPath);
        built = { destination: buildResult.destination, htmlPath: buildResult.htmlPath, sourceStatus: "current" as const, builtAt: new Date().toISOString() };
        rebuilt = true;
      }
      const repositoryName = book.settings.publishing.repository.split("/")[1];
      const owner = book.settings.publishing.repository.split("/")[0];
      const baseUrl = repositoryName.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "" : `/${repositoryName}`;
      const templateCache = process.env.E2E_BUILD_TEMPLATES || await prepareOfflineBookTheme(bundledTemplateArchive, path.join(directories.cache, "BookTheme"));
      const pagesBuild = await buildBookForPublication(built.destination, baseUrl, undefined, templateCache, directories.temp);
      let result;
      try { result = await githubPublishing.publish(book.settings.publishing, pagesBuild.htmlPath, book.settings.title); }
      finally { await fs.rm(pagesBuild.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined); }
      const updated = { ...book, settings: { ...book.settings, github: result.binding.repositoryUrl, publishing: result.binding }, updatedAt: new Date().toISOString() };
      await store.saveWorkspace({ ...workspace, books: workspace.books.map(item => item.id === bookId ? updated : item) });
      return { ok: true, ...result, rebuilt };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "GitHub publishing failed" }; }
  });
    ipcMain.handle("github:sign-in", async () => {
      return startGitHubSignIn();
    });
  ipcMain.handle("github:open-cli-download", async () => {
    try { await shell.openExternal("https://cli.github.com/"); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open the GitHub CLI website" }; }
  });
  ipcMain.handle("github:open-url", async (_event, url: string) => {
    try {
      const parsed = new URL(url); const host = parsed.hostname.toLowerCase(); if (parsed.protocol !== "https:" || (![/^(?:www\.)?github\.com$/, /^[a-z0-9-]+\.github\.io$/].some(pattern => pattern.test(host)))) throw new Error("Only GitHub HTTPS links can be opened here");
      await shell.openExternal(parsed.toString()); return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Failed to open GitHub" }; }
  });
  await createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});

app.on("before-quit", () => { environmentManager?.cancel(); websiteServers.closeAll(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
