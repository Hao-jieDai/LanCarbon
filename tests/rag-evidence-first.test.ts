// @vitest-environment node
import { createRequire } from "node:module";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { groupEvidence, parseNotes, answerInputs, quoteMatches } = require("../scripts/rag-evidence-first.cjs");
const evidence = [
  { citation: "S1", sourceId: "clinical", fingerprint: "v1", source: "Trial", text: "Hospital admissions decreased by -12%. Staffing stayed fixed in the main scenario.", valid: true },
  { citation: "S2", sourceId: "transport", fingerprint: "v2", source: "Transport report", text: "Companies are ranked by passenger kilometres. Accident rates are separate columns.", valid: true }
];
const fact = (citation = "S1", quote = evidence[0].text) => ({ subject: "Hospital", statement: "Staffing stayed fixed.", measure: null, value: null, unit: null, conditions: ["main scenario"], evidence: [{ citation, quote }] });
it("isolates document evidence and preserves original labels and fingerprints", () => {
  const groups = groupEvidence("Compare the methods", evidence);
  expect(groups).toHaveLength(2); expect(groups[0].excerpts).toEqual([evidence[0]]);
  expect(groups[0].messages[1].content).not.toContain(evidence[1].text);
  expect(groups[1].messages[1].content).toContain('"citation":"S2"');
});
it("accepts source-linked notes without certifying their semantic accuracy", () => {
  const [g] = groupEvidence("What changed?", evidence);
  const result = parseNotes(JSON.stringify({ facts: [fact()] }), g);
  expect(result.semanticValidation).toBe("not-validated"); expect(result.fingerprint).toBe("v1");
});
it("rejects cross-document evidence, stale inputs, duplicate labels and uncertain OCR", () => {
  const [g] = groupEvidence("What changed?", evidence);
  expect(() => parseNotes(JSON.stringify({ facts: [fact("S2", evidence[1].text)] }), g)).toThrow();
  expect(() => groupEvidence("Question", [...evidence, evidence[0]])).toThrow();
  expect(() => groupEvidence("Question", [{ ...evidence[0], valid: false }])).toThrow();
  expect(() => groupEvidence("Question", [{ ...evidence[0], needsReview: true }])).toThrow();
  g.excerpts[0].text += "changed";
  expect(() => parseNotes(JSON.stringify({ facts: [fact()] }), g)).toThrow();
});
it("preserves negative signs and decimal points while handling PDF word and identifier wraps", () => {
  expect(quoteMatches("Admissions fell -12%.", "Admissions fell 12%.")).toBe(false);
  expect(quoteMatches("A value of 1.20", "A value of 120")).toBe(false);
  expect(quoteMatches("trans-\nport results", "transport results")).toBe(true);
  expect(quoteMatches("Scenario2030-\nFixed", "Scenario2030-Fixed")).toBe(true);
  expect(quoteMatches("decreased -\n12%", "decreased 12%")).toBe(false);
});
it("retains null fields and empty irrelevant-document notes without fabricating facts", () => {
  const [g] = groupEvidence("What changed?", evidence);
  expect(parseNotes('{"facts":[]}', g).facts).toEqual([]);
  expect(parseNotes(JSON.stringify({ facts: [fact()] }), g).facts[0].value).toBe(null);
});
it("normalizes Chinese layout spacing without merging numbers or removing signs", () => {
  expect(quoteMatches("交通需求下 降，客流为 12.5% , 成本不变", "交通需求下降，客流为 12.5%, 成本不变")).toBe(true);
  expect(quoteMatches("交通成本 - 12.5", "交通成本 12.5")).toBe(false);
  expect(quoteMatches("人数 12 50", "人数 1250")).toBe(false);
  expect(quoteMatches("比率 1 . 25", "比率 1.25")).toBe(false);
});
it("accepts finite JSON numeric values without coercing units or accepting unsafe magnitudes", () => {
  const [g] = groupEvidence("What changed?", evidence);
  expect(parseNotes(JSON.stringify({ facts: [{ ...fact(), value: -12.5 }] }), g).facts[0].value).toBe(-12.5);
  for (const value of [true, [], {}, 1e100]) expect(() => parseNotes(JSON.stringify({ facts: [{ ...fact(), value }] }), g)).toThrow();
  expect(() => parseNotes(JSON.stringify({ facts: [{ ...fact(), unit: 12 }] }), g)).toThrow();
});
it("rejects malformed responses, missing proof and unbounded extraction", () => {
  const [g] = groupEvidence("What changed?", evidence);
  for (const raw of ['{"facts":', '{} {}', JSON.stringify({ facts: [fact()], answer: "unsupported" }), JSON.stringify({ facts: [{ ...fact(), evidence: [] }] }), JSON.stringify({ facts: Array(9).fill(fact()) })]) expect(() => parseNotes(raw, g)).toThrow();
});
it("changes only reading notes between paired answer inputs, keeping originals and question history", () => {
  const groups = groupEvidence("Compare", evidence);
  const notes = groups.map((g: any) => parseNotes('{"facts":[]}', g));
  const original = [{ role: "system", content: "Original contract" }, { role: "user", content: JSON.stringify({ selectedSources: [], evidence }) }, { role: "user", content: JSON.stringify({ latestQuestion: "Compare", dialogueContext: { recentUserQuestions: ["Earlier question"] } }) }];
  const saved = structuredClone(original);
  const pair = answerInputs(original, groups, notes);
  expect(original).toEqual(saved);
  expect(pair.baseline[0]).toEqual(pair.experimental[0]); expect(pair.baseline[2]).toEqual(pair.experimental[2]);
  const enriched = JSON.parse(pair.experimental[1].content); delete enriched.readingNotes;
  expect(enriched).toEqual(JSON.parse(pair.baseline[1].content));
  expect(() => answerInputs(original, groups, notes.slice(1))).toThrow();
  expect(() => answerInputs(original, groups, [{ ...notes[0], fingerprint: "stale" }, notes[1]])).toThrow();
});
