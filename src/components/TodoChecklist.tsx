import { useState } from "react";
import { todoTasks, toggleTodoTask } from "../shared/todo";

export function TodoChecklist({ content, onChange }: { content: string; onChange(content: string): void }) {
  const [draft, setDraft] = useState("");
  const tasks = todoTasks(content);
  return <details className="todo-checklist" open data-translation-exclude>
    <summary>Checklist · {tasks.filter(task => task.checked).length} / {tasks.length}</summary>
    <div className="todo-items">{tasks.map(task => <label key={task.offset}><input type="checkbox" checked={task.checked} onChange={() => onChange(toggleTodoTask(content, task.offset))}/><span>{task.label || "Untitled task"}</span></label>)}</div>
    <form onSubmit={event => { event.preventDefault(); const text = draft.trim(); if (!text) return; onChange(content + (content.endsWith("\n") ? "" : "\n") + `- [ ] ${text}\n`); setDraft(""); }}><input aria-label="New task" placeholder="Add a task…" maxLength={500} value={draft} onChange={event => setDraft(event.target.value)}/><button className="text-button" disabled={!draft.trim()}>Add task</button></form>
  </details>;
}
