import { BrowserWindow, ipcMain, session } from "electron";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { createHash } from "node:crypto";
import { validOcrPage, type OcrPage } from "../src/shared/ocr";
import type { OcrStore } from "./ocr-store";
import type { KnowledgeExtraction, KnowledgeSource } from "../src/shared/knowledge";
export interface KnowledgeExtractor { extract(source: KnowledgeSource, input: string | Buffer, signal: AbortSignal, progress: (unit: number, total: number, message?: string) => void): Promise<KnowledgeExtraction>; idle(): void }
export class LocalKnowledgeExtractor implements KnowledgeExtractor {
  private worker?: Worker;
  private pdfQueue: Promise<unknown> = Promise.resolve();
  private pdfJobs = new Map<number, { bytes: Uint8Array; fingerprint: string; onlyPage?: number; force?: boolean; cache: OcrStore; result(value: any): void; progress(unit: number, total: number, message?: string): void }>();
  constructor(private readonly cache: () => OcrStore) {
    ipcMain.handle("knowledge-parser:job", event => { const job = this.pdfJobs.get(event.sender.id); if (!job) throw Error("Text extraction has ended."); return { bytes: job.bytes, onlyPage: job.onlyPage, force: job.force }; });
    ipcMain.handle("knowledge-parser:cached-ocr", (event, page) => { const job = this.pdfJobs.get(event.sender.id); if (!job) throw Error("Text extraction has ended."); return job.cache.get(job.fingerprint, page); });
    ipcMain.handle("knowledge-parser:save-ocr", (event, value) => { const job = this.pdfJobs.get(event.sender.id); if (!job || !validOcrPage(value) || job.onlyPage && job.onlyPage !== value.page) throw Error("Invalid OCR page."); return job.cache.put(job.fingerprint, value); });
    ipcMain.on("knowledge-parser:result", (event, value) => this.pdfJobs.get(event.sender.id)?.result(value));
    ipcMain.on("knowledge-parser:progress", (event, unit, total, message) => { if (Number.isSafeInteger(unit) && Number.isSafeInteger(total) && unit >= 0 && total >= unit && total <= 1_000_000) this.pdfJobs.get(event.sender.id)?.progress(unit, total, typeof message === "string" ? message.slice(0, 300) : undefined); });
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
  async recognize(bytes: Buffer, page: number | undefined, signal: AbortSignal, progress: (unit: number, total: number, message?: string) => void, force = false): Promise<KnowledgeExtraction & { ocrPage?: OcrPage }> { return this.pdf(bytes, signal, progress, { onlyPage: page, force }); }
  private pdf(bytes: Buffer, signal: AbortSignal, progress: (unit: number, total: number, message?: string) => void, options: { onlyPage?: number; force?: boolean } = {}): Promise<KnowledgeExtraction & { ocrPage?: OcrPage }> {
    // Capture the data-root cache before waiting. A queued job must never write into a newly selected workspace.
    const cache = this.cache(), task = this.pdfQueue.catch(() => undefined).then(() => { signal.throwIfAborted(); return this.runPdf(bytes, signal, progress, cache, options); });
    this.pdfQueue = task.catch(() => undefined);
    return new Promise((resolve, reject) => { const abort = () => reject(Error("Indexing stopped.")); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort)); });
  }
  private async runPdf(bytes: Buffer, signal: AbortSignal, progress: (unit: number, total: number, message?: string) => void, cache: OcrStore, options: { onlyPage?: number; force?: boolean }): Promise<KnowledgeExtraction & { ocrPage?: OcrPage }> {
    const isolated = session.fromPartition("knowledge-text-parser", { cache: false });
    const dev = process.env.VITE_DEV_SERVER_URL;
    isolated.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => callback({ cancel: !dev || new URL(details.url).origin !== new URL(dev).origin }));
    const window = new BrowserWindow({ show: false, webPreferences: { session: isolated, preload: path.join(__dirname, "knowledge-parser-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" })); window.webContents.on("will-navigate", event => event.preventDefault());
    const id = window.webContents.id;
    return new Promise<KnowledgeExtraction & { ocrPage?: OcrPage }>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error, result?: KnowledgeExtraction & { ocrPage?: OcrPage }) => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(deadline); signal.removeEventListener("abort", abort); this.pdfJobs.delete(id); if (!window.isDestroyed()) window.destroy(); error ? reject(error) : resolve(result!); };
      const abort = () => finish(Error("Indexing stopped."));
      const timeout = () => finish(Error("PDF recognition timed out. Completed OCR pages are saved; retry or choose fewer pages."));
      const timer = setTimeout(timeout, 180_000), deadline = setTimeout(timeout, 30 * 60_000);
      signal.addEventListener("abort", abort, { once: true });
      window.once("closed", () => finish(Error("PDF text extraction stopped.")));
      window.webContents.once("render-process-gone", () => finish(Error("PDF text extraction stopped. Retry this file.")));
      this.pdfJobs.set(id, { bytes: Uint8Array.from(bytes), fingerprint: createHash("sha256").update(bytes).digest("hex"), cache, ...options, progress: (unit, total, message) => { timer.refresh(); progress(unit, total, message); }, result: value => value?.error ? finish(Error(String(value.error))) : options.onlyPage !== undefined && !validOcrPage(value?.ocrPage) ? finish(Error("OCR returned invalid page text.")) : finish(undefined, value) });
      void (dev ? window.loadURL(new URL("knowledge.html", `${dev}/`).href) : window.loadFile(path.join(__dirname, "../../dist/knowledge.html"))).catch(error => finish(error));
    });
  }
  idle() { if (this.worker) { void this.worker.terminate(); this.worker = undefined; } }
}
