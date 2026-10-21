// @vitest-environment node
import { expect, it } from "vitest";
import { bibliography, comparativeResultCoverage, quantityNotes, quantityWarnings, resultCoverage, scenarioWarnings } from "../electron/chat-quality";
import { chooseEvidence } from "../electron/chat-evidence";
import type { ChatEvidence } from "../src/shared/grounding";
function hit(text: string, id = "result", source = "file:alpha"): ChatEvidence {
  return { label: "S1", fingerprint: "a".repeat(64), source: { id: source, entityId: "alpha", kind: "file", format: "pdf", title: "Alpha.pdf", fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id, text, anchor: { kind: "pdf", page: 7 } } };
}
it("excludes dense bibliographies from factual answers but supports questions about reference lists", () => {
  const references = hit("References\nSmith, J. (2020). Risk. https://doi.org/10.1234/one\nJones, A. (2021). Assets. https://doi.org/10.1234/two\nChan, H. (2022). Climate. https://doi.org/10.1234/three", "refs");
  const result = hit("Results: total loss is 28.4 billion CNY.");
  expect(bibliography(references)).toBe(true); expect(bibliography(hit("Smith (2020) reports a different model. Results depend on policy."))).toBe(false);
  expect(chooseEvidence([references, result], [[references, result]], [result.source.id], true).map(item => item.chunk.id)).toEqual(["result"]);
  expect(chooseEvidence([references, result], [[references]], [result.source.id], true, [], 9000, true).some(item => item.chunk.id === "refs")).toBe(true);
});

it("keeps actual non-monetary comparison findings ahead of method/background passages", () => {
  const abstract = hit("We find public transport operators bear the largest burden.", "abstract"); abstract.chunk.anchor = { kind: "pdf", page: 1 };
  const method = hit("We estimate cost using a panel regression.", "method"); method.chunk.anchor = { kind: "pdf", page: 4, heading: "Methods" };
  const result = hit("Our results show private households bear the largest burden.", "result", "file:beta");
  const outside = hit("We find an unrelated result.", "outside", "file:private");
  const groups = comparativeResultCoverage([method, outside, abstract, result], ["file:alpha", "file:beta"]);
  expect(groups[0][0]).toBe(abstract); expect(groups[1][0]).toBe(result); expect(groups.flat()).not.toContain(outside);
  expect(groups.every(group => group.length <= 2)).toBe(true);
});
it.each(["Our analysis suggests improved treatment adherence.", "Our conclusions support longer material service lives."])("recognises original qualitative summaries without a results heading: %s", text => {
  const summary = hit(text, "summary"); summary.chunk.anchor = { kind: "pdf", page: 1 };
  const methods = hit("We estimate a regression using historical observations.", "methods");
  const groups = comparativeResultCoverage([methods, summary], [summary.source.id]);
  expect(groups[0][0]).toBe(summary);
});
it("checks explicit monetary scenario bindings without treating discussion of multiple scenarios as a contradiction", () => {
  const medium = hit("Each bar shows the US$1.4 trillion losses from medium expectations realignment.");
  expect(scenarioWarnings("严重情景的损失为1.4万亿美元。[S1]", [medium]).join(" ")).toContain("ties this amount to medium");
  expect(scenarioWarnings("中等情景的损失为1.4万亿美元。[S1]", [medium])).toEqual([]);
  expect(scenarioWarnings("中等情景不是严重情景，这里的损失是1.4万亿美元。[S1]", [medium])).toEqual([]);
  expect(scenarioWarnings("严重损失共1.4万亿美元。[S1]", [medium])).toEqual([]);
});
it("reserves actual monetary results despite bad rankings, accepts only fresh scoped historical excerpts", () => {
  const result = hit("National aggregate stranded loss is 28.4 billion CNY.");
  const context = hit("Background: investment matters.", "background");
  const changed = hit("Previous incorrect result 999 billion CNY.", "changed"), stale = { ...changed, fingerprint: "b".repeat(64) };
  const privateHit = hit("National total is 999 trillion CNY", "private", "file:private");
  const groups = resultCoverage([context, result, changed, privateHit], [result.source.id], [stale, privateHit], "把这些金额换算成人民币能直接相加吗？");
  expect(groups.flat().some(item => item.chunk.id === "result")).toBe(true); expect(groups.flat().every(item => item.source.id !== "file:private")).toBe(true);
  expect(resultCoverage([context, result], [result.source.id], [], "Explain its method")).toEqual([]);
  const background = hit("Earlier literature reports 719 billion CNY.", "background-money");
  const remembered = resultCoverage([background, result], [result.source.id], [background], "Compare all total losses and convert to CNY");
  expect(remembered[0][0].chunk.id).toBe("result");
  const removed = resultCoverage([context], [result.source.id], [result], "总损失是多少？"); expect(removed).toEqual([]);
});
it("supplies exact unit equivalents with verbatim scenario context without inventing labels", () => {
  const original = hit("For the medium realignment, losses are US$1.4 trillion at a 6% discount rate. National losses are 339.0 billion CNY.");
  const notes = quantityNotes(original).join("\n");
  expect(notes).toContain("14000 亿美元"); expect(notes).toContain("3390 亿元人民币"); expect(notes).toContain("medium realignment"); expect(notes).not.toContain("Severe");
  expect(quantityNotes(hit("Capacity is 339.0 billion kWh; 2020 base year; population 1.4 billion."))).toEqual([]);
});

