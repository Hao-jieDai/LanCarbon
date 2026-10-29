import { memo, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { renderMystPreview } from "../preview/mystPreview";
import type { AIChat as Conversation, AIMessage, AIProvider } from "../shared/ai";
import { ChatSources } from "./ChatSources";
import { emptyKnowledgeScope, selectedKnowledgeSources, type KnowledgeScope } from "../shared/knowledge";
import { hasChatSources, citationLocation, citedLabels, mapCitations, type ChatSourceCatalogue, type CitationTarget } from "../shared/grounding";
import { ThemedSelect } from "./ThemedSelect";
import { chatMarkdown } from "../shared/chatText";
import type { WritingScope } from "../shared/writingWorkspace";
import type { WorkspaceFile } from "../shared/types";

const Message = memo(function Message({ message, onCopy, onCitation }: { message: AIMessage; onCopy(text: string): void; onCitation(messageId: string, label: string): void }) {
  const evidence = message.grounding?.evidence ?? [], labels = citedLabels(message.content);
  const [expanded, setExpanded] = useState(false);
  const markdown = message.role === "assistant" ? chatMarkdown(message.content) : message.content;
  const referenced = mapCitations(markdown, label => evidence.some(hit => hit.label === label) ? `[${label}](#evidence-${message.id}-${label})` : `[${label}]`);
  const rendered = useMemo(() => message.role === "assistant" && message.status !== "streaming" && message.content ? renderMystPreview({ id: message.id, title: "AI reply", content: referenced, navigationAnchors: evidence.map(hit => `evidence-${message.id}-${hit.label}`) }) : null, [referenced, message.status, message.role, message.id, message.grounding]);
  return <article className={`ai-message ai-message-${message.role}`} aria-label={message.role === "user" ? "Your message" : "AI reply"}>
    <header><strong>{message.role === "user" ? "You" : `${message.providerName} · ${message.modelName}`}</strong>{message.content && <button className="quiet-button" aria-label={`Copy ${message.role === "user" ? "message" : "reply"}`} onClick={() => onCopy(markdown + (message.grounding?.quantityCheck?.issues.length ? "\n\nCheck amounts:\n" + message.grounding.quantityCheck.issues.map(issue => "- " + issue).join("\n") : ""))}>Copy</button>}</header>
    {message.reasoning && <details className="ai-reasoning"><summary>Reasoning</summary><pre>{message.reasoning}</pre></details>}
    {rendered && !rendered.error ? <div className="markdown-preview ai-markdown"><div className="preview-body" onClick={event => { const link = (event.target as HTMLElement).closest("a"); if (link) { event.preventDefault(); const label = link.getAttribute("href")?.match(/-([S][1-9]\d{0,2})$/)?.[1]; if (label && evidence.some(hit => hit.label === label)) { setExpanded(true); onCitation(message.id, label); } } }} dangerouslySetInnerHTML={{ __html: rendered.html }}/></div> : <div className="ai-plain-text">{message.content || (message.status === "streaming" ? (message.reasoning ? "Thinking…" : "Waiting for the model…") : "")}</div>}
    {message.status === "streaming" && <span className="ai-generating" role="status">{message.progress || "Generating…"}</span>}
    {message.grounding?.quantityCheck?.status === "needs-review" && <details className="chat-quantity-check" open><summary>Check amounts</summary>{message.grounding.quantityCheck.issues.map((issue, i) => <p className="modal-help" key={i}>{issue}</p>)}</details>}
    {message.grounding && <details className="chat-evidence" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Evidence · {message.grounding.evidence.length} excerpts · {message.grounding.mode === "full-text" ? "PaperQA · full text" : message.grounding.mode}</summary>
      {message.grounding.research && <p className="modal-help">{new Set(evidence.map(hit => hit.source.id)).size} sources represented · {message.grounding.research.searches} searches · {message.grounding.research.modelChecks} auxiliary model calls{message.grounding.research.supplemented ? " · Supplementary search completed" : ""}{message.grounding.research.review === "limited" ? " · Coverage needs checking" : ""}{message.grounding.research.answerRevision === "applied" ? " · Answer checked against sources" : message.grounding.research.answerRevision === "failed" ? " · Answer check incomplete" : ""}.</p>}
      {message.grounding.warnings.map((text, i) => <p key={i} className="modal-help">{text}</p>)}
      {evidence.map(hit => <article key={hit.label} aria-label={`Evidence ${hit.label}`}><header><strong>{hit.label} · {hit.source.title}</strong><button className="quiet-button" onClick={() => onCitation(message.id, hit.label)}>Open source</button></header><small>{citationLocation(hit)}{labels.has(hit.label) ? " · Cited" : message.grounding?.mode === "full-text" ? " · Included" : " · Retrieved"}</small><blockquote>{hit.chunk.text}</blockquote></article>)}
    </details>}
    {message.error && <p className={message.status === "error" ? "ai-error" : "modal-help"} role={message.status === "error" ? "alert" : "status"}>{message.error}</p>}
  </article>;
});

export function AIChat({ providers, chats, onChats, onSettings, draft, onDraft, beforeChange, onCitationOpen, onNoteExported, writing }: { writing?: { noteId: string; title: string; selectionKey: string; range: WritingScope; inBook: boolean; onRange(value: WritingScope): void; getScope(): KnowledgeScope }; onNoteExported?(workspace: WorkspaceFile, noteId: string): void; beforeChange?(): Promise<void>; onCitationOpen?(target: CitationTarget): void; providers: AIProvider[]; chats: Conversation[]; onChats(value: Conversation[] | ((previous: Conversation[]) => Conversation[])): void; onSettings(): void; draft: string; onDraft(value: string): void }) {
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem(writing?.selectionKey ?? "lancarbon-active-chat") || ""; } catch { return ""; } });
  const [catalogue, setCatalogue] = useState<ChatSourceCatalogue>({ sources: [], books: [], folders: [] });
  const [sourceDialog, setSourceDialog] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"rename" | "delete" | "pdf" | "note" | null>(null);
  const [includeThinking, setIncludeThinking] = useState(true);
  const [includeEvidence, setIncludeEvidence] = useState(false);
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
  useEffect(() => { if (chat) { try { localStorage.setItem(writing?.selectionKey ?? "lancarbon-active-chat", chat.id); } catch { /* optional selection */ } } }, [chat?.id]);
  useEffect(() => { if (thread.current && follow.current) thread.current.scrollTop = thread.current.scrollHeight; }, [chat?.id, chat?.messages]);
  const create = async () => { const [provider, model] = value ? JSON.parse(value) : ["", ""]; const result = await window.notesDesktop.ai!.createChat(provider, model, writing?.noteId); if (!result.ok) throw new Error(result.error); upsert(result.chat); chooseChat(result.chat.id); return result.chat; };
  const send = async (retry = false) => {
    if (!value) { onSettings(); return; }
    await beforeChange?.();
    const [provider, model] = JSON.parse(value); let current = chat;
    if (!current) current = await create();
    if (writing) { const result = await window.notesDesktop.ai!.setSources(current.id, writing.getScope()); if (!result.ok) throw Error(result.error); upsert(result.chat); }
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
    await refreshSources(); if (result.batch.items.length) { const current = chat ?? await create(), scope = structuredClone(initial ?? current.sourceScope ?? emptyKnowledgeScope()), importedIds = new Set(result.batch.items.map(item => item.entry.documentId ?? item.entry.id)); scope.fileIds = [...new Set([...scope.fileIds, ...importedIds])]; scope.excludedFileIds = scope.excludedFileIds?.filter(id => !importedIds.has(id)); const saved = await window.notesDesktop.ai!.setSources(current.id, scope); if (!saved.ok) throw Error(saved.error); upsert(saved.chat); setSourceDialog(false); }
    if (result.batch.failures.length) throw Error(result.batch.failures.map(item => `${item.name}: ${item.error}`).join("\n"));
  };
  const openCitation = (messageId: string, label: string) => { if (chat) void act(async () => { await beforeChange?.(); const result = await window.notesDesktop.ai!.openCitation(chat.id, messageId, label); if (!result.ok) throw Error(result.error); onCitationOpen?.(result.target); }); };
  const sourceCount = hasChatSources(chat?.sourceScope) ? selectedKnowledgeSources(catalogue, chat!.sourceScope!).size : 0;
  return <div className={`ai-chat-layout${writing ? " ai-chat-compact" : ""}`} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length || writing) return; event.preventDefault(); void act(() => imported(Array.from(event.dataTransfer.files))); }}>
    {!writing && <aside className="ai-chat-list" aria-label="Conversations"><button className="primary-button" disabled={busy} onClick={() => void act(async () => { await create(); onDraft(""); })}>New chat</button><div>{ordered.map(item => <button key={item.id} aria-pressed={chat?.id === item.id} onClick={() => chooseChat(item.id)}><span>{item.title}</span>{item.messages.at(-1)?.status === "streaming" && <small>Generating…</small>}</button>)}</div></aside>}

    <div className="ai-chat-main">{writing && <><p className="writing-chat-page" title={writing.title}>{writing.title || "Untitled"}</p><div className="writing-chat-controls"><ThemedSelect label="Page conversations" value={chat?.id ?? ""} placeholder="New conversation" options={ordered.map(item => ({value:item.id,label:item.title}))} disabled={busy} onChange={chooseChat}/><button className="quiet-button" disabled={busy} onClick={() => void act(async () => { await create(); onDraft(""); })}>New chat</button></div><div className="writing-chat-controls"><ThemedSelect label="Page chat scope" value={writing.range} disabled={busy || generating} options={writing.inBook ? [{value:"page",label:"Current page"},{value:"section",label:"Current section"},{value:"book",label:"Whole Book"}] : [{value:"page",label:"Current Note"}]} onChange={value => writing.onRange(value as WritingScope)}/></div></>}<header className="ai-chat-heading"><h1>{chat?.title ?? "Start a conversation"}</h1><div className="ai-actions">{chat && <><button className="quiet-button" disabled={busy || generating || !chat.messages.length} onClick={() => { setError(""); setIncludeThinking(true); setIncludeEvidence(false); setDialog("pdf"); }}>Export PDF</button><button className="quiet-button" disabled={busy || generating || !chat.messages.length} onClick={() => { setError(""); setIncludeThinking(true); setIncludeEvidence(false); setDialog("note"); }}>Export to Note</button><button className="quiet-button" disabled={busy || generating} onClick={() => { setTitle(chat.title); setDialog("rename"); }}>Rename chat</button><button className="quiet-button" disabled={busy || generating} onClick={() => setDialog("delete")}>Delete chat</button></>}</div></header>
      <div className="ai-chat-model"><ThemedSelect label="Chat model" value={value} placeholder="Choose a model" options={options} disabled={busy || generating} onChange={setChoice}/><button className="quiet-button" onClick={onSettings}>AI Settings</button></div>
      {chat?.messages.length && value && value !== savedChoice ? <p className="ai-context-notice">The next message and this conversation's history will be sent to the selected service.</p> : null}
      <div className="ai-thread" ref={thread} onScroll={() => { const element = thread.current; if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        {!chat?.messages.length && <div className="ai-chat-empty"><h2>A space to think</h2><p>{options.length ? "Choose a model and send your first message." : "Add an API key and a chat model in AI Settings to begin."}</p><p>{writing ? "Ask about the current page, or choose a wider Book scope above. Each page keeps its own conversations." : "Choose one or more Library files, Notes or Book pages to ask questions with source citations. Sources are prepared automatically when you send."}</p>{!options.length && <button className="quiet-button" onClick={onSettings}>Configure AI</button>}</div>}
        {chat?.messages.map(message => <Message key={message.id} message={message} onCitation={openCitation} onCopy={text => { void navigator.clipboard.writeText(text).then(() => setNotice("Copied.")).catch(() => setError("Could not copy. Select the text and copy it manually.")); }}/>) }
      </div>
      <form className="ai-composer" onSubmit={event => { event.preventDefault(); if (!generating && !busy && draft.trim() && value) void act(() => send()); }}>
        {writing ? <p className="writing-source-hint">The latest saved text in this scope is used when you send.</p> : <div className="chat-source-bar" role="group" aria-label="Chat sources"><button type="button" className="quiet-button" disabled={busy || generating} onClick={() => void act(async () => { await refreshSources(); setSourceDialog(true); })}>{hasChatSources(chat?.sourceScope) ? `Sources · ${sourceCount}` : "Choose sources"}</button>{hasChatSources(chat?.sourceScope) ? <><span>Questions use this chat's selected sources.</span><button type="button" className="text-button" disabled={busy || generating} onClick={() => void act(() => applySources(emptyKnowledgeScope()))}>Clear sources</button></> : <span>Choose Library files, Notes or Book pages.</span>}</div>}
        {error && <p className="ai-error" role="alert">{error}</p>}{notice && <p role="status" className="ai-notice">{notice}</p>}
        <textarea disabled={busy} aria-label="Chat message" placeholder="Write a message…" value={draft} maxLength={writing || hasChatSources(chat?.sourceScope) ? 1500 : 100000} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>
        <div className="ai-composer-actions"><span>Enter to send · Shift+Enter for a new line</span><div className="ai-actions">{chat?.messages.at(-1)?.role === "assistant" && ["stopped", "error"].includes(chat.messages.at(-1)!.status) && <button className="quiet-button" type="button" disabled={busy || !value} onClick={() => void act(() => send(true))}>Retry reply</button>}{generating ? <button className="primary-button" type="button" disabled={busy} onClick={() => void act(async () => { const result = await window.notesDesktop.ai!.stop(chat!.id); if (!result.ok) throw new Error(result.error); })}>Stop generating</button> : <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !value}>Send</button>}</div></div>
      </form>
    </div>
    {sourceDialog && <ChatSources catalogue={catalogue} initial={chat?.sourceScope} onSave={applySources} onClose={() => setSourceDialog(false)} onImport={scope => imported(undefined, scope)}/>}
    {dialog && chat && <div className="modal-backdrop"><form className="settings-modal compact-modal" role="dialog" aria-modal="true" aria-label={dialog === "rename" ? "Rename conversation" : dialog === "pdf" ? "Export chat as PDF" : dialog === "note" ? "Export chat as Note" : "Delete conversation"} onSubmit={event => { event.preventDefault(); void act(async () => {
      if (dialog === "rename") { const result = await window.notesDesktop.ai!.renameChat(chat.id, title); if (!result.ok) throw new Error(result.error); upsert(result.chat); }
      else if (dialog === "pdf") { const result = await window.notesDesktop.ai!.exportPdf(chat.id, { includeThinking, includeEvidence }); if (!result.ok) { if (result.canceled) return; throw Error(result.error); } setNotice(`PDF saved: ${result.destination}${result.warnings.length ? ` · ${result.warnings.join(" ")}` : ""}`); }
      else if (dialog === "note") { await beforeChange?.(); const result = await window.notesDesktop.ai!.exportNote(chat.id, { includeThinking, includeEvidence }); if (!result.ok) throw Error(result.error); onNoteExported?.(result.workspace, result.noteId); }
      else { const result = await window.notesDesktop.ai!.deleteChat(chat.id); if (!result.ok) throw new Error(result.error); onChats(previous => previous.filter(item => item.id !== chat.id)); setSelected(""); }
      setDialog(null);
    }); }}><h2>{dialog === "rename" ? "Rename chat" : dialog === "pdf" ? "Export chat as PDF" : dialog === "note" ? "Export chat as Note" : "Delete chat?"}</h2>{dialog === "rename" ? <label>Chat name<input aria-label="Chat name" autoFocus value={title} maxLength={120} onChange={event => setTitle(event.target.value)}/></label> : (dialog === "pdf" || dialog === "note") ? <div className="chat-pdf-options"><p>Export the whole conversation with model names and source locations.</p><label><input type="checkbox" checked={includeThinking} onChange={event => setIncludeThinking(event.target.checked)}/>Include Thinking</label><label><input type="checkbox" checked={includeEvidence} onChange={event => setIncludeEvidence(event.target.checked)}/>Include cited evidence excerpts</label><p className="modal-help">Only saved content is exported. This does not call a model.</p></div> : <p>This deletes “{chat.title}” and its messages from this computer.</p>}{error && <p className="ai-error" role="alert">{error}</p>}<footer><button className="quiet-button" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy || (dialog === "rename" && !title.trim()) || ((dialog === "pdf" || dialog === "note") && generating)} type="submit">{dialog === "rename" ? "Save name" : dialog === "pdf" ? busy ? "Exporting…" : "Export PDF" : dialog === "note" ? busy ? "Exporting…" : "Export to Note" : "Delete conversation"}</button></footer></form></div>}
  </div>;
}
