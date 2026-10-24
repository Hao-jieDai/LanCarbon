import type { AIChat } from "../src/shared/ai";
import { hasChatSources, scopeKey, type ChatEvidence, type ChatGrounding } from "../src/shared/grounding";
import { selectedKnowledgeSources } from "../src/shared/knowledge";
import type { KnowledgeStore } from "./knowledge-store";
import type { ChatGrounder, PreparedChat } from "./chat-grounding";
import type { PaperQACompiler } from "./paperqa-bridge";

export const PAPERQA_MAX_CHARACTERS = 500_000;
export const PAPERQA_MAX_PASSAGES = 999;
export type DocumentGrounder = Pick<ChatGrounder, "validate" | "prepare" | "finish">;

export class PaperQAGrounder implements DocumentGrounder {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly knowledge: () => KnowledgeStore, private readonly common: ChatGrounder, private readonly compile: PaperQACompiler, private readonly stopRetrieval: () => Promise<void>) {}
  validate: ChatGrounder["validate"] = scope => this.common.validate(scope);
  finish: ChatGrounder["finish"] = (grounding, text) => this.common.finish(grounding, text);
  async prepare(chat: AIChat, signal: AbortSignal, progress: (message: string) => void): Promise<PreparedChat> {
    const work = this.queue.catch(() => {}).then(async () => {
      signal.throwIfAborted();
      const scope = await this.validate(chat.sourceScope!);
      if (!hasChatSources(scope)) throw Error("Choose sources before asking a document question.");
      const question = chat.messages.filter(m => m.role === "user").at(-1)?.content;
      if (!question) throw Error("Enter a question.");
      await this.stopRetrieval();
      progress("Reading complete selected texts…");
      const view = await this.knowledge().prepare(scope, signal, progress);
      const ids = selectedKnowledgeSources(view, scope);
      const excluded = new Set([...(scope.excludedNoteIds ?? []).map(id => `note:${id}`), ...(scope.excludedFileIds ?? []).map(id => `file:${id}`)]);
      const explicit = [...scope.noteIds.map(id => `note:${id}`), ...scope.fileIds.map(id => `file:${id}`)].filter(id => !excluded.has(id));
      if (!ids.size || explicit.some(id => !ids.has(id)) || scope.bookIds.some(id => !view.books.some(b => b.id === id)) || scope.folderIds.some(id => id !== null && !view.folders.some(f => f.id === id))) throw Error("A selected source is missing or excluded. Update the selection; no other sources were substituted.");
      const records = new Map(view.records.map(r => [r.sourceId, r]));
      const unreadable = view.sources.filter(s => ids.has(s.id) && (s.unavailable || records.get(s.id)?.status !== "ready"));
      if (unreadable.length) throw Error(`Full text is not ready: ${unreadable.slice(0, 4).map(s => s.title).join(", ")}. Check extraction/OCR or remove these sources; nothing was sent.`);
      const hits = (await this.knowledge().corpus()).filter(hit => ids.has(hit.source.id));
      if ([...ids].some(id => !hits.some(hit => hit.source.id === id))) throw Error("A selected source has no readable full text. Nothing was sent.");
      if (hits.length > PAPERQA_MAX_PASSAGES || hits.reduce((n, hit) => n + hit.chunk.text.length, 0) > PAPERQA_MAX_CHARACTERS) throw Error("Select fewer sources: the development full-text limit is 500,000 characters / 999 passages. Nothing was truncated or sent.");
      const evidence: ChatEvidence[] = hits.map((hit, i) => ({ ...hit, label: `S${i + 1}` }));
      signal.throwIfAborted(); progress("Preparing full-text answer…");
      const prepared = await this.compile(question, evidence, signal);
      signal.throwIfAborted();
      // Recheck after the local process: do not send a stale snapshot if a file changed.
      const current = await this.knowledge().inspect(), currentIds = selectedKnowledgeSources(current, scope);
      const currentSources = new Map(current.sources.map(s => [s.id, s]));
      if (currentIds.size !== ids.size || [...ids].some(id => !currentIds.has(id)) || hits.some(hit => currentSources.get(hit.source.id)?.fingerprint !== hit.fingerprint || currentSources.get(hit.source.id)?.unavailable)) throw Error("Selected sources changed while preparing the answer. Ask again to read the current text.");
      const history: Array<{ role: string; content: string }> = [];
      let historySize = 0;
      // Contiguous completed turns from this selection only; never revive a prior scope.
      const latest = chat.messages.map(m => m.role).lastIndexOf("user");
      for (let i = latest - 1; i >= 0 && history.length < 6; i--) {
        const m = chat.messages[i];
        if (scopeKey(m.sourceScope) !== scopeKey(scope)) break;
        if (m.status !== "complete" || !m.content) continue;
        if (historySize + m.content.length > 20_000) break;
        historySize += m.content.length; history.unshift({ role: m.role, content: m.content });
      }
      const messages = [prepared.messages[0], ...history, prepared.messages[1]];
      if (Buffer.byteLength(JSON.stringify(messages), "utf8") > 750_000) throw Error("Select fewer sources or start a new chat: the full-text request exceeds the development limit. Nothing was sent.");
      const grounding: ChatGrounding = { scope, sourceIds: [...ids], evidence, mode: "full-text", warnings: evidence.some(hit => hit.chunk.anchor.needsReview) ? ["Some OCR text needs checking against the original page."] : [], research: { focusSourceIds: [...ids], searches: 0, modelChecks: 0, supplemented: false, review: "not-needed" } };
      return { grounding, messages };
    });
    this.queue = work.catch(() => {});
    return new Promise((resolve, reject) => {
      const abort = () => reject(Error("Document question stopped."));
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
      void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
}
