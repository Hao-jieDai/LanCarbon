import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { NotesDesktopApi } from "../src/shared/types";

const api: NotesDesktopApi = {
  retrieval: {
    models: (role, mode, providerId) => ipcRenderer.invoke("retrieval:models", role, mode, providerId),
    settings: () => ipcRenderer.invoke("retrieval:settings"),
    saveSettings: settings => ipcRenderer.invoke("retrieval:save-settings", settings),
    saveProvider: input => ipcRenderer.invoke("retrieval:save-provider", input),
    clearKey: id => ipcRenderer.invoke("retrieval:clear-key", id),
    test: role => ipcRenderer.invoke("retrieval:test", role),
    status: () => ipcRenderer.invoke("retrieval:status"),
    build: () => ipcRenderer.invoke("retrieval:build"),
    stop: () => ipcRenderer.invoke("retrieval:stop"),
    clear: () => ipcRenderer.invoke("retrieval:clear"),
    search: (text, ids, limit) => ipcRenderer.invoke("retrieval:search", text, ids, limit),
    onChanged: callback => { const listener = () => callback(); ipcRenderer.on("retrieval:changed", listener); return () => ipcRenderer.removeListener("retrieval:changed", listener); }
  },
  epub: {
    open: id => ipcRenderer.invoke("epub:open", id),
    chapter: (token, index) => ipcRenderer.invoke("epub:chapter", token, index),
    search: (token, query) => ipcRenderer.invoke("epub:search", token, query),
    release: token => ipcRenderer.invoke("epub:release", token),
    savePosition: (id, position) => ipcRenderer.invoke("epub:save-position", id, position)
  },
  reader: {
    open: id => ipcRenderer.invoke("reader:open", id),
    range: (token, begin, end) => ipcRenderer.invoke("reader:range", token, begin, end),
    release: token => ipcRenderer.invoke("reader:release", token),
    savePosition: (id, position) => ipcRenderer.invoke("reader:save-position", id, position)
  },
  knowledge: {
    inspect: () => ipcRenderer.invoke("knowledge:inspect"),
    start: (scope, rebuild) => ipcRenderer.invoke("knowledge:start", scope, rebuild),
    stop: () => ipcRenderer.invoke("knowledge:stop"),
    clear: () => ipcRenderer.invoke("knowledge:clear"),
    preview: (id, offset) => ipcRenderer.invoke("knowledge:preview", id, offset),
    search: query => ipcRenderer.invoke("knowledge:search", query),
    onChanged: callback => { const listener = () => callback(); ipcRenderer.on("knowledge:changed", listener); return () => ipcRenderer.removeListener("knowledge:changed", listener); }
  },
  library: {
    list: () => ipcRenderer.invoke("library:list"),
    choose: folderId => ipcRenderer.invoke("library:choose", folderId),
    importFiles: async (files, folderId) => {
      try {
        if (!Array.isArray(files) || !files.length || files.length > 20) throw Error("Choose up to 20 local PDF or EPUB files at a time.");
        const paths = files.map(file => webUtils.getPathForFile(file));
        if (paths.some(file => !file)) throw Error("Drop files from your computer or use Import PDF / EPUB.");
        return await ipcRenderer.invoke("library:import-files", paths, folderId);
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Unable to import files" }; }
    },
    rename: (id, name) => ipcRenderer.invoke("library:rename", id, name),
    reveal: id => ipcRenderer.invoke("library:reveal", id),
    open: id => ipcRenderer.invoke("library:open", id),
    saveCopy: (id, version) => ipcRenderer.invoke("library:save-copy", id, version),
    createFolder: (name, parentId) => ipcRenderer.invoke("library:create-folder", name, parentId),
    renameFolder: (id, name) => ipcRenderer.invoke("library:rename-folder", id, name),
    deleteFolder: id => ipcRenderer.invoke("library:delete-folder", id),
    move: (id, folderId, keepBoth) => ipcRenderer.invoke("library:move", id, folderId, keepBoth),
    moveMany: (ids, folderId, keepBoth) => ipcRenderer.invoke("library:move-many", ids, folderId, keepBoth),
    exportMany: ids => ipcRenderer.invoke("library:export-many", ids),
    remove: ids => ipcRenderer.invoke("library:remove", ids),
    versions: id => ipcRenderer.invoke("library:versions", id),
    onChanged: callback => { const listener = () => callback(); ipcRenderer.on("library:changed", listener); return () => ipcRenderer.removeListener("library:changed", listener); }
  },
  translation: {
    settings: () => ipcRenderer.invoke("translation:settings"),
    saveSettings: settings => ipcRenderer.invoke("translation:save-settings", settings),
    saveProvider: input => ipcRenderer.invoke("translation:save-provider", input),
    clearKey: id => ipcRenderer.invoke("translation:clear-key", id),
    models: (mode, id) => ipcRenderer.invoke("translation:models", mode, id),
    setEnabled: enabled => ipcRenderer.invoke("translation:set-enabled", enabled),
    translate: (id, text) => ipcRenderer.invoke("translation:translate", id, text),
    cancel: id => ipcRenderer.invoke("translation:cancel", id),
    test: () => ipcRenderer.invoke("translation:test"),
    clearCache: () => ipcRenderer.invoke("translation:clear-cache"),
    onChanged: callback => { const listener = () => callback(); ipcRenderer.on("translation:changed", listener); return () => ipcRenderer.removeListener("translation:changed", listener); }
  },
  ai: {
    providers: () => ipcRenderer.invoke("ai:providers"),
    priceProviders: () => ipcRenderer.invoke("ai:price-providers"),
    saveProvider: input => ipcRenderer.invoke("ai:save-provider", input),
    removeProvider: id => ipcRenderer.invoke("ai:remove-provider", id),
    clearKey: id => ipcRenderer.invoke("ai:clear-key", id),
    preferences: () => ipcRenderer.invoke("ai:preferences"),
    savePreferences: systemPrompt => ipcRenderer.invoke("ai:save-preferences", systemPrompt),
    models: id => ipcRenderer.invoke("ai:models", id),
    test: (id, modelId) => ipcRenderer.invoke("ai:test", id, modelId),
    stopTest: () => ipcRenderer.invoke("ai:stop-test"),
    onTestProgress: callback => { const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message); ipcRenderer.on("ai:test-progress", listener); return () => ipcRenderer.removeListener("ai:test-progress", listener); },
    chats: () => ipcRenderer.invoke("ai:chats"),
    sourceCatalogue: () => ipcRenderer.invoke("ai:source-catalogue"),
    setSources: (id, scope) => ipcRenderer.invoke("ai:set-sources", id, scope),
    openCitation: (id, message, label) => ipcRenderer.invoke("ai:open-citation", id, message, label),
    createChat: (providerId, modelId) => ipcRenderer.invoke("ai:create-chat", providerId, modelId),
    renameChat: (id, title) => ipcRenderer.invoke("ai:rename-chat", id, title),
    deleteChat: id => ipcRenderer.invoke("ai:delete-chat", id),
    send: (id, providerId, modelId, text, retry) => ipcRenderer.invoke("ai:send", id, providerId, modelId, text, retry),
    stop: id => ipcRenderer.invoke("ai:stop", id),
    onChat: callback => { const listener = (_event: Electron.IpcRendererEvent, chat: Parameters<typeof callback>[0]) => callback(chat); ipcRenderer.on("ai:chat", listener); return () => ipcRenderer.removeListener("ai:chat", listener); },
    balances: () => ipcRenderer.invoke("ai:balances"),
    saveBalance: input => ipcRenderer.invoke("ai:save-balance", input),
    removeBalance: source => ipcRenderer.invoke("ai:remove-balance", source),
    usage: query => ipcRenderer.invoke("ai:usage", query),
    prices: () => ipcRenderer.invoke("ai:prices"),
    savePrice: price => ipcRenderer.invoke("ai:save-price", price),
    saveExchangeRate: rate => ipcRenderer.invoke("ai:save-exchange-rate", rate),
    onUsageChanged: callback => { const listener = () => callback(); ipcRenderer.on("ai:usage-changed", listener); return () => ipcRenderer.removeListener("ai:usage-changed", listener); }
  },
  foundation: {
    inspect: () => ipcRenderer.invoke("foundation:inspect"),
    openLibrary: () => ipcRenderer.invoke("foundation:open-library")
  },
  assets: {
    reveal: id => ipcRenderer.invoke("assets:reveal", id),
    rename: (id, name) => ipcRenderer.invoke("assets:rename", id, name),
    remove: ids => ipcRenderer.invoke("assets:remove",ids),
    list: () => ipcRenderer.invoke("assets:list"),
    choose: imageOnly => ipcRenderer.invoke("assets:choose", imageOnly),
    import: (name, base64, imageOnly) => ipcRenderer.invoke("assets:import", name, base64, imageOnly),
    image: id => ipcRenderer.invoke("assets:image", id),
    saveCopy: id => ipcRenderer.invoke("assets:save-copy", id)
    ,chooseBibliography: () => ipcRenderer.invoke("assets:choose-bibliography")
  },
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: workspace => ipcRenderer.invoke("workspace:save", workspace),
  exportBook: bookId => ipcRenderer.invoke("book:export", bookId),
  exportPdf: noteId => ipcRenderer.invoke("page:export-pdf", noteId),
  onAssetConflict: callback => { const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]) => callback(request); ipcRenderer.on("assets:conflict", listener); return () => ipcRenderer.removeListener("assets:conflict", listener); },
  resolveAssetConflict: (id, choice) => ipcRenderer.invoke("assets:resolve-conflict", id, choice),
  validateBook: bookId => ipcRenderer.invoke("book:validate", bookId),
  inspectBuildEnvironment: () => ipcRenderer.invoke("book:build-environment"),
  inspectEnvironment: () => ipcRenderer.invoke("environment:inspect"),
  installEnvironmentTool: id => ipcRenderer.invoke("environment:install", id),
  repairEnvironmentPermissions: () => ipcRenderer.invoke("environment:repair-permissions"),
  cancelEnvironmentInstall: () => ipcRenderer.invoke("environment:cancel"),
  openEnvironmentInstructions: id => ipcRenderer.invoke("environment:instructions", id),
  openEnvironmentLog: () => ipcRenderer.invoke("environment:open-log"),
  onEnvironmentProgress: callback => { const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => callback(progress); ipcRenderer.on("environment:progress", listener); return () => ipcRenderer.removeListener("environment:progress", listener); },
  buildBook: (bookId, options) => ipcRenderer.invoke("book:build", bookId, options),
  openBuildFolder: bookId => ipcRenderer.invoke("book:open-build", bookId),
  openBookWebsite: bookId => ipcRenderer.invoke("book:open-website", bookId),
  getBookWebsite: bookId => ipcRenderer.invoke("book:website-status", bookId),
  startBookWebsite: bookId => ipcRenderer.invoke("book:website-start", bookId),
  stopBookWebsite: bookId => ipcRenderer.invoke("book:website-stop", bookId),
  inspectGitHubPublishing: bookId => ipcRenderer.invoke("github:inspect", bookId),
  setupGitHubPublishing: (bookId, request) => ipcRenderer.invoke("github:setup", bookId, request),
  publishGitHubBook: bookId => ipcRenderer.invoke("github:publish", bookId),
  startGitHubSignIn: () => ipcRenderer.invoke("github:sign-in"),
  openGitHubCliDownload: () => ipcRenderer.invoke("github:open-cli-download"),
  openGitHubUrl: url => ipcRenderer.invoke("github:open-url", url),
  getDataLocation: () => ipcRenderer.invoke("data-location:get"),
  changeDataLocation: () => ipcRenderer.invoke("data-location:change"),
  openDataLocation: () => ipcRenderer.invoke("data-location:open")
};

contextBridge.exposeInMainWorld("notesDesktop", api);
