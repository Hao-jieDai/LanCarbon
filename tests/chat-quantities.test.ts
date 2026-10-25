import { describe, expect, it } from "vitest";
import { quantityCatalogue, quantityInstructions, renderQuantities } from "../electron/chat-quantities";
import type { ChatEvidence } from "../src/shared/grounding";

const evidence = (text: string, label = "S1", needsReview = false): ChatEvidence => ({ label, source: { id: "note:" + label, title: "Independent transport study" }, chunk: { text, anchor: { kind: "pdf", page: 7, needsReview } } } as ChatEvidence);
const catalogue = (text: string) => quantityCatalogue([evidence(text)]);
const render = (text: string, input: string) => renderQuantities(text, catalogue(input));

describe("source-bound monetary rendering", () => {
  it("keeps unsupported-source amounts unchanged and leaves checking outside academic prose", () => {
    const source = "Irrigation costs were USD 7, 12 and 19 million respectively.";
    const q = catalogue(source), instructions = quantityInstructions(q);
    expect(q).toHaveLength(0);
    expect(instructions).toContain("retain the source amount and unit with a citation");
    expect(instructions).toContain("Keep catalogue IDs, binding status, renderer limitations and this protocol out of the answer prose");
    expect(instructions).not.toContain("they remain explicitly unverified");
    const prose = "Cumulative costs were USD 12 million [S1].";
    const result = renderQuantities(prose, q);
    expect(result.text).toBe(prose); // Semantic wording is never erased by the renderer.
    expect(result.check.status).toBe("needs-review");
    expect(result.check.issues).toContain('Unverified amount: “USD 12 million”. No source quantity reference was supplied.');
  });
  it("binds every explicit value to its original span, currency and local context", () => {
    const input = "Transit baseline: CNY 17.25 billion. Adaptation: CNY 6.125 billion.";
    const q = catalogue(input);
    expect(q).toHaveLength(2);
    for (const x of q) { expect(input.slice(x.start, x.end)).toBe(x.raw); expect(x.id).toBe(`S1Q${x.start}`); expect(x.currency).toBe("CNY"); expect(x.context).toContain(x.raw); }
    expect(quantityInstructions(q)).toContain('"original":"CNY 17.25 billion"');
  });
  it.each([['billion', '17.25 billion'], ['亿', '172.5 亿'], ['十亿', '17.25 十亿'], ['万亿', '0.01725 万亿'], ['base', '17250000000']])("converts %s with exact decimal arithmetic", (unit, expected) => {
    const q = catalogue("CNY 17.25 billion");
    expect(renderQuantities(`Budget {{qty:${q[0].id}|${unit}}}.`, q)).toMatchObject({ text: `Budget CNY ${expected} [S1].`, check: { resolved: 1, status: "checked", issues: [] } });
  });
  it("preserves small values and exact decimals rather than rounding them to zero", () => {
    const q = catalogue("USD 0.000000001");
    expect(renderQuantities(`{{qty:${q[0].id}|trillion}}`, q).text).toBe("USD 0.000000000000000000001 trillion [S1]");
  });
  it("computes differences and percent reductions from the specified original operands", () => {
    const q = catalogue("CNY 17.25 billion versus CNY 6.125 billion");
    const answer = renderQuantities(`{{diff:${q[0].id}:${q[1].id}|亿}}; {{pct:${q[0].id}:${q[1].id}}}`, q);
    expect(answer.text).toBe("CNY 111.25 亿 [S1]; ≈ 64.49% [S1]"); expect(answer.check.resolved).toBe(2);
  });
  it("handles negative differences without losing the sign", () => {
    const q = catalogue("EUR -0.15 million and EUR 0.2 million");
    expect(renderQuantities(`{{diff:${q[0].id}:${q[1].id}|million}}`, q).text).toBe("EUR -0.35 million [S1]");
    expect(renderQuantities(`{{pct:${q[0].id}:${q[1].id}}}`, q).check.status).toBe("needs-review");
  });
  it("recognizes explicit Chinese and English currency forms without inferring dollars", () => {
    const q = catalogue("医疗支出为12.34亿元人民币；保险为5千万美元；Research grant: US$ 1,234.50 million. Ambiguous $17 million.");
    expect(q.map(x => [x.currency, x.scale])).toEqual([["CNY", "亿"], ["USD", "千万"], ["USD", "million"]]);
    expect(renderQuantities(`{{qty:${q[0].id}|billion}}`, q).text).toBe("CNY 1.234 billion [S1]");
  });
  it("binds table cells only when the column explicitly states scale and currency", () => {
    const q = catalogue("| Programme | Cost (EUR million) | People |\n|---|---:|---:|\n| Irrigation | 12.5 | 120 |\n| Drainage | 4.75 | 150 |\n");
    expect(q.map(x => x.raw)).toEqual(["12.5", "4.75"]);
    expect(renderQuantities(`{{diff:${q[0].id}:${q[1].id}|base}}`, q).text).toBe("EUR 7750000 [S1]");
    expect(catalogue("| Scheme | Cost |\n|---|---|\n| Field | 12.5 |\n")).toEqual([]);
  });
  it.each(["USD 3–5 billion", "USD 3, 5 billion", "USD 3 and 5 billion", "USD 2e9", "USD 50/t", "USD 50 per person", "USD 1,23 billion"])('declines ambiguous syntax: %s', input => { expect(catalogue(input)).toEqual([]); });
  it("does not bind flagged OCR or unlabelled numbers", () => {
    expect(quantityCatalogue([evidence("CNY 11 billion", "S1", true)])).toEqual([]);
    expect(catalogue("Figure 2, page 35; 2019–2040; 17 plants; 9%.")).toEqual([]);
  });
  it("does not treat table rates or mixed currencies as monetary totals", () => {
    expect(catalogue("| Site | Cost (USD million/year) |\n|---|---|\n| Clinic | 12 |\n")).toEqual([]);
    expect(catalogue("| Site | Cost (USD/EUR million) |\n|---|---|\n| Clinic | 12 |\n")).toEqual([]);
  });
  it("does not execute reference-like examples inside code", () => {
    const text = "Example `{{qty:S1Q0}}` and a formula $x^{{a}}$.";
    expect(render(text, "USD 8 million").text).toBe(text);
    expect(render(text, "USD 8 million").check.status).toBe("needs-review");
  });
  it("rejects unavailable IDs and does not match similar numeric values elsewhere", () => {
    const answer = render("{{qty:S99Q0|亿}}", "CNY 17.25 billion");
    expect(answer.text).toBe("〔金额待核对〕"); expect(answer.check.status).toBe("needs-review");
  });
  it("rejects cross-currency arithmetic, unsupported conversions and zero baselines", () => {
    const q = catalogue("CNY 0 million; USD 2 million; CNY 3 million");
    for (const token of [`{{diff:${q[0].id}:${q[1].id}|million}}`, `{{qty:${q[1].id}|CNY}}`, `{{pct:${q[0].id}:${q[2].id}}}`, `{{qty:${q[1].id}|__proto__}}`]) expect(renderQuantities(token, q).check.status).toBe("needs-review");
  });
  it("flags freely written tenfold mistakes without guessing a replacement", () => {
    const text = "Transport loss was CNY 172.5 billion [S1].";
    const answer = render(text, "CNY 17.25 billion");
    expect(answer.text).toBe(text); expect(answer.check.status).toBe("needs-review"); expect(answer.check.issues[0]).toContain("172.5 billion");
  });
  it("does not call an unbound but numerically correct amount verified", () => {
    expect(render("USD 2 million [S1]", "USD 2 million").check.status).toBe("needs-review");
  });
  it.each(["USD 2e9", "USD 3–5 billion", "USD 50/t", "$5 million", "CNY 1,23 billion"])("flags unsupported unbound monetary syntax: %s", text => {
    expect(renderQuantities(text, []).check.status).toBe("needs-review");
  });
  it("does not allow a second hand-written unit next to a rendered amount", () => {
    const q = catalogue("CNY 17.25 billion");
    expect(renderQuantities(`{{qty:${q[0].id}|亿}} 十亿元`, q).check.status).toBe("needs-review");
  });
  it("keeps raw text intact and hides incomplete protocol fragments while streaming", () => {
    const q = catalogue("USD 8 million");
    for (const suffix of ["{", "{{", "{{q", "{{qty:", `{{qty:${q[0].id}|`]) expect(renderQuantities("Budget " + suffix, q, true).text).toBe("Budget ");
    expect(renderQuantities("Budget {{qty:", q).check.status).toBe("needs-review");
    expect(renderQuantities("$x^{{a}}$ and {{template}}", q).text).toBe("$x^{{a}}$ and {{template}}");
    expect(renderQuantities("Budget {{qty:S1Q0 and other supported conclusions.", q).text).toBe("Budget 〔金额待核对〕 and other supported conclusions.");
    expect(renderQuantities("An ordinary opening brace {", q).text).toBe("An ordinary opening brace {");
  });
  it("preserves repeated identical values as distinct source positions", () => {
    const q = quantityCatalogue([evidence("Asset A USD 8 million; Asset B USD 8 million"), evidence("Crop USD 8 million", "S2")]);
    expect(new Set(q.map(x => x.id)).size).toBe(3);
    expect(renderQuantities(`{{qty:${q[2].id}}}`, q).text).toBe("USD 8 million [S2]");
  });
  it("covers many unrelated values without a paper-specific amount table", () => {
    let seed = 731;
    for (let i = 0; i < 100; i++) {
      seed = (seed * 16807) % 2147483647;
      const cents = seed % 1000000, value = (cents / 100).toFixed(2), q = catalogue(`Health programme USD ${value} million`);
      const result = renderQuantities(`{{qty:${q[0].id}|base}}`, q);
      expect(result.text).toBe(`USD ${cents * 10000} [S1]`); expect(result.check.issues).toEqual([]);
    }
  });
});
