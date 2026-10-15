import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_ASSET_BYTES } from "../src/shared/assets";
import type { LibraryStore } from "./library";
import { digest, managedDirectory, managedFile, validName, writeManaged } from "./resource-files";
interface EditSession { id: string; file: string; name: string; hash: string; systemManaged?: boolean; error?: string }
export function canOpenResource(name: string): boolean {
  return !/\.(?:exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|msi|msp|scr|pif|cpl|reg|lnk|url|scf|jar)$/i.test(name);
}
/** External apps edit a named working copy; each changed save becomes an immutable revision. */
export class ExternalEdits {
  private queue: Promise<unknown> = Promise.resolve();
  private seen = new Map<string, string>();
  constructor(private readonly data: string, private readonly library: string, private readonly store: LibraryStore) {}
  private async load(): Promise<EditSession[]> {
    const directory = await managedDirectory(this.data, "Library");
    try {
      const value = JSON.parse(await fs.readFile(path.join(directory, "edit-sessions.json"), "utf8"));
      if (value.version !== 1 || !Array.isArray(value.sessions) || !value.sessions.every((session: EditSession) => typeof session.id === "string" && /^(?:import:)?[a-f0-9]{64}\.[a-z0-9]{1,12}$/.test(session.id) && /^[a-f0-9]{64}$/.test(session.hash) && typeof session.name === "string" && session.file === `.Editing/${digest(Buffer.from(session.id))}/${validName(session.name)}`) || new Set(value.sessions.map((session: EditSession) => session.id)).size !== value.sessions.length) throw Error("Invalid external-edit records. Working copies have been preserved.");
      return value.sessions;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  private async save(sessions: EditSession[]) {
    const directory = await managedDirectory(this.data, "Library"), filename = path.join(directory, "edit-sessions.json"), temporary = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify({ version: 1, sessions }, null, 2), "utf8"); await fs.rename(temporary, filename); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private async syncSessions(sessions: EditSession[]) {
    let changed = false, dirty = false;
    for (const session of sessions) {
      try {
        const filename = await managedFile(this.library, session.file), before = await fs.stat(filename), signature = `${before.mtimeMs}:${before.ctimeMs}:${before.size}`;
        if (this.seen.get(session.id) === signature || Date.now() - before.mtimeMs < 700) continue;
        if (before.size > MAX_ASSET_BYTES) throw Error("The external save exceeds 100 MB. Its working copy is preserved.");
        const bytes = await fs.readFile(filename), after = await fs.stat(filename);
        if (before.mtimeMs !== after.mtimeMs || before.size !== after.size || bytes.length !== before.size) continue;
        const hash = digest(bytes);
        if (hash !== session.hash) {
          if (session.systemManaged) throw Error("Built-in tutorial resources cannot be updated. Save your edited copy separately.");
          await this.store.updateVersion(session.id, bytes); session.hash = hash; dirty = true; changed = true;
        }
        if (session.error) { delete session.error; dirty = true; changed = true; }
        this.seen.set(session.id, signature);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not import this external save.";
        if (session.error !== message) { session.error = message; changed = true; dirty = true; }
      }
    }
    if (dirty) await this.save(sessions);
    return { changed, errors: sessions.filter(session => session.error).map(session => `${session.name}: ${session.error}`) };
  }
  sync(): Promise<{ changed: boolean; errors: string[] }> {
    const action = this.queue.then(async () => this.syncSessions(await this.load())); this.queue = action.catch(() => undefined); return action;
  }
  prepare(id: string): Promise<string> {
    const action = this.queue.then(async () => {
      const sessions = await this.load(); await this.syncSessions(sessions);
      const current = await this.store.read(id);
      id = current.entry.documentId ?? id;
      if (!canOpenResource(current.entry.name)) throw Error("Programs, scripts and shortcuts are not opened as Library documents. Use Folder to inspect the file.");
      let session = sessions.find(session => session.id === id);
      if (session) {
        try {
          const filename = await managedFile(this.library, session.file), bytes = await fs.readFile(filename);
          // Keep an unsynchronized save intact. When another operation updated the original,
          // refresh only an unchanged working copy; never overwrite pending external edits.
          if (digest(bytes) === session.hash && session.hash !== digest(current.bytes)) { await writeManaged(this.library, session.file, current.bytes, true); session.hash = digest(current.bytes); this.seen.delete(id); await this.save(sessions); }
          return filename;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      const name = validName(current.entry.name), relative = `.Editing/${digest(Buffer.from(id))}/${name}`;
      await writeManaged(this.library, relative, current.bytes, true);
      const next: EditSession = { id, file: relative, name, hash: digest(current.bytes), ...(current.entry.systemManaged ? { systemManaged: true } : {}) };
      if (session) sessions.splice(sessions.indexOf(session), 1, next); else sessions.push(next);
      await this.save(sessions); this.seen.delete(id); return managedFile(this.library, relative);
    }); this.queue = action.catch(() => undefined); return action;
  }
}
