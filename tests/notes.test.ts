import { describe, expect, it } from "vitest";
import { createInitialNotes, createNote, ensureReleaseReadme, filterNotes, getStats, normalizeNote, normalizeNotes, parseTags, RELEASE_README_CONTENT, RELEASE_README_ID, RELEASE_VERSION, sortNotes } from "../src/shared/notes";

describe("笔记核心逻辑", () => {
  it("创建完整且独立的笔记", () => {
    const first = createNote();
    const second = createNote();
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
    expect(first.title).toBe("Untitled Note");
    expect(first.tags).toEqual([]);
    expect(Date.parse(first.createdAt)).not.toBeNaN();
  });

  it("规范化损坏、超长或缺失的字段", () => {
    const note = normalizeNote({ id: "saved", title: 12, tags: ["有效", 4], pinned: 1 });
    expect(note).toMatchObject({ id: "saved", title: "Untitled Note", tags: ["有效"], pinned: true });
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNotes([null, createNote({ id: "valid" })])).toHaveLength(1);
  });

  it("把旧版中文占位标题迁移为英文", () => {
    expect(normalizeNote(createNote({ title: "无标题笔记" }))?.title).toBe("Untitled Note");
    expect(normalizeNote(createNote({ title: "无标题笔记补充" }))?.title).toBe("无标题笔记补充");
  });

  it("全新安装只创建版本 ReadMe", () => {
    const notes = createInitialNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: RELEASE_README_ID, title: "ReadMe", pinned: true });
    expect(notes[0].content).toBe(RELEASE_README_CONTENT);
    expect(notes[0].content).toContain(`LanCarbon ${RELEASE_VERSION}`);
  });

  it("升级时补充或更新 ReadMe 且不删除用户笔记", () => {
    const userNote = createNote({ id: "user", title: "Keep me" });
    const added = ensureReleaseReadme([userNote]);
    expect(added.changed).toBe(true);
    expect(added.notes).toEqual(expect.arrayContaining([userNote, expect.objectContaining({ id: RELEASE_README_ID })]));

    const stale = { ...added.notes.find(note => note.id === RELEASE_README_ID)!, content: "old release", pinned: false };
    const updated = ensureReleaseReadme([userNote, stale]);
    expect(updated.changed).toBe(true);
    expect(updated.notes.find(note => note.id === RELEASE_README_ID)).toMatchObject({ title: "ReadMe", content: RELEASE_README_CONTENT, pinned: true });
    expect(ensureReleaseReadme(updated.notes).changed).toBe(false);
  });

  it("优先置顶，其次按更新时间倒序", () => {
    const notes = [
      createNote({ id: "old", updatedAt: "2025-01-01T00:00:00.000Z" }),
      createNote({ id: "new", updatedAt: "2025-02-01T00:00:00.000Z" }),
      createNote({ id: "pin", pinned: true, updatedAt: "2024-01-01T00:00:00.000Z" })
    ];
    expect(sortNotes(notes).map(note => note.id)).toEqual(["pin", "new", "old"]);
  });

  it("搜索标题、正文和标签，并筛选置顶", () => {
    const notes = [
      createNote({ title: "旅行清单", content: "带上相机", tags: ["生活"], pinned: true }),
      createNote({ title: "读书", content: "设计中的设计", tags: ["阅读"] })
    ];
    expect(filterNotes(notes, "相机")).toHaveLength(1);
    expect(filterNotes(notes, "阅读")[0].title).toBe("读书");
    expect(filterNotes(notes, "", "pinned").map(note => note.title)).toEqual(["旅行清单"]);
  });

  it("统计字数和行数", () => {
    expect(getStats("你好 world\n第二行")).toEqual({ chars: 10, lines: 2 });
    expect(getStats("")).toEqual({ chars: 0, lines: 0 });
  });

  it("解析中英文逗号、去重、井号和数量上限", () => {
    expect(parseTags("#灵感, 工作，灵感,  ")).toEqual(["灵感", "工作"]);
    expect(parseTags(Array.from({ length: 20 }, (_, index) => `标签${index}`).join(","))).toHaveLength(12);
  });
});