it("recognizes a LaTeX arithmetic result before a monetary scale without assuming one unit", () => {
  for (const reply of ["$24.8 - 15.2 = 9.6$ billion CNY，即96亿元人民币", "$36.7$ million USD means 0.367亿美元"]) expect(quantityWarnings(reply, [])).toEqual([]);
  expect(quantityWarnings("$9.6$ billion CNY，即9.6亿元人民币", []).length).toBeGreaterThan(0);
});

it("preserves both members of shared-scale results in arithmetic aids and unit diagnostics", () => {
  const original = hit("Transport exposure is US$53 and US$17 billion under separate scenarios.");
  const notes = quantityNotes(original).join("\n");
  expect(notes).toContain("530 亿美元"); expect(notes).toContain("170 亿美元");
  expect(quantityWarnings("两情景分别为US$53亿和US$17亿[S1]。", [original])).toHaveLength(2);
  expect(quantityWarnings("两情景分别为US$530亿和US$170亿[S1]。", [original])).toEqual([]);
  expect(quantityNotes(hit("USD 53 and CNY 17 billion.")).join("\n")).not.toContain("530 亿美元");
  const crops = hit("Crop C loses 41.2 billion CNY, below A (68.7 billion) and B (53.9 billion).");
  expect(quantityNotes(crops).join("\n")).toContain("687 亿元人民币");
  expect(quantityWarnings("三者为68.7、53.9和412亿元人民币[S1]。", [crops])).toHaveLength(2);
});
it("flags the observed billion-to-yi mistakes with exact cited originals, avoiding FX and coincidental uncited amounts", () => {
  const originals = [hit("National losses are 339.0 billion CNY; regional losses 133.91 billion CNY and 127.13 billion CNY.")];
  const issues = quantityWarnings("全国为339.0亿元，两个省分别为133.91亿元与127.13亿元。[S1]", originals);
  expect(issues).toHaveLength(3); expect(issues.join(" ")).toContain("3390 亿元人民币"); expect(issues.join(" ")).toContain("1339.1 亿元人民币");
  expect(quantityWarnings("全国3390亿元，两个省1339.1亿元与1271.3亿元。[S1]", originals)).toEqual([]);
  expect(quantityWarnings("An unreferenced example 339亿元.", originals)).toEqual([]);
  expect(quantityWarnings("339.0亿美元。[S1]", originals)).toEqual([]);
  expect(quantityWarnings("Cost 339.0亿元。[S2]", originals)).toEqual([]);
});

it("checks shared-caption table amounts and does not equate unrelated English figures with matching digits", () => {
  const originals = [hit("Regional transport exposure is US$3.6 billion. Global exposure in the stricter scenario is US$3.6 trillion.")];
  expect(quantityWarnings("Global exposure is US$3.6 trillion [S1].", [hit("The regional operator owns US$3.6 billion.")])).toEqual([]);
  const table = "**Transport [S1]**\n\n| Metric | Original |\n|---|---|\n| National | US\\$58 亿 |";
  expect(quantityWarnings(table, [hit("National transport exposure is US$58 billion.")]).join(" ")).toContain("580 亿美元");
  expect(quantityWarnings("损失为3.6万亿美元[S1]。", originals)).toEqual([]);
  expect(quantityWarnings("全球损失3.6万亿美元[S1]。", [hit("Capacity (GW)\nUS$3.6 billion\nUS$2.4 billion\nFig. 4 | Companies in another scenario.")])).toEqual([]);
});
