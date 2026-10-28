import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { managedDirectory } from "./resource-files";
import { withAssetCatalog } from "./asset-catalog-lock";
import type { LibraryStore } from "./library";
import type { NotesStore } from "./storage";
import { createNote } from "../src/shared/notes";
import { validReaderId } from "../src/shared/readerTabs";
import { annotationLink, annotationNoteContent, validAnnotation, validAnnotationDraft, validAnnotationId, type AnnotationCollection, type AnnotationDraft, type ReadingAnnotation } from "../src/shared/annotations";

/** Sidecars follow the stable Library identity; the source file is never written. */
export class AnnotationStore {
  constructor(private readonly data: string, private readonly library: LibraryStore) {}
  private async source(id: string) {
    if (!validReaderId(id)) throw Error("Invalid document identity.");
    const { entry, bytes } = await this.library.read(id);
    if (!["pdf", "epub"].includes(entry.format)) throw Error("Annotations require a PDF or EPUB.");
    return { entry, documentId: entry.documentId ?? entry.id, fingerprint: createHash("sha256").update(bytes).digest("hex") };
  }
  private async file(id: string) {
    if (!validReaderId(id)) throw Error("Invalid document identity.");
    return path.join(await managedDirectory(this.data, "Library/Annotations"), `${createHash("sha256").update(id).digest("hex")}.json`);
  }
  private async read(id: string): Promise<AnnotationCollection> {
    const file = await this.file(id);
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16000000) throw Error("Invalid annotation file. Existing data has been preserved.");
      const value = JSON.parse(await fs.readFile(file, "utf8")) as AnnotationCollection;
      if (!value || value.version !== 1 || value.documentId !== id || !Array.isArray(value.annotations) || value.annotations.length > 10000 || value.annotations.some(a => !validAnnotation(a) || a.documentId !== id) || new Set(value.annotations.map(a => a.id)).size !== value.annotations.length) throw Error("Unsupported annotation data. Existing data has been preserved.");
      return value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, documentId: id, annotations: [] }; throw error; }
  }
  private async write(value: AnnotationCollection) {
    const file = await this.file(value.documentId), temporary = `${file}.${randomUUID()}.tmp`, json = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(json) > 16000000) throw Error("Annotation storage limit reached. Existing annotations are preserved.");
    try { await fs.writeFile(temporary, json, { flag: "wx" }); await fs.rename(temporary, file); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  list(id: string, notes?: NotesStore) {
    return withAssetCatalog(this.data, async () => {
      const source = await this.source(id), collection = await this.read(source.documentId);
      // Export history comes from the saved Notes, avoiding a second non-atomic write.
      const workspace = notes ? (await notes.loadWorkspace()).workspace : undefined;
      const prefix = `](${annotationLink(source.documentId, "")}`;
      const exports = workspace?.notes.filter(n => n.annotationSourceId === source.documentId || n.content.includes(prefix)).map(n => ({ noteId: n.id, createdAt: n.createdAt })) ?? [];
      return { collection, fingerprint: source.fingerprint, exports };
    });
  }
  save(id: string, draft: AnnotationDraft, annotationId?: string) {
    return withAssetCatalog(this.data, async () => {
      if (!validAnnotationDraft(draft) || (annotationId !== undefined && !validAnnotationId(annotationId))) throw Error("Invalid annotation. Select a shorter passage and try again.");
      const source = await this.source(id), collection = await this.read(source.documentId), old = annotationId ? collection.annotations.find(a => a.id === annotationId) : undefined;
      if (annotationId && !old) throw Error("This annotation no longer exists.");
      if (source.fingerprint !== draft.fingerprint || old && old.fingerprint !== source.fingerprint) throw Error("The original file has changed. Reload it before adding or editing annotations. Old annotations are preserved.");
      if (draft.anchor.kind !== source.entry.format) throw Error("Annotation location does not match this document.");
      if (!old && collection.annotations.length >= 10000) throw Error("This document has reached the annotation limit.");
      const now = new Date().toISOString();
      const annotation: ReadingAnnotation = old ? { ...old, comment: draft.comment, color: draft.color, kind: draft.kind, updatedAt: now } : { quote: draft.quote, comment: draft.comment, kind: draft.kind, color: draft.color, anchor: draft.anchor, fingerprint: draft.fingerprint, id: randomUUID(), documentId: source.documentId, fileVersion: source.entry.version ?? 1, createdAt: now, updatedAt: now };
      collection.annotations = old ? collection.annotations.map(a => a.id === old.id ? annotation : a) : [...collection.annotations, annotation];
      await this.write(collection); return { annotation };
    });
  }
  remove(id: string, annotationId: string) {
    return withAssetCatalog(this.data, async () => {
      if (!validAnnotationId(annotationId)) throw Error("Invalid annotation identity.");
      const source = await this.source(id), collection = await this.read(source.documentId);
      collection.annotations = collection.annotations.filter(a => a.id !== annotationId); await this.write(collection);
    });
  }
  exportNote(id: string, selected: string[] | undefined, notes: NotesStore) {
    return withAssetCatalog(this.data, async () => {
      if (selected !== undefined && (!Array.isArray(selected) || !selected.length || selected.length > 10000 || selected.some(s => !validAnnotationId(s)) || new Set(selected).size !== selected.length)) throw Error("Select valid annotations to export.");
      const source = await this.source(id), collection = await this.read(source.documentId);
      const chosen = selected ? collection.annotations.filter(a => selected.includes(a.id)) : collection.annotations;
      if (!chosen.length || selected && chosen.length !== selected.length) throw Error("Some annotations no longer exist. Refresh the list before exporting.");
      const note = createNote({ annotationSourceId: source.documentId, title: `Reading annotations — ${source.entry.name}`.slice(0, 120), content: annotationNoteContent(source.entry.name, source.documentId, chosen, new Date().toISOString()), tags: ["reading", "annotations"] });
      const { workspace } = await notes.loadWorkspace(), next = { ...workspace, notes: [...workspace.notes, note] };
      await notes.saveWorkspace(next); return { workspace: next, noteId: note.id };
    });
  }
}
