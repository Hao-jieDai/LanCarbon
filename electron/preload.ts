import { contextBridge, ipcRenderer } from "electron";
import type { NotesDesktopApi } from "../src/shared/types";

const api: NotesDesktopApi = {
  ai: {
    providers: () => ipcRenderer.invoke("ai:providers"),
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
    createChat: (providerId, modelId) => ipcRenderer.invoke("ai:create-chat", providerId, modelId),
    renameChat: (id, title) => ipcRenderer.invoke("ai:rename-chat", id, title),
    deleteChat: id => ipcRenderer.invoke("ai:delete-chat", id),
    send: (id, providerId, modelId, text, retry) => ipcRenderer.invoke("ai:send", id, providerId, modelId, text, retry),
    stop: id => ipcRenderer.invoke("ai:stop", id),
    onChat: callback => { const listener = (_event: Electron.IpcRendererEvent, chat: Parameters<typeof callback>[0]) => callback(chat); ipcRenderer.on("ai:chat", listener); return () => ipcRenderer.removeListener("ai:chat", listener); }
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
