import type { KnowledgeHit } from "../src/shared/knowledge";
import { bibliography } from "./chat-quality";
export type AnswerTask = "definition" | "mechanism" | "comparison" | "calculation" | "writing" | "ranking" | "answer";
export function answerTask(question: string): AnswerTask {
  if (/写一段|撰写|写.*综述|综述.*(?:组织|写)|写作|\b(?:draft|write).{0,35}(?:paragraph|review|summary)/iu.test(question)) return "writing";
  if (/(?:前|最高|最低|最大|最小).{0,12}(?:十|\d+|名单|排名)|\btop\s*\d+|\brank(?:ing)?\b/iu.test(question)) return "ranking";
  if (/定义|实际算的|算的.*(?:损失|指标)|计算口径|损失口径|衡量什么|度量|\bdefin|what.{0,20}(?:measur|calculat)/iu.test(question)) return "definition";
  if (/多少钱|差多少|少了多少|多了多少|金额|换算|总额|\b(?:how much|convert|amount|total cost)/iu.test(question)) return "calculation";
  if (/为什么|原因|怎么.*(?:会|发生)|机制|\b(?:why|how does|mechanism)/iu.test(question)) return "mechanism";
  if (/比较|对比|不同|区别|矛盾|相反|\bcompar|\bdiffer|\bcontrast/iu.test(question)) return "comparison";
  return "answer";
}
export function answerInstructions(task: AnswerTask): string {
  return ({ definition: "Compare the actual metrics: what is lost, relative to which baseline, whose loss, and what is included/excluded. Use a compact comparison table if helpful. Explain the reported definitions; do not add an inventory of monetary results or a hypothetical worked example unless requested. Cash-flow/wealth losses and GDP/employment changes must stay distinct even when one paper reports both.",
    mechanism: "Answer why/how directly, then explain the mechanism as connected steps. Use only numbers that help that explanation. Attribute implemented mechanisms to the paper; express an inference or proposed extension through calibrated wording in the sentence without a repetitive disclaimer.",
    comparison: "Start with the direct judgment, identify the exact dimensions that resolve the comparison, then explain their implications. Use only relevant papers. Avoid repeating unrelated results or declaring a missing excerpt from an unrelated paper.",
    calculation: "Give the requested available values in one consistent set of units, show necessary arithmetic, and bind each amount to its metric/scenario. Convert currencies only when requested, with an explicit rate; if absent use a symbolic conversion or ask for the rate. Do not add an unsolicited exchange-rate example. Check incidental amounts as carefully as the main answer.",
    writing: "Provide the requested writing support, including a coherent editable draft paragraph when useful. Use citations and calibrated wording to convey evidence versus interpretation naturally; add a separate explanation only if a material distinction needs clarification. Distinguish ownership allocation, behavioural transmission and macro simulation; do not claim separate studies prove an entire causal chain. Do not substitute only a checklist of instructions or unrelated monetary results for the requested prose.",
    ranking: "Identify whether the selected materials contain the individual-level data needed for the ranking. A provincial/sector total or a reference to an unseen supplement cannot establish entity rankings or confirm the supplement's granularity. State the concrete missing fields once and the next usable step. Omit unrelated totals and percentages.",
    answer: "Answer the current question first, explain enough to make it useful, and stop when it is answered. Choose paragraphs, an example, a table or a formula according to the task; do not force a fixed sequence of headings." })[task];
}
/** Reserve methodological evidence per relevant source for metric questions; no external/model calls. */
export function methodCoverage(corpus: KnowledgeHit[], ids: string[], task: AnswerTask, question = ""): KnowledgeHit[][] {
  if (task === "ranking") return [];
  const mechanism = task === "mechanism" || /为什么|为何|机制|如何.*(?:选择|调整|切换)|\bwhy\b|\bmechanism\b|how.{0,25}(?:select|switch|allocat)/iu.test(question);
  const comparison = /比较|对比|不同|区别|各篇|几篇|\bcompar|\bdiffer|\bstudies\b/iu.test(question);
  if (!["definition", "writing", "comparison"].includes(task) && !mechanism && !comparison) return [];
  const groups = mechanism
    ? [/(?:method|algorithm|decision|select|rank|allocat|cost|方法|规则|选择|排序|分配)/iu, /(?:limitation|assum|static|fixed|switch|lock.in|future research|局限|假设|静态|固定|切换|锁定|未来研究)/iu]
    : [/(?:defin|measur|quantif|net present value|cash flow|future profit|accounting|NPV|定义|度量|衡量|净现值|现金流)/iu, /(?:baseline|counterfactual|business.as.usual|pass.through|assum|limitation|ownership|discount|horizon|valuation period|time period|基准|假设|局限|所有权|折现|估值期|期限)/iu];
  return ids.slice(0, 12).map(id => {
    const candidates = corpus.filter(hit => hit.source.id === id && !bibliography(hit));
    const chosen = groups.flatMap(pattern => candidates.map(hit => ({ hit, score: (hit.chunk.text.match(new RegExp(pattern.source, "giu")) ?? []).length + (pattern.test(hit.chunk.anchor.heading ?? "") ? 3 : 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 1).map(item => item.hit));
    return [...new Map(chosen.map(hit => [hit.chunk.id, hit])).values()];
  }).filter(group => group.length > 0);
}
