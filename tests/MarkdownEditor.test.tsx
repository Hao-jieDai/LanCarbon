import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/components/MarkdownEditor";

function ControlledEditor({ initial = "", theme = "light" as const, changed = vi.fn() }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor value={value} theme={theme} onChange={next => { setValue(next); changed(next); }} />;
}

describe("MarkdownEditor", () => {
  it("provides an accessible spellcheck-free CodeMirror Markdown editor", async () => {
    render(<ControlledEditor initial="# Heading\n\nBody" />);
    const editor = screen.getByLabelText("Note content");
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveAttribute("spellcheck", "false");
    expect(document.querySelector(".cm-lineNumbers")).toBeInTheDocument();
    expect(editor).toHaveAttribute("data-language", "markdown");
    expect(editor.querySelectorAll("span").length).toBeGreaterThan(0);
  });

  it("emits multiline Chinese input and handles Tab indentation", async () => {
    const changed = vi.fn();
    render(<ControlledEditor changed={changed} />);
    const editor = screen.getByLabelText("Note content");
    const view = EditorView.findFromDOM(editor)!;
    act(() => view.dispatch({ changes: { from: 0, insert: "中文\nMarkdown" }, selection: { anchor: 11 } }));
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith("中文\nMarkdown"));
    act(() => { view.focus(); fireEvent.keyDown(editor, { key: "Tab", code: "Tab" }); });
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith("中文\n  Markdown"));
  });

  it("keeps the same editor instance when the app theme changes", () => {
    const { rerender } = render(<MarkdownEditor value="text" theme="light" onChange={vi.fn()} />);
    const first = document.querySelector(".cm-editor");
    rerender(<MarkdownEditor value="text" theme="dark" onChange={vi.fn()} />);
    expect(document.querySelector(".cm-editor")).toBe(first);
  });

  it("formats the preserved selection from toolbar buttons and keyboard shortcuts", async () => {
    const user = userEvent.setup(); render(<ControlledEditor initial="中文笔记" />);
    const view = EditorView.findFromDOM(screen.getByLabelText("Note content"))!;
    act(() => view.dispatch({ selection: { anchor: 0, head: 2 } }));
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(view.state.doc.toString()).toBe("**中文**笔记");
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    act(() => { view.focus(); fireEvent.keyDown(view.contentDOM, { key: "b", ctrlKey: true }); });
    expect(view.state.doc.toString()).toBe("中文笔记");
    act(() => fireEvent.keyDown(view.contentDOM, { key: "z", code: "KeyZ", keyCode: 90, ctrlKey: true }));
    expect(view.state.doc.toString()).toBe("**中文**笔记");
    act(() => fireEvent.keyDown(view.contentDOM, { key: "Z", code: "KeyZ", keyCode: 90, ctrlKey: true, shiftKey: true }));
    expect(view.state.doc.toString()).toBe("中文笔记");
  });

  it("shows Align before the compact Abbr tool and applies a menu alignment", async () => {
    const user = userEvent.setup(); render(<ControlledEditor initial="Aligned text" />);
    const toolbar = screen.getByRole("group", { name: "Formatting toolbar" });
    const align = within(toolbar).getByRole("button", { name: "Align" });
    const abbr = within(toolbar).getByRole("button", { name: "Abbr" });
    expect(align.compareDocumentPosition(abbr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(align); await user.click(screen.getByRole("menuitem", { name: "Align center" }));
    expect(EditorView.findFromDOM(screen.getByLabelText("Note content"))!.state.doc.toString()).toContain(":class: lc-align-center");
  });

  it("keeps table drafts out of autosave until applying and supports reopening", async () => {
    const user = userEvent.setup(), changed = vi.fn(); render(<ControlledEditor initial="前文" changed={changed} />);
    const view = EditorView.findFromDOM(screen.getByLabelText("Note content"))!;
    act(() => view.dispatch({ selection: { anchor: 2 } }));
    await user.click(screen.getByRole("button", { name: "Table" }));
    await user.type(screen.getByLabelText("Header 1"), "项目");
    await user.type(screen.getByLabelText("Row 1, column 1"), "内容");
    expect(changed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(view.state.doc.toString()).toContain("| 项目 |  |");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("内容") } }));
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByLabelText("Row 1, column 1")).toHaveValue("内容");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(view.state.doc.toString()).toBe("前文");
  });

  it("previews formula templates, selects placeholders and refuses invalid math", async () => {
    const user = userEvent.setup(); render(<ControlledEditor />);
    await user.click(screen.getByRole("button", { name: "Math" }));
    await user.click(screen.getByRole("button", { name: "Fraction" }));
    const formula = screen.getByLabelText("Formula") as HTMLTextAreaElement;
    await waitFor(() => expect(formula.selectionStart).toBe(6));
    expect(formula.selectionEnd).toBe(7);
    expect(screen.getByLabelText("Math preview").querySelector(".katex")).toBeInTheDocument();
    await user.clear(formula); await user.type(formula, "\\invalidCommand");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please correct the formula");
    await user.clear(formula); await user.type(formula, "E=mc^2");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(EditorView.findFromDOM(screen.getByLabelText("Note content"))!.state.doc.toString()).toBe("$E=mc^2$");
  });

  it("generates valid aligned equations and matrices from templates", async () => {
    const user = userEvent.setup(); render(<ControlledEditor />);
    await user.click(screen.getByRole("button", { name: "Math" }));
    await user.click(screen.getByRole("button", { name: "Aligned equations" }));
    expect(screen.getByLabelText("Math display")).toHaveTextContent("Display");
    expect(screen.getByLabelText("Math preview").querySelector(".katex")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Formula"));
    await user.click(screen.getByRole("button", { name: "Insert matrix" }));
    expect(screen.getByLabelText("Math preview").querySelector(".katex")).toBeInTheDocument();
  });

  it("opens links with Ctrl+K and closes dialogs when switching note or preview", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<MarkdownEditor key="one" value="链接文字" theme="light" onChange={changed} />);
    const view = EditorView.findFromDOM(screen.getByLabelText("Note content"))!;
    act(() => { view.dispatch({ selection: { anchor: 0, head: 4 } }); view.focus(); fireEvent.keyDown(view.contentDOM, { key: "k", ctrlKey: true }); });
    expect(screen.getByLabelText("Link text")).toHaveValue("链接文字");
    await user.type(screen.getByLabelText("Link URL"), "https://example.com");
    rerender(<MarkdownEditor key="two" value="另一篇" theme="light" onChange={changed} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(changed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Table" }));
    rerender(<MarkdownEditor key="two" value="另一篇" theme="light" visible={false} onChange={changed} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Formatting toolbar" })).not.toBeInTheDocument();
  });

  it("inserts a dropdown with its title and content from Directives", async () => {
    const user = userEvent.setup(); render(<ControlledEditor />);
    await user.click(screen.getByRole("button", { name: "Directives" }));
    await user.click(screen.getByRole("menuitem", { name: "Dropdown" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Dropdown title"), "详情");
    await user.type(dialog.getByLabelText("Block content"), "折叠正文");
    await user.click(dialog.getByRole("button", { name: "Apply" }));
    expect(EditorView.findFromDOM(screen.getByLabelText("Note content"))!.state.doc.toString()).toContain(":::{dropdown} 详情\n折叠正文\n:::");
  });
});
