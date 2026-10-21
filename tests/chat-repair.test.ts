// @vitest-environment node
import { expect, it } from "vitest";
import { repairCitedUnits } from "../electron/chat-repair";
import { answerTasks, methodCoverage } from "../electron/chat-answer-plan";
import { groundingInstructions } from "../electron/chat-policy";
import { mapCitations, type ChatEvidence } from "../src/shared/grounding";
import { chineseListAmounts } from "../electron/chat-money";
function evidence(text: string, id = "a", label = "S1"): ChatEvidence { return { label, fingerprint: "a".repeat(64), source: { id: `file:${id}`, entityId: id, title: `${id}.pdf`, kind: "file", format: "pdf", fingerprint: "a".repeat(64), locations: [], attachments: [], tags: [], systemManaged: false }, chunk: { id, text, anchor: { kind: "pdf", page: 4 } } }; }
it("repairs every declared slash-list amount, retaining correct members and excluding ratios", () => {
  const transport = [evidence("Rail costs CNY 12.6 billion; shipping CNY 8.2 billion; road CNY 5.4 billion.")];
  const reply = "货运：12.6 / 8.2 / 54 亿元人民币（铁路、航运、公路）[S1]。";
  const fixed = repairCitedUnits(reply, transport);
  expect(fixed.text).toBe("货运：126 / 82 / 54 亿元人民币（铁路、航运、公路）[S1]。");
  expect(fixed.corrections).toHaveLength(2);
  expect(repairCitedUnits(fixed.text, transport).corrections).toEqual([]);
  const crops = [evidence("Wheat costs USD 7.3 billion; corn USD 4.8 billion; rice USD 2.6 billion.")];
  expect(repairCitedUnits("小麦、玉米、水稻分别为7.3／4.8／2.6亿美元[S1]。", crops).text).toBe("小麦、玉米、水稻分别为73／48／26亿美元[S1]。");
  expect(chineseListAmounts("12.6 / 8.2亿元人民币")).toEqual([]);
  expect(chineseListAmounts("12.6 / 8.2亿元人民币（铁路、航运、公路）")).toEqual([]);
  expect(chineseListAmounts("1 / 8.2亿元人民币（比例）")).toEqual([]);
  for (const text of ["12.6 / 8.2亿元人民币[S1]。", "`12.6 / 8.2 / 5.4亿元人民币（铁路、航运、公路）[S1]`", "假设一家企业依次损失12.6 / 8.2 / 5.4亿元人民币[S1]。"])
    expect(repairCitedUnits(text, transport).corrections).toEqual([]);
  expect(repairCitedUnits(reply, [evidence("Rail costs USD 12.6 billion; shipping USD 8.2 billion; road USD 5.4 billion.")]).corrections).toEqual([]);
});
it("corrects exact cited currency scales and ranges in final prose while retaining the target unit and an audit", () => {
  const hits = [evidence("The national total is CNY 28.4 billion. The selected companies hold US$41 to US$67 billion.")];
  const result = repairCitedUnits("全国为28.4亿元人民币（CNY 28.4 billion）[S1]。\n\n公司为US$41–67亿（S1）。", hits);
  expect(result.text).toContain("284亿元人民币"); expect(result.text).toContain("US$410–670亿"); expect(result.text).toContain("[S1]"); expect(result.corrections).toHaveLength(2);
  expect(repairCitedUnits(result.text, hits)).toEqual({ text: result.text, corrections: [] });
});
it("checks declared source subtractions without treating generated differences or unrelated citations as originals", () => {
  const hits = [evidence("Transport route C loses 41.2 billion CNY, below A (68.7 billion) and B (53.9 billion).")];
  const text = "以41.2亿元为基准，路线C比A少27.5亿元，比B少12.7亿元（按原文数值相减）。相对降幅不同[S1]。";
  const fixed = repairCitedUnits(text, hits);
  expect(fixed.text).toBe("以412亿元为基准，路线C比A少275亿元，比B少127亿元（按原文数值相减）。相对降幅不同[S1]。");
  expect(fixed.corrections).toHaveLength(3); expect(repairCitedUnits(fixed.text, hits).corrections).toEqual([]);
  expect(repairCitedUnits("作物两路径的差额为CNY 9.6 亿[S1]。", [evidence("Crop A costs CNY 24.8 billion; B costs CNY 15.2 billion.")]).text).toContain("CNY 96 亿");
  expect(repairCitedUnits("其他指标CNY 9.6 亿[S1]。", [evidence("Crop A costs CNY 24.8 billion; B costs CNY 15.2 billion.")]).corrections).toEqual([]);
  for (const source of ["A costs CNY 24.8 billion; B costs USD 15.2 billion.", "A costs CNY 24.8 billion; B costs CNY 15.2 million.", "Capacity (GW)\nCNY 24.8 billion\nCNY 15.2 billion\nFig. 2 | Crops."]) expect(repairCitedUnits("差额为CNY 9.6 亿[S1]。", [evidence(source)]).corrections).toEqual([]);
  expect(repairCitedUnits("以41.2亿元为基准，少27.5亿元（按原文数值相减）。比较原文[S1][S2]。", [...hits, evidence("An unrelated crop.", "b", "S2")]).corrections).toEqual([]);
  expect(repairCitedUnits("假设一家企业少27.5亿元（按原文数值相减）[S1]。", hits).corrections).toEqual([]);
});
it("revalidates nearby named repetitions and arithmetic on cited differences without giving arbitrary prose a citation", () => {
  const hits = [evidence("Transport route C costs CNY 41.2 billion, A costs CNY 68.7 billion, B costs CNY 53.9 billion.")];
  const text = "RouteC为41.2亿元人民币，RouteA为68.7亿元人民币，RouteB为53.9亿元人民币[S1]。RouteC分别少27.5亿元人民币和12.7亿元人民币[S1]。\n\n这两个差额不能相加，共同终点是RouteC的41.2亿元人民币，相加得到40.2亿元人民币没有单一比较口径。";
  const fixed = repairCitedUnits(text,hits);
  expect(fixed.text).toContain("共同终点是RouteC的412亿元人民币"); expect(fixed.text).toContain("得到402亿元人民币");
  expect(repairCitedUnits(fixed.text,hits).corrections).toEqual([]);
  const crop = "CropC为CNY 15.2 亿，CropA为CNY 24.8 亿[S1]。差额为CNY 9.6 亿[S1]。\n\nCropC仍是CNY 15.2 亿。";
  expect(repairCitedUnits(crop,[evidence("Crop C costs CNY 15.2 billion; Crop A costs CNY 24.8 billion.")]).text).toContain("CropC仍是CNY 152 亿");
  for (const tail of ["\n\nAnotherRoute为41.2亿元人民币。", "\n\n## Other section\n\nRouteC为41.2亿元人民币。", "\n\n假设一家企业的RouteC损失41.2亿元人民币。"]){
    const result=repairCitedUnits(text.split("\n\n")[0]+tail,hits);
    expect(result.text.endsWith(tail)).toBe(true);
  }
});
it("does not change uncited/unsupported amounts, currency, code, hypotheses, ambiguous originals or low-confidence OCR", () => {
  const hit = evidence("Total CNY 28.4 billion.");
  for (const text of ["28.4亿元人民币", "CNY 999 亿 [S1]", "USD 28.4 亿 [S1]", "`CNY 28.4 亿` [S1]", "假设一家企业损失28.4亿元人民币。[S1]"]) expect(repairCitedUnits(text, [hit]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [evidence("CNY 28.4 billion; another metric is CNY 28.4 亿。")]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [{ ...hit, chunk: { ...hit.chunk, anchor: { kind: "pdf", page: 4, method: "ocr", confidence: 40 } } }]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [{ ...hit, chunk: { ...hit.chunk, anchor: { kind: "pdf", page: 4, method: "ocr", confidence: 94, needsReview: true } } }]).corrections).toEqual([]);
  expect(repairCitedUnits("损失为284亿元人民币 [S1]", [hit]).corrections).toEqual([]);
  expect(repairCitedUnits("其中130亿美元只在后续环节体现[S1]。", [evidence("13% of the loss only becomes apparent downstream. Overall exposure is US$1.6 trillion.")]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY 28.4 亿 [S1]", [evidence("The gain corresponds to CNY -28.4 billion of stranded value.")]).corrections).toEqual([]);
  expect(repairCitedUnits("CNY −28.4 亿 [S1]", [evidence("The stranded value is CNY −28.4 billion.")]).text).toContain("CNY -284 亿");
  expect(mapCitations("Equation (S2) and 公式（S3） remain labels. A finding (S1)." )).toBe("Equation (S2) and 公式（S3） remain labels. A finding [S1].");
});
it("adapts evidence and response structure to questions rather than always listing monetary results", () => {
  expect(answerTasks("这几篇实际算的损失有什么区别？")).toContain("definition");
  expect(answerTasks("请写一段综述，解释这些研究之间的联系。")).toContain("writing");
  expect(answerTasks("能列出损失最高的十家企业及精确金额吗？")).toContain("ranking");
  expect(answerTasks("前30家企业和两类基金对应的金额分别是多少？")).toContain("calculation");
  expect(answerTasks("What is the combined loss of the top 12 operators?")).toContain("calculation");
  expect(answerTasks("List the top 12 operators and each one's exact loss.")).toContain("ranking");
  expect(answerTasks("为什么降低利用率可能比关闭更贵？")).toContain("mechanism");
  expect(groundingInstructions(["writing"])).toContain("continuous paragraph"); expect(groundingInstructions(["ranking"])).toContain("unseen supplement");
  const background = evidence("Introduction: climate transition and investment.", "intro"), method = evidence("We define the metric as the difference in discounted net cash flow relative to the baseline.", "method");
  method.source = background.source;
  expect(methodCoverage([background, method], [background.source.id], ["definition"]).flat().map(hit => hit.chunk.id)).toContain("method");
  expect(methodCoverage([background, method], [background.source.id], ["ranking"])).toEqual([]);
  expect(methodCoverage([background, method], ["file:excluded"], ["definition"])).toEqual([]);
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

it("inherits a table caption's sources without borrowing another section or overriding row attribution", () => {
  const hits = [evidence("Transport exposure is US$52 billion; funds hold US$184 billion."), evidence("Agriculture exposure is US$52 million.", "b", "S2")];
  const text = "**Transport [S1]**\n\n| Metric | Original | 人民币 |\n|---|---|---|\n| Exposure | US\\$52 亿 | $520e$ 亿元 |\n| Funds | US$184 亿 | $1840e$ 亿元 |\n\n**Agriculture**\n\n| Metric | Original |\n|---|---|\n| Uncited | US$52 亿 |\n| Explicit | US$52 亿 [S2] |";
  const fixed = repairCitedUnits(text, hits);
  expect(fixed.text).toContain("US\\$520 亿"); expect(fixed.text).toContain("US$1840 亿");
  expect(fixed.text).toContain("| Uncited | US$52 亿 |"); expect(fixed.text).toContain("US$0.52 亿 [S2]");
  expect(fixed.corrections).toHaveLength(3); expect(repairCitedUnits(fixed.text, hits).corrections).toEqual([]);
  const mixed = "**Comparison [S1][S2]**\n\n| Metric | Amount |\n|---|---|\n| Exposure | US$52 亿 |";
  expect(repairCitedUnits(mixed, hits).text).toBe(mixed);
});

it("computes symbolic table conversions from exact originals and preserves unknown rates, unsupported data and other columns", () => {
  const hit = evidence("Crop exposure is US$46 billion; another crop is US$92 million.");
  const text = "## Crop results [S1]\n\n| Crop | 原值 | 人民币 |\n|---|---|---|\n| A | US$46 billion | $46e$ 亿元 |\n| B | US$92 million | $920e$ 亿元 |\n| Unknown | US$123 billion | $123e$ 亿元 |";
  const fixed = repairCitedUnits(text, [hit]);
  expect(fixed.text).toContain("US$46 billion | $460e$ 亿元"); expect(fixed.text).toContain("US$92 million | $0.92e$ 亿元");
  expect(fixed.text).toContain("US$123 billion | $123e$ 亿元"); expect(fixed.corrections).toHaveLength(2);
  expect(repairCitedUnits(fixed.text, [hit])).toEqual({ text: fixed.text, corrections: [] });
  const unrelated = text.replace(/人民币/g, "Other measure");
  expect(repairCitedUnits(unrelated, [hit]).text).toBe(unrelated);
  expect(repairCitedUnits("```markdown\n" + text + "\n```", [hit]).corrections).toEqual([]);
});

it("honours monetary column units without confusing counts or crossing currency dimensions", () => {
  const hits = [evidence("Transport exposure is US$52 billion; domestic exposure is CNY 3.4 trillion.")];
  const text = "**Transport [S1]**\n\n| Metric | 原值（亿美元） | 人民币 | Plants |\n|---|---|---|---|\n| A | 52 | $52e$ 亿元 | 52 |\n\n**Domestic [S1]**\n\n| Metric | 损失（亿元人民币） |\n|---|---|\n| B | $3.4$ |";
  const fixed = repairCitedUnits(text, hits);
  expect(fixed.text).toContain("| A | 520 | $520e$ 亿元 | 52 |"); expect(fixed.text).toContain("| B | $34000$ |");
  expect(repairCitedUnits(fixed.text, hits).corrections).toEqual([]);
  const shared = "**Transport [S1]**\n\n| Metric | 原值（亿美元） | 人民币（万亿元） |\n|---|---|---|\n| A | 52 | $52e$ |";
  expect(repairCitedUnits(shared, hits).text).toContain("| A | 520 | $0.052e$ |");
});

it("does not use isolated chart labels as proof that another entity's total has the wrong scale", () => {
  const chart = evidence("Company risks\nCapacity (GW)\nUS$2.7 billion\nUS$1.6 billion\nFig. 3 | Selected operators in a moderate scenario.");
  const text = "全球更严格情景的总损失是2.7万亿美元[S1]。";
  expect(repairCitedUnits(text, [chart]).corrections).toEqual([]);
});

it("repairs shared English scales and separately repeated range endpoints, without trusting a generated parenthesis", () => {
  const hits = [evidence("Transport operators hold upwards of US$53 and US$17 billion under the two scenarios. Regional exposure ranges from US$26 to US$48 billion.")];
  const text = "两种情景分别为US$53亿（530亿美元）和US$17亿（170亿美元）[S1]。地区为US$26亿至US$48亿（260亿至480亿美元）[S1]。";
  const fixed = repairCitedUnits(text, hits);
  expect(fixed.text).toBe("两种情景分别为US$530亿（530亿美元）和US$170亿（170亿美元）[S1]。地区为US$260亿至US$480亿（260亿至480亿美元）[S1]。");
  expect(fixed.corrections).toHaveLength(4); expect(repairCitedUnits(fixed.text, hits).corrections).toEqual([]);
  const crop = [evidence("Crop exposure is CNY 6,200, CNY 1,300 and CNY 800 million.")];
  expect(repairCitedUnits("作物分别损失CNY 6,200亿、CNY 1,300亿和CNY 800亿[S1]。", crop).text).toBe("作物分别损失CNY 62亿、CNY 13亿和CNY 8亿[S1]。");
  for (const source of ["USD 53 and CNY 17 billion.", "US$53 facilities and US$17 billion.", "Capacity (GW)\nUS$53 and US$17 billion\nFig. 7 | Operators."]) {
    expect(repairCitedUnits("US$53亿[S1]。", [evidence(source)]).corrections).toEqual([]);
  }
  expect(repairCitedUnits("US$53亿[S1]。", [evidence("US$53 million and US$17 billion.")]).text).toBe("US$0.53亿[S1]。");
});

it("checks every member of a Chinese monetary list using locally declared original currencies", () => {
  const hits = [evidence("Crop strategy C has the lowest loss (41.2 billion CNY), below strategy A (68.7 billion) and B (53.9 billion).")];
  const result = repairCitedUnits("三种策略分别为68.7、53.9和412亿元人民币[S1]。", hits);
  expect(result.text).toBe("三种策略分别为687、539和412亿元人民币[S1]。"); expect(result.corrections).toHaveLength(2);
  expect(repairCitedUnits(result.text, hits).corrections).toEqual([]);
  expect(repairCitedUnits("支出2.6万元人民币[S1]。", [evidence("Expense is CNY 2.6 million.")]).text).toBe("支出260万元人民币[S1]。");
  for (const source of ["CNY 41.2 billion. A count (68.7 billion).", "CNY 41.2 billion and USD 5 million; A (68.7 billion).", "Population (68.7 billion).", "CNY 41.2 billion; energy (68.7 billion kWh).", "Capacity (GW)\nCNY 41.2 billion\n(68.7 billion)\nFig. 8 | Operators."]){
    expect(repairCitedUnits("68.7亿元人民币[S1]。", [evidence(source)]).corrections).toEqual([]);
  }
});
