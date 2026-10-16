import { memo, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { renderMystPreview } from "../preview/mystPreview";
import type { AIChat as Conversation, AIMessage, AIProvider } from "../shared/ai";
import { ChatSources } from "./ChatSources";
import { emptyKnowledgeScope, selectedKnowledgeSources, type KnowledgeScope } from "../shared/knowledge";
import { hasChatSources, citationLocation, citedLabels, type ChatSourceCatalogue, type CitationTarget } from "../shared/grounding";
import { ThemedSelect } from "./ThemedSelect";

const Message = memo(function Message({ message, onCopy, onCitation }: { message: AIMessage; onCopy(text: string): void; onCitation(messageId: string, label: string): void }) {
  const evidence = message.grounding?.evidence ?? [], labels = citedLabels(message.content);
  const [expanded, setExpanded] = useState(false);
  const referenced = message.content.replace(/\[(S[1-9]\d{0,2})\]/g, (text, label: string) => evidence.some(hit => hit.label === label) ? `[${label}](#evidence-${message.id}-${label})` : text);
  const rendered = useMemo(() => message.role === "assistant" && message.status !== "streaming" && message.content ? renderMystPreview({ id: message.id, title: "AI reply", content: referenced }) : null, [referenced, message.status, message.role, message.id]);
  return <article className={`ai-message ai-message-${message.role}`} aria-label={message.role === "user" ? "Your message" : "AI reply"}>
    <header><strong>{message.role === "user" ? "You" : `${message.providerName} · ${message.modelName}`}</strong>{message.content && <button className="quiet-button" aria-label={`Copy ${message.role === "user" ? "message" : "reply"}`} onClick={() => onCopy(message.content)}>Copy</button>}</header>
    {message.reasoning && <details className="ai-reasoning"><summary>Reasoning</summary><pre>{message.reasoning}</pre></details>}
    {rendered && !rendered.error ? <div className="markdown-preview ai-markdown"><div className="preview-body" onClick={event => { const link = (event.target as HTMLElement).closest("a"); if (link) { event.preventDefault(); const label = link.getAttribute("href")?.match(/-([S][1-9]\d{0,2})$/)?.[1]; if (label && evidence.some(hit => hit.label === label)) { setExpanded(true); onCitation(message.id, label); } } }} dangerouslySetInnerHTML={{ __html: rendered.html }}/></div> : <div className="ai-plain-text">{message.content || (message.status === "streaming" ? (message.reasoning ? "Thinking…" : "Waiting for the model…") : "")}</div>}
    {message.status === "streaming" && <span className="ai-generating" role="status">{message.progress || "Generating…"}</span>}
    {message.grounding?.warnings.some(text => /unavailable|missing|changed|could not|incomplete|no matching|not ready|unrecognized|did not supply/i.test(text)) && <p className="usage-warning" role="status">Some evidence is unavailable or needs checking. See Evidence below.</p>}
    {message.grounding && <details className="chat-evidence" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Evidence · {message.grounding.evidence.length} excerpts · {message.grounding.mode}</summary>
      {message.grounding.warnings.map((text, i) => <p key={i} className="modal-help">{text}</p>)}
      {evidence.map(hit => <article key={hit.label} aria-label={`Evidence ${hit.label}`}><header><strong>{hit.label} · {hit.source.title}</strong><button className="quiet-button" onClick={() => onCitation(message.id, hit.label)}>Open source</button></header><small>{citationLocation(hit)}{labels.has(hit.label) ? " · Cited" : " · Retrieved"}</small><blockquote>{hit.chunk.text}</blockquote></article>)}
    </details>}
    {message.error && <p className={message.status === "error" ? "ai-error" : "modal-help"} role={message.status === "error" ? "alert" : "status"}>{message.error}</p>}
  </article>;
});

export function AIChat({ providers, chats, onChats, onSettings, draft, onDraft, beforeChange, onCitationOpen }: { beforeChange?(): Promise<void>; onCitationOpen?(target: CitationTarget): void; providers: AIProvider[]; chats: Conversation[]; onChats(value: Conversation[] | ((previous: Conversation[]) => Conversation[])): void; onSettings(): void; draft: string; onDraft(value: string): void }) {
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem("lancarbon-active-chat") || ""; } catch { return ""; } });
  const [catalogue, setCatalogue] = useState<ChatSourceCatalogue>({ sources: [], books: [], folders: [] });
  const [sourceDialog, setSourceDialog] = useState(false);
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
  const refreshSources = async () => { await beforeChange?.(); const result = await window.notesDesktop.ai!.sourceCatalogue(); if (!result.ok) throw Error(result.error); setCatalogue(result.catalogue); return result.catalogue; };
  useEffect(() => { if (!window.notesDesktop.ai?.sourceCatalogue) return; void refreshSources().catch(() => undefined); }, []);
  const chooseChat = (id: string) => { setSelected(id); setChoice(""); setError(""); follow.current = true; };
  useEffect(() => { if (chat) { try { localStorage.setItem("lancarbon-active-chat", chat.id); } catch { /* optional selection */ } } }, [chat?.id]);
  useEffect(() => { if (thread.current && follow.current) thread.current.scrollTop = thread.current.scrollHeight; }, [chat?.id, chat?.messages]);
  const create = async () => { const [provider, model] = value ? JSON.parse(value) : ["", ""]; const result = await window.notesDesktop.ai!.createChat(provider, model); if (!result.ok) throw new Error(result.error); upsert(result.chat); chooseChat(result.chat.id); return result.chat; };
  const send = async (retry = false) => {
    if (!value) { onSettings(); return; }
    await beforeChange?.();
    const [provider, model] = JSON.parse(value); let current = chat;
    if (!current) current = await create();
    follow.current = true;
    const result = await window.notesDesktop.ai!.send(current.id, provider, model, retry ? "" : draft, retry);
    if (!result.ok) throw new Error(result.error);
    // The event subscription owns streaming updates; avoid replacing a newer event with the initial reply.
    if (!retry) onDraft("");
  };
  const applySources = async (scope: KnowledgeScope) => { await beforeChange?.(); const current = chat ?? await create(); const result = await window.notesDesktop.ai!.setSources(current.id, scope); if (!result.ok) throw Error(result.error); upsert(result.chat); setSourceDialog(false); };
  const imported = async (files?: File[], initial?: KnowledgeScope) => {
    if (generating) throw Error("Stop the reply before importing sources.");
    await beforeChange?.(); const result = files ? await window.notesDesktop.library!.importFiles(files) : await window.notesDesktop.library!.choose();
    if (!result.ok) { if (result.canceled) return; throw Error(result.error); }
    await refreshSources(); if (result.batch.items.length) { const current = chat ?? await create(), scope = structuredClone(initial ?? current.sourceScope ?? emptyKnowledgeScope()); scope.fileIds = [...new Set([...scope.fileIds, ...result.batch.items.map(item => item.entry.documentId ?? item.entry.id)])]; const saved = await window.notesDesktop.ai!.setSources(current.id, scope); if (!saved.ok) throw Error(saved.error); upsert(saved.chat); setSourceDialog(false); }
    if (result.batch.failures.length) throw Error(result.batch.failures.map(item => `${item.name}: ${item.error}`).join("\n"));
  };
  const openCitation = (messageId: string, label: string) => { if (chat) void act(async () => { await beforeChange?.(); const result = await window.notesDesktop.ai!.openCitation(chat.id, messageId, label); if (!result.ok) throw Error(result.error); onCitationOpen?.(result.target); }); };
  const sourceCount = hasChatSources(chat?.sourceScope) ? selectedKnowledgeSources(catalogue, chat!.sourceScope!).size : 0;
  return <div className="ai-chat-layout" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); void act(() => imported(Array.from(event.dataTransfer.files))); }}>
    <aside className="ai-chat-list" aria-label="Conversations"><button className="primary-button" disabled={busy} onClick={() => void act(async () => { await create(); onDraft(""); })}>New chat</button><div>{ordered.map(item => <button key={item.id} aria-pressed={chat?.id === item.id} onClick={() => chooseChat(item.id)}><span>{item.title}</span>{item.messages.at(-1)?.status === "streaming" && <small>Generating…</small>}</button>)}</div></aside>
    <div className="ai-chat-main"><header className="ai-chat-heading"><h1>{chat?.title ?? "Start a conversation"}</h1><div className="ai-actions">{chat && <><button className="quiet-button" disabled={busy || generating} onClick={() => { setTitle(chat.title); setDialog("rename"); }}>Rename chat</button><button className="quiet-button" disabled={busy || generating} onClick={() => setDialog("delete")}>Delete chat</button></>}</div></header>
      <div className="ai-chat-model"><ThemedSelect label="Chat model" value={value} placeholder="Choose a model" options={options} disabled={busy || generating} onChange={setChoice}/><button className="quiet-button" onClick={onSettings}>AI Settings</button></div>
      <div className="chat-source-bar"><button className="quiet-button" disabled={busy || generating} onClick={() => void act(async () => { await refreshSources(); setSourceDialog(true); })}>{hasChatSources(chat?.sourceScope) ? `Sources · ${sourceCount}` : "Choose sources"}</button>{hasChatSources(chat?.sourceScope) ? <><span>Questions use this chat's selected sources.</span><button className="text-button" disabled={busy || generating} onClick={() => void act(() => applySources(emptyKnowledgeScope()))}>Clear sources</button></> : <span>Ordinary chat · choose sources or drop PDF / EPUB files to ask about documents.</span>}</div>
      {chat?.messages.length && value && value !== savedChoice ? <p className="ai-context-notice">The next message and this conversation's history will be sent to the selected service.</p> : null}
      <div className="ai-thread" ref={thread} onScroll={() => { const element = thread.current; if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        {!chat?.messages.length && <div className="ai-chat-empty"><h2>A space to think</h2><p>{options.length ? "Choose a model and send your first message." : "Add an API key and a chat model in AI Settings to begin."}</p><p>Choose one or more Library files, Notes or Book pages to ask questions with source citations. Sources are prepared automatically when you send.</p>{!options.length && <button className="quiet-button" onClick={onSettings}>Configure AI</button>}</div>}
        {chat?.messages.map(message => <Message key={message.id} message={message} onCitation={openCitation} onCopy={text => { void navigator.clipboard.writeText(text).then(() => setNotice("Copied.")).catch(() => setError("Could not copy. Select the text and copy it manually.")); }}/>) }
      </div>
      <form className="ai-composer" onSubmit={event => { event.preventDefault(); if (!generating && !busy && draft.trim() && value) void act(() => send()); }}>
        {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p role="status" className="ai-notice">{notice}</p>}
        <textarea disabled={busy} aria-label="Chat message" placeholder="Write a message…" value={draft} maxLength={hasChatSources(chat?.sourceScope) ? 1500 : 100000} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>
        <div className="ai-composer-actions"><span>Enter to send · Shift+Enter for a new line</span><div className="ai-actions">{chat?.messages.at(-1)?.role === "assistant" && ["stopped", "error"].includes(chat.messages.at(-1)!.status) && <button className="quiet-button" type="button" disabled={busy || !value} onClick={() => void act(() => send(true))}>Retry reply</button>}{generating ? <button className="primary-button" type="button" disabled={busy} onClick={() => void act(async () => { const result = await window.notesDesktop.ai!.stop(chat!.id); if (!result.ok) throw new Error(result.error); })}>Stop generating</button> : <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !value}>Send</button>}</div></div>
      </form>
    </div>
    {sourceDialog && <ChatSources catalogue={catalogue} initial={chat?.sourceScope} onSave={applySources} onClose={() => setSourceDialog(false)} onImport={scope => imported(undefined, scope)}/>}
    {dialog && chat && <div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label={dialog === "rename" ? "Rename conversation" : "Delete conversation"} onSubmit={event => { event.preventDefault(); void act(async () => { if (dialog === "rename") { const result = await window.notesDesktop.ai!.renameChat(chat.id, title); if (!result.ok) throw new Error(result.error); upsert(result.chat); } else { const result = await window.notesDesktop.ai!.deleteChat(chat.id); if (!result.ok) throw new Error(result.error); onChats(previous => previous.filter(item => item.id !== chat.id)); setSelected(""); } setDialog(null); }); }}><h2>{dialog === "rename" ? "Rename chat" : "Delete chat?"}</h2>{dialog === "rename" ? <label>Chat name<input aria-label="Chat name" autoFocus value={title} maxLength={120} onChange={event => setTitle(event.target.value)}/></label> : <p>This deletes “{chat.title}” and its messages from this computer.</p>}<footer><button className="quiet-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy || (dialog === "rename" && !title.trim())} type="submit">{dialog === "rename" ? "Save name" : "Delete conversation"}</button></footer></form></div>}
  </div>;
}
