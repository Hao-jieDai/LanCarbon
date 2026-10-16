import { BrowserWindow, ipcMain, session } from "electron";
import { Worker } from "node:worker_threads";
import path from "node:path";
import type { KnowledgeExtraction, KnowledgeSource } from "../src/shared/knowledge";
export interface KnowledgeExtractor { extract(source: KnowledgeSource, input: string | Buffer, signal: AbortSignal, progress: (unit: number, total: number) => void): Promise<KnowledgeExtraction>; idle(): void }
export class LocalKnowledgeExtractor implements KnowledgeExtractor {
  private worker?: Worker;
  private pdfJobs = new Map<number, { bytes: Uint8Array; result(value: any): void; progress(unit: number, total: number): void }>();
  constructor() {
    ipcMain.handle("knowledge-parser:job", event => { const job = this.pdfJobs.get(event.sender.id); if (!job) throw Error("Text extraction has ended."); return { bytes: job.bytes }; });
    ipcMain.on("knowledge-parser:result", (event, value) => this.pdfJobs.get(event.sender.id)?.result(value));
    ipcMain.on("knowledge-parser:progress", (event, unit, total) => { if (Number.isSafeInteger(unit) && Number.isSafeInteger(total) && unit >= 0 && total >= unit && total <= 1_000_000) this.pdfJobs.get(event.sender.id)?.progress(unit, total); });
  }
  extract(source: KnowledgeSource, input: string | Buffer, signal: AbortSignal, progress: (unit: number, total: number) => void): Promise<KnowledgeExtraction> {
    if (signal.aborted) return Promise.reject(Error("Indexing stopped."));
    return source.format === "pdf" ? this.pdf(input as Buffer, signal, progress) : this.text(source, input, signal, progress);
  }
  private text(source: KnowledgeSource, input: string | Buffer, signal: AbortSignal, progress: (unit: number, total: number) => void): Promise<KnowledgeExtraction> {
    const worker = this.worker ??= new Worker(path.join(__dirname, "knowledge-worker.js"), { resourceLimits: { maxOldGenerationSizeMb: 256 } });
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, result?: KnowledgeExtraction) => { clearTimeout(timer); signal.removeEventListener("abort", abort); worker.removeListener("message", message); worker.removeListener("error", failed); worker.removeListener("exit", exited); error ? reject(error) : resolve(result!); };
      const abort = () => { if (this.worker === worker) this.worker = undefined; void worker.terminate(); finish(Error("Indexing stopped.")); };
      const failed = (error: Error) => { this.worker = undefined; finish(error); };
      const exited = () => { this.worker = undefined; finish(Error("Text extraction worker stopped. Retry this source.")); };
      const message = (value: any) => { if (value.progress) progress(value.progress.unit, value.progress.total); else if (value.error) finish(Error(value.error)); else finish(undefined, value.result); };
      const timer = setTimeout(() => { abort(); }, 120_000);
      signal.addEventListener("abort", abort, { once: true }); worker.on("message", message); worker.once("error", failed); worker.once("exit", exited);
      worker.postMessage({ kind: source.format, ...(typeof input === "string" ? { content: input } : { bytes: Uint8Array.from(input) }) });
    });
  }
  private async pdf(bytes: Buffer, signal: AbortSignal, progress: (unit: number, total: number) => void): Promise<KnowledgeExtraction> {
    const isolated = session.fromPartition("knowledge-text-parser", { cache: false });
    const dev = process.env.VITE_DEV_SERVER_URL;
    isolated.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => callback({ cancel: !dev || new URL(details.url).origin !== new URL(dev).origin }));
    const window = new BrowserWindow({ show: false, webPreferences: { session: isolated, preload: path.join(__dirname, "knowledge-parser-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" })); window.webContents.on("will-navigate", event => event.preventDefault());
    const id = window.webContents.id;
    return new Promise<KnowledgeExtraction>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error, result?: KnowledgeExtraction) => { if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener("abort", abort); this.pdfJobs.delete(id); if (!window.isDestroyed()) window.destroy(); error ? reject(error) : resolve(result!); };
      const abort = () => finish(Error("Indexing stopped."));
      const timer = setTimeout(() => finish(Error("PDF text extraction timed out. Try a smaller document.")), 120_000);
      signal.addEventListener("abort", abort, { once: true });
      window.once("closed", () => finish(Error("PDF text extraction stopped.")));
      window.webContents.once("render-process-gone", () => finish(Error("PDF text extraction stopped. Retry this file.")));
      this.pdfJobs.set(id, { bytes: Uint8Array.from(bytes), progress, result: value => value?.error ? finish(Error(String(value.error))) : finish(undefined, value) });
      void (dev ? window.loadURL(new URL("knowledge.html", `${dev}/`).href) : window.loadFile(path.join(__dirname, "../../dist/knowledge.html"))).catch(error => finish(error));
    });
  }
  idle() { if (this.worker) { void this.worker.terminate(); this.worker = undefined; } }
}
