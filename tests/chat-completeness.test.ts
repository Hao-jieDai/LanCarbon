// @vitest-environment node
import { expect, it } from "vitest";
import { methodCoverage, answerTask } from "../electron/chat-answer-plan";
import { scopeCoverage, unitCompanions } from "../electron/chat-completeness";
import { chooseEvidence } from "../electron/chat-evidence";
import type { KnowledgeHit } from "../src/shared/knowledge";
function hit(id: string, text: string, sourceId = "a"): KnowledgeHit { return { fingerprint: "v1", source: { id: `file:${sourceId}`, entityId: sourceId, title: `${sourceId}.pdf`, kind: "file", format: "pdf", fingerprint: "v1", locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id, text, anchor: { kind: "pdf", page: 3 } } }; }
it("keeps selection rules and static constraints together even when a why question also asks for amounts", () => {
  for (const [question, method, limit] of [
    ["为什么组合方案损失更小，具体少了多少钱？", "The method selects the cheapest option per site, ranks facilities by unit cost and then calculates discounted value.", "Limitations: technology assignments are static because of infrastructure lock-in; switching is future research."],
    ["Why does the mixed treatment help, and how much does it cost?", "Our algorithm selects a treatment per patient under the clinical allocation rule.", "The model assumes fixed treatment assignments. Future research could allow switching after relapse."]
  ]) {
    const corpus = [hit("background", "Study introduction."), hit("method", method), hit("limit", limit)];
    const groups = methodCoverage(corpus, ["file:a"], answerTask(question), question);
    const evidence = chooseEvidence(corpus, groups, ["file:a"], false);
    expect(evidence.map(h => h.chunk.id)).toEqual(expect.arrayContaining(["method", "limit"]));
    expect(methodCoverage(corpus, ["file:excluded"], "mechanism", question)).toEqual([]);
  }
});
it("reserves original scope descriptions in multi-study comparisons without manufacturing sector labels", () => {
  const a = hit("scope", "Our analysis covers agriculture, transport and manufacturing. We assess their scenario-specific costs.");
  const b = hit("scope", "This study focuses on dairy farms and estimates losses under a different baseline.", "b");
  const groups = scopeCoverage([a, b, hit("outside", "Private excluded scope", "private")], ["file:a", "file:b"], "把几篇金额换算后能比较哪个行业吗？", "calculation");
  expect(groups.flat()).toEqual([a, b]);
  expect(scopeCoverage([a], ["file:a"], "Top 10 firms", "ranking")).toEqual([]);
  const header = hit("header", "Department of Chemistry, University A. Correspondence to the authors.");
  const caption = hit("caption", "Figure 2. Scenario-specific value losses for farming, freight and buildings under common assumptions.");
  expect(scopeCoverage([header, caption], ["file:a"], "Compare industry coverage", "comparison").flat()).toEqual([caption]);
});
it("adds exact same-document unit-bearing passages and preserves bounds without merging amounts into facts", () => {
  const seed = hit("fragment", "Financial exposure of US$713 is compared with another estimate.");
  const full = hit("definition", "An upper bound of US$713 billion in potential losses affects the financial sector, before consolidation.");
  const differentCurrency = hit("other-currency", "CNY 713 billion of a different quantity.");
  const outside = hit("outside", "US$713 trillion.", "outside");
  const stale = { ...hit("stale", "US$713 million."), fingerprint: "v0" };
  const unsafe = hit("unsafe", "US$713 million."); unsafe.chunk.anchor = { kind: "pdf", page: 8, method: "ocr", confidence: 95, needsReview: true };
  expect(unitCompanions([differentCurrency, outside, stale, unsafe, full], [[seed]], ["file:a"])).toEqual([[full]]);
  expect(unitCompanions([full], [[hit("already-scaled", "US$713 million.")]], ["file:a"])).toEqual([]);
  const euro = hit("euro", "EUR 52 was reported."), euroFull = hit("euro-full", "EUR 52 million is an annual revenue estimate.");
  expect(unitCompanions([euroFull], [[euro]], ["file:a"])).toEqual([[euroFull]]);
});
it("retains metric-scope enumerations in figure captions alongside general study descriptions", () => {
  for (const caption of ["Fig. 4: Value losses for farming, freight and buildings in the transition scenario.", "Figure 7 shows financial exposure across shipping, aviation and rail under the baseline."]) {
    const population = hit("population", "Our supply model covers agriculture, transport and industry. Study population and data set are described here.");
    const generic = hit("generic", "Our study analyses transport costs. Further results are in supplementary data.");
    const original = hit("caption", caption);
    const groups = scopeCoverage([generic, population, original], ["file:a"], "Compare the scope of these studies", "comparison");
    expect(groups[0][0]).toEqual(original); expect(groups.flat()).toContainEqual(population);
    expect(chooseEvidence([generic, population, original], groups, ["file:a"], true).map(h => h.chunk.id)).toContain("caption");
  }
  const method = hit("horizon", "The valuation period is 12 years, discounted at 5% against the counterfactual baseline.");
  expect(methodCoverage([method], ["file:a"], "calculation", "比较几篇金额换算后能否相加？").flat()).toContainEqual(method);
});
