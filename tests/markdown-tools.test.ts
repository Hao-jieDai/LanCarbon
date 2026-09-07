import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { applyDraft, directiveOptions, mathSpans, openDraft, parseTable, runCommand, serializeTable } from "../src/editor/markdownTools";
import { renderMystPreview } from "../src/preview/mystPreview";

const views: EditorView[] = [];
function editor(doc: string, from = 0, to = from) {
  const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: from, head: to }, extensions: [history(), markdown({ base: markdownLanguage })] }) });
  views.push(view); return view;
}
const source = (view: EditorView) => view.state.doc.toString();
afterEach(() => views.splice(0).forEach(view => view.destroy()));

describe("inline roles and directive panels", () => {
  it("inserts and reopens an abbreviation while preserving surrounding text and atomic undo", () => {
    const view = editor("An IPCC report", 3, 7), draft = openDraft(view, "abbr");
    expect(draft.text).toBe("IPCC"); draft.explanation = "Intergovernmental Panel on Climate Change";
    expect(applyDraft(view, draft)).toBeNull();
    expect(source(view)).toBe("An {abbr}`IPCC (Intergovernmental Panel on Climate Change)` report");
    view.dispatch({ selection: { anchor: 12 } });
    const reopened = openDraft(view, "abbr"); expect(reopened.existing).toBe(true);
    expect(reopened.explanation).toBe(draft.explanation); reopened.explanation = "Updated meaning";
    expect(applyDraft(view, reopened)).toBeNull(); expect(source(view)).toContain("IPCC (Updated meaning)");
    undo(view); expect(source(view)).toContain(draft.explanation);
    undo(view); expect(source(view)).toBe("An IPCC report");
  });

  it("formats keyboard selections, toggles them, and accepts a keyboard panel at the caret", () => {
    const view = editor("Ctrl+F", 0, 6);
    expect(runCommand(view, "kbd")).toBeNull(); expect(source(view)).toBe("{kbd}`Ctrl+F`");
    expect(runCommand(view, "kbd")).toBeNull(); expect(source(view)).toBe("Ctrl+F");
    const draft = openDraft(view, "keyboard"); draft.text = "Ctrl+Shift+Z";
    expect(applyDraft(view, draft)).toBeNull(); expect(source(view)).toBe("{kbd}`Ctrl+Shift+Z`");
    view.dispatch({ selection: { anchor: 8 } });
    expect(openDraft(view, "keyboard").text).toBe("Ctrl+Shift+Z");
  });

  it("rejects invalid roles, stale drafts and protected code without changing content", () => {
    const view = editor("IPCC", 0, 4), draft = openDraft(view, "abbr");
    expect(applyDraft(view, draft)).toContain("full meaning");
    draft.explanation = "line\nbreak"; expect(applyDraft(view, draft)).toContain("one line");
    draft.explanation = "meaning`"; expect(applyDraft(view, draft)).toContain("backticks");
    expect(source(view)).toBe("IPCC");
    view.dispatch({ changes: { from: 4, insert: "!" } }); expect(applyDraft(view, draft)).toContain("changed");
    expect(() => openDraft(editor("```text\n{abbr}`X (Y)`\n```", 15), "abbr")).toThrow();
    expect(runCommand(editor("Ctrl\nF", 0, 6), "kbd")).toContain("one line");
  });

  it.each(directiveOptions)("generates valid $label content with preview and one-step undo", ({ value, label }) => {
    const view = editor("前文", 2), draft = openDraft(view, value);
    draft.title = label + " title"; draft.text = "Outer **content**";
    draft.innerText = "Inner *content*"; draft.innerTitle = "Inner title";
    expect(applyDraft(view, draft)).toBeNull();
    const result = renderMystPreview({ id: "test", title: "Test", path: "index.md", content: source(view) });
    expect(result.error).toBeUndefined(); expect(result.warnings).toEqual([]);
    const host = document.createElement("div"); host.innerHTML = result.html;
    expect(host).toHaveTextContent("Outer content");
    if (value === "nested") expect(host.querySelector(".note .tip")).toHaveTextContent("Inner content");
    else if (value === "initiallyOpen") expect(host.querySelector("details")).toHaveAttribute("open");
    else if (value === "dropdown") expect(host.querySelector("details")).not.toHaveAttribute("open");
    else expect(host.querySelector("aside")).toHaveTextContent(label + " title");
    undo(view); expect(source(view)).toBe("前文");
  });

  it("keeps nested content inside longer outer fences and requires custom titles", () => {
    const view = editor(""), draft = openDraft(view, "nested");
    draft.innerText = ":::{note}\nDeep content\n:::"; draft.innerKind = "admonition";
    expect(applyDraft(view, draft)).toContain("title"); draft.innerTitle = "Inner";
    expect(applyDraft(view, draft)).toBeNull();
    expect(source(view)).toContain(":::::{note}\n::::{admonition} Inner\n:::{note}");
    const result = renderMystPreview({ id: "test", title: "Test", path: "index.md", content: source(view) });
    expect(result.warnings).toEqual([]); expect(result.html).toContain("Deep content");
  });
});

