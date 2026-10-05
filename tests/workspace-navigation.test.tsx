import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { addNoteToBook, createBook } from "../src/shared/books";
import { createNote } from "../src/shared/notes";
import type { NotesDesktopApi } from "../src/shared/types";

const alpha = createNote({ id: "alpha", title: "Alpha", updatedAt: "2026-01-01", createdAt: "2026-03-01" });
const beta = createNote({ id: "beta", title: "Beta", content: "Keep this content", updatedAt: "2026-03-01", createdAt: "2026-01-01" });
const first = createBook("Z Book");
const second = createBook("A Book");
const child = createNote({ id: "child", title: "Selected child" });
const book = addNoteToBook(first.book, child, { parentPageId: first.book.homePageId });
let save: ReturnType<typeof vi.fn>;
beforeEach(() => {
  save = vi.fn().mockResolvedValue({ ok: true });
  window.notesDesktop = {
    loadWorkspace: vi.fn().mockResolvedValue({ ok: true, isFirstRun: false, migrated: false, workspace: { version: 2, notes: [alpha, beta, first.homeNote, second.homeNote, child], books: [book, second.book] } }),
    saveWorkspace: save,
    getDataLocation: vi.fn().mockResolvedValue({ ok: true, path: "D:\\LanCarbon\\Data" })
  } as unknown as NotesDesktopApi;
});

describe("workspace navigation preferences", () => {
  it("sorts both lists independently, preserves selections and does not save content when changing a preference", async () => {
    const view = render(<App />);
    await screen.findByRole("button", { name: /^Beta/ });
    const booksTab = screen.getByRole("button", { name: "Books" });
    expect(booksTab.querySelector("kbd")).toHaveTextContent("Q"); expect(booksTab).toHaveAttribute("title", "Switch between Notes and Books (Ctrl+Q)");
    expect(document.querySelector(".workspace-shortcut")).toBeNull();
    await waitFor(() => expect(save).toHaveBeenCalled()); save.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^Beta/ }));
    fireEvent.change(screen.getByLabelText("Sort Notes"), { target: { value: "title" } });
    const titles = () => [...document.querySelectorAll(".note-card h3")].map(item => item.textContent);
    expect(titles()).toEqual(["ReadMe", "Alpha", "Beta"]);
    expect(screen.getByLabelText("Note title")).toHaveValue("Beta");
    fireEvent.keyDown(document, { key: "q", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Sort Books"), { target: { value: "title" } });
    expect(within(screen.getByLabelText("Select Book")).getAllByRole("option").map(option => option.textContent)).toEqual(["Select Book", "A Book", "Z Book"]);
    expect(screen.getByLabelText("Select Book")).toHaveValue(book.id);
    fireEvent.click(screen.getByRole("button", { name: "Selected child" }));
    fireEvent.keyDown(document, { key: "Q", ctrlKey: true });
    expect(screen.getByLabelText("Note title")).toHaveValue("Beta");
    expect(screen.getByLabelText("Sort Notes")).toHaveValue("title");
    fireEvent.keyDown(document, { key: "q", ctrlKey: true });
    expect(screen.getByLabelText("Note title")).toHaveValue("Selected child");
    expect(save).not.toHaveBeenCalled();
    view.unmount(); render(<App />);
    expect(await screen.findByLabelText("Sort Notes")).toHaveValue("title");
    fireEvent.keyDown(document, { key: "q", ctrlKey: true });
    expect(screen.getByLabelText("Sort Books")).toHaveValue("title");
  });

  it("does not toggle for composition, repeat, other modifiers or while a dialog is open", async () => {
    localStorage.setItem("lancarbon-notes-sort-v1", "invalid");
    render(<App />); await screen.findByLabelText("Sort Notes");
    expect(screen.getByLabelText("Sort Notes")).toHaveValue("updated");
    for (const flags of [{ isComposing: true }, { repeat: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) {
      fireEvent.keyDown(document, { key: "q", ctrlKey: true, ...flags });
      expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-pressed", "true");
    }
    fireEvent.keyDown(document, { key: "q", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "New Book" }));
    fireEvent.keyDown(screen.getByLabelText("Book Name"), { key: "q", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Create Book" })).toBeVisible();
  });
});
