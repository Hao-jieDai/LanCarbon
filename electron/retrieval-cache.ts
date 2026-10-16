import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RETRIEVAL_MAX_BYTES, RETRIEVAL_MAX_PASSAGES } from "../src/shared/retrieval";
import { managedDirectory, managedFile } from "./resource-files";
export class RetrievalCache {
  private database?: DatabaseSync;
  private opening?: Promise<DatabaseSync>;
  constructor(private readonly data: string) {}
  private async db() {
    if (this.database) return this.database;
    if (this.opening) return this.opening;
    this.opening = this.open(); try { return await this.opening; } finally { this.opening = undefined; }
  }
  private async open() {
    const directory = await managedDirectory(this.data, "Research/Retrieval"), file = path.join(directory, "vectors.sqlite"), existing = await fs.lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.size > RETRIEVAL_MAX_BYTES)) throw Error("Invalid vector cache. Clear the vector index and prepare it again.");
    const database = new DatabaseSync(file, { allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 3000, defensive: true });
    try {
      const application = Number(database.prepare("PRAGMA application_id").get()!.application_id), version = Number(database.prepare("PRAGMA user_version").get()!.user_version);
      if (existing && existing.size > 0 && (application !== 0x4c435247 || version !== 1)) throw Error("Unsupported vector cache. Clear the vector index and prepare it again.");
      database.exec("PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA page_size=4096; PRAGMA max_page_count=32768; PRAGMA auto_vacuum=INCREMENTAL;");
      database.exec("CREATE TABLE IF NOT EXISTS vectors (key TEXT PRIMARY KEY, profile TEXT NOT NULL, dimensions INTEGER NOT NULL CHECK(dimensions BETWEEN 1 AND 8192), vector BLOB NOT NULL CHECK(length(vector)=dimensions*4)); CREATE INDEX IF NOT EXISTS vector_profile ON vectors(profile); PRAGMA application_id=1279480391; PRAGMA user_version=1;");
      return this.database = database;
    } catch (error) { database.close(); throw error; }
  }
  async stats(profile: string) {
    const db = await this.db(), row = db.prepare("SELECT count(*) AS count, min(dimensions) AS dimensions, max(dimensions) AS maximum FROM vectors WHERE profile=?").get(profile)!;
    if (row.dimensions !== row.maximum) throw Error("Inconsistent cached dimensions. Clear and rebuild the vector index.");
    const file = await managedFile(this.data, "Research/Retrieval/vectors.sqlite"); return { count: Number(row.count), dimensions: row.dimensions === null ? undefined : Number(row.dimensions), bytes: (await fs.stat(file)).size };
  }
  async has(profile: string, key: string) { return !!(await this.db()).prepare("SELECT 1 FROM vectors WHERE profile=? AND key=?").get(profile, key); }
  async get(profile: string, key: string): Promise<Float32Array | undefined> {
    const row = (await this.db()).prepare("SELECT dimensions, vector FROM vectors WHERE profile=? AND key=?").get(profile, key); if (!row) return;
    const dimensions = Number(row.dimensions), bytes = Buffer.from(row.vector as Uint8Array);
    if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192 || bytes.length !== dimensions * 4) throw Error("Invalid cached vector. Clear and rebuild the vector index.");
    const vector = Float32Array.from({ length: dimensions }, (_, i) => bytes.readFloatLE(i * 4)); const norm = Math.hypot(...vector);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.005) throw Error("Invalid cached vector. Clear and rebuild the vector index."); return vector;
  }
  async put(profile: string, rows: Array<{ key: string; vector: Float32Array }>) {
    if (!rows.length) return;
    const db = await this.db(), existing = await this.stats(profile), dimensions = existing.dimensions ?? rows[0]?.vector.length;
    if (!dimensions || rows.some(row => row.vector.length !== dimensions || !Number.isFinite(Math.hypot(...row.vector)) || Math.abs(Math.hypot(...row.vector) - 1) > 0.005)) throw Error("Embedding dimensions changed. Clear and rebuild the vector index.");
    if (Number(db.prepare("SELECT count(*) AS count FROM vectors").get()!.count) + rows.length > RETRIEVAL_MAX_PASSAGES) throw Error("The vector index is full. Reduce the selected sources.");
    const insert = db.prepare("INSERT OR IGNORE INTO vectors(key,profile,dimensions,vector) VALUES(?,?,?,?)"); db.exec("BEGIN IMMEDIATE");
    try { for (const row of rows) { const bytes = Buffer.alloc(row.vector.length * 4); row.vector.forEach((n, i) => bytes.writeFloatLE(n, i * 4)); insert.run(row.key, profile, dimensions, bytes); } db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); if (String(error).includes("full")) throw Error("The vector cache reached 128 MB. Reduce the selected sources or clear it."); throw error; }
  }
  async prune(profile: string, keys: Set<string>) {
    const db = await this.db(), remove = db.prepare("DELETE FROM vectors WHERE key=?"); db.exec("BEGIN IMMEDIATE");
    try { for (const row of db.prepare("SELECT key,profile FROM vectors").all()) if (row.profile !== profile || !keys.has(String(row.key))) remove.run(row.key); db.exec("COMMIT"); db.exec("PRAGMA incremental_vacuum(256)"); } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  }
  close() { this.database?.close(); this.database = undefined; }
  async clear() { this.close(); await managedDirectory(this.data, "Research/Retrieval"); for (const name of ["vectors.sqlite", "vectors.sqlite-journal"]) { try { await fs.unlink(await managedFile(this.data, `Research/Retrieval/${name}`)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } } }
}
