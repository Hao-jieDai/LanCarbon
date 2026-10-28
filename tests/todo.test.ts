import { describe, it, expect } from "vitest";
import { ensureTodoNote, TODO_NOTE_ID, todoTasks, toggleTodoTask } from "../src/shared/todo";
import { createNote } from "../src/shared/notes";

describe("personal default To do", () => {
  it("adds a pinned stable note for fresh and existing users without replacing same-title notes", () => {
    for (const notes of [[], [createNote({ title: "To do", content: "Keep my list" })]]) {
      const result = ensureTodoNote(notes);
      expect(result.changed).toBe(true);
      expect(result.notes.slice(0, notes.length)).toEqual(notes);
      expect(result.notes.at(-1)).toMatchObject({ id: TODO_NOTE_ID, title: "To do", pinned: true });
      expect(ensureTodoNote(result.notes)).toEqual({ notes: result.notes, changed: false });
    }
  });
  it("preserves renamed, edited and unpinned personal lists across upgrades", () => {
    const edited = createNote({ id: TODO_NOTE_ID, title: "My work", content: "- [x] Done", pinned: false });
    expect(ensureTodoNote([edited])).toEqual({ notes: [edited], changed: false });
  });
  it("changes only the requested checkbox and skips fenced and indented code", () => {
    const content = "# Tasks\r\n- [ ] 中文 task\r\n```md\r\n- [ ] example\r\n```\r\n    - [ ] code\r\n* [X] Complete\r\n";
    const tasks = todoTasks(content);
    expect(tasks.map(task => task.label)).toEqual(["中文 task", "Complete"]);
    expect(toggleTodoTask(content, tasks[0].offset)).toBe(content.replace("- [ ] 中文", "- [x] 中文"));
    expect(toggleTodoTask(content, tasks[1].offset)).toBe(content.replace("* [X]", "* [ ]"));
    expect(toggleTodoTask(content, 0)).toBe(content);
  });
});
