import { useEffect, useState } from "react";
import { AIChat } from "./AIChat";
import type { AIChat as Conversation, AIProvider } from "../shared/ai";
import type { CitationTarget } from "../shared/grounding";
import type { WorkspaceFile } from "../shared/types";
import { writingKnowledgeScope, type WritingScope } from "../shared/writingWorkspace";

interface Props {
  dataLocation: string; noteId: string; title: string; inBook: boolean; visible: boolean;
  getWorkspace(): WorkspaceFile;
  beforeChange(): Promise<void>;
  onSettings(): void;
  onCitationOpen(target: CitationTarget): void;
  onNoteExported(workspace: WorkspaceFile, noteId: string): void;
}

export function WritingChat(props: Props) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ranges, setRanges] = useState<Record<string, WritingScope>>({});
  const { noteId } = props;
  const range = props.inBook ? ranges[noteId] ?? "page" : "page";
  useEffect(() => {
    if (!props.visible) return;
    let live = true;
    void Promise.all([window.notesDesktop.ai!.providers(), window.notesDesktop.ai!.chats()]).then(([p, c]) => {
      if (!live) return;
      if (!p.ok) throw Error(p.error); if (!c.ok) throw Error(c.error);
      setProviders(p.providers); setChats(c.chats); setError(""); setReady(true);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [props.visible]);
  useEffect(() => window.notesDesktop.ai!.onChat(chat => setChats(previous => previous.some(item => item.id === chat.id) ? previous.map(item => item.id === chat.id ? chat : item) : [chat, ...previous])), []);
  return <div className="writing-chat" hidden={!props.visible}>
    {error && <p role="alert" className="ai-error">{error}</p>}
    {ready && <AIChat key={noteId} providers={providers} chats={chats.filter(chat => chat.contextNoteId === noteId)} onChats={update => setChats(previous => {
      const own = previous.filter(chat => chat.contextNoteId === noteId);
      return [...previous.filter(chat => chat.contextNoteId !== noteId), ...(typeof update === "function" ? update(own) : update)];
    })} draft={drafts[noteId] ?? ""} onDraft={text => setDrafts(previous => ({ ...previous, [noteId]: text }))}
      beforeChange={props.beforeChange} onSettings={props.onSettings} onCitationOpen={props.onCitationOpen} onNoteExported={props.onNoteExported}
      writing={{ noteId, title: props.title, selectionKey: `lancarbon-writing-chat:${props.dataLocation}:${noteId}`, range, inBook: props.inBook,
        onRange: value => setRanges(previous => ({ ...previous, [noteId]: value })),
        getScope: () => writingKnowledgeScope(props.getWorkspace(), noteId, range) }}/>
    }
  </div>;
}
