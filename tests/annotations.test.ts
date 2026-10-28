// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { AssetStore } from "../electron/assets";
import { LibraryStore } from "../electron/library";
import { NotesStore } from "../electron/storage";
import { AnnotationStore } from "../electron/annotations";
import { annotationLink, parseAnnotationLink, type AnnotationDraft, validAnnotationDraft } from "../src/shared/annotations";
import { readerPdfFixture } from "./fixtures/reader";
import { readerEpubFixture } from "./fixtures/epub";
const roots: string[] = [];
async function fixture(epub = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-annotations-")); roots.push(root);
  const data = path.join(root, "Data"), assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets), notes = new NotesStore(data), store = new AnnotationStore(data, library);
  const file = path.join(root, epub ? "Original.epub" : "Original.pdf"), bytes = epub ? readerEpubFixture() : readerPdfFixture(); await fs.writeFile(file, bytes);
  const id = (await library.importFiles([file])).items[0].entry.id, fingerprint = createHash("sha256").update(bytes).digest("hex");
  const draft: AnnotationDraft = { fingerprint, kind: "highlight", color: "yellow", quote: "Climate investment", comment: "Check evidence.", anchor: epub ? { kind: "epub", chapter: "OEBPS/chapter.xhtml", chapterTitle: "Climate", chapterIndex: 0, start: 10, end: 28, prefix: "before", suffix: "after", paragraph: 2 } : { kind: "pdf", rects: [{ page: 2, x: .1, y: .2, width: .4, height: .03 }] } };
  return { root, data, library, assets, notes, store, file, bytes, id, draft };
}
afterEach(async () => { for (const root of roots.splice(0)) { const resolved = path.resolve(root); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("lancarbon-annotations-")) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5 }); } });
it("persists independent sidecars across rename, alias, restart and edits without writing the original", async () => {
  const f = await fixture(), a = (await f.store.save(f.id, f.draft)).annotation;
  await f.library.rename(f.id, "Renamed.pdf"); const alias = await f.assets.importFile(await f.library.filePath(f.id), false);
  const restarted = new AnnotationStore(f.data, f.library); expect((await restarted.list(alias.id)).collection.annotations).toEqual([a]);
  const edited = (await restarted.save(f.id, { ...f.draft, kind: "underline", comment: "Revised", quote: "do not move", anchor: { kind: "pdf", rects: [{ page: 9, x: 0, y: 0, width: .1, height: .1 }] } }, a.id)).annotation;
  expect(edited).toMatchObject({ id: a.id, comment: "Revised", kind: "underline", quote: a.quote, anchor: a.anchor });
  expect(await fs.readFile(f.file)).toEqual(f.bytes); expect((await f.library.read(f.id)).bytes).toEqual(f.bytes);
  await restarted.remove(f.id, a.id); expect((await restarted.list(f.id)).collection.annotations).toEqual([]);
});
it("serializes concurrent edits and preserves old-version excerpts while rejecting stale writes", async () => {
  const f = await fixture(); await Promise.all(Array.from({ length: 5 }, (_, i) => f.store.save(f.id, { ...f.draft, comment: String(i) })));
  expect((await f.store.list(f.id)).collection.annotations).toHaveLength(5);
  await f.library.updateVersion(f.id, readerPdfFixture(6)); const list = await f.store.list(f.id);
  expect(list.fingerprint).not.toBe(f.draft.fingerprint); expect(list.collection.annotations.every(a => a.fileVersion === 1)).toBe(true);
  await expect(f.store.save(f.id, f.draft)).rejects.toThrow("changed");
  await expect(f.store.save(f.id, { ...f.draft, fingerprint: list.fingerprint }, list.collection.annotations[0].id)).rejects.toThrow("changed");
  expect((await f.store.list(f.id)).collection.annotations).toHaveLength(5);
});
it.each([false, true])("exports sorted all/selected snapshots, usable links and prior-export warnings, preserving edited Notes (epub=%s)", async epub => {
  const f = await fixture(epub), a = (await f.store.save(f.id, f.draft)).annotation, b = (await f.store.save(f.id, { ...f.draft, comment: "", color: "blue" })).annotation;
  const first = await f.store.exportNote(f.id, [a.id], f.notes), note = first.workspace.notes.find(n => n.id === first.noteId)!;
  expect(note.content).toContain("**Original excerpt**"); expect(note.content).toContain("**My comment**"); expect(note.content).toContain(epub ? "Chapter 1" : "PDF file page 2");
  expect(parseAnnotationLink(annotationLink(f.id, a.id))).toEqual({ documentId: f.id, annotationId: a.id });
  note.content = "Personal revision with all original links removed."; await f.notes.saveWorkspace(first.workspace);
  expect((await f.store.list(f.id, f.notes)).exports).toHaveLength(1);
  const second = await f.store.exportNote(f.id, undefined, f.notes); expect(second.noteId).not.toBe(first.noteId);
  expect(second.workspace.notes.find(n => n.id === first.noteId)?.content).toBe(note.content);
  const content = second.workspace.notes.find(n => n.id === second.noteId)!.content; expect(content.match(/\*\*My comment\*\*/g)).toHaveLength(1); expect(content).toContain(annotationLink(f.id, b.id));
  await f.store.remove(f.id, a.id); await expect(f.store.exportNote(f.id, [a.id], f.notes)).rejects.toThrow("no longer exist");
});
it("rejects corrupt data, traversal, unsupported schemas and excessive/invalid locations without overwriting", async () => {
  const f = await fixture(); await expect(f.store.list("../outside.pdf")).rejects.toThrow("identity");
  expect(validAnnotationDraft({ ...f.draft, anchor: { kind: "pdf", rects: [{ page: 0, x: 1, y: 0, width: 1, height: 1 }] } })).toBe(false);
  await f.store.save(f.id, f.draft); const dir = path.join(f.data, "Library/Annotations"), file = path.join(dir, (await fs.readdir(dir))[0]);
  for (const value of ["broken json", JSON.stringify({ version: 99, annotations: [] })]) { await fs.writeFile(file, value); await expect(f.store.save(f.id, f.draft)).rejects.toThrow(); expect(await fs.readFile(file, "utf8")).toBe(value); }
  expect(parseAnnotationLink("lancarbon-annotation:../../escape/x")).toBeUndefined();
});
