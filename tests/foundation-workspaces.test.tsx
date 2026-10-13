import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { createBook, createEmptyWorkspace } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import type { NotesDesktopApi } from "../src/shared/types";

const note = createNote({ id: "foundation-note", title: "Personal writing", content: "Saved writing" });
const { book, homeNote } = createBook("Personal Book");
const asset = { id: "a".repeat(64) + ".pdf", name: "Original.pdf", size: 1234, mime: "application/octet-stream", createdAt: "2026-10-01" };
beforeEach(() => {
  window.notesDesktop = {
    loadWorkspace: vi.fn().mockResolvedValue({ ok: true, isFirstRun: false, migrated: false, workspace: { ...createEmptyWorkspace([note, homeNote]), books: [book] } }),
    saveWorkspace: vi.fn().mockResolvedValue({ ok: true }),
    getDataLocation: vi.fn().mockResolvedValue({ ok: true, path: "D:\\LanCarbon\\Data" }),
    assets: { list: vi.fn().mockResolvedValue({ ok: true, assets: [asset] }), saveCopy: vi.fn().mockResolvedValue({ ok: true }) }
  } as unknown as NotesDesktopApi;
});

describe("foundation workspaces", () => {
  it("renames resource metadata and navigates its writing reference without rewriting the Note", async () => {
    const linked = { ...note, content: `Before\n[Original label](assets/${asset.id})\nAfter` };
    vi.mocked(window.notesDesktop.loadWorkspace).mockResolvedValue({ ok: true, isFirstRun: false, migrated: false, workspace: { version: 2, notes: [linked, homeNote], books: [book] } });
    window.notesDesktop.assets!.rename = vi.fn().mockImplementation(async (id, name) => ({ ok: true, asset: { ...asset, id, name } }));
    render(<App />); await screen.findByDisplayValue(note.title);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Original.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Original.pdf" }));
    fireEvent.change(screen.getByLabelText("Resource name"), { target: { value: "Renamed.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("heading", { name: "Renamed.pdf" })).toBeVisible();
    expect(window.notesDesktop.assets!.rename).toHaveBeenCalledWith(asset.id, "Renamed.pdf");
    fireEvent.click(screen.getByRole("button", { name: /Notes \/ Personal writing · line 2/ }));
    await screen.findByDisplayValue(note.title);
    expect(screen.getByLabelText("Note content")).toHaveTextContent("Original label");
    expect(document.querySelector(".cm-activeLine")).toHaveTextContent(asset.id);
    expect(window.notesDesktop.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.arrayContaining([expect.objectContaining({ id: note.id, content: linked.content })]) }));
  });
  it("keeps edited writing across all workspaces and restores Research selection after restarting", async () => {
    const view = render(<App />); await screen.findByDisplayValue("Personal writing");
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Edited writing" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByRole("heading", { name: "Chat" })).toBeVisible();
    expect(screen.queryByLabelText("Note title")).toBeNull();
    fireEvent.keyDown(document, { key: "n", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Research" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(window.notesDesktop.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.arrayContaining([expect.objectContaining({ id: note.id, title: "Edited writing" })]) })));
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Original.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Save a copy" }));
    expect(window.notesDesktop.assets!.saveCopy).toHaveBeenCalledWith(asset.id);
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByLabelText("Note title")).toHaveValue("Edited writing");
    fireEvent.click(screen.getByRole("button", { name: "Books" }));
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    fireEvent.keyDown(document, { key: "q", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    view.unmount(); render(<App />);
    expect(await screen.findByRole("heading", { name: "Chat" })).toBeVisible();
  });
  it("blocks editing and saving when the backend rejects a workspace format", async () => {
    vi.mocked(window.notesDesktop.loadWorkspace).mockResolvedValue({ ok: false, workspace: createEmptyWorkspace(), isFirstRun: false, migrated: false, error: "Unsupported data format" });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported data format");
    expect(screen.queryByRole("button", { name: "New Note" })).toBeNull();
    expect(window.notesDesktop.saveWorkspace).not.toHaveBeenCalled();
  });
});
