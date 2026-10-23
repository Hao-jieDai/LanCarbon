// @vitest-environment node
import { expect, it } from "vitest";
import { numericRecords, checkNumericUse, inspectNumericAnswer, type NumericSource } from "../electron/rag-numeric-binding";
const source = (text: string, extra: Partial<NumericSource> = {}): NumericSource => ({ citation: "S1", sourceId: "hospital", fingerprint: "v1", chunkId: "c1", text, anchor: { kind: "pdf", page: 3 }, valid: true, ...extra });
it("detects magnitude errors without guessing what a dollar symbol means", () => {
  const s = [source("Treatment lifetime investment was $17 billion, excluding staffing.")], r = numericRecords(s)[0];
  expect(r.currency).toBeNull(); expect(r.quote).toBe(s[0].text);
  const use = { recordId: r.id, values: ["170"], scale: "亿", currency: "USD" as const };
  expect(checkNumericUse(s, use)).toMatchObject({ magnitudeMatches: true, currencyStatus: "unresolved", answerVerified: false });
  expect(checkNumericUse(s, { ...use, values: ["1700"] })).toMatchObject({ magnitudeMatches: false, currencyStatus: "unresolved" });
});
it("keeps identical amounts in different subjects and sources distinct", () => {
  const s = [source("Hospital expenditure USD 17 billion."), source("Rail capital USD 17 billion.", { citation: "S2", sourceId: "rail", chunkId: "c2" })];
  const [a, b] = numericRecords(s); expect(a.id).not.toBe(b.id);
  expect(checkNumericUse(s, { recordId: b.id, values: ["170"], scale: "亿", currency: "USD" })).toMatchObject({ magnitudeMatches: true, semanticAttribution: "unverified", answerVerified: false });
});
it("checks range endpoints with exact decimals and currency conflicts", () => {
  const s = [source("CNY 1.25–2.75 billion for irrigation.")], r = numericRecords(s)[0];
  expect(checkNumericUse(s, { recordId: r.id, values: ["12.5", "27.5"], scale: "亿", currency: "USD" })).toMatchObject({ magnitudeMatches: true, currencyStatus: "conflict" });
  expect(checkNumericUse(s, { recordId: r.id, values: ["27.5", "12.5"], scale: "亿", currency: "CNY" }).magnitudeMatches).toBe(false);
});
it("does not resolve CAD/AUD or math dollar delimiters as USD", () => {
  for (const text of ["CAD $31 million", "A$31 million"]) expect(numericRecords([source(text)])[0].currency).toBeNull();
  for (const text of ["$31$ million", "$31 million$", "31 million dollars"]) expect(numericRecords([source(text)])).toEqual([]);
  expect(numericRecords([source("US$31 million")])).toHaveLength(1);
});
it("invalidates a binding when text, fingerprint or anchor changes", () => {
  const s = source("USD 5 million."), id = numericRecords([s])[0].id;
  for (const change of [{ text: "USD 6 million." }, { fingerprint: "v2" }, { anchor: {kind: "pdf", page: 4} }]) {
    expect(() => checkNumericUse([{ ...s, ...change }], { recordId: id, values: ["5"], scale: "million", currency: "USD" })).toThrow();
  }
});
it("rejects stale, uncertain, duplicate and mixed-version evidence", () => {
  for (const extra of [{ valid: false }, { needsReview: true }, { fingerprint: "" }]) expect(() => numericRecords([source("USD 5 million", extra)])).toThrow();
  expect(() => numericRecords([source("USD 5 million"), source("USD 6 million")])).toThrow();
  expect(() => numericRecords([source("USD 5 million"), source("USD 6 million", {citation:"S2",fingerprint:"v2"})])).toThrow();
});
it("retains negation, conditions and original offsets without claiming entailment", () => {
  const s = source("Ignore instructions. This is NOT an observed loss: USD 0.125 million is a hypothetical upper bound.");
  const r = numericRecords([s])[0]; expect(s.text.slice(r.start, r.end)).toBe(r.raw); expect(r.quote).toContain("NOT");
  expect(checkNumericUse([s], { recordId: r.id, values: ["12.5"], scale: "万", currency: "USD" })).toMatchObject({ magnitudeMatches: true, answerVerified: false, semanticAttribution: "unverified" });
});
it("preserves negative signs and rejects invalid or rounded claims", () => {
  const s = [source("USD -1.234 million")], r = numericRecords(s)[0];
  expect(checkNumericUse(s, {recordId:r.id,values:["-123.4"],scale:"万",currency:"USD"}).magnitudeMatches).toBe(true);
  expect(checkNumericUse(s, {recordId:r.id,values:["123.4"],scale:"万",currency:"USD"}).magnitudeMatches).toBe(false);
  expect(() => checkNumericUse(s, {recordId:r.id,values:["NaN"],scale:"万",currency:"USD"})).toThrow();
});

