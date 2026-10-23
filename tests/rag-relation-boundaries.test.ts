// @vitest-environment node
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { inspectNumericAnswer } from "../electron/rag-numeric-binding";
const { groupEvidence, parseNotes } = createRequire(import.meta.url)("../scripts/rag-evidence-first.cjs");
const cases = JSON.parse(readFileSync(new URL("./fixtures/rag-relation-boundaries.json", import.meta.url), "utf8")) as Array<{
  id: string; text: string; supported: string; unsupported: string; reason: string;
}>;

// Adversarial boundary regression, NOT a semantic classifier accuracy test.
// Every unsupported claim uses an authentic full quotation and valid metadata.
// A future refactor must not promote syntax/numeric success into entailment.
it.each(cases)("does not certify authentic quotes with a false relation: $id", fixture => {
  const evidence = [{ citation: "S1", sourceId: fixture.id, fingerprint: "v1", text: fixture.text, valid: true }];
  const [group] = groupEvidence("Explain this study's result", evidence);
  const results = [fixture.supported, fixture.unsupported].map(statement => parseNotes(JSON.stringify({facts:[{
    subject: "Study", statement, measure: null, value: null, unit: null, conditions: [],
    evidence: [{citation:"S1",quote:fixture.text}]
  }]}), group));
  for (const result of results) expect(result.semanticValidation).toBe("not-validated");
  for (const statement of [fixture.supported, fixture.unsupported]) {
    const findings = inspectNumericAnswer(statement + " [S1]", [{...evidence[0],chunkId:"c1",anchor:{kind:"pdf",page:1}}]);
    for (const finding of findings) {
      expect(finding.answerVerified).toBe(false);
      expect(finding.semanticAttribution).toBe("unverified");
    }
  }
});
