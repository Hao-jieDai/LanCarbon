import { RESEARCH_PAGES, type ResearchPage } from "../shared/research";
import { useEffect, useState } from "react";
import type { AIProvider, AIChat as Conversation } from "../shared/ai";
import { AISettings } from "./AISettings";
import { AIChat } from "./AIChat";
import { AIUsage } from "./AIUsage";
import { TranslationSettings } from "./TranslationSettings";
import { KnowledgeBase } from "./KnowledgeBase";
import type { KnowledgeHit, KnowledgeLocation } from "../shared/knowledge";

export function ResearchWorkspace({ page, visible = true, onPageChange, onOpenSidebar, beforeChange, onKnowledgeOpen }: { page: ResearchPage; visible?: boolean; onPageChange?(page: ResearchPage): void; onOpenSidebar(): void; beforeChange?(): Promise<void>; onKnowledgeOpen?(hit: KnowledgeHit, location?: KnowledgeLocation): void }) {
  const selected = RESEARCH_PAGES.find(item => item.id === page)!;
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [priceProviders, setPriceProviders] = useState<AIProvider[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const enabled = page === "chat" || page === "settings" || page === "usage" || page === "translation";
  useEffect(() => {
    if (!enabled || !window.notesDesktop.ai || !visible || loaded) return;
    let disposed = false;
    void Promise.all([window.notesDesktop.ai.providers(), window.notesDesktop.ai.chats()]).then(([providers, chats]) => { if (disposed) return; if (!providers.ok) throw new Error(providers.error); if (!chats.ok) throw new Error(chats.error); setProviders(providers.providers); setChats(chats.chats); setError(""); setLoaded(true); }).catch(error => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [visible, loaded, enabled]);
  useEffect(() => window.notesDesktop.ai?.onChat(chat => setChats(previous => previous.some(item => item.id === chat.id) ? previous.map(item => item.id === chat.id ? chat : item) : [chat, ...previous])), []);
  useEffect(() => { if (page !== "usage" || !visible || !window.notesDesktop.ai?.priceProviders) return; let alive = true; void window.notesDesktop.ai.priceProviders().then(result => { if (alive && result.ok) setPriceProviders(result.providers); }); return () => { alive = false; }; }, [page, visible, providers]);
  if (page === "knowledge") return <section hidden={!visible} className="editor-panel foundation-panel ai-panel" aria-label="Workshop workspace"><header className="editor-toolbar"><button className="icon-button mobile-menu" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Workshop / Knowledge base</span></header><KnowledgeBase visible={visible} beforeChange={beforeChange} onOpen={onKnowledgeOpen}/></section>;
  if (enabled) return <section hidden={!visible} className="editor-panel foundation-panel ai-panel" aria-label="Workshop workspace"><header className="editor-toolbar"><button className="icon-button mobile-menu" title="Show sidebar" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Workshop / {selected.label}</span></header>{error ? <div className="ai-loading"><h1>{selected.label}</h1><p role="alert">{error}</p><p>Your writing workspace remains available.</p></div> : !loaded ? <div className="ai-loading"><h1>{selected.label}</h1><p>{window.notesDesktop.ai ? "Loading AI workspace…" : "AI is available in the desktop application."}</p></div> : page === "translation" ? <TranslationSettings providers={providers}/> : page === "settings" ? <AISettings providers={providers} onProviders={setProviders}/> : page === "usage" ? <AIUsage providers={priceProviders.length ? priceProviders : providers} visible={visible}/> : <AIChat providers={providers} chats={chats} onChats={setChats} onSettings={() => onPageChange?.("settings")} draft={draft} onDraft={setDraft}/>}</section>;
  return <section hidden={!visible} className="editor-panel foundation-panel" aria-label="Workshop workspace">
    <header className="editor-toolbar"><button className="icon-button mobile-menu" title="Show sidebar" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Workshop / {selected.label}</span><span className="foundation-status">Coming soon</span></header>
    <article className="foundation-content">
      <p className="foundation-eyebrow">WORKSHOP</p><h1>{selected.label}</h1><p className="foundation-description">{selected.description}</p>
      <div className="foundation-card"><span className="foundation-card-icon" aria-hidden="true">◇</span><h2>A place for your research</h2><p>This workspace is ready for upcoming AI and literature tools. {selected.label} is not available yet.</p><p>Your Notes and Books are available from the workspace buttons.</p></div>
    </article>
  </section>;
}
