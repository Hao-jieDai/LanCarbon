import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AIChat } from "../src/shared/ai";
import type { ChatEvidence } from "../src/shared/grounding";

const ID = /^[a-zA-Z0-9-]{1,100}$/;
const HASH = /^[a-f0-9]{64}$/;
const CHAT_BYTES = 64_000_000;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function directory(folder: string) {
  await fs.mkdir(folder, { recursive: true });
  const stat = await fs.lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("Invalid chat storage directory. Existing files were preserved.");
}
async function read(file: string, limit: number): Promise<string | undefined> {
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw Error("Invalid or oversized chat data. Existing files were preserved."); return await fs.readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function atomic(file: string, value: unknown, limit: number) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > limit) throw Error("This conversation is too large to save. Export it and continue in a new chat.");
  const existing = await fs.lstat(file).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw Error("Invalid chat file. Existing files were preserved.");
  const temporary = file + "." + randomUUID() + ".tmp";
  try { await fs.writeFile(temporary, text, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}

/** Index publication is the migration/create/delete commit point. Evidence is
 * immutable and written first; legacy chats.json is retained as a rollback copy.
 * A failed write never replaces the last usable conversation or index. */
export class AIChatFiles {
  private readonly root: string;
  private readonly pool = new Map<string, Omit<ChatEvidence, "label">>();
  constructor(data: string) { this.root = path.join(data, "Research", "Chats"); }
  private async folders() { await directory(this.root); await directory(path.join(this.root, "conversations")); await directory(path.join(this.root, "evidence")); }
  private chatFile(id: string) { if (!ID.test(id)) throw Error("Invalid conversation ID"); return path.join(this.root, "conversations", id + ".json"); }
  async load(): Promise<AIChat[] | undefined> {
    await this.folders();
    const raw = await read(path.join(this.root, "index.json"), 2_000_000); if (raw === undefined) return undefined;
    const index = JSON.parse(raw);
    if (index.version !== 2 || !Array.isArray(index.ids) || index.ids.length > 10000 || index.ids.some((id: unknown) => typeof id !== "string" || !ID.test(id)) || new Set(index.ids).size !== index.ids.length) throw Error("Invalid chat index. Existing files were preserved.");
    const chats: AIChat[] = [];
    for (const id of index.ids) {
      const rawChat = await read(this.chatFile(id), CHAT_BYTES); if (!rawChat) throw Error("A conversation file is missing. Restore it from your backup; existing files were preserved.");
      const saved = JSON.parse(rawChat);
      if (saved.version !== 2 || saved.chat?.id !== id || !Array.isArray(saved.chat.messages)) throw Error("Invalid conversation file. Existing files were preserved.");
      for (const message of saved.chat.messages) if (message.grounding) {
        const { evidenceRefs, ...grounding } = message.grounding;
        if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 999) throw Error("Invalid saved evidence references.");
        const evidence: ChatEvidence[] = [];
        for (const ref of evidenceRefs) {
          if (!ref || !HASH.test(ref.key) || !/^S[1-9]\d{0,2}$/.test(ref.label)) throw Error("Invalid saved evidence reference.");
          let hit = this.pool.get(ref.key);
          if (!hit) {
            const text = await read(path.join(this.root, "evidence", ref.key + ".json"), 2_000_000);
            if (!text || digest(text) !== ref.key) throw Error("Saved evidence is missing or damaged. Restore your chat backup; no source text was replaced.");
            hit = JSON.parse(text); this.pool.set(ref.key, hit!);
          }
          evidence.push({ ...hit!, label: ref.label });
        }
        message.grounding = { ...grounding, evidence };
      }
      chats.push(saved.chat);
    }
    return chats;
  }
  async save(chat: AIChat): Promise<void> {
    await this.folders();
    const saved = structuredClone(chat);
    for (const message of saved.messages) if (message.grounding) {
      const { evidence, ...grounding } = message.grounding;
      const evidenceRefs: Array<{ key: string; label: string }> = [];
      for (const { label, ...hit } of evidence) {
        const text = JSON.stringify(hit), key = digest(text);
        if (!this.pool.has(key)) {
          const file = path.join(this.root, "evidence", key + ".json"), existing = await read(file, 2_000_000);
          if (existing !== undefined && digest(existing) !== key) throw Error("Saved evidence is damaged. Existing files were preserved.");
          if (existing === undefined) await atomic(file, hit, 2_000_000);
          this.pool.set(key, hit);
        }
        evidenceRefs.push({ key, label });
      }
      // Only the persisted representation uses references; callers always see
      // complete original evidence, including labels, page anchors and scores.
      (message as any).grounding = { ...grounding, evidenceRefs };
    }
    await atomic(this.chatFile(chat.id), { version: 2, chat: saved }, CHAT_BYTES);
  }
  async index(chats: AIChat[]) {
    if (chats.length > 10000) throw Error("The conversation count limit was reached. Export and remove unused chats.");
    await this.folders(); await atomic(path.join(this.root, "index.json"), { version: 2, ids: chats.map(chat => chat.id) }, 2_000_000);
  }
  async migrate(chats: AIChat[]) { for (const chat of chats) await this.save(chat); await this.index(chats); }
  async remove(id: string, remaining: AIChat[]) {
    await this.index(remaining);
    // Cleanup is best effort after the logical deletion commits. Shared
    // evidence stays as long as any remaining reply references it.
    const live = new Set(remaining.flatMap(chat => chat.messages.flatMap(message => (message.grounding?.evidence ?? []).map(({ label: _label, ...hit }) => digest(JSON.stringify(hit))))));
    await fs.unlink(this.chatFile(id)).catch(() => undefined);
    try {
      for (const name of await fs.readdir(path.join(this.root, "evidence"))) if (/^[a-f0-9]{64}\.json$/.test(name) && !live.has(name.slice(0, -5))) {
        await fs.unlink(path.join(this.root, "evidence", name)).catch(() => undefined); this.pool.delete(name.slice(0, -5));
      }
    } catch { /* The committed index remains authoritative if cleanup is blocked. */ }
  }
}
