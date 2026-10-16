import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("knowledgeParser", { job: () => ipcRenderer.invoke("knowledge-parser:job"), result: (value: unknown) => ipcRenderer.send("knowledge-parser:result", value), progress: (unit: number, total: number) => ipcRenderer.send("knowledge-parser:progress", unit, total) });
