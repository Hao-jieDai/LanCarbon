import { contextBridge, ipcRenderer } from "electron";
import type { NotesDesktopApi } from "../src/shared/types";

const api: NotesDesktopApi = {
  assets: {
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
  validateBook: bookId => ipcRenderer.invoke("book:validate", bookId),
  inspectBuildEnvironment: () => ipcRenderer.invoke("book:build-environment"),
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
