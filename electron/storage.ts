import { promises as fs } from "node:fs";
import path from "node:path";
import { createEmptyWorkspace, MAX_BOOK_PAGES, MAX_BOOKS, normalizeBooks, validateWorkspace } from "../src/shared/books";
import { normalizeNotes } from "../src/shared/notes";
import type { Note, WindowPreferences, WorkspaceFile } from "../src/shared/types";
import { validateBibliographies } from "../src/shared/bibliography";

export class NotesStore {
  private readonly notesPath: string;
  private readonly preferencesPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string, private readonly starterContentDirectory?: string) {
    this.notesPath = path.join(dataDirectory, "notes.json");
    this.preferencesPath = path.join(dataDirectory, "window.json");
  }

  async loadWorkspace(): Promise<{ workspace: WorkspaceFile; isFirstRun: boolean; migrated: boolean }> {
    try {
      const raw = await fs.readFile(this.notesPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WorkspaceFile> & { version?: number };
      if (parsed?.version === 2 && Array.isArray(parsed.notes) && Array.isArray(parsed.books)) {
        const notes = normalizeNotes(parsed.notes);
        const workspace: WorkspaceFile = { version: 2, notes, books: normalizeBooks(parsed.books, notes) };
        return { workspace, isFirstRun: false, migrated: false };
      }
      if (Array.isArray(parsed?.notes)) {
        return { workspace: createEmptyWorkspace(normalizeNotes(parsed.notes)), isFirstRun: false, migrated: true };
      }
      if (Array.isArray(parsed)) {
        return { workspace: createEmptyWorkspace(normalizeNotes(parsed)), isFirstRun: false, migrated: true };
      }
      throw new Error("Unrecognized workspace file version");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const starter = await this.loadStarterContent();
        return { workspace: starter ?? createEmptyWorkspace(), isFirstRun: true, migrated: false };
      }
      await this.backupCorruptedFile();
      return { workspace: createEmptyWorkspace(), isFirstRun: false, migrated: false };
    }
  }

  private async loadStarterContent(): Promise<WorkspaceFile | undefined> {
    if (!this.starterContentDirectory) return undefined;
    const starterWorkspace = path.join(this.starterContentDirectory, "notes.json");
    if (!(await fs.stat(starterWorkspace).catch(() => null))?.isFile()) return undefined;
    const parsed = JSON.parse(await fs.readFile(starterWorkspace, "utf8")) as Partial<WorkspaceFile>;
    if (parsed.version !== 2 || !Array.isArray(parsed.notes) || !Array.isArray(parsed.books)) throw new Error("Invalid starter workspace");
    const notes = normalizeNotes(parsed.notes);
    const workspace: WorkspaceFile = { version: 2, notes, books: normalizeBooks(parsed.books, notes) };
    if (validateWorkspace(workspace).length) throw new Error("Invalid starter workspace structure");
    const sourceManifest = path.join(this.starterContentDirectory, "assets.json");
    const sourceAssets = path.join(this.starterContentDirectory, "assets");
    if ((await fs.stat(sourceManifest).catch(() => null))?.isFile()) {
      await fs.mkdir(this.dataDirectory, { recursive: true });
      await fs.cp(sourceAssets, path.join(this.dataDirectory, "assets"), { recursive: true, force: false, errorOnExist: false });
      await fs.copyFile(sourceManifest, path.join(this.dataDirectory, "assets.json"));
    }
    return workspace;
  }

  async saveWorkspace(input: unknown): Promise<void> {
    if (!input || typeof input !== "object") throw new TypeError("Workspace data must be an object");
    const candidate = input as Partial<WorkspaceFile>;
    if (candidate.version !== 2 || !Array.isArray(candidate.notes) || !Array.isArray(candidate.books)) throw new TypeError("Invalid workspace data version");
    if (candidate.notes.length > 10_000) throw new TypeError("Note count exceeds the limit");
    if (!this.hasValidBookShape(candidate.books)) throw new TypeError("Book data contains invalid fields");
    const valid = candidate.notes.every(value => {
      if (!value || typeof value !== "object") return false;
      const note = value as Partial<Note>;
      return typeof note.id === "string" && note.id.length > 0 && note.id.length <= 200
        && typeof note.title === "string" && note.title.length <= 120
        && typeof note.content === "string" && note.content.length <= 2_000_000
        && typeof note.pinned === "boolean"
        && typeof note.createdAt === "string" && !Number.isNaN(Date.parse(note.createdAt))
        && typeof note.updatedAt === "string" && !Number.isNaN(Date.parse(note.updatedAt))
        && Array.isArray(note.tags) && note.tags.length <= 12
        && note.tags.every(tag => typeof tag === "string" && tag.length <= 40);
    });
    if (!valid) throw new TypeError("Note data contains invalid fields");
    const workspace: WorkspaceFile = { version: 2, notes: normalizeNotes(candidate.notes), books: candidate.books };
    const workspaceErrors = validateWorkspace(workspace);
    if (workspaceErrors.length) throw new TypeError(workspaceErrors.join("\n"));
    const write = this.writeQueue.then(() => this.writeWorkspaceFile(workspace));
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  private hasValidBookShape(books: unknown[]): books is WorkspaceFile["books"] {
    const validString = (value: unknown, maximum: number) => typeof value === "string" && value.length <= maximum;
    const validOptional = (value: unknown, maximum: number) => value === undefined || validString(value, maximum);
    const validAuthors = (value: unknown) => Array.isArray(value) && value.length <= 50 && value.every(author => author && typeof author === "object" && validString((author as { name?: unknown }).name, 200));
    const validStrings = (value: unknown, maximum = 100) => Array.isArray(value) && value.length <= maximum && value.every(item => validString(item, 200));
    if (books.length > MAX_BOOKS) return false;
    return books.every(raw => {
      if (!raw || typeof raw !== "object") return false;
      const book = raw as Record<string, unknown>;
      if (!validString(book.id, 200) || !(book.id as string) || !book.settings || typeof book.settings !== "object" || !book.pages || typeof book.pages !== "object" || Array.isArray(book.pages)) return false;
      const settings = book.settings as Record<string, unknown>;
      const publishing = settings.publishing as Record<string, unknown> | undefined;
      const validPublishing = publishing === undefined || (publishing && typeof publishing === "object"
        && validString(publishing.repository, 300) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(publishing.repository as string)
        && validString(publishing.repositoryUrl, 1_000) && /^https:\/\/github\.com\//.test(publishing.repositoryUrl as string)
        && validOptional(publishing.pagesUrl, 1_000) && validString(publishing.branch, 100)
        && (publishing.visibility === "PUBLIC" || publishing.visibility === "PRIVATE")
        && validString(publishing.initializedAt, 100) && !Number.isNaN(Date.parse(publishing.initializedAt as string))
        && (publishing.lastPublishedAt === undefined || (validString(publishing.lastPublishedAt, 100) && !Number.isNaN(Date.parse(publishing.lastPublishedAt as string))))
        && (publishing.lastCommit === undefined || (validString(publishing.lastCommit, 40) && /^[a-f0-9]{7,40}$/i.test(publishing.lastCommit as string))));
      if (!validString(settings.title, 200) || !validAuthors(settings.authors) || !validStrings(settings.keywords)
        || ![settings.subtitle, settings.siteTitle].every(value => validOptional(value, 500))
        || ![settings.description, settings.github].every(value => validOptional(value, 2_000))
        || ![settings.license, settings.logo, settings.favicon].every(value => validOptional(value, 500)) || !validateBibliographies(settings.bibliography) || !validPublishing) return false;
      const pageEntries = Object.entries(book.pages as Record<string, unknown>);
      if (pageEntries.length > MAX_BOOK_PAGES || !validStrings(book.rootPageIds, MAX_BOOK_PAGES) || !validString(book.homePageId, 200)
        || !validString(book.createdAt, 100) || !validString(book.updatedAt, 100)) return false;
      return pageEntries.every(([, rawPage]) => {
        if (!rawPage || typeof rawPage !== "object") return false;
        const page = rawPage as Record<string, unknown>;
        const metadata = page.metadata as Record<string, unknown> | undefined;
        return validString(page.id, 200) && validString(page.noteId, 200) && (page.sourceType === "markdown" || page.sourceType === "notebook")
          && validString(page.exportPath, 500) && typeof page.showInToc === "boolean" && validStrings(page.children, MAX_BOOK_PAGES)
          && metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)
          && validOptional(metadata.shortTitle, 200) && validOptional(metadata.description, 2_000) && validOptional(metadata.date, 50) && validOptional(metadata.label, 200)
          && (metadata.authors === undefined || validAuthors(metadata.authors)) && (metadata.keywords === undefined || validStrings(metadata.keywords));
      });
    });
  }

  private async writeWorkspaceFile(workspace: WorkspaceFile): Promise<void> {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    // Keep the full original workspace before the one-time guide consolidation.
    if (workspace.books.some(book => book.phase2GuideRevision === 1)) {
      try {
        const previous = await fs.readFile(this.notesPath, "utf8");
        const previousBooks = (JSON.parse(previous) as Partial<WorkspaceFile>).books ?? [];
        if (workspace.books.some(book => book.phase2GuideRevision === 1
          && previousBooks.some(old => old.id === book.id && old.phase2GuideRevision !== 1))) {
          await fs.writeFile(path.join(this.dataDirectory, `notes.before-phase2-consolidation-${Date.now()}.json`), previous, { encoding: "utf8", flag: "wx" });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const temporaryPath = `${this.notesPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(workspace, null, 2), "utf8");
    await fs.rename(temporaryPath, this.notesPath);
  }

  async loadWindowPreferences(): Promise<WindowPreferences | null> {
    try {
      const value = JSON.parse(await fs.readFile(this.preferencesPath, "utf8")) as Partial<WindowPreferences>;
      if (typeof value.width !== "number" || typeof value.height !== "number") return null;
      return {
        width: Math.max(900, value.width),
        height: Math.max(600, value.height),
        ...(typeof value.x === "number" ? { x: value.x } : {}),
        ...(typeof value.y === "number" ? { y: value.y } : {}),
        maximized: Boolean(value.maximized)
      };
    } catch {
      return null;
    }
  }

  async saveWindowPreferences(value: WindowPreferences): Promise<void> {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    await fs.writeFile(this.preferencesPath, JSON.stringify(value, null, 2), "utf8");
  }

  private async backupCorruptedFile(): Promise<void> {
    try {
      await fs.rename(this.notesPath, `${this.notesPath}.corrupt-${Date.now()}`);
    } catch {
      // The file may have disappeared between read and backup.
    }
  }
}
