import type { KnowledgeHit } from "../src/shared/knowledge";
import { bibliography } from "./chat-quality";
export type AnswerTask = "definition" | "mechanism" | "comparison" | "calculation" | "writing" | "ranking" | "answer";

/** Independent intents: a definition, calculation and explanation may all be requested. */
export function answerTasks(question: string): AnswerTask[] {
  const tasks: AnswerTask[] = [];
  const ranked = /(?:前|最高|最低|最大|最小).{0,12}(?:十|\d+|名单|排名)|\btop\s*\d+|\brank(?:ing)?\b/iu.test(question);
  const aggregate = /合计|累计|总额|对应的?金额|\b(?:total|combined|aggregate)/iu.test(question);
  const individual = /逐家|逐个|每家|各自|精确金额|名单|排名|\b(?:list|rank|each|individual)/iu.test(question);
  const ranking = ranked && (individual || !aggregate);
  if (/写一段|撰写|写.*综述|综述.*(?:组织|写)|写作|\b(?:draft|write).{0,35}(?:paragraph|review|summary)/iu.test(question)) tasks.push("writing");
  if (ranking) tasks.push("ranking");
  if (/定义|实际算的|算的.*(?:损失|指标)|计算口径|损失口径|衡量什么|度量|\bdefin|what.{0,20}(?:measur|calculat)/iu.test(question)) tasks.push("definition");
  const operation = /换算|计算|差多少|少了多少|多了多少|减少多少|\b(?:convert|calculat|difference|subtract)/iu.test(question);
  if (operation || (!ranking || aggregate) && /多少钱|金额|总额|总损失|\b(?:how much|amount|total|combined|aggregate)/iu.test(question)) tasks.push("calculation");
  if (/为什么|为何|原因|怎么.*(?:会|发生)|机制|\b(?:why|how does|mechanism)/iu.test(question)) tasks.push("mechanism");
  if (/比较|对比|不同|区别|矛盾|相反|\bcompar|\bdiffer|\bcontrast/iu.test(question)) tasks.push("comparison");
  return tasks.length ? tasks : ["answer"];
}

/** Reserve methodological evidence for all requested intents, within the existing budget. */
export function methodCoverage(corpus: KnowledgeHit[], ids: string[], tasks: readonly AnswerTask[], question = ""): KnowledgeHit[][] {
  const mechanism = tasks.includes("mechanism") || /如何.*(?:选择|调整|切换)|how.{0,25}(?:select|switch|allocat)/iu.test(question);
  const comparison = tasks.includes("comparison") || /各篇|几篇|\bstudies\b/iu.test(question);
  if (!tasks.some(task => ["definition", "writing", "comparison"].includes(task)) && !mechanism && !comparison) return [];
  const groups: RegExp[] = [];
  if (mechanism) groups.push(/(?:method|algorithm|decision|select|rank|allocat|cost|方法|规则|选择|排序|分配)/iu, /(?:limitation|assum|static|fixed|switch|lock.in|future research|局限|假设|静态|固定|切换|锁定|未来研究)/iu);
  if (!mechanism || tasks.includes("definition") || comparison) groups.push(/(?:defin|measur|quantif|net present value|cash flow|future profit|accounting|NPV|定义|度量|衡量|净现值|现金流)/iu, /(?:baseline|counterfactual|business.as.usual|pass.through|assum|limitation|ownership|discount|horizon|valuation period|time period|基准|假设|局限|所有权|折现|估值期|期限)/iu);
  return ids.slice(0, 12).map(id => {
    const candidates = corpus.filter(hit => hit.source.id === id && !bibliography(hit));
    const chosen = groups.flatMap(pattern => candidates.map(hit => ({ hit, score: (hit.chunk.text.match(new RegExp(pattern.source, "giu")) ?? []).length + (pattern.test(hit.chunk.anchor.heading ?? "") ? 3 : 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 1).map(item => item.hit));
    return [...new Map(chosen.map(hit => [hit.chunk.id, hit])).values()];
  }).filter(group => group.length > 0);
}