describe("format commands", () => {
  it("inserts bold at the cursor, places the caret inside, and isolates undo", () => {
    const view = editor("中文", 2);
    view.dispatch({ changes: { from: 2, insert: "笔记" }, selection: { anchor: 4 } });
    expect(runCommand(view, "bold")).toBeNull();
    expect(source(view)).toBe("中文笔记****");
    expect(view.state.selection.main.head).toBe(6);
    undo(view); expect(source(view)).toBe("中文笔记");
    undo(view); expect(source(view)).toBe("中文");
  });
  it("wraps a selection and toggles from inside existing bold", () => {
    const view = editor("正文文字", 2, 4);
    runCommand(view, "bold"); expect(source(view)).toBe("正文**文字**");
    runCommand(view, "bold"); expect(source(view)).toBe("正文文字");
  });
  it("changes heading levels and restores paragraphs without stacking markers", () => {
    const view = editor("## 标题\n正文", 3);
    runCommand(view, "heading1"); expect(source(view)).toBe("# 标题\n正文");
    runCommand(view, "heading0"); expect(source(view)).toBe("标题\n正文");
  });
  it("aligns the current line and updates an existing alignment block", () => {
    const view = editor("Before\nCentered text\nAfter", 10);
    expect(runCommand(view, "alignCenter")).toBeNull();
    expect(source(view)).toContain(":::{div}\n:class: lc-align-center\n\nCentered text\n:::");
    expect(source(view)).toMatch(/^Before\n\n/); expect(source(view)).toMatch(/\n\nAfter$/);
    expect(runCommand(view, "alignRight")).toBeNull();
    expect(source(view)).toContain(":class: lc-align-right");
    expect(source(view)).not.toContain("lc-align-center");
    undo(view); expect(source(view)).toContain(":class: lc-align-center");
    undo(view); expect(source(view)).toBe("Before\nCentered text\nAfter");
  });
  it("does not include an unselected line when selection ends at its start", () => {
    const view = editor("甲\n乙\n丙", 0, 4);
    runCommand(view, "bullet"); expect(source(view)).toBe("- 甲\n- 乙\n丙");
    runCommand(view, "ordered"); expect(source(view)).toBe("1. 甲\n2. 乙\n丙");
  });
  it.each([["bullet", "- "], ["ordered", "1. "]] as const)("starts %s on an empty line and toggles it off", (command, marker) => {
    const view = editor(""); runCommand(view, command); expect(source(view)).toBe(marker);
    runCommand(view, command); expect(source(view)).toBe("");
  });
  it("keeps descendants nested when changing a parent marker width", () => {
    const view = editor("- parent\n  - child\n- next", 3);
    runCommand(view, "ordered"); expect(source(view)).toBe("1. parent\n   - child\n- next");
    runCommand(view, "bullet"); expect(source(view)).toBe("- parent\n  - child\n- next");
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    runCommand(view, "ordered"); expect(source(view)).toBe("1. parent\n   1. child\n2. next");
  });
  it("quotes and unquotes a multi-paragraph selection", () => {
    const view = editor("甲\n\n乙", 0, 4);
    runCommand(view, "quote"); expect(source(view)).toBe("> 甲\n> \n> 乙");
    runCommand(view, "quote"); expect(source(view)).toBe("甲\n\n乙");
  });
  it("indents a list item with its descendants", () => {
    const text = "- parent\n- item\n  - child\n- next";
    const view = editor(text, text.indexOf("item"));
    runCommand(view, "indent"); expect(source(view)).toBe("- parent\n  - item\n    - child\n- next");
    runCommand(view, "outdent"); expect(source(view)).toBe(text);
  });
  it("uses sibling structure and marker width for ordered-list indentation", () => {
    const text = "1. parent\n   - previous child\n2. item\n   - child\n3. next";
    const view = editor(text, text.indexOf("item"));
    expect(runCommand(view, "indent")).toBeNull();
    expect(source(view)).toBe("1. parent\n   - previous child\n   2. item\n      - child\n3. next");
    runCommand(view, "outdent"); expect(source(view)).toBe(text);
  });
  it.each(["bold", "italic", "inlineCode", "underline"] as const)("cancels an empty %s insertion", format => {
    const view = editor(""); runCommand(view, format); runCommand(view, format); expect(source(view)).toBe("");
  });
  it.each(["```python\nx=1\n```", "$$\nx=1\n$$", "| A | B |\n| --- | --- |\n| 1 | 2 |", "```{math}\n:label: eq\nx=1\n```"])("protects special content: %s", text => {
    const view = editor(text, Math.floor(text.length / 2));
    expect(runCommand(view, "bold")).toBeTruthy(); expect(source(view)).toBe(text);
  });
  it("preserves blank paragraph boundaries when applying bold", () => {
    const view = editor("甲\n\n乙", 0, 4); runCommand(view, "bold"); expect(source(view)).toBe("**甲**\n\n**乙**");
    runCommand(view, "bold"); expect(source(view)).toBe("甲\n\n乙");
  });
  it("escapes code fences and toggles MyST roles", () => {
    const view = editor("a `b`", 0, 5); runCommand(view, "inlineCode"); expect(source(view)).toBe("`` a `b` ``");
    const role = editor("文字", 0, 2); runCommand(role, "underline"); expect(source(role)).toBe("{underline}`文字`");
    runCommand(role, "underline"); expect(source(role)).toBe("文字");
  });
});

