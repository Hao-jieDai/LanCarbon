import { app, BrowserWindow, dialog, ipcMain, net, screen, shell, safeStorage } from "electron";
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
import { prepareResearchDirectories } from "./research-directories";
import { migrateAssetsToLibrary } from "./asset-migration";
import { AISettingsStore, AIChatStore } from "./ai-storage";
import { AIClient, redactAIError } from "./ai-client";
import { AIService } from "./ai-service";
import { AIPriceStore, AIUsageStore } from "./ai-usage";
import { TranslationCache, TranslationService, TranslationSettingsStore } from "./translation";
import { translationPriceProviders, TRANSLATION_TEST_TEXT, type TranslationSettings } from "../src/shared/translation";
import type { AIModelPriceInput, AIUsageQuery } from "../src/shared/aiUsage";
import type { AIProviderInput } from "../src/shared/ai";

let mainWindow: BrowserWindow | null = null;
const websiteServers = new WebsiteServerManager();
let store: NotesStore;
let preferencesStore: NotesStore;
let dataLocationManager: DataLocationManager;
let dataDirectory: string;
let saveWindowTimer: NodeJS.Timeout | undefined;
let environmentManager: EnvironmentManager;
let aiService: AIService;
let translationService: TranslationService;

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
  await prepareResearchDirectories(directories.root, dataDirectory);
  const managedAssetDirectory = path.join(directories.library, "assets");
  await migrateAssetsToLibrary(dataDirectory, directories.library);
  const officialCatalog = JSON.parse(await fs.readFile(path.join(bundledStarterContent, "assets.json"), "utf8"));
  const systemAssetIds = new Set<string>(officialCatalog.assets.map((asset: { id: string }) => asset.id));
  store = new NotesStore(dataDirectory, bundledStarterContent, managedAssetDirectory);
  const secretCodec = { available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: (text: string) => safeStorage.encryptStringAsync(text), decrypt: async (bytes: Buffer) => (await safeStorage.decryptStringAsync(bytes)).result };
  const aiSettings = new AISettingsStore(configurationDirectory, secretCodec);
  const translationConnections = new AISettingsStore(configurationDirectory, secretCodec, "translation-");
  const translationSettings = new TranslationSettingsStore(configurationDirectory);
  let cacheDirectory = dataDirectory, translationCache = new TranslationCache(dataDirectory);
  const cache = () => { if (cacheDirectory !== dataDirectory) { cacheDirectory = dataDirectory; translationCache = new TranslationCache(dataDirectory); } return translationCache; };
  let chatDirectory = dataDirectory;
  let chatStore = new AIChatStore(chatDirectory);
  const chats = () => { if (chatDirectory !== dataDirectory) { chatDirectory = dataDirectory; chatStore = new AIChatStore(chatDirectory); } return chatStore; };
  const aiPrices = new AIPriceStore(configurationDirectory);
  const priceProviders = async () => translationPriceProviders(await aiSettings.list(), await translationConnections.list(), await translationSettings.get());
  const usageStores = new Map<string, AIUsageStore>();
  const usage = () => { let value = usageStores.get(dataDirectory); if (!value) { value = new AIUsageStore(dataDirectory, aiPrices); usageStores.set(dataDirectory, value); } return value; };
  const syncPrices = async () => {
    try { const providers = await priceProviders(); await aiPrices.retain(providers.flatMap(provider => provider.models.map(model => ({ providerId: provider.id, baseUrl: provider.baseUrl, modelId: model.id })))); }
    catch { usage().reportFailure("Saved model prices could not be cleaned. Historical usage is preserved; check your configuration folder."); }
  };
  await syncPrices();
  const usageRequests = new Map<string, AIUsageStore>();
  // Electron's network stack follows the computer's system proxy. Keys stay in the main process.
  const aiClient = new AIClient((input, init) => net.fetch(input as string, init), async event => {
    const target = event.type === "start" ? usage() : usageRequests.get(event.id) ?? usage();
    if (event.type === "start") usageRequests.set(event.request.id, target);
    try { await target.record(event); } catch { target.reportFailure(); }
    finally { if (event.type === "finish") usageRequests.delete(event.id); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("ai:usage-changed"); }
  });
  aiService = new AIService(aiSettings, chats, aiClient, chat => mainWindow?.webContents.send("ai:chat", chat));
  translationService = new TranslationService(translationSettings, translationConnections, aiSettings, cache, aiClient);
  const translationChanged = () => mainWindow?.webContents.send("translation:changed");
  const aiHandler = (channel: string, action: (...args: any[]) => Promise<object>) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== mainWindow?.webContents) return { ok: false, error: "The AI workspace is unavailable" };
    try { return { ok: true, ...await action(...args) }; } catch (error) { return { ok: false, error: redactAIError(error) }; }
  });
  aiHandler("ai:providers", async () => ({ providers: await aiSettings.list() }));
  aiHandler("ai:price-providers", async () => ({ providers: await priceProviders() }));
  aiHandler("ai:save-provider", async (input: AIProviderInput) => { const providers = await aiSettings.save(input); await syncPrices(); translationChanged(); return { providers }; });
  aiHandler("ai:remove-provider", async (id: string) => { const providers = await aiSettings.remove(id); await syncPrices(); translationChanged(); return { providers }; });
  aiHandler("ai:clear-key", async (id: string) => { const providers = await aiSettings.clearKey(id); translationChanged(); return { providers }; });
  aiHandler("ai:preferences", async () => ({ systemPrompt: await aiSettings.preferences() }));
  aiHandler("ai:save-preferences", async (prompt: string) => ({ systemPrompt: await aiSettings.savePreferences(prompt) }));
  aiHandler("ai:models", async (id: string) => ({ models: await aiService.models(id) }));
  aiHandler("ai:test", async (id: string, model: string) => ({ message: await aiService.test(id, model, message => mainWindow?.webContents.send("ai:test-progress", message)) }));
  aiHandler("ai:stop-test", async () => { await aiService.stopTest(); return {}; });
  aiHandler("ai:chats", async () => ({ chats: await chats().list() }));
  aiHandler("ai:create-chat", async (provider: string, model: string) => ({ chat: await chats().create(provider, model) }));
  aiHandler("ai:rename-chat", async (id: string, title: string) => ({ chat: await chats().rename(id, title) }));
  aiHandler("ai:delete-chat", async (id: string) => { await aiService.remove(id); return {}; });
  aiHandler("ai:send", async (id: string, provider: string, model: string, text: string, retry?: boolean) => ({ chat: await aiService.send(id, provider, model, text, retry) }));
  aiHandler("ai:stop", async (id: string) => { await aiService.stop(id); return {}; });
  aiHandler("ai:usage", async (query: AIUsageQuery) => ({ usage: await usage().query(query) }));
  aiHandler("ai:prices", async () => ({ prices: await aiPrices.list(), usdToCny: await aiPrices.exchangeRate() }));
  aiHandler("ai:save-price", async (input: AIModelPriceInput) => {
    const provider = (await priceProviders()).find(value => value.id === input?.providerId);
    const model = provider?.baseUrl === input.baseUrl ? provider.models.find(model => model.id === input.modelId) : undefined;
    if (!model) throw new Error("Choose a currently configured service and model.");
    return { prices: await aiPrices.save({ ...input, providerName: provider!.name, modelName: model.name }) };
  });
  aiHandler("ai:save-exchange-rate", async (input: number) => {
    const usdToCny = await aiPrices.saveExchangeRate(input);
    mainWindow?.webContents.send("ai:usage-changed");
    return { usdToCny };
  });
  aiHandler("translation:settings", async () => ({ settings: await translationSettings.get(), providers: await translationConnections.list(), enabled: translationService.enabled, cache: await cache().stats().catch(() => ({ entries: 0, bytes: 0 })) }));
  aiHandler("translation:save-settings", async (input: TranslationSettings) => {
    await translationService.cancel();
    const providers = await (input?.mode === "custom" ? translationConnections : aiSettings).list();
    if (!input?.modelId || !providers.some(provider => provider.id === input.providerId)) throw Error("Choose a translation service and model first.");
    if (input.mode === "reuse" && !providers.find(provider => provider.id === input.providerId)?.models.some(model => model.id === input.modelId)) throw Error("Choose a model saved in AI Settings, or use a separate translation connection.");
    const settings = await translationSettings.save(input); await syncPrices(); translationChanged(); return { settings };
  });
  aiHandler("translation:save-provider", async (input: AIProviderInput) => { await translationService.cancel(); const providers = await translationConnections.save(input); await syncPrices(); translationChanged(); return { providers }; });
  aiHandler("translation:clear-key", async (id: string) => { await translationService.cancel(); const providers = await translationConnections.clearKey(id); translationChanged(); return { providers }; });
  aiHandler("translation:models", async (mode: TranslationSettings["mode"], id: string) => ({ models: await translationService.models(mode, id) }));
  aiHandler("translation:set-enabled", async (input: boolean) => { const enabled = await translationService.setEnabled(input); translationChanged(); return { enabled }; });
  aiHandler("translation:translate", async (id: string, text: string) => ({ result: await translationService.translate(id, text) }));
  aiHandler("translation:cancel", async (id?: string) => { await translationService.cancel(id); return {}; });
  aiHandler("translation:test", async () => ({ result: await translationService.translate(randomUUID(), TRANSLATION_TEST_TEXT, true) }));
  aiHandler("translation:clear-cache", async () => { await translationService.cancel(); const stats = await cache().clear(); translationChanged(); return { cache: stats }; });
  let assetsDirectory = dataDirectory;
  let assetsManager = new AssetStore(dataDirectory, managedAssetDirectory, systemAssetIds);
  const assetStore = () => {
    if (assetsDirectory !== dataDirectory) { assetsDirectory = dataDirectory; assetsManager = new AssetStore(dataDirectory, managedAssetDirectory, systemAssetIds); }
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
  ipcMain.handle("assets:reveal", async (_event, id: string) => {
    try { shell.showItemInFolder(await assetStore().filePath(id)); return { ok: true }; }
    catch (error) { return assetError(error); }
  });
  ipcMain.handle("assets:rename", async (_event, id: string, name: string) => {
    try { return { ok: true, asset: await assetStore().rename(id, name) }; }
    catch (error) { return assetError(error); }
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
  ipcMain.handle("foundation:inspect", async () => {
    try { return { ok: true, directories: await prepareResearchDirectories(directories.root, dataDirectory) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Unable to prepare Library and Research folders" }; }
  });
  ipcMain.handle("foundation:open-library", async () => {
    try {
      const error = await shell.openPath(directories.library);
      if (error) throw new Error(error);
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Unable to open Library" }; }
  });
  ipcMain.handle("data-location:change", async () => {
    if (!mainWindow) return { ok: false, error: "The main window is unavailable" };
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Choose LanCarbon data folder", buttonLabel: "Use This Folder", properties: ["openDirectory", "createDirectory"]
    });
    if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true, error: "Data location change canceled" };
    const target = path.resolve(selection.filePaths[0]);
    try {
      await translationService.shutdown(); await aiService.shutdown();
      await dataLocationManager.prepareTarget(dataDirectory, target);
      const current = await store.loadWorkspace();
      const targetStore = new NotesStore(target, bundledStarterContent, managedAssetDirectory);
      await prepareResearchDirectories(directories.root, target);
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
      await fs.mkdir(directories.pdfs, { recursive: true });
      const selection = await dialog.showSaveDialog(mainWindow, { title: "Export current page as PDF", defaultPath: path.join(directories.pdfs, pdfFileName(note.title)), filters: [{ name: "PDF document", extensions: ["pdf"] }], properties: ["showOverwriteConfirmation", "createDirectory"] });
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
}).catch(error => {
  dialog.showErrorBox("LanCarbon could not start", error instanceof Error ? error.message : "Unable to prepare the workspace");
  app.quit();
});

let aiQuitFlushed = false;
app.on("before-quit", event => {
  environmentManager?.cancel(); websiteServers.closeAll();
  if (aiService && !aiQuitFlushed) { event.preventDefault(); aiQuitFlushed = true; void Promise.all([aiService.shutdown(), translationService?.shutdown()]).finally(() => app.quit()); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
