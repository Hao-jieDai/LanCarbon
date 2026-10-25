import { expect, it } from "vitest";
import type { ChatEvidence } from "../src/shared/grounding";
import { calculationContext, calculationInstructions, renderCalculations } from "../electron/chat-calculations";
const evidence = (text: string, label = "S1", needsReview = false) => ({ label, chunk: { text, anchor: { needsReview } } }) as ChatEvidence;
const calc = (a = "EUR 27 million", op = "qty", b?: string, unit: string | undefined = "亿") => "{{calc:" + JSON.stringify({ op, a: { source: "S1", quote: a }, ...(b ? { b: { source: "S2", quote: b } } : {}), ...(unit && op !== "pct" ? { unit } : {}) }) + "}}";
const context = (...texts: string[]) => calculationContext(texts.map((t, i) => evidence(t, `S${i + 1}`)));

it.each([
  ["Clinic losses EUR 27 million, 62% public.", "EUR 27 million", "EUR 0.27 亿"],
  ["  GBP 16 bil-\nlion, 43% equipment.", "GBP 16 billion", "GBP 160 亿"],
  ["Flood damage USD 4.2\nmillion.", "USD 4.2 million", "USD 0.042 亿"],
  ["医疗支出12.34亿元人民币，41%基层。", "12.34亿元人民币", "CNY 12.34 亿"],
  ["Notes contain soft\u00adhyphens. EUR 3 mil\u00adlion.", "EUR 3 million", "EUR 0.03 亿"],
])("resolves original quotations without model-authored offsets: %s", (text, quote, output) => {
  const r = renderCalculations(calc(quote), context(text));
  expect(r.text).toBe(`${quote} [S1] (${output} [S1])`);
  expect(r.check).toMatchObject({ status: "checked", resolved: 1, issues: [] });
  expect(r.check.bindings?.[0].ids[0]).toBe(`S1Q${text.indexOf(quote.split(" ")[0])}`);
});
it("calculates differences and percentages exactly and retains both originals", () => {
  const c = context("Budget EUR 27 million.", "Other EUR 18 million.");
  const diff = renderCalculations(calc(undefined, "diff", "EUR 18 million", "million"), c);
  expect(diff.text).toBe("EUR 27 million [S1]; EUR 18 million [S2] (EUR 9 million [S1] [S2])");
  expect(renderCalculations(calc(undefined, "pct", "EUR 18 million", undefined), c).text).toContain("≈ 33.33%");
});
it.each([
  ["EUR 27 million. Again EUR 27 million.", "EUR 27 million"],
  ["Cost $90 billion.", "$90 billion"],
  ["Range EUR 27, 18 and 6 million.", "EUR 27"],
  ["Annual EUR 27 million/year.", "EUR 27 million"],
])("retains matched text without fabricating units or selecting an occurrence: %s", (source, quote) => {
  const r = renderCalculations("Original values: " + calc(quote), context(source));
  expect(r.text).toBe("Original values: " + quote + " [S1]");
  expect(r.text).not.toContain("待核对"); expect(r.check.status).toBe("needs-review"); expect(r.check.resolved).toBe(0);
});
it.each(["EUR 28 million", "USD 27 million", "EUR 0.27 亿"])("rejects an invented or translated quotation %s without erasing normal prose", quote => {
  const r = renderCalculations("EUR 27 million [S1]. " + calc(quote), context("EUR 27 million."));
  expect(r.text).toBe("EUR 27 million [S1]. "); expect(r.check.status).toBe("needs-review");
});
it("does not bind a numeric substring or silently choose a different source", () => {
  const c = context("EUR 127 million.", "EUR 27 million.");
  expect(renderCalculations(calc(), c).check.resolved).toBe(0);
  const t = calc().replace('"S1"', '"S2"'); expect(renderCalculations(t, c).check.resolved).toBe(1);
});
it("uses explicit table headers only", () => {
  const c = context("| Programme | EUR million |\n|---|---|\n| Hospitals | 27 |");
  expect(renderCalculations(calc("27"), c).text).toContain("EUR 0.27 亿");
});
it.each([
  ["EUR 27 million", "USD 18 million", "diff", "million"],
  ["EUR 0 million", "EUR 18 million", "pct", undefined],
  ["EUR 27 million", "EUR 18 million", "qty", "unsupported"],
])("keeps the originals when an operation cannot be computed", (a, b, op, unit) => {
  const r = renderCalculations(calc(a, op, b, unit), context(a + ".", b + "."));
  expect(r.text).toContain(a + " [S1]"); expect(r.text).not.toContain("待核对"); expect(r.check.resolved).toBe(0); expect(r.check.status).toBe("needs-review");
});
it("rejects uncertain OCR, duplicate source labels and additional JSON fields", () => {
  for (const hits of [[evidence("EUR 27 million", "S1", true)], [evidence("EUR 27 million"), evidence("EUR 27 million")]]) {
    expect(renderCalculations(calc(), calculationContext(hits)).check.resolved).toBe(0);
  }
  expect(renderCalculations(calc().replace('"op":', '"eval":"unsafe","op":'), context("EUR 27 million")).check.resolved).toBe(0);
});
it("does not execute markers in code, and never treats ordinary prose as verified", () => {
  const c = context("EUR 27 million."), text = "`" + calc() + "`\n```\n" + calc() + "\n```\nIncorrect claim EUR 270 billion [S1].";
  const r = renderCalculations(text, c); expect(r.text).toBe(text); expect(r.check.status).toBe("not-checked");
});
it("handles every streaming split without exposing a partial calculation", () => {
  const c = context("EUR 27 million."), token = calc();
  for (let i = 1; i < token.length; i++) {
    const r = renderCalculations("Budget: " + token.slice(0, i), c, true);
    expect(r.text, String(i)).toBe("Budget: "); expect(r.check.issues, String(i)).toEqual([]);
  }
  expect(renderCalculations("Budget: " + token, c, true).text).toContain("EUR 0.27 亿");
});
it.each(["{{calc:{broken}}}", "{{calc:{\"op\":\"qty\"}", "{{cal"])("removes malformed syntax without inserting a placeholder: %s", token => {
  const r = renderCalculations("Original EUR 27 million. " + token, context("EUR 27 million."));
  expect(r.text).not.toContain("{{"); expect(r.text).not.toContain("待核对"); expect(r.check.status).toBe("needs-review");
});
it("quotes containing braces and escaped strings cannot terminate the JSON scanner early", () => {
  const quote = 'EUR 27 million {"scope": "clinic"}';
  const r = renderCalculations(calc(quote), context(quote));
  expect(r.text).toBe(quote + " [S1]"); expect(r.check.resolved).toBe(0);
});
it("does not append a generated catalogue or claim semantic verification", () => {
  const prompt = calculationInstructions();
  expect(prompt).not.toMatch(/S\d+Q\d+|Catalogue \(/); expect(prompt).toContain("arithmetic only");
  expect(prompt).toContain("original source amounts");
});
