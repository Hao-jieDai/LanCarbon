// @vitest-environment node
import { expect, it } from "vitest";
import { formalEvidenceGroups } from "../electron/chat-formal-evidence";
import { answerTasks } from "../electron/chat-answer-plan";
import { chooseEvidence, evidenceTokens } from "../electron/chat-evidence";
import type { KnowledgeHit } from "../src/shared/knowledge";

function hit(id: string, text: string, page = 4, sourceId = "file:selected"): KnowledgeHit {
  return { fingerprint: "current", source: { id: sourceId, entityId: sourceId, title: "Independent study.pdf", kind: "file", format: "pdf", fingerprint: "current", locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id, text, anchor: { kind: "pdf", page } } };
}
it.each([
  ["为什么治疗方案更可靠？请用 LaTeX 写出风险比公式，并说明它的适用条件。", "Risk is measured by the probability in each treatment group.", "RR = p_treatment / p_control", "where p denotes the event probability; the treatment assignments are fixed."],
  ["为什么回收方案更有效？请写出产率计算式。", "Product yield is defined as recovered product mass divided by input mass.", "Y = m_product / m_feed", "where m is dry mass; wet mass cannot be substituted."],
  ["Why does this intervention help? Show the formulas for the value loss.", "Value loss is defined as the difference between the reference and revised valuation.", "D = V_reference - V_revised", "where V is the discounted valuation; negative differences are retained."]
])("retrieves an independent formula subpart of a mixed question: %s", async (question, definition, equation, variables) => {
  const items = [hit("unrelated", "The temperature calibration uses T = a + b*x.", 2), hit("definition", definition), hit("equation", equation), hit("variables", variables), hit("pointer", "Further details of the method are provided in the supplementary appendix.", 9)];
  const formal = await formalEvidenceGroups(items, [question], ["file:selected"], new AbortController().signal);
  const ids = formal.flatMap(group => group.hits.map(hit => hit.chunk.id));
  expect(ids).toContain("equation"); expect(ids).toContain("definition"); expect(ids).not.toContain("unrelated");
  expect(formal.every(group => group.questionIndex === 0)).toBe(true);
  expect(formal.flatMap(group => group.hits).find(hit => hit.chunk.id === "equation")!.chunk.text).toBe(equation);
});
it.each(["为什么该方案稳定？另外损失怎么计算？", "Why is the intervention effective? How is loss quantified?"])("retains a definition when the main task remains a mechanism: %s", async question => {
  expect(answerTasks(question)).toContain("mechanism");
  const definition = hit("definition", "Loss is defined as the decrease in expected annual revenue relative to the control baseline.");
  const formal = await formalEvidenceGroups([hit("overview", "The method selects and ranks interventions by cost."), definition], [question], ["file:selected"], new AbortController().signal);
  expect(formal.flatMap(group => group.hits)).toContainEqual(definition);
});
it("reserves equations before saturated semantic overviews while retaining the unchanged context budget", async () => {
  const equations = [hit("definition", "The relative error is defined using observed and estimated demand."), hit("equation", "E = (observed - estimated) / observed"), hit("variables", "where observed denotes measured demand; the denominator must be nonzero.")];
  const overviews = Array.from({ length: 60 }, (_, i) => hit(`overview-${i}`, "The method selects technologies and compares outcomes. ".repeat(20), 20 + i));
  const formal = await formalEvidenceGroups([...equations, ...overviews], ["Why is the method useful? Write the error equation."], ["file:selected"], new AbortController().signal);
  const chosen = chooseEvidence([...equations, ...overviews], [...formal.map(group => group.hits), overviews], ["file:selected"], false, [], 2500);
  expect(chosen.some(hit => hit.chunk.id === "equation")).toBe(true);
  expect(chosen.some(hit => hit.chunk.id === "definition")).toBe(true);
  expect(chosen.reduce((sum, hit) => sum + evidenceTokens(hit), 0)).toBeLessThanOrEqual(2500);
});
it("honours selection and current text identity, and never reconstructs an absent equation", async () => {
  const pointer = hit("pointer", "The loss definition is discussed in an unavailable appendix.");
  const outside = hit("outside", "Loss = benefit - cost", 4, "file:excluded");
  const available = [pointer, outside, hit("unrelated", "Temperature = a + b", 10)];
  const formal = await formalEvidenceGroups(available, ["Give the loss formula"], ["file:selected"], new AbortController().signal);
  expect(formal.flatMap(group => group.hits)).toEqual([pointer]);
  const stale = { ...pointer, fingerprint: "old", chunk: { ...pointer.chunk, text: "Loss = stale" } };
  expect(chooseEvidence(available, [[stale]], ["file:selected"], false)).toEqual([]);
  expect(await formalEvidenceGroups(available, ["Explain the weather"], ["file:selected"], new AbortController().signal)).toEqual([]);
});
it("keeps review flags, original locations and subquestion assignments, and remains bounded and cancellable", async () => {
  const original = hit("ocr", "The risk equation is R = failures / exposure."); original.chunk.anchor = { kind: "pdf", page: 7, method: "ocr", confidence: 61, needsReview: true };
  const items = [original], questions = ["Summarize the motivation.", "Write the risk equation."];
  const result = await formalEvidenceGroups(items, questions, ["file:selected"], new AbortController().signal);
  expect(result[0].questionIndex).toBe(1); expect(result[0].hits[0]).toEqual(original);
  const many = await formalEvidenceGroups(items, Array(30).fill(questions[1]), ["file:selected"], new AbortController().signal);
  expect(many.length).toBeLessThanOrEqual(16); expect(many.every(group => group.hits.length <= 4)).toBe(true);
  const controller = new AbortController(); controller.abort();
  await expect(formalEvidenceGroups(items, questions, ["file:selected"], controller.signal)).rejects.toThrow();
});
