import { memo, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { renderMystPreview } from "../preview/mystPreview";
import type { AIChat as Conversation, AIMessage, AIProvider } from "../shared/ai";
import { ThemedSelect } from "./ThemedSelect";

const Message = memo(function Message({ message, onCopy }: { message: AIMessage; onCopy(text: string): void }) {
  const rendered = useMemo(() => message.role === "assistant" && message.status !== "streaming" && message.content ? renderMystPreview({ id: message.id, title: "AI reply", content: message.content }) : null, [message.content, message.status, message.role, message.id]);
  return <article className={`ai-message ai-message-${message.role}`} aria-label={message.role === "user" ? "Your message" : "AI reply"}>
    <header><strong>{message.role === "user" ? "You" : `${message.providerName} · ${message.modelName}`}</strong>{message.content && <button className="quiet-button" aria-label={`Copy ${message.role === "user" ? "message" : "reply"}`} onClick={() => onCopy(message.content)}>Copy</button>}</header>
    {message.reasoning && <details className="ai-reasoning"><summary>Reasoning</summary><pre>{message.reasoning}</pre></details>}
    {rendered && !rendered.error ? <div className="markdown-preview ai-markdown"><div className="preview-body" onClick={event => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }} dangerouslySetInnerHTML={{ __html: rendered.html }}/></div> : <div className="ai-plain-text">{message.content || (message.status === "streaming" ? (message.reasoning ? "Thinking…" : "Waiting for the model…") : "")}</div>}
    {message.status === "streaming" && <span className="ai-generating" role="status">Generating…</span>}
    {message.error && <p className={message.status === "error" ? "ai-error" : "modal-help"} role={message.status === "error" ? "alert" : "status"}>{message.error}</p>}
  </article>;
});