describe("table panels", () => {
  it("uses parsed table boundaries and preserves surrounding text on edit and undo", () => {
    const text = "之前\n\n| A | B |\n| :--- | ---: |\n| 1 | 2 |\n\n之后";
    const view = editor(text, text.indexOf("1 |"));
    const draft = openDraft(view, "table"); expect(draft.existing).toBe(true);
    expect(draft.table.align).toEqual(["left", "right"]);
    draft.table.rows[1][0] = "中文 | **文字**";
    expect(applyDraft(view, draft)).toBeNull();
    expect(source(view)).toContain("中文 \\| **文字**"); expect(source(view)).toMatch(/^之前\n\n/); expect(source(view)).toMatch(/\n\n之后$/);
    undo(view); expect(source(view)).toBe(text);
  });
  it("preserves escaped pipes without adding escapes on repeated edits", () => {
    const text = "| A | B |\n| --- | --- |\n| a \\| b | `x` |";
    expect(serializeTable(parseTable(text))).toBe(text);
  });
  it("rejects rows whose cells would be discarded", () => {
    expect(() => parseTable("| A | B |\n| --- | --- |\n| 1 | 2 | 3 |")).toThrow("irregular structure");
  });
  it("does not recognize pipe text or fenced tables as editable tables", () => {
    const view = editor("普通 | 正文", 2); expect(openDraft(view, "table").existing).toBe(false);
    const code = editor("```\n| A | B |\n| --- | --- |\n```", 10); expect(() => openDraft(code, "table")).toThrow();
  });
  it("keeps drafts atomic and refuses stale content", () => {
    const view = editor("原文", 2); const draft = openDraft(view, "table");
    view.dispatch({ changes: { from: 0, insert: "新" } }); expect(applyDraft(view, draft)).toContain("The note has changed"); expect(source(view)).toBe("新原文");
  });
});

describe("formula, link and block panels", () => {
  it("finds inline and block math while ignoring code and escaped dollars", () => {
    expect(mathSpans("`$x$` \\$5 and $a^2$\n\n$$\nb=1\n$$").map(span => [span.text, span.display])).toEqual([["a^2", false], ["b=1", true]]);
  });
  it("reopens formulas and changes inline to block with paragraph boundaries", () => {
    const view = editor("前 $x^2$ 后", 4); const draft = openDraft(view, "math");
    expect(draft.text).toBe("x^2"); draft.text = "\\frac{a}{b}"; draft.display = true;
    expect(applyDraft(view, draft)).toBeNull(); expect(source(view)).toBe("前 \n\n$$\n\\frac{a}{b}\n$$\n\n 后");
  });
  it("refuses labelled formulas and MyST directives", () => {
    expect(() => openDraft(editor("$$\\label{eq}x=1$$", 5), "math")).toThrow();
    expect(() => openDraft(editor("```{math}\nx=1\n```", 11), "math")).toThrow();
  });
  it("edits balanced link URLs, and removes markup without deleting the label", () => {
    const view = editor("前 [链接](https://a.com/a(b)) 后", 5);
    const draft = openDraft(view, "link"); expect(draft.url).toBe("https://a.com/a(b)");
    draft.url = "https://b.com"; expect(applyDraft(view, draft)).toBeNull();
    expect(source(view)).toBe("前 [链接](<https://b.com>) 后");
    view.dispatch({ selection: { anchor: 5 } }); expect(applyDraft(view, openDraft(view, "link"), true)).toBeNull(); expect(source(view)).toBe("前 链接 后");
  });
  it("generates safe code and nested directive fences", () => {
    const view = editor("正文", 2); const draft = openDraft(view, "code"); draft.text = "```md\ntext\n```"; draft.language = "markdown";
    applyDraft(view, draft); expect(source(view)).toContain("````markdown\n```md\ntext\n```\n````");
    const note = editor(""); const block = openDraft(note, "note"); block.text = ":::{tip}\n内部\n:::"; applyDraft(note, block); expect(source(note)).toContain("::::{note}");
  });
});
