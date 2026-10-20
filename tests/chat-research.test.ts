// @vitest-environment node
import { expect, it } from "vitest";
import { localResearchPlan, planMessages, readResearchPlan, readReview, reviewMessages, sourceProfiles } from "../electron/chat-plan";
import { arithmeticWarnings } from "../electron/chat-checks";
import { citedLabels, mapCitations } from "../src/shared/grounding";
import { chooseEvidence, evidenceTokens } from "../electron/chat-evidence";
import type { KnowledgeHit } from "../src/shared/knowledge";

function corpus(): KnowledgeHit[] {
  return ["Alvarez", "Bennett", "Chandra", "Duarte", "Ekstrom"].flatMap((name, s) => Array.from({ length: 32 }, (_, i) => ({
    source: { id: `file:${s}`, entityId: String(s), title: `Renamed-${s}.pdf`, format: "pdf" as const, kind: "file" as const, fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, fingerprint: "a".repeat(64),
    chunk: { id: String(i), text: i ? `Document ${s}, paragraph ${i}. ` + "Investment results and loss assumptions. ".repeat(15) : `${name} et al. Effects on investment. Definition and methodology.`, anchor: { kind: "pdf" as const, page: Math.floor(i / 3) + 1 } }
  })));
}
it("identifies an author inside a renamed PDF and drops stale topic context when a new paper is named", () => {
  const profiles = sourceProfiles(corpus());
  const plan = localResearchPlan("Alvarez says transition can benefit an economy. Why?", profiles, ["Explain the refinery pathway", "Can it change technologies?"], ["file:3"]);
  expect(plan.sourceIds).toEqual(["file:0"]); expect(plan.question).not.toContain("refinery");
  const followup = localResearchPlan("那它为什么会有损失？", profiles, ["How does Alvarez define risk?"], ["file:0"]);
  expect(followup.sourceIds).toEqual(["file:0"]); expect(followup.question).toContain("Alvarez");
  expect(localResearchPlan("这几篇文章的损失定义有什么不同？", profiles, [], []).sourceIds).toHaveLength(5);
  // A reviewed resolution may narrow an inherited multi-paper focus, but cannot erase an explicitly named paper.
  const fallback = localResearchPlan("那产油国呢？", profiles, ["Compare economies and facilities"], ["file:0", "file:1"]);
  expect(readResearchPlan(JSON.stringify({ question: "Oil producer losses", sourceIds: ["file:0"], compare: false }), fallback, profiles, "那产油国呢？")!.sourceIds).toEqual(["file:0"]);
  expect(readResearchPlan(JSON.stringify({ question: "Different paper", sourceIds: ["file:1"], compare: false }), plan, profiles)!.sourceIds).toContain("file:0");
});
it("rejects malformed planning and out-of-selection searches without broadening their scope", () => {
  const profiles = sourceProfiles(corpus()), plan = localResearchPlan("Compare definitions", profiles, [], []);
  expect(readResearchPlan("No JSON", plan, profiles)).toBeUndefined();
  expect(readResearchPlan('{"sourceIds":[]}', plan, profiles)).toBeUndefined();
  const review = readReview(JSON.stringify({ sufficient: false, queries: [{ query: "private material", sourceIds: ["file:secret"] }, { query: "discounted cash flows", sourceIds: ["file:1"] }] }), new Set(["file:1"]));
  expect(review!.queries).toEqual([{ query: "discounted cash flows", sourceIds: ["file:1"] }]);
  expect(JSON.stringify(planMessages("question", profiles, [], [], plan))).not.toContain("file:secret");
});
it("bounds transmitted catalogues and focus lists even for a large selected collection", () => {
  const profiles = Array.from({ length: 2000 }, (_, i) => ({ id: `file:long-source-${i}`, title: `Source ${i}`, opening: "Long document header. ".repeat(80) }));
  const ids = profiles.map(p => p.id), fallback = localResearchPlan("比较所有文献的定义", profiles, [], ids);
  const planned = JSON.parse(planMessages("比较所有文献的定义", profiles, [], ids, fallback)[1].content);
  expect(planned.catalogue).toHaveLength(24); expect(planned.previousFocus).toHaveLength(24); expect(planned.catalogueTotal).toBe(2000);
  const reviewed = JSON.parse(reviewMessages("question", [], ids, profiles)[1].content);
  expect(reviewed.focusSourceIds).toHaveLength(24); expect(reviewed.relevantSources).toHaveLength(24); expect(reviewed.focusTotal).toBe(2000);
});
it("reserves cross-paper evidence and gives a bounded reviewer excerpts from each paper", () => {
  const items = corpus(), ids = [...new Set(items.map(hit => hit.source.id))];
  const groups = [items.slice(0, 20), ...ids.map(id => items.filter(hit => hit.source.id === id).slice(3, 9))];
  const selected = chooseEvidence(items, groups, ids, true, ids, 22_000);
  expect(new Set(selected.map(hit => hit.source.id))).toEqual(new Set(ids));
  expect(selected.reduce((sum, hit) => sum + evidenceTokens(hit), 0)).toBeLessThanOrEqual(22_000);
  const review = JSON.parse(reviewMessages("Compare all definitions and totals", selected, ids)[1].content);
  expect(new Set(review.reviewedExcerpts.map((item: any) => item.sourceId))).toEqual(new Set(ids));
  expect(review.reviewedCount).toBeLessThan(review.availableExcerpts);
});
it("opens grouped and full-width citations consistently while preserving code and escaped examples", () => {
  const input = "Supported ［S7，S18］ and [S1, S2] and [S3]. `［S9］`\n```text\n[S8]\n```\n\\[S5]";
  expect([...citedLabels(input)]).toEqual(["S7", "S18", "S1", "S2", "S3"]);
  const links = mapCitations(input, label => `[${label}](#evidence-test-${label})`);
  expect(links).toContain("[S7](#evidence-test-S7) [S18](#evidence-test-S18)");
  expect(links).toContain("`［S9］`"); expect(links).toContain("\\[S5]");
  expect(mapCitations("[S1](https://example.test)", () => "broken")).toBe("[S1](https://example.test)");
});
it("flags arithmetic disagreements without executing code, rewriting facts or rejecting rounded correct values", () => {
  expect(arithmeticWarnings("The difference is 4821.6 − 3139.2 = 1672.4 million.")[0]).toContain("1682.4");
  expect(arithmeticWarnings("Difference: 3958.4 - 3390.3 = 558.1.")[0]).toContain("568.1");
  expect(arithmeticWarnings("约 558.1 亿元（3958.4 − 3390.3）")[0]).toContain("568.1");
  expect(arithmeticWarnings("3958.4−3390.3=568.1; 1 / 3 ≈ 33.3%; 2 * 4 = 8; 3 + 7 = 10")).toEqual([]);
  for (const space of [" ", "\u00a0", "\u202f"]) {
    expect(arithmeticWarnings(`12${space}450.25 + 1${space}320.5 + 915 = 14${space}685.75`)).toEqual([]);
    expect(arithmeticWarnings(`12${space}450.25 + 1${space}320.5 + 915 = 14${space}680.75`)[0]).toContain("14685.75");
  }
  expect(arithmeticWarnings("The years 2030–2040 are a range; `9 - 3 = 4` is code.")).toEqual([]);
});
