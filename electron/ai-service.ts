import { randomUUID } from "node:crypto";
import type { AIChat, AIMessage } from "../src/shared/ai";
import { AISettingsStore, AIChatStore } from "./ai-storage";
import { AIClient, redactAIError } from "./ai-client";

export class AIService {
  private readonly jobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  constructor(readonly settings: AISettingsStore, private readonly chats: () => AIChatStore, private readonly client: AIClient, private readonly emit: (chat: AIChat) => void) {}
  async models(id: string) { const { provider, key } = await this.settings.connection(id); return this.client.models(provider, key); }
  async test(id: string, modelId: string) { const { provider, key } = await this.settings.connection(id); if (!provider.models.some(model => model.id === modelId)) throw new Error("Save this chat model first"); await this.client.complete(provider, key, modelId, [{ role: "user", content: "Reply with just OK." }], new AbortController().signal, () => {}, true); return "Connection successful. The selected model responded."; }
  async send(id: string, providerId: string, modelId: string, text: string, retry = false): Promise<AIChat> {
    if (this.jobs.has(id)) throw new Error("This conversation is already generating a response");
    if (this.jobs.size >= 3) throw new Error("Wait for an active conversation to finish or stop it");
    const controller = new AbortController();
    let finishJob!: () => void;
    const job = { controller, done: new Promise<void>(resolve => { finishJob = resolve; }) }; this.jobs.set(id, job);
    const chatStore = this.chats();
    try {
      const { provider, key } = await this.settings.connection(providerId), model = provider.models.find(item => item.id === modelId && item.purpose === "chat");
      if (controller.signal.aborted) throw new Error("Generation stopped");
      if (!model) throw new Error("Choose a configured chat model in AI Settings");
      if (typeof text !== "string" || (!retry && !text.trim()) || text.length > 100_000) throw new Error("Enter a message of up to 100,000 characters");
      const reply: AIMessage = { id: randomUUID(), role: "assistant", content: "", reasoning: "", status: "streaming", providerId, providerName: provider.name, modelId, modelName: model.name, createdAt: new Date().toISOString() };
      const chat = await chatStore.update(id, chat => {
        if (chat.messages.length >= 1000) throw new Error("Start a new conversation to continue");
        if (retry) { const last = chat.messages.at(-1); if (last?.role !== "assistant" || !["error", "stopped"].includes(last.status) || chat.messages.at(-2)?.role !== "user") throw new Error("Only the last stopped or failed reply can be retried"); chat.messages.pop(); }
        else { chat.messages.push({ id: randomUUID(), role: "user", content: text.trim(), status: "complete", createdAt: new Date().toISOString() }); if (chat.title === "New chat") chat.title = text.trim().replace(/\s+/g, " ").slice(0, 60); }
        if (chat.messages.reduce((size, message) => size + message.content.length, 0) > 1_500_000) throw new Error("This conversation is too long. Start a new chat.");
        chat.providerId = providerId; chat.modelId = modelId; chat.messages.push(reply);
      });
      const context = chat.messages.filter(message => message.role === "user" || (message.content && ["complete", "stopped"].includes(message.status))).map(message => ({ role: message.role, content: message.content }));
      this.emit(chat);
      void (async () => {
        let updateTimer: NodeJS.Timeout | undefined;
        let persistTimer: NodeJS.Timeout | undefined;
        try {
          await this.client.complete(provider, key, modelId, context, controller.signal, (content, reasoning) => {
            reply.content += content; reply.reasoning = (reply.reasoning ?? "") + reasoning;
            if (reply.content.length + reply.reasoning.length > 1_000_000) { controller.abort(); throw new Error("Response size limit reached"); }
            if (!updateTimer) updateTimer = setTimeout(() => { updateTimer = undefined; this.emit({ ...chat, messages: chat.messages.map(message => message.id === reply.id ? { ...reply } : message) }); }, 120);
            if (!persistTimer) persistTimer = setTimeout(() => { persistTimer = undefined; const snapshot = { ...reply }; void chatStore.update(id, saved => { const index = saved.messages.findIndex(message => message.id === reply.id); if (index >= 0) saved.messages[index] = snapshot; }).catch(() => controller.abort()); }, 800);
          });
          reply.status = "complete";
        } catch (error) { reply.status = controller.signal.aborted ? "stopped" : "error"; reply.error = controller.signal.aborted ? "Generation stopped. Partial text has been saved." : redactAIError(error, key); }
        finally {
          clearTimeout(updateTimer); clearTimeout(persistTimer);
          try { const saved = await chatStore.update(id, chat => { const index = chat.messages.findIndex(message => message.id === reply.id); if (index >= 0) chat.messages[index] = { ...reply }; }); this.emit(saved); }
          catch { this.emit({ ...chat, messages: chat.messages.map(message => message.id === reply.id ? { ...reply, status: "error", error: "The reply could not be saved. Check the data folder." } : message) }); }
          this.jobs.delete(id);
          finishJob();
        }
      })();
      return chat;
    } catch (error) { this.jobs.delete(id); finishJob(); throw error; }
  }
  async stop(id: string): Promise<void> { const job = this.jobs.get(id); if (job) { job.controller.abort(); await job.done; } }
  async remove(id: string): Promise<void> { await this.stop(id); await this.chats().remove(id); }
  async shutdown(): Promise<void> { for (const job of this.jobs.values()) job.controller.abort(); await Promise.all([...this.jobs.values()].map(job => job.done)); await this.chats().flush(); await this.settings.flush(); }
}
