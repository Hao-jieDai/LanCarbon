import { describe, expect, it } from "vitest";
import { quantityCatalogue, quantityInstructions, renderQuantities } from "../electron/chat-quantities";
import type { ChatEvidence } from "../src/shared/grounding";

const evidence = (text: string, label = "S1", needsReview = false): ChatEvidence => ({ label, source: { id: "note:" + label, title: "Independent transport study" }, chunk: { text, anchor: { kind: "pdf", page: 7, needsReview } } } as ChatEvidence);
const catalogue = (text: string) => quantityCatalogue([evidence(text)]);
const render = (text: string, input: string) => renderQuantities(text, catalogue(input));

describe("source-bound monetary rendering", () => {
  it.each([
    ["Clinic losses were EUR 27 million, 62% in public clinics.", "EUR 27 million"],
    ["Equipment loss: GBP 16 billion，43％ in the east.", "GBP 16 billion"],
    ["Flood damage: USD 4.2 million, 17 hospitals affected.", "USD 4.2 million"],
    ["医疗支出为12.34亿元人民币，41%属于基层诊所。", "12.34亿元人民币"],
    ["Budget EUR 23.75\nmillion, 39% for maintenance.", "EUR 23.75\nmillion"],
    ["Works cost GBP 8 mil-\nlion, 2024 prices.", "GBP 8 mil-\nlion"],
  ])("keeps independently scaled amounts before another numeric fact: %s", (source, raw) => {
    const q = catalogue(source);
    expect(q).toHaveLength(1); expect(q[0].raw).toBe(raw);
    expect(source.slice(q[0].start, q[0].end)).toBe(raw);
    expect(q[0].id).toBe(`S1Q${source.indexOf(raw)}`);
  });
  it("keeps fully specified amounts while rejecting shared scales and rates", () => {
    expect(catalogue("EUR 27 million, EUR 18 million and EUR 6 million").map(q => q.raw)).toEqual(["EUR 27 million", "EUR 18 million", "EUR 6 million"]);
    for (const s of ["EUR 27, 18 and 6 million", "GBP 4–9 billion", "USD 6 and 11 million", "EUR 27 million/year", "GBP 16 billion per year", "12.34亿元人民币/年"]) expect(catalogue(s)).toEqual([]);
  });
  it("v2 permits literal restatements without marking them verified or missing an ID", () => {
    const q = catalogue("Clinic losses EUR 27 million, 62% in public clinics."), text = "Losses EUR 27 million [S1].";
    expect(quantityInstructions(q)).toContain("For direct restatements");
    expect(quantityInstructions(q)).not.toContain("every monetary amount");
    expect(renderQuantities(text, q, false, 2)).toEqual({ text, check: { version: 1, resolved: 0, status: "not-checked", issues: [] } });
    // Absence of a warning is not semantic validation, even for incorrect prose.
    expect(renderQuantities("EUR 270 million [S1]", q, false, 2).check.status).toBe("not-checked");
    expect(renderQuantities(text, q, false, 1).check.status).toBe("needs-review");
  });
  it("v2 checks only requested calculations and retains invalid-token diagnostics", () => {
    const q = catalogue("EUR 27 million, 62% for clinics. Revised EUR 18 million.");
    const text = `Baseline EUR 27 million [S1]. Difference {{diff:${q[0].id}:${q[1].id}|million}}.`;
    const result = renderQuantities(text, q, false, 2);
    expect(result.text).toBe("Baseline EUR 27 million [S1]. Difference EUR 9 million [S1].");
    expect(result.check).toMatchObject({ resolved: 1, status: "checked", issues: [] });
    for (const token of ["{{qty:S99Q0|million}}", `{{qty:${q[0].id}|EUR}}`, "{{diff:S1Q0", `{{qty:${q[0].id}|million}} million`]) expect(renderQuantities(token, q, false, 2).check.status).toBe("needs-review");
  });
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
    const q = catalogue("USD 0.000000000001 thousand.");
    expect(renderQuantities(`{{qty:${q[0].id}|trillion}}`, q).text).toBe("USD 0.000000000000000000001 trillion [S1]");
  });
  it.each(["\n", "\r\n", " \n  ", "\u00a0\n\u00a0"])("keeps a wrapped scale with its amount (%j)", gap => {
    const input = `Clinic cost EUR 23.75${gap}million; transport GBP 6.125${gap}billion; 支出为人民币 12.5${gap}万亿。`;
    const q = catalogue(input);
    expect(q.map(x => [x.currency, x.scale])).toEqual([["EUR", "million"], ["GBP", "billion"], ["CNY", "万亿"]]);
    expect(q.map(x => x.numerator / x.denominator)).toEqual([23750000n, 6125000000n, 12500000000000n]);
    for (const x of q) expect(input.slice(x.start, x.end)).toBe(x.raw);
    expect(renderQuantities(`{{qty:${q[1].id}|亿}}`, q).text).toBe("GBP 61.25 亿 [S1]");
  });
  it("handles each possible hyphenation position without changing source identity", () => {
    const units = { thousand: 1000n, million: 1000000n, billion: 1000000000n, trillion: 1000000000000n };
    for (const [unit, factor] of Object.entries(units)) for (let cut = 1; cut < unit.length; cut++) for (const breakText of ["-\n", "-\r\n  ", "\u00ad\n", "\u00ad"]) {
      const wrapped = unit.slice(0, cut) + breakText + unit.slice(cut);
      for (const raw of [`USD 7.25 ${wrapped}`, `7.25 ${wrapped}美元`]) {
        const input = `😀 Unrelated programme: ${raw}.`, q = catalogue(input);
        expect(q).toHaveLength(1);
        expect(q[0].scale).toBe(unit);
        expect(q[0].numerator).toBe(725n * factor);
        expect(q[0].denominator).toBe(100n);
        expect(q[0].raw).toBe(raw);
        expect(input.slice(q[0].start, q[0].end)).toBe(raw);
        expect(q[0].id).toBe(`S1Q${input.indexOf(raw)}`);
        expect(renderQuantities(`{{qty:${q[0].id}|${unit}}}`, q).text).toBe(`USD 7.25 ${unit} [S1]`);
      }
    }
  });
  it.each(["USD 7.25", "USD 7.25 tril-", "USD 7.25 tril-\n", "USD 7.25 tril-\nli", "USD 7.25 trillions", "USD 7.25 millionaire", "USD 7.25 quadrillion", "USD 7.25 bn", "USD 7.25\n\ntrillion", "USD 7.25\n[page 2]\ntrillion", "USD 7.25\nunknown scale", "USD 7.25 tril\nlion"])("does not silently bind a partial or ambiguous scale as base: %s", input => {
    expect(catalogue(input)).toEqual([]);
    const result = renderQuantities("{{qty:S1Q0|trillion}}", catalogue(input));
    expect(result.check.status).toBe("needs-review");
    expect(result.text).toBe("〔金额待核对〕");
  });
  it("does not infer base currency from bare values, figure ticks, years or shared scales", () => {
    for (const input of ["USD 8 was the ticket price.", "0.2\n0.4\n0.6\nEUR million", "Costs (2020 USD bn)", "EUR 9 and EUR 16 million", "GBP 12 to GBP 19 billion"]) {
      expect(catalogue(input).every(q => q.scale !== "base")).toBe(true);
    }
    expect(catalogue("Cost GBP 18.5.\nSee figure for unit.")).toEqual([]);
    const raw = "The ticket was USD 8 [S1].";
    expect(renderQuantities(raw, catalogue("The ticket was USD 8.")).text).toBe(raw);
    expect(renderQuantities(raw, []).check.status).toBe("needs-review");
    expect(catalogue("EUR 8 mil-\nlion per year")).toEqual([]);
    expect(catalogue("CNY 8 亿万")).toEqual([]);
  });
  it("computes differences and percent reductions from the specified original operands", () => {
    const q = catalogue("CNY 17.25 billion versus CNY 6.125 billion");
    const answer = renderQuantities(`{{diff:${q[0].id}:${q[1].id}|亿}}; {{pct:${q[0].id}:${q[1].id}}}`, q);
    expect(answer.text).toBe("CNY 111.25 亿 [S1]; ≈ 64.49% [S1]"); expect(answer.check.resolved).toBe(2);
  });
  it("accepts Markdown-escaped unit delimiters in tables and prose without relaxing validation", () => {
    const q = catalogue("EUR 12.5\nmillion versus EUR 8.25 mil-\nlion.");
    for (const pipe of ["|", "\\|"]) {
      const input = `| Baseline | {{qty:${q[0].id}${pipe}亿}} |\nDifference {{diff:${q[0].id}:${q[1].id}${pipe}million}}.`;
      const output = renderQuantities(input, q);
      expect(output.text).toBe("| Baseline | EUR 0.125 亿 [S1] |\nDifference EUR 4.25 million [S1].");
      expect(output.check.status).toBe("checked");
      expect(renderQuantities(`{{qty:${q[0].id}${pipe}__proto__}}`, q).check.status).toBe("needs-review");
    }
    expect(renderQuantities(`{{qty:${q[0].id}\\\\|million}}`, q).check.status).toBe("needs-review");
    expect(renderQuantities(`{{qty:${q[0].id}\\|million|亿}}`, q).check.status).toBe("needs-review");
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
