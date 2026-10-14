import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { translationSelection } from "../src/components/TranslationWidget";
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });
describe("global translation selection", () => {
  it("reads selected translation instructions without changing the prompt", () => {
    const prompt = document.createElement("textarea"); prompt.setAttribute("aria-label", "Translation prompt"); prompt.value = "Translate the supplied English word."; document.body.append(prompt); prompt.setSelectionRange(0, 9);
    expect(translationSelection(prompt)).toBe("Translate"); expect(prompt.value).toBe("Translate the supplied English word.");
  });
  it("reads a text input selection without changing its value", () => {
    const input = document.createElement("input"); input.value = "climate change"; document.body.append(input); input.setSelectionRange(0, 7);
    expect(translationSelection(input)).toBe("climate"); expect(input.value).toBe("climate change");
  });
  it("excludes secret inputs, masked keys and the translation panel", () => {
    const input = document.createElement("input"); input.type = "password"; input.value = "private-api-key"; document.body.append(input); input.setSelectionRange(0, input.value.length); expect(translationSelection(input)).toBe("");
    input.type = "text"; input.setAttribute("aria-label", "API base address"); input.setSelectionRange(0, input.value.length); expect(translationSelection(input)).toBe("");
    input.removeAttribute("aria-label"); input.setAttribute("data-translation-exclude", ""); expect(translationSelection(input)).toBe("");
  });
  it("reads application and preview text across DOM nodes", () => {
    const paragraph = document.createElement("p"); paragraph.innerHTML = "climate <strong>change</strong>"; document.body.append(paragraph);
    const range = document.createRange(); range.selectNodeContents(paragraph); window.getSelection()!.addRange(range);
    expect(translationSelection(paragraph)).toBe("climate change");
    paragraph.setAttribute("data-translation-exclude", ""); expect(translationSelection(paragraph)).toBe("");
  });
  it("reads CodeMirror's full document selection without altering text or selection", () => {
    const parent = document.createElement("div"); document.body.append(parent); const doc = "prefix ".repeat(800) + "stranded assets";
    const view = new EditorView({ parent, state: EditorState.create({ doc, selection: { anchor: doc.length - 15, head: doc.length } }) });
    try { expect(translationSelection(view.contentDOM)).toBe("stranded assets"); expect(view.state.doc.toString()).toBe(doc); expect(view.state.selection.main.to).toBe(doc.length); } finally { view.destroy(); }
  });
});
