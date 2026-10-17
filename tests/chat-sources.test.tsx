import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChatSources } from "../src/components/ChatSources";
import { emptyKnowledgeScope, selectedKnowledgeSources, type KnowledgeSource } from "../src/shared/knowledge";
import type { ChatSourceCatalogue } from "../src/shared/grounding";
import { filterSourceTree, sourceTree, toggleSourceNode } from "../src/shared/chatSources";
import { validKnowledgeScope } from "../electron/knowledge-sources";

const parent = `folder_${"a".repeat(32)}`, child = `folder_${"b".repeat(32)}`;
function fixture(): ChatSourceCatalogue {
  const note = (id: string, title: string, book = false): KnowledgeSource => ({ id: `note:${id}`, entityId: id, title, kind: "note", format: "markdown", fingerprint: "a".repeat(64), locations: [{ kind: book ? "book" : "note", label: title }], tags: [], attachments: [], systemManaged: false });
  const file = (id: string, folderId: string | null): KnowledgeSource => ({ ...note(id, `${id}.pdf`), id: `file:${id}`, kind: "file", format: "pdf", locations: [{ kind: "file", label: id }], imported: true, folderId });
  return {
    sources: [note("memo", "Daily memo"), note("home", "Home", true), note("chapter", "Methods", true), note("page", "Discount rate", true), file("paper", child), file("root", null)],
    books: [{ id: "book", title: "Research Book", noteIds: ["home", "chapter", "page"], systemManaged: false, homePageId: "home", rootPageIds: ["chapter"], pages: [{ id: "home", noteId: "home", title: "Home", children: [] }, { id: "chapter", noteId: "chapter", title: "Methods", children: ["page"] }, { id: "page", noteId: "page", title: "Discount rate", children: [] }] }],
    folders: [{ id: parent, parentId: null, name: "Literature" }, { id: child, parentId: parent, name: "Refineries" }]
  };
}

it("uses the actual Book and folder hierarchy and reveals a matching page with its ancestors", () => {
  const catalogue = fixture(), tree = sourceTree(catalogue, false);
  expect(tree.books[0].children.map(node => node.title)).toEqual(["Home", "Methods"]);
  expect(tree.books[0].children[1].children[0].title).toBe("Discount rate");
  expect(tree.library[0].children[0].children[0].title).toBe("paper.pdf");
  expect(tree.library[1].title).toBe("root.pdf");
  const filtered = filterSourceTree(tree.books, "Discount");
  expect(filtered[0].title).toBe("Research Book"); expect(filtered[0].children[0].title).toBe("Methods");
  expect(filtered[0].sourceIds).toHaveLength(3);
});

it("saves whole selections with leaf exceptions and keeps linked-attachment exclusions effective", () => {
  const catalogue = fixture(), tree = sourceTree(catalogue, false);
  catalogue.sources[0].attachments = ["file:paper"];
  let scope = toggleSourceNode(catalogue, emptyKnowledgeScope(), tree.books[0], true);
  scope = toggleSourceNode(catalogue, scope, tree.books[0].children[1].children[0], false);
  scope = toggleSourceNode(catalogue, scope, tree.library[0], true);
  scope = toggleSourceNode(catalogue, scope, tree.notes[0], true);
  scope = toggleSourceNode(catalogue, scope, tree.library[0].children[0].children[0], false);
  const reloaded = validKnowledgeScope(JSON.parse(JSON.stringify(scope)));
  expect(selectedKnowledgeSources(catalogue, reloaded)).toEqual(new Set(["note:home", "note:chapter", "note:memo"]));
  scope = toggleSourceNode(catalogue, reloaded, tree.library[0], true);
  expect(selectedKnowledgeSources(catalogue, scope).has("file:paper")).toBe(true);
  scope = toggleSourceNode(catalogue, scope, tree.books[0].children[1], true);
  expect(selectedKnowledgeSources(catalogue, scope).has("note:page")).toBe(true);
  expect(() => validKnowledgeScope({ ...scope, excludedNoteIds: [123] } as any)).toThrow();
});

it("separates expansion from selection, shows partial selection and preserves it across search and collapse", async () => {
  const saved = vi.fn(async () => {});
  render(<ChatSources catalogue={fixture()} onSave={saved} onClose={() => {}} onImport={async () => {}}/>);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByLabelText("Select Discount rate")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand Book: Research Book" }));
  expect(screen.getByText("0 sources selected")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Select Book: Research Book"));
  fireEvent.click(screen.getByRole("button", { name: "Expand Methods" }));
  fireEvent.click(screen.getByLabelText("Select Discount rate"));
  expect(screen.getByLabelText("Select Book: Research Book")).toBePartiallyChecked();
  fireEvent.click(screen.getByRole("button", { name: "Collapse Book: Research Book" }));
  fireEvent.change(screen.getByLabelText("Find chat sources"), { target: { value: "Discount" } });
  expect(screen.getByLabelText("Select Discount rate")).not.toBeChecked();
  expect(screen.getByText("2 sources selected")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find chat sources"), { target: { value: "" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use sources" })); });
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ bookIds: ["book"], excludedNoteIds: ["page"] }));
});
it("returns to ordinary Chat when every descendant of an inherited folder selection is unchecked", async () => {
  const catalogue = fixture(), saved = vi.fn(async () => {});
  render(<ChatSources catalogue={catalogue} initial={{ ...emptyKnowledgeScope(), folderIds: [parent], excludedFileIds: ["paper"] }} onSave={saved} onClose={() => {}} onImport={async () => {}}/>);
  expect(screen.getByText("0 sources selected")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use sources" })); });
  expect(saved).toHaveBeenCalledWith(emptyKnowledgeScope());
});
