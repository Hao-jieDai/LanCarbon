import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ResearchWorkspace } from "../src/components/ResearchWorkspace";
import { emptyKnowledgeScope } from "../src/shared/knowledge";
import { AIChat } from "../src/components/AIChat";
import type { AIChat as Conversation, AIProvider } from "../src/shared/ai";

const provider: AIProvider = { id: "fixture", kind: "others", name: "Fixture", baseUrl: "https://example.invalid", hasKey: true, defaultModel: "chat", models: [{ id: "chat", name: "Chat", purpose: "chat" }] };
const conversation = (id: string, contextNoteId?: string): Conversation => ({ id, title: id, contextNoteId, providerId: provider.id, modelId: "chat", createdAt: "2026-10-29", updatedAt: "2026-10-29", messages: [{ id: id + "-message", role: "user", status: "complete", content: "Content of " + id, createdAt: "2026-10-29" }] });
function fixture() {
  let listener: (chat: Conversation) => void = () => {};
  const chats = [conversation("Page A", "page-a"), conversation("Deleted page", "missing"), conversation("Workshop legacy")];
  const api = {
    providers: vi.fn(async () => ({ ok: true, providers: [provider] })), chats: vi.fn(async () => ({ ok: true, chats })),
    sourceCatalogue: vi.fn(async () => ({ ok: true, catalogue: { sources: [], books: [], folders: [] } })),
    onChat: vi.fn((callback: typeof listener) => { listener = callback; return () => {}; }),
    createChat: vi.fn(async (_p: string, _m: string, contextNoteId?: string) => ({ ok: true, chat: conversation("New conversation", contextNoteId) })),
    deleteChat: vi.fn(async () => ({ ok: true })), send: vi.fn(),
  };
  window.notesDesktop = { ai: api } as unknown as typeof window.notesDesktop;
  return { api, emit: (chat: Conversation) => act(() => listener(chat)) };
}
it("keeps Workshop, page history and orphan page chats separate through live updates and deletion", async () => {
  const { api, emit } = fixture();
  // An old Workshop selection may still point at a page chat after upgrading.
  localStorage.setItem("lancarbon-active-chat", "Page A");
  render(<ResearchWorkspace page="chat" onOpenSidebar={() => {}}/>);
  await screen.findByText("Content of Workshop legacy");
  expect(screen.queryByText("Content of Page A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
  expect(screen.queryByRole("menuitem", { name: "Page A" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Page chats…" }));
  expect(screen.getByLabelText("Chat message")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
  expect(screen.queryByRole("menuitem", { name: "Workshop legacy" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Deleted page" }));
  expect(screen.getByText("Content of Deleted page")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "More chat actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete chat" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
  await screen.findByText("Content of Page A");
  emit(conversation("Page B", "page-b"));
  fireEvent.click(screen.getByRole("button", { name: "Back to Workshop chats" }));
  expect(screen.getByText("Content of Workshop legacy")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  await screen.findByText("Content of New conversation");
  expect(api.createChat).toHaveBeenCalledWith("fixture", "chat", undefined);
  fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Page chats…" }));
  fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
  expect(screen.getByRole("menuitem", { name: "Page B" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Deleted page" })).toBeNull();
  expect(api.send).not.toHaveBeenCalled();
});
it("keeps icon menus keyboard accessible and the model inside the page composer", async () => {
  const { api } = fixture(), onRange = vi.fn();
  render(<AIChat chats={[conversation("Page A", "page-a")]} providers={[provider]} onChats={() => {}} onSettings={() => {}} draft="" onDraft={() => {}} writing={{noteId:"page-a", title:"Page A", selectionKey:"test-page", range:"page", inBook:true, onRange, getScope:() => ({ ...emptyKnowledgeScope(), noteIds:["page-a"] })}}/>);
  await act(async () => {});
  const card = screen.getByLabelText("Chat message").closest(".ai-composer-card")!;
  expect(within(card as HTMLElement).getByRole("combobox", {name:"Chat model"})).toBeVisible();
  fireEvent.click(screen.getByRole("combobox", {name:"Page chat scope"}));
  fireEvent.click(screen.getByRole("option", {name:"Whole Book"})); expect(onRange).toHaveBeenCalledWith("book");
  const menu = screen.getByRole("button", {name:"Export chat"});
  fireEvent.keyDown(menu, {key:"Enter"}); expect(screen.getByRole("menuitem", {name:"Export PDF"})).toBeVisible();
  fireEvent.keyDown(menu, {key:"Escape"}); expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"New chat"}));
  await act(async () => {}); expect(api.createChat).toHaveBeenCalledWith("fixture", "chat", "page-a");
  expect(api.send).not.toHaveBeenCalled();
});
it("does not create an unowned chat when files are dropped into an empty page history", async () => {
  const { api } = fixture(), imported = vi.fn();
  window.notesDesktop.library = { importFiles: imported } as unknown as typeof window.notesDesktop.library;
  const { container } = render(<AIChat pageHistory chats={[]} providers={[provider]} onChats={() => {}} onSettings={() => {}} draft="" onDraft={() => {}}/>);
  await act(async () => { fireEvent.drop(container.querySelector(".ai-chat-layout")!, {dataTransfer:{files:[new File(["text"],"source.txt")],types:["Files"]}}); });
  expect(imported).not.toHaveBeenCalled(); expect(api.createChat).not.toHaveBeenCalled();
});