export function AIChat({ providers, chats, onChats, onSettings, draft, onDraft }: { providers: AIProvider[]; chats: Conversation[]; onChats(value: Conversation[] | ((previous: Conversation[]) => Conversation[])): void; onSettings(): void; draft: string; onDraft(value: string): void }) {
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem("lancarbon-active-chat") || ""; } catch { return ""; } });
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState("");
  const thread = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const chat = chats.find(item => item.id === selected) ?? chats[0];
  const ordered = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const options = providers.filter(provider => provider.hasKey).flatMap(provider => provider.models.filter(model => model.purpose === "chat").map(model => ({ value: JSON.stringify([provider.id, model.id]), label: `${provider.name} · ${model.name}` })));
  const savedChoice = chat ? JSON.stringify([chat.providerId, chat.modelId]) : "";
  const value = options.some(item => item.value === choice) ? choice : options.some(item => item.value === savedChoice) ? savedChoice : (chat?.messages.length ? undefined : options.find(item => { const [id, model] = JSON.parse(item.value); return providers.find(provider => provider.id === id)?.defaultModel === model; }))?.value ?? "";
  const generating = chat?.messages.at(-1)?.status === "streaming";
  const upsert = (next: Conversation) => onChats(previous => previous.some(item => item.id === next.id) ? previous.map(item => item.id === next.id ? next : item) : [next, ...previous]);
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const chooseChat = (id: string) => { setSelected(id); setChoice(""); setError(""); follow.current = true; };
  useEffect(() => { if (chat) { try { localStorage.setItem("lancarbon-active-chat", chat.id); } catch { /* optional selection */ } } }, [chat?.id]);
  useEffect(() => { if (thread.current && follow.current) thread.current.scrollTop = thread.current.scrollHeight; }, [chat?.id, chat?.messages]);
  const create = async () => { const [provider, model] = value ? JSON.parse(value) : ["", ""]; const result = await window.notesDesktop.ai!.createChat(provider, model); if (!result.ok) throw new Error(result.error); upsert(result.chat); chooseChat(result.chat.id); return result.chat; };
  const send = async (retry = false) => {
    if (!value) { onSettings(); return; }
    const [provider, model] = JSON.parse(value); let current = chat;
    if (!current) current = await create();
    follow.current = true;
    const result = await window.notesDesktop.ai!.send(current.id, provider, model, retry ? "" : draft, retry);
    if (!result.ok) throw new Error(result.error);
    // The event subscription owns streaming updates; avoid replacing a newer event with the initial reply.
    if (!retry) onDraft("");
  };
  return <div className="ai-chat-layout">
    <aside className="ai-chat-list" aria-label="Conversations"><button className="primary-button" disabled={busy} onClick={() => void act(async () => { await create(); onDraft(""); })}>New chat</button><div>{ordered.map(item => <button key={item.id} aria-pressed={chat?.id === item.id} onClick={() => chooseChat(item.id)}><span>{item.title}</span>{item.messages.at(-1)?.status === "streaming" && <small>Generating…</small>}</button>)}</div></aside>
    <div className="ai-chat-main"><header className="ai-chat-heading"><div><h1>Chat</h1><p>{chat?.title ?? "Start a conversation"}</p></div><div className="ai-actions">{chat && <><button className="quiet-button" disabled={busy || generating} onClick={() => { setTitle(chat.title); setDialog("rename"); }}>Rename chat</button><button className="quiet-button" disabled={busy || generating} onClick={() => setDialog("delete")}>Delete chat</button></>}</div></header>
      <div className="ai-chat-model"><ThemedSelect label="Chat model" value={value} placeholder="Choose a model" options={options} disabled={busy || generating} onChange={setChoice}/><button className="quiet-button" onClick={onSettings}>AI Settings</button></div>
      {chat?.messages.length && value && value !== savedChoice ? <p className="ai-context-notice">The next message and this conversation's history will be sent to the selected service.</p> : null}
      <div className="ai-thread" ref={thread} onScroll={() => { const element = thread.current; if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        {!chat?.messages.length && <div className="ai-chat-empty"><h2>A space to think</h2><p>{options.length ? "Choose a model and send your first message." : "Add an API key and a chat model in AI Settings to begin."}</p><p>Chat uses the text you send. Document reading and Library questions will be added later.</p>{!options.length && <button className="quiet-button" onClick={onSettings}>Configure AI</button>}</div>}
        {chat?.messages.map(message => <Message key={message.id} message={message} onCopy={text => { void navigator.clipboard.writeText(text).then(() => setNotice("Copied.")).catch(() => setError("Could not copy. Select the text and copy it manually.")); }}/>) }
      </div>
      <form className="ai-composer" onSubmit={event => { event.preventDefault(); if (!generating && !busy && draft.trim() && value) void act(() => send()); }}>
        {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p role="status" className="ai-notice">{notice}</p>}
        <textarea aria-label="Chat message" placeholder="Write a message…" value={draft} maxLength={100000} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>
        <div className="ai-composer-actions"><span>Enter to send · Shift+Enter for a new line</span><div className="ai-actions">{chat?.messages.at(-1)?.role === "assistant" && ["stopped", "error"].includes(chat.messages.at(-1)!.status) && <button className="quiet-button" type="button" disabled={busy || !value} onClick={() => void act(() => send(true))}>Retry reply</button>}{generating ? <button className="primary-button" type="button" disabled={busy} onClick={() => void act(async () => { const result = await window.notesDesktop.ai!.stop(chat!.id); if (!result.ok) throw new Error(result.error); })}>Stop generating</button> : <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !value}>Send</button>}</div></div>
      </form>
    </div>
    {dialog && chat && <div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label={dialog === "rename" ? "Rename conversation" : "Delete conversation"} onSubmit={event => { event.preventDefault(); void act(async () => { if (dialog === "rename") { const result = await window.notesDesktop.ai!.renameChat(chat.id, title); if (!result.ok) throw new Error(result.error); upsert(result.chat); } else { const result = await window.notesDesktop.ai!.deleteChat(chat.id); if (!result.ok) throw new Error(result.error); onChats(previous => previous.filter(item => item.id !== chat.id)); setSelected(""); } setDialog(null); }); }}><h2>{dialog === "rename" ? "Rename chat" : "Delete chat?"}</h2>{dialog === "rename" ? <label>Chat name<input aria-label="Chat name" autoFocus value={title} maxLength={120} onChange={event => setTitle(event.target.value)}/></label> : <p>This deletes “{chat.title}” and its messages from this computer.</p>}<footer><button className="quiet-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy || (dialog === "rename" && !title.trim())} type="submit">{dialog === "rename" ? "Save name" : "Delete conversation"}</button></footer></form></div>}
  </div>;
}
