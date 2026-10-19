// @vitest-environment node
import { expect, it } from "vitest";
import { repairCitedUnits } from "../electron/chat-repair";
import { answerTask, answerInstructions, methodCoverage } from "../electron/chat-answer-plan";
import { mapCitations, type ChatEvidence } from "../src/shared/grounding";
function evidence(text: string, id = "a", label = "S1"): ChatEvidence { return { label, fingerprint: "a".repeat(64), source: { id: `file:${id}`, entityId: id, title: `${id}.pdf`, kind: "file", format: "pdf", fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id, text, anchor: { kind: "pdf", page: 4 } } }; }
it("corrects exact cited currency scales and ranges in final prose while retaining the target unit and an audit", () => {
  const hits = [evidence("The national total is CNY 28.4 billion. The selected companies hold US$41 to US$67 billion.")];
  const result = repairCitedUnits("全国为28.4亿元人民币（CNY 28.4 billion）[S1]。\n\n公司为US$41–67亿（S1）。", hits);
  expect(result.text).toContain("284亿元人民币"); expect(result.text).toContain("US$410–670亿"); expect(result.text).toContain("[S1]"); expect(result.corrections).toHaveLength(2);
  expect(repairCitedUnits(result.text, hits)).toEqual({ text: result.text, corrections: [] });
});
it("does not change uncited/unsupported amounts, currency, code, hypotheses, ambiguous originals or low-confidence OCR", () => {
  const hit = evidence("Total CNY 28.4 billion.");
  for (const text of ["28.4亿元人民币", "CNY 999 亿 [S1]", "USD 28.4 亿 [S1]", "`CNY 28.4 亿` [S1]", "假设一家企业损失28.4亿元人民币。[S1]"]) expect(repairCitedUnits(text, [hit]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [evidence("CNY 28.4 billion; another metric is CNY 28.4 亿。")]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [{ ...hit, chunk: { ...hit.chunk, anchor: { kind: "pdf", page: 4, method: "ocr", confidence: 40 } } }]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [{ ...hit, chunk: { ...hit.chunk, anchor: { kind: "pdf", page: 4, method: "ocr", confidence: 94, needsReview: true } } }]).corrections).toEqual([]);
  expect(repairCitedUnits("损失为284亿元人民币 [S1]", [hit]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [evidence("The gain corresponds to CNY -28.4 billion of stranded value.")]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY −28.4 亿 [S1]", [evidence("The stranded value is CNY −28.4 billion.")]).text).toContain("CNY -284 亿");
  expect(mapCitations("Equation (S2) and 公式（S3） remain labels. A finding (S1)." )).toBe("Equation (S2) and 公式（S3） remain labels. A finding [S1].");
});
it("adapts evidence and response structure to questions rather than always listing monetary results", () => {
  expect(answerTask("这几篇实际算的损失有什么区别？")).toBe("definition");
  expect(answerTask("请写一段综述，解释这些研究之间的联系。")).toBe("writing");
  expect(answerTask("能列出损失最高的十家企业及精确金额吗？")).toBe("ranking");
  expect(answerTask("为什么降低利用率可能比关闭更贵？")).toBe("mechanism");
  expect(answerInstructions("writing")).toContain("editable draft"); expect(answerInstructions("ranking")).toContain("unseen supplement");
  const background = evidence("Introduction: climate transition and investment.", "intro"), method = evidence("We define the metric as the difference in discounted net cash flow relative to the baseline.", "method");
  method.source = background.source;
  expect(methodCoverage([background, method], [background.source.id], "definition").flat().map(hit => hit.chunk.id)).toContain("method");
  expect(methodCoverage([background, method], [background.source.id], "ranking")).toEqual([]);
  expect(methodCoverage([background, method], ["file:excluded"], "definition")).toEqual([]);
});
it("checks factual enumerations, incidental amounts and reported assumptions without changing invented examples", () => {
  const hits = [evidence("The reported total is CNY 28.4 billion; northern facilities account for CNY 6.3 billion."), evidence("Under the model's 90% pass-through assumption, company losses are US$64 billion.", "b", "S2")];
  expect(repairCitedUnits("全国损失28.4亿元人民币[S1]，例如北区6.3亿元人民币[S1]。", hits).text).toBe("全国损失284亿元人民币[S1]，例如北区63亿元人民币[S1]。");
  expect(repairCitedUnits("模型假设成本可转嫁90%，估计企业损失为US$64亿[S2]。", hits).text).toContain("US$640亿");
  expect(repairCitedUnits("在成本转嫁90%的假设下，企业损失为US$64亿[S2]。", hits).text).toContain("US$640亿");
  expect(repairCitedUnits("The model assuming 90% pass-through reports US$64亿[S2].", hits).text).toContain("US$640亿");
  const mixed = "报告损失为28.4亿元人民币[S1]。假设一家企业损失28.4亿元人民币[S1]，其收入减少。";
  expect(repairCitedUnits(mixed, hits).text).toBe("报告损失为284亿元人民币[S1]。假设一家企业损失28.4亿元人民币[S1]，其收入减少。");
  expect(repairCitedUnits("损失28.4亿元人民币[S1]，假设一家企业损失6.3亿元人民币[S1]。", hits).text).toBe("损失284亿元人民币[S1]，假设一家企业损失6.3亿元人民币[S1]。");
  for (const text of ["例如一家企业损失28.4亿元人民币[S1]。", "假设一家企业退出。其损失28.4亿元人民币[S1]。", "A hypothetical firm loses CNY 28.4 亿[S1]."]) expect(repairCitedUnits(text, hits).corrections).toEqual([]);
  expect(repairCitedUnits("假设一家企业退出。原文报告损失28.4亿元人民币[S1]。", hits).text).toContain("284亿元");
  expect(repairCitedUnits("核心判断不涉及金额；另有US\\$64亿[S2]。", hits).text).toContain("US\\$640亿");
  expect(repairCitedUnits("核心判断不涉及金额；另有$64$亿美元[S2]。", hits).text).toContain("$640$亿美元");
  expect(repairCitedUnits("全国$28.4$亿元人民币[S1]。", hits).text).toContain("$284$亿元人民币");
  expect(repairCitedUnits("持有US\\$ $41$–$67$亿[S1]。", [evidence("US$41 to US$67 billion.")]).text).toContain("US\\$ $410$–$670$亿");
  const building = [evidence("Building exposure is CNY 3.75 trillion.")];
  expect(repairCitedUnits("建筑业为3.75亿元人民币[S1]。", building).text).toContain("37500亿元人民币");
  for (const text of ["例如一座楼损失3.75亿元人民币[S1]。", "Assume a firm loses CNY 3.75 亿[S1].", "3.75亿元人民币（假设值）[S1]。", "假定一家企业退出，其损失3.75亿元人民币[S1]。"]) expect(repairCitedUnits(text, building).corrections).toEqual([]);
});
it("binds independently cited metrics to their own sentences, clauses and table rows", () => {
  const hits = [evidence("Transport loses CNY 28.4 billion."), evidence("Agriculture loses CNY 28.4 million.", "b", "S2")];
  for (const separator of ["；", "。", "\n", "; "]) {
    const text = `第一项为28.4亿元人民币[S1]${separator}第二项为28.4亿元人民币[S2]。`;
    expect(repairCitedUnits(text, hits).text).toBe(`第一项为284亿元人民币[S1]${separator}第二项为0.284亿元人民币[S2]。`);
  }
  expect(repairCitedUnits("甲28.4亿元人民币[S1]，乙28.4亿元人民币[S2]。", hits).text).toBe("甲284亿元人民币[S1]，乙0.284亿元人民币[S2]。");
  expect(repairCitedUnits("甲28.4亿元人民币。[S1]\n乙28.4亿元人民币。[S2]", hits).corrections).toHaveLength(2);
  expect(repairCitedUnits("| 甲 | 28.4亿元人民币 | [S1] |\n| 乙 | 28.4亿元人民币 | [S2] |", hits).text).toContain("0.284亿元");
  expect(repairCitedUnits("28.4亿元人民币[S1][S2]", hits).corrections).toEqual([]);
  expect(repairCitedUnits("未引用的28.4亿元人民币。另一句话只有引用[S1]。", hits).corrections).toEqual([]);
  expect(repairCitedUnits("```text\n28.4亿元人民币[S1]\n```\n\n真实损失28.4亿元人民币[S1]", hits).text).toBe("```text\n28.4亿元人民币[S1]\n```\n\n真实损失284亿元人民币[S1]");
});
