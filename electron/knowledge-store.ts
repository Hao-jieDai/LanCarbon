import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { emptyKnowledgeScope, KNOWLEDGE_MAX_BYTES, KNOWLEDGE_MAX_CHUNKS, KNOWLEDGE_PARSER_VERSION, type KnowledgeExtraction, type KnowledgeHit, type KnowledgeRecord, type KnowledgeScope, type KnowledgeSource, type KnowledgeView } from "../src/shared/knowledge";
import { knowledgeTerms } from "../src/shared/knowledgeText";
import { knowledgeHash, selectedKnowledgeIds, validKnowledgeScope, type KnowledgeSnapshot } from "./knowledge-sources";
import { managedDirectory, managedFile } from "./resource-files";
import type { KnowledgeExtractor } from "./knowledge-extractor";
interface Settings { version: 1; scope: KnowledgeScope; enabled: boolean; paused: boolean }
interface CachedSource { version: 1; sourceId: string; fingerprint: string; extraction: KnowledgeExtraction }
const statuses = new Set(["pending", "processing", "ready", "partial", "failed", "missing", "unsupported"]);
export class KnowledgeStore {
  private settings: Settings = { version: 1, scope: emptyKnowledgeScope(), enabled: false, paused: false };
  private records = new Map<string, KnowledgeRecord>(); private loaded = false; private queue: Promise<unknown> = Promise.resolve();
  private error = ""; private epoch = 0; private controller?: AbortController; private job?: Promise<void>; private running = false; private timer?: ReturnType<typeof setTimeout>;
  private progress: KnowledgeView["progress"] = { completed: 0, total: 0 };
  constructor(private readonly data: string, private readonly snapshot: () => Promise<KnowledgeSnapshot>, private readonly readFile: (id: string) => Promise<Buffer>, private readonly extractor: KnowledgeExtractor, private readonly changed: () => void = () => {}) {}
  private serial<T>(work: () => Promise<T>): Promise<T> { const result = this.queue.then(work); this.queue = result.catch(() => undefined); return result; }
  private async readJson(name: string, max: number): Promise<any> { const file = await managedFile(this.data, `Research/Knowledge/${name}`); if ((await fs.stat(file)).size > max) throw Error("Knowledge index exceeds its size limit. Clear and rebuild it."); return JSON.parse(await fs.readFile(file, "utf8")); }
  private async writeJson(name: string, value: unknown) {
    const directory = await managedDirectory(this.data, "Research/Knowledge"), file = path.join(directory, name), temporary = `${file}.${randomUUID()}.tmp`;
    const existing = await fs.lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; }); if (existing?.isSymbolicLink() || existing && !existing.isFile()) throw Error("Knowledge index path is not a regular file.");
    try { await fs.writeFile(temporary, JSON.stringify(value), { flag: "wx" }); await fs.rename(temporary, file); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private async load() {
    if (this.loaded) return;
    try { const value = await this.readJson("scope.json", 2_000_000); if (value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.paused !== "boolean") throw Error("Invalid knowledge settings."); this.settings = { ...value, scope: validKnowledgeScope(value.scope) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try {
      const manifest = await this.readJson("manifest.json", 6_000_000);
      if (manifest.version !== 1 || manifest.parserVersion !== KNOWLEDGE_PARSER_VERSION || !Array.isArray(manifest.records) || manifest.records.length > 20000 || !manifest.records.every((record: KnowledgeRecord) => record && typeof record.sourceId === "string" && record.sourceId.length <= 330 && /^(note|file):/.test(record.sourceId) && /^[a-f0-9]{64}$/.test(record.fingerprint) && statuses.has(record.status) && Number.isSafeInteger(record.chunks) && record.chunks >= 0 && record.chunks <= KNOWLEDGE_MAX_CHUNKS && Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes <= KNOWLEDGE_MAX_BYTES && (record.message === undefined || typeof record.message === "string" && record.message.length <= 10000) && (record.indexedAt === undefined || typeof record.indexedAt === "string" && Number.isFinite(Date.parse(record.indexedAt))))) throw Error("Invalid knowledge index.");
      this.records = new Map(manifest.records.map((record: KnowledgeRecord) => [record.sourceId, record.status === "processing" ? { ...record, status: "pending", message: "Interrupted extraction will resume." } : record]));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.error = "The text index could not be read. Clear the index and build it again; original sources are preserved."; }
    this.loaded = true;
  }
  private saveManifest() { return this.writeJson("manifest.json", { version: 1, parserVersion: KNOWLEDGE_PARSER_VERSION, records: [...this.records.values()] }); }
  private cacheName(id: string) { return `${knowledgeHash(id)}.json`; }
  private async unlinkCache(id: string) { try { await fs.unlink(await managedFile(this.data, `Research/Knowledge/${this.cacheName(id)}`)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  private async reconcile(snapshot: KnowledgeSnapshot) {
    const selected = selectedKnowledgeIds(snapshot, this.settings.scope), sourceMap = new Map(snapshot.sources.map(source => [source.id, source])); let dirty = false;
    for (const id of this.records.keys()) if (!selected.has(id) || !sourceMap.has(id)) { await this.unlinkCache(id); this.records.delete(id); dirty = true; }
    for (const source of snapshot.sources) if (selected.has(source.id)) {
      const previous = this.records.get(source.id), status = source.unavailable ? "missing" : source.format === "other" ? "unsupported" : previous && previous.fingerprint === source.fingerprint && !["missing", "unsupported"].includes(previous.status) ? previous.status : "pending";
      if (!previous || previous.status !== status || previous.fingerprint !== source.fingerprint && previous.status !== "pending") {
        this.records.set(source.id, { sourceId: source.id, fingerprint: source.fingerprint, status, chunks: previous?.chunks ?? 0, bytes: previous?.bytes ?? 0, indexedAt: previous?.indexedAt, message: source.unavailable || (status === "unsupported" ? "Text indexing supports PDF, EPUB and Note/Book Markdown pages. This format is not supported yet." : status === "pending" ? undefined : previous?.message), processedUnits: previous?.processedUnits, totalUnits: previous?.totalUnits }); dirty = true;
      }
    }
    if (dirty && !this.error) { await this.saveManifest(); this.changed(); }
    return selected;
  }
  private bytes() { return [...this.records.values()].reduce((total, record) => total + record.bytes, 0); }
  async inspect(): Promise<KnowledgeView> {
    const view = await this.serial(async () => { await this.load(); const snapshot = await this.snapshot(), selected = await this.reconcile(snapshot); return { sources: snapshot.sources, folders: snapshot.folders, books: snapshot.books, scope: this.settings.scope, selectedIds: [...selected], records: [...this.records.values()], running: this.running, paused: this.settings.paused, enabled: this.settings.enabled, progress: { ...this.progress }, bytes: this.bytes(), limitBytes: KNOWLEDGE_MAX_BYTES, error: this.error || undefined }; });
    if (this.settings.enabled && !this.settings.paused && this.settings.scope.autoUpdate && !this.error) this.kick(); return view;
  }
  requestRefresh() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.inspect().catch(error => { this.error = error instanceof Error ? error.message : "Could not update the text index."; this.changed(); }); }, 400); this.timer.unref?.(); }
  async start(scope: KnowledgeScope, rebuild = false) {
    await this.serial(async () => {
      await this.load(); if (this.running) throw Error("Stop the current indexing task first."); if (this.error && !rebuild) throw Error(this.error);
      this.settings = { version: 1, scope: validKnowledgeScope(scope), enabled: true, paused: false }; await this.writeJson("scope.json", this.settings);
      if (rebuild) await this.clearRecords();
      await this.reconcile(await this.snapshot());
      for (const [id, record] of this.records) if (record.status === "failed") this.records.set(id, { ...record, status: "pending", message: undefined });
      await this.saveManifest(); this.changed();
    }); this.kick();
  }
  private kick() {
    if (this.running || this.settings.paused || this.error || ![...this.records.values()].some(record => record.status === "pending")) return;
    this.running = true; const epoch = ++this.epoch, controller = this.controller = new AbortController(); this.progress = { completed: 0, total: [...this.records.values()].filter(record => record.status === "pending").length }; this.changed();
    this.job = this.run(epoch, controller.signal).catch(error => { this.error = error instanceof Error ? error.message : "Indexing failed."; }).finally(() => { this.running = false; this.progress.current = undefined; this.extractor.idle(); this.changed(); });
  }
  private async run(epoch: number, signal: AbortSignal) {
    while (!signal.aborted && epoch === this.epoch) {
      const work = await this.serial(async () => {
        const snapshot = await this.snapshot(); await this.reconcile(snapshot); if (signal.aborted) return;
        const record = [...this.records.values()].find(record => record.status === "pending"); if (!record) return;
        this.progress.total = Math.max(this.progress.total, this.progress.completed + [...this.records.values()].filter(record => record.status === "pending").length);
        const source = snapshot.sources.find(source => source.id === record.sourceId)!;
        this.records.set(source.id, { ...record, fingerprint: source.fingerprint, status: "processing", message: undefined }); this.progress.current = source.title; this.progress.unit = undefined; this.progress.units = undefined; await this.saveManifest(); this.changed();
        return { source, content: snapshot.content.get(source.id) };
      });
      if (!work) break;
      try {
        const input = work.source.kind === "note" ? work.content! : await this.readFile(work.source.entityId);
        const extraction = await this.extractor.extract(work.source, input, signal, (unit, total) => { if (!signal.aborted) { this.progress.unit = unit; this.progress.units = total; this.changed(); } });
        validateExtraction(extraction);
        await this.serial(async () => {
          if (signal.aborted || epoch !== this.epoch) return;
          const fresh = await this.snapshot(); await this.reconcile(fresh); const source = fresh.sources.find(source => source.id === work.source.id), selected = selectedKnowledgeIds(fresh, this.settings.scope);
          if (!source || !selected.has(source.id) || source.unavailable || source.fingerprint !== work.source.fingerprint) return;
          if (!extraction.chunks.length) throw Error(extraction.message ?? "No readable text was found in this source.");
          const cached: CachedSource = { version: 1, sourceId: source.id, fingerprint: source.fingerprint, extraction }, bytes = Buffer.byteLength(JSON.stringify(cached));
          if (this.bytes() - (this.records.get(source.id)?.bytes ?? 0) + bytes > KNOWLEDGE_MAX_BYTES) throw Error("The text index reached 100 MB. Reduce the selection or clear the index.");
          await this.writeJson(this.cacheName(source.id), cached);
          this.records.set(source.id, { sourceId: source.id, fingerprint: source.fingerprint, status: extraction.partial ? "partial" : "ready", message: extraction.message, chunks: extraction.chunks.length, bytes, indexedAt: new Date().toISOString(), processedUnits: extraction.processedUnits, totalUnits: extraction.totalUnits }); await this.saveManifest();
        });
      } catch (error) {
        if (!signal.aborted) await this.serial(async () => { const record = this.records.get(work.source.id); if (record && record.fingerprint === work.source.fingerprint) { this.records.set(work.source.id, { ...record, status: "failed", message: error instanceof Error ? error.message : "Could not extract text." }); await this.saveManifest(); } });
      }
      this.progress.completed++; this.changed();
    }
  }
  async stop(manual = true) {
    clearTimeout(this.timer); const job = this.job;
    await this.serial(async () => { await this.load(); this.epoch++; this.controller?.abort(); if (manual) { this.settings.paused = true; await this.writeJson("scope.json", this.settings); } for (const [id, record] of this.records) if (record.status === "processing") this.records.set(id, { ...record, status: "pending", message: "Stopped. Update the index to continue." }); if (!this.error) await this.saveManifest(); });
    await job; this.changed();
  }
  private async clearRecords() {
    const directory = await managedDirectory(this.data, "Research/Knowledge");
    for (const name of await fs.readdir(directory)) if (/^[a-f0-9]{64}\.json$/.test(name) || name === "manifest.json") await fs.unlink(await managedFile(this.data, `Research/Knowledge/${name}`));
    this.records.clear(); this.error = ""; await this.saveManifest();
  }
  async clear() { await this.stop(); await this.serial(async () => { await this.clearRecords(); this.settings.enabled = false; await this.writeJson("scope.json", this.settings); }); this.changed(); }
  async corpus(): Promise<KnowledgeHit[]> {
    return this.serial(async () => {
      await this.load(); if (this.error) throw Error(this.error);
      const snapshot = await this.snapshot(), selected = await this.reconcile(snapshot), hits: KnowledgeHit[] = [];
      if (!this.settings.enabled) return hits;
      for (const source of snapshot.sources) {
        const record = this.records.get(source.id); if (!selected.has(source.id) || !record || !["ready", "partial"].includes(record.status) || record.fingerprint !== source.fingerprint || source.unavailable) continue;
        const cached = await this.readJson(this.cacheName(source.id), 12_000_000) as CachedSource;
        if (cached.version !== 1 || cached.sourceId !== source.id || cached.fingerprint !== source.fingerprint) throw Error("The text index changed. Update it before preparing retrieval."); validateExtraction(cached.extraction);
        for (const chunk of cached.extraction.chunks) { hits.push({ source, chunk, indexedAt: record.indexedAt, fingerprint: source.fingerprint }); if (hits.length > 40000) throw Error("Retrieval supports up to 40,000 passages. Reduce the selected sources."); }
      }
      return hits;
    });
  }
  async search(query: string, sourceId?: string, offset = 0): Promise<{ hits: KnowledgeHit[]; total: number }> {
    if (typeof query !== "string" || query.length > 200 || sourceId !== undefined && typeof sourceId !== "string" || !Number.isSafeInteger(offset) || offset < 0 || offset > KNOWLEDGE_MAX_CHUNKS) throw Error("Enter up to 200 characters to search extracted text.");
    return this.serial(async () => {
      await this.load(); const snapshot = await this.snapshot(), selected = await this.reconcile(snapshot), terms = knowledgeTerms(query), candidates: Array<KnowledgeHit & { score: number }> = []; let total = 0;
      for (const source of snapshot.sources) {
        const record = this.records.get(source.id); if (!selected.has(source.id) || sourceId && source.id !== sourceId || !record || !["ready", "partial"].includes(record.status) || record.fingerprint !== source.fingerprint || source.unavailable) continue;
        try {
          const cache = await this.readJson(this.cacheName(source.id), 12_000_000) as CachedSource;
          if (cache.version !== 1 || cache.sourceId !== source.id || cache.fingerprint !== source.fingerprint) throw Error("Stale extracted text. Rebuild this index."); validateExtraction(cache.extraction);
          for (const chunk of cache.extraction.chunks) { const text = chunk.text.toLocaleLowerCase(), score = terms.length ? terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) + (query.trim() && text.includes(query.toLocaleLowerCase().trim()) ? terms.length : 0) : 1; if (!score) continue; const index = total++; if (sourceId && (index < offset || index >= offset + 50)) continue; candidates.push({ source, chunk, indexedAt: record.indexedAt, fingerprint: record.fingerprint, score }); if (candidates.length > 200) { candidates.sort((a, b) => b.score - a.score); candidates.length = 100; } }
        } catch (error) { this.records.set(source.id, { ...record, status: "failed", message: error instanceof Error ? error.message : "Extracted text is unavailable. Update the index." }); await this.saveManifest(); this.changed(); }
      }
      candidates.sort((a, b) => b.score - a.score); return { hits: candidates.slice(0, 100).map(({ score: _score, ...hit }) => hit), total };
    });
  }
}
function validateExtraction(value: KnowledgeExtraction) {
  const positive = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  if (!value || !Array.isArray(value.chunks) || value.chunks.length > KNOWLEDGE_MAX_CHUNKS || typeof value.partial !== "boolean" || !Number.isSafeInteger(value.totalUnits) || value.totalUnits < 0 || !Number.isSafeInteger(value.processedUnits) || value.processedUnits < 0 || value.processedUnits > value.totalUnits || value.message !== undefined && (typeof value.message !== "string" || value.message.length > 10000) || !value.chunks.every(chunk => {
    if (!chunk || typeof chunk.id !== "string" || chunk.id.length > 100 || typeof chunk.text !== "string" || chunk.text.length > 1200 || !chunk.anchor) return false;
    const a = chunk.anchor;
    if (a.heading !== undefined && (typeof a.heading !== "string" || a.heading.length > 300) || a.fragment !== undefined && (typeof a.fragment !== "string" || a.fragment.length > 500)) return false;
    return a.kind === "markdown" ? positive(a.line) && positive(a.endLine) && a.endLine! >= a.line! : a.kind === "pdf" ? positive(a.page) : a.kind === "epub" && typeof a.chapter === "string" && a.chapter.length <= 2048 && Number.isSafeInteger(a.chapterIndex) && a.chapterIndex! >= 0 && positive(a.paragraph);
  })) throw Error("The parser returned invalid extracted text. Retry the source.");
}