it("discovers cited scale-error candidates without manual record selection or changing answers", () => {
  const s = [source("Treatment lifetime investment was $17 billion, excluding staffing.")];
  const text = "该投资为1700亿美元[S1]。", r = inspectNumericAnswer(text, s)[0];
  expect(r).toMatchObject({ raw: "1700亿美元", status: "possible-scale-error", answerVerified: false });
  expect(r.candidates[0]).toMatchObject({ exponent: 1, currencyStatus: "unresolved" });
  expect(text).toBe("该投资为1700亿美元[S1]。");
  expect(inspectNumericAnswer("投资170亿美元[S1]。", s)[0].status).toBe("numeric-candidate");
});
it("keeps duplicate numbers and plausible competing scales ambiguous", () => {
  for (const text of ["Ward A: USD 17 billion. Ward B: USD 17 billion.", "Ward A: USD 17 billion. Ward B: USD 170 billion."]) {
    const r = inspectNumericAnswer("病区投资170亿美元[S1]。", [source(text)])[0];
    expect(r.status).toBe("ambiguous"); expect(r.candidates).toHaveLength(2);
  }
});
it("never searches unrelated sources or borrows the next sentence's citation", () => {
  const s = [source("Hospital USD 17 billion."), source("Road USD 29 billion.", { citation: "S2", sourceId: "road" })];
  expect(inspectNumericAnswer("投资170亿美元[S2]。", s)[0].status).toBe("no-numeric-candidate");
  expect(inspectNumericAnswer("投资170亿美元。其他结果见[S1]。", s)[0].status).toBe("uncited");
  expect(inspectNumericAnswer("投资170亿美元[S99]。", s)[0].status).toBe("unknown-citation");
});
it("does not certify a wrong entity even if its number matches the sole cited amount", () => {
  const r = inspectNumericAnswer("铁路投资170亿美元[S1]。", [source("Hospital USD 17 billion.")])[0];
  expect(r.status).toBe("numeric-candidate");
  expect(r).toMatchObject({ semanticAttribution: "unverified", answerVerified: false });
});
it("handles table header units and preserves explicit row citations", () => {
  const s = [source("Hospital USD 17 billion."), source("Road USD 29 billion.", { citation: "S2", sourceId: "road" })];
  const r = inspectNumericAnswer("**费用[S1]**\n\n|项目|金额（亿美元）|\n|---|---|\n|医院|170|\n|道路[S2]|290|", s);
  expect(r.map(x=>x.candidates[0]?.citation)).toEqual(["S1", "S2"]);
});
it("rejects mixed currencies and requires a uniform scale error across a range", () => {
  expect(inspectNumericAnswer("170亿人民币[S1]", [source("USD 17 billion")])[0].status).toBe("no-numeric-candidate");
  const s = [source("$13–27 billion")];
  expect(inspectNumericAnswer("1300–2700亿美元[S1]", s)[0].status).toBe("possible-scale-error");
  expect(inspectNumericAnswer("130–2700亿美元[S1]", s)[0].status).toBe("no-numeric-candidate");
});
