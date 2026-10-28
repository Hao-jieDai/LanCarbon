import { createNote } from "./notes";
import type { Note } from "./types";

export const TODO_NOTE_ID = "lancarbon-personal-todo";
export function ensureTodoNote(notes: Note[]): { notes: Note[]; changed: boolean } {
  if (notes.some(note => note.id === TODO_NOTE_ID)) return { notes, changed: false };
  return { notes: [...notes, createNote({ id: TODO_NOTE_ID, title: "To do", pinned: true,
    content: "# To do\n\nYour personal checklist. Edit the tasks below or use the checklist controls. Your changes are kept when LanCarbon updates.\n\n你的个人待办清单。可以编辑下方任务，或使用清单控件勾选。软件升级时保留你的修改。\n\n- [ ] Add your first task / 添加第一项待办\n" })], changed: true };
}

export function todoTasks(content: string): { offset: number; checked: boolean; label: string }[] {
  const tasks: { offset: number; checked: boolean; label: string }[] = [];
  let offset = 0, fence = "", fenceLength = 0;
  for (const line of content.split(/(?<=\n)/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && !line.slice(marker[0].length).trim()) fence = "";
    } else if (!fence) {
      const match = /^( {0,3}[-+*] +\[)([ xX])(\] +)([^\r\n]*)/.exec(line);
      if (match) tasks.push({ offset: offset + match[1].length, checked: match[2] !== " ", label: match[4] });
    }
    offset += line.length;
  }
  return tasks;
}
export function toggleTodoTask(content: string, offset: number): string {
  const task = todoTasks(content).find(task => task.offset === offset);
  return task ? content.slice(0, offset) + (task.checked ? " " : "x") + content.slice(offset + 1) : content;
}
