// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createNote } from "../src/shared/notes";
import { createBook } from "../src/shared/books";
import { emptyKnowledgeScope } from "../src/shared/knowledge";
import { extractMarkdown, knowledgeTerms, textChunks } from "../src/shared/knowledgeText";
import { knowledgeSnapshot, selectedKnowledgeIds, validKnowledgeScope } from "../electron/knowledge-sources";
import { extractEpub } from "../electron/knowledge-epub";
import { KnowledgeStore } from "../electron/knowledge-store";
import { knowledgeHash } from "../electron/knowledge-sources";
import { AssetStore } from "../electron/assets";
import { LibraryStore } from "../electron/library";
import { epubFixture, pdfFixture } from "./fixtures/library";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith("lancarbon-knowledge-")) throw Error("Unsafe test cleanup"); await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); } });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-knowledge-")); roots.push(root); const data = path.join(root, "Data"); await fs.mkdir(data);
  const assets = new AssetStore(data, path.join(root, "Library/assets")), library = new LibraryStore(data, path.join(root, "Library"), assets);
  const note = createNote({ id: "writing", title: "Personal", content: "# Energy\n\nClimate policy reduces emissions.\n\n搁浅资产取决于政策。" }), { book, homeNote } = createBook("Research Book"); homeNote.content = "# Home\n\nCoal investment is uncertain.";
  const workspace = { version: 2 as const, notes: [note, homeNote], books: [book] };
  const snapshot = async () => knowledgeSnapshot(workspace, await library.list(), await library.folders());
  const extract = vi.fn(async (source: any, input: string | Buffer) => source.format === "epub" ? extractEpub(input as Buffer) : extractMarkdown(String(input)));
  const extractor = { extract, idle: vi.fn() }, store = new KnowledgeStore(data, snapshot, async id => (await library.read(id)).bytes, extractor);
  const settle = async () => { for (let i = 0; i < 200; i++) { const view = await store.inspect(); if (!view.running && !view.records.some(record => record.status === "pending" || record.status === "processing")) return view; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error("Indexing did not finish"); };
  return { root, data, assets, library, workspace, note, homeNote, book, store, snapshot, extract, extractor, settle };
}
it("extracts Markdown headings, tables, math and source lines without indexing link destinations", () => {
  const value = extractMarkdown("---\nprivate: meta\n---\n# Energy\n\nPolicy and [evidence](assets/" + "a".repeat(64) + ".pdf).\n\n| cost | value |\n| --- | --- |\n| Coal | $x^2$ |\n");
  expect(value.chunks[1].text).toBe("Policy and evidence."); expect(value.chunks[1].anchor).toMatchObject({ kind: "markdown", line: 6, endLine: 6, heading: "Energy" }); expect(value.chunks.some(chunk => chunk.text.includes("$x^2$"))).toBe(true); expect(JSON.stringify(value)).not.toContain("private: meta");
});
it("keeps reusable text from another chat while respecting each chat's individual exclusions", async () => {
  const f = await fixture(), full = { ...emptyKnowledgeScope(), bookIds: [f.book.id] };
  await f.store.prepare(full, new AbortController().signal, () => {});
  const calls = f.extract.mock.calls.length;
  const except = { ...full, noteIds: [f.note.id], excludedNoteIds: [f.homeNote.id] };
  const view = await f.store.prepare(except, new AbortController().signal, () => {});
  expect(selectedKnowledgeIds({ ...await f.snapshot() }, except)).toEqual(new Set([`note:${f.note.id}`]));
  expect(view.records.some(record => record.sourceId === `note:${f.homeNote.id}` && record.status === "ready")).toBe(true);
  await f.store.prepare(full, new AbortController().signal, () => {});
  expect(f.extract.mock.calls.length).toBe(calls + 1);
  await f.store.stop();
});
it("bounds extracted text and keeps page anchors on overlapping windows", () => {
  const value = textChunks([{ text: "x".repeat(2_500_000), anchor: { kind: "pdf", page: 3 } }]); expect(value.limited).toBe(true); expect(value.chunks.length).toBeLessThanOrEqual(2000); expect(value.chunks.every(chunk => chunk.text.length <= 1200 && chunk.anchor.page === 3)).toBe(true);
});
it("extracts EPUB paragraphs, heading and table positions while ignoring scripts", () => {
  const value = extractEpub(epubFixture({ "OEBPS/chapter.xhtml": '<html><head><title>Ignore title</title></head><body><h1 id="topic">Climate policy</h1><p>Carbon affects investment.<script>Ignore nested script</script></p><script>Do not index this</script><table><tr><td>Coal</td><td>20</td></tr></table></body></html>' }));
  expect(value.chunks.map(chunk => chunk.text)).toEqual(["Climate policy", "Carbon affects investment.", "Coal | 20"]); expect(value.chunks[1].anchor).toMatchObject({ kind: "epub", chapterIndex: 0, paragraph: 2, heading: "Climate policy" });
});
it("reports damaged EPUB chapters as partial rather than inventing complete coverage", () => {
  const bytes = epubFixture({ "OEBPS/content.opf": '<package><manifest><item id="a" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="b" href="missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>' }), value = extractEpub(bytes);
  expect(value).toMatchObject({ partial: true, totalUnits: 2, processedUnits: 1 }); expect(value.message).toContain("Chapter 2");
});
it("canonicalizes linked files, selects Book pages and attachments once, and excludes system content", async () => {
  const f = await fixture(), source = path.join(f.root, "paper.pdf"); await fs.writeFile(source, pdfFixture()); const imported = (await f.library.importFiles([source])).items[0].entry, linked = await f.assets.importFile(await f.library.filePath(imported.id), false);
  f.note.content += `\n[Paper](assets/${linked.id})`; f.homeNote.content += `\n[Paper](assets/${linked.id})`;
  f.workspace.notes.push(createNote({ id: "lancarbon-release-readme", title: "ReadMe", content: "Official" }));
  const snapshot = await f.snapshot(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id, "lancarbon-release-readme"], bookIds: [f.book.id] }, selected = selectedKnowledgeIds(snapshot, scope);
  expect(selected.size).toBe(3); expect([...selected].filter(id => id.startsWith("file:"))).toEqual([`file:${imported.id}`]); expect(snapshot.sources.find(source => source.entityId === f.homeNote.id)?.locations[0]).toMatchObject({ bookId: f.book.id, pageId: f.book.homePageId });
  expect(selectedKnowledgeIds(snapshot, { ...scope, includeSystem: true }).size).toBe(4);
});
it("does not broaden a deleted folder selection to all Imports", async () => {
  const f = await fixture(), source = path.join(f.root, "book.epub"); await fs.writeFile(source, epubFixture()); await f.library.importFiles([source]); const snapshot = await f.snapshot(); expect(selectedKnowledgeIds(snapshot, { ...emptyKnowledgeScope(), folderIds: [`folder_${"a".repeat(32)}`] }).size).toBe(0); expect(selectedKnowledgeIds(snapshot, { ...emptyKnowledgeScope(), folderIds: [null] }).size).toBe(1);
});
it("persists scopes and parsed passages, reuses unchanged sources, and refreshes changed writing", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id], bookIds: [f.book.id] }; await f.store.start(scope); let view = await f.settle(); expect(view.records.every(record => record.status === "ready")).toBe(true); expect(f.extract).toHaveBeenCalledTimes(2);
  expect((await f.store.search("搁浅资产")).hits[0].source.entityId).toBe(f.note.id); await f.store.start(scope); await f.settle(); expect(f.extract).toHaveBeenCalledTimes(2);
  f.note.title = "Renamed personal note"; expect((await f.store.inspect()).sources.find(source => source.entityId === f.note.id)?.title).toBe(f.note.title); expect(f.extract).toHaveBeenCalledTimes(2);
  f.note.content = "FreshPolicySignal replaces the prior writing."; await f.store.inspect(); view = await f.settle(); expect((await f.store.search("FreshPolicySignal")).hits).toHaveLength(1); expect((await f.store.search("emissions")).hits).toHaveLength(0); expect(f.extract).toHaveBeenCalledTimes(3);
  const restored = new KnowledgeStore(f.data, f.snapshot, async id => (await f.library.read(id)).bytes, f.extractor); expect((await restored.inspect()).scope).toEqual(scope); expect((await restored.search("FreshPolicySignal")).hits).toHaveLength(1); await restored.stop(false);
});
it("withholds outdated text when automatic updates are disabled, then allows an explicit update", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id], autoUpdate: false }; await f.store.start(scope); await f.settle(); f.note.content = "Replacement"; const view = await f.store.inspect(); expect(view.records[0].status).toBe("pending"); expect((await f.store.search("emissions")).hits).toHaveLength(0); await f.store.start(scope); await f.settle(); expect((await f.store.search("Replacement")).hits).toHaveLength(1);
});
it("removes deleted or deselected sources from search without changing personal writing", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id], bookIds: [f.book.id] }; await f.store.start(scope); await f.settle(); const original = f.homeNote.content; f.workspace.notes = f.workspace.notes.filter(note => note.id !== f.note.id); await f.store.inspect(); expect((await f.store.search("emissions")).hits).toHaveLength(0); await f.store.start(emptyKnowledgeScope()); expect((await f.store.inspect()).records).toHaveLength(0); expect(f.homeNote.content).toBe(original);
});
it("stops a pending extractor and keeps completed records without resurrecting late results", async () => {
  const f = await fixture(); let resolve!: (value: ReturnType<typeof extractMarkdown>) => void;
  f.extract.mockImplementationOnce(async (_source, _input, ..._rest) => new Promise<ReturnType<typeof extractMarkdown>>(done => { resolve = done; }));
  await f.store.start({ ...emptyKnowledgeScope(), noteIds: [f.note.id] }); for (let i = 0; !resolve && i < 100; i++) await new Promise(done => setTimeout(done, 5));
  const stopping = f.store.stop(); resolve(extractMarkdown("Late result")); await stopping; const view = await f.store.inspect(); expect(view.paused).toBe(true); expect(view.records[0].status).toBe("pending"); expect((await f.store.search("Late result")).hits).toHaveLength(0);
});
it("clears only index files, preserves selection and originals, and supports rebuild", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id] }; await f.store.start(scope); await f.settle(); await f.store.clear(); let view = await f.store.inspect(); expect(view.scope).toEqual(scope); expect(view.enabled).toBe(false); expect(view.bytes).toBe(0); expect(f.note.content).toContain("emissions"); await f.store.start(scope, true); view = await f.settle(); expect(view.records[0].status).toBe("ready");
});
it("reports unsupported and missing attachments without repeatedly invoking the parser", async () => {
  const f = await fixture(), doc = await f.assets.importBytes("Word.docx", Buffer.from("PK fixture"), false), source = path.join(f.root, "missing.epub"); await fs.writeFile(source, epubFixture()); const imported = (await f.library.importFiles([source])).items[0].entry; await fs.unlink(await f.library.filePath(imported.id));
  await f.store.start({ ...emptyKnowledgeScope(), fileIds: [doc.id, imported.id] }); const view = await f.store.inspect(); expect(view.records.map(record => record.status).sort()).toEqual(["missing", "unsupported"]); expect(f.extract).not.toHaveBeenCalled();
});
it("bounds and validates settings and supports bilingual keyword terms", () => { expect(() => validKnowledgeScope({ ...emptyKnowledgeScope(), folderIds: ["../../Library"] })).toThrow(); expect(knowledgeTerms("Climate 搁浅资产")).toContain("搁浅"); });
it("includes future Book pages and nested folder imports without expanding unrelated sources", async () => {
  const f = await fixture(), folder = await f.library.createFolder("Evidence", null), nested = await f.library.createFolder("Children", folder.id), scope = { ...emptyKnowledgeScope(), bookIds: [f.book.id], folderIds: [folder.id] };
  await f.store.start(scope); await f.settle();
  const next = createNote({ id: "future-page", title: "New evidence", content: "FutureBookSignal" }); f.workspace.notes.push(next); f.book.pages.newpage = { ...f.book.pages[f.book.homePageId], id: "newpage", noteId: next.id, exportPath: "new.md", children: [] }; f.book.rootPageIds.push("newpage");
  const included = path.join(f.root, "included.epub"), excluded = path.join(f.root, "excluded.epub"); await fs.writeFile(included, epubFixture()); await fs.writeFile(excluded, epubFixture({ "OEBPS/chapter.xhtml": "<html><body><p>ExcludedSignal</p></body></html>" })); const doc = (await f.library.importFiles([included], nested.id)).items[0].entry; await f.library.importFiles([excluded]);
  await f.store.inspect(); const view = await f.settle(); expect(view.selectedIds).toContain(`note:${next.id}`); expect(view.selectedIds).toContain(`file:${doc.id}`); expect((await f.store.search("FutureBookSignal")).total).toBe(1); expect((await f.store.search("ExcludedSignal")).total).toBe(0);
});
it("rejects damaged cached anchors and recovers by rebuilding without touching writing", async () => {
  const f = await fixture(), scope = { ...emptyKnowledgeScope(), noteIds: [f.note.id] }; await f.store.start(scope); await f.settle(); const original = f.note.content, file = path.join(f.data, "Research/Knowledge", `${knowledgeHash(`note:${f.note.id}`)}.json`), cached = JSON.parse(await fs.readFile(file, "utf8")); cached.extraction.chunks[0].anchor = { kind: "markdown", line: -2, endLine: "bad" }; await fs.writeFile(file, JSON.stringify(cached));
  expect((await f.store.search("policy")).hits).toEqual([]); expect((await f.store.inspect()).records[0].status).toBe("failed"); await f.store.start(scope, true); expect((await f.settle()).records[0].status).toBe("ready"); expect(f.note.content).toBe(original);
});
