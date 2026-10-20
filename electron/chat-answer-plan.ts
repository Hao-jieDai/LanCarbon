import type { KnowledgeHit } from "../src/shared/knowledge";
import { bibliography } from "./chat-quality";
export type AnswerTask = "definition" | "mechanism" | "comparison" | "calculation" | "writing" | "ranking" | "formula" | "answer";


/** Request vocabulary shared with source planning and formal evidence selection. */
export const DEFINITION_REQUEST = /定义|实际算的|算的.*(?:损失|指标)|计算口径|损失口径|衡量什么|度量|如何计算|怎么计算|\bdefin|\boperationali[sz]|what.{0,20}(?:measur|calculat)|how.{0,25}(?:measur|calculat|quantif)/iu;
export const FORMULA_REQUEST = /公式|计算式|表达式|方程|数学形式|\b(?:formula(?:e|s)?|equations?|latex)\b|mathematical (?:expression|definition)/iu;
export const COMPARISON_REQUEST = /比较|对比|异同|区别|不同|矛盾|相反|一致|冲突|并存|同时(?:理解|成立|存在)|如何同时|(?:两|三|这几|多)篇|\bcompar|\bcontrast|\bcontradict|\bconflict|\boppos|\bdiffer|\bversus\b|\bvs\.?\b|\bcoexist|\breconcil/iu;

/** Prefer a study's operational definition and counterfactual over a survey of others' results. */
export function definitionScore(text: string): number {
  const t = text.replace(/\s+/g, " ");
  const own = /\b(?:we|this (?:study|paper)|our (?:study|analysis))\b.{0,40}\b(?:operationali[sz]|defin|measur|quantif|calculat|estimat)|本文.{0,30}(?:采用|定义|计算|测算|评估)/iu.test(t);
  const direct = /\boperationali[sz]\w*.{0,100}\bas\b|\b(?:defin\w*|measur\w*)\b.{0,70}\b(?:as|difference|change)\b|定义为|视为|即与基准|现金流缩减/iu.test(t);
  const relation = /\b(?:change|difference)\b.{0,90}\b(?:profit|value|expect|baseline)|与基准.{0,60}(?:收益|现金流|损失)|预期.{0,35}下降/iu.test(t);
  const outcome = /\b(?:defin|measur|operationali[sz]|quantif|estimat)\w*.{0,65}\b(?:loss|risk|value|profit|cost|probabilit|error|yield)|(?:定义|测算|计算|衡量).{0,40}(?:损失|风险|价值|成本|概率|误差)/iu.test(t);
  const survey = /previous studies|earlier studies|literature review|已有研究|既有文献|早期研究|文献综述/iu.test(t) && !own;
  return (own ? 6 : 0) + (direct ? 16 : 0) + (relation ? 8 : 0) + (outcome ? 8 : 0) + Math.min(5, (t.match(/present value|future profit|cash flow|NPV|净现值|现金流|基准/giu) ?? []).length) - (survey ? 8 : 0);
}

/** Find the study's actual paired counterfactual, not a dense paragraph of generic parameters. */
export function counterfactualScore(text: string): number {
  const t = text.replace(/\s+/gu, " ");
  const own = /\b(?:here\s+)?we\b.{0,70}\b(?:estimat|calculat|compar|quantif|measur)|(?:本文|本研究).{0,50}(?:评估|计算|测算|比较)/iu.test(t);
  const named = /\b(?:baseline|counterfactual|control (?:group|scenario)|business.as.usual)\b|基准情景|对照组|反事实/iu.test(t);
  const paired = /\b(?:with(?:out)?|either|no)\b[^.!?]{0,200}\b(?:versus|with(?:out)?|or|relative to|compared (?:to|with))\b|(?:基准|对照|无干预).{0,100}(?:与|相比|减去|差异)/iu.test(t);
  const difference = /\b(?:differences?|different|changes?|relative|pairing)\b|差额|差值|变化|之差/iu.test(t);
  const relation = /\b(?:assum|compar|measur|calculat|estimat|quantif)\w*[^.!?]{0,250}\b(?:relative|against|between|assuming|either|without)\b|(?:计算|测算|定义).{0,100}(?:差|相比|减去)/iu.test(t);
  const secondary = /previous studies|earlier studies|文献综述|已有研究/iu.test(t) && !own;
  return (own ? 6 : 0) + (named ? 5 : 0) + (paired && difference ? 10 : 0) + (relation ? 8 : 0) - (secondary ? 12 : 0);
}

/** Independent intents: a definition, calculation and explanation may all be requested. */
export function answerTasks(question: string): AnswerTask[] {
  const tasks: AnswerTask[] = [];
  const ranked = /(?:前|最高|最低|最大|最小).{0,12}(?:十|\d+|名单|排名)|\btop\s*\d+|\brank(?:ing)?\b/iu.test(question);
  const aggregate = /合计|累计|总额|对应的?金额|\b(?:total|combined|aggregate)/iu.test(question);
  const individual = /逐家|逐个|每家|各自|精确金额|名单|排名|\b(?:list|rank|each|individual)/iu.test(question);
  const ranking = ranked && (individual || !aggregate);
  if (/写一段|撰写|写.*综述|综述.*(?:组织|写)|写作|\b(?:draft|write).{0,35}(?:paragraph|review|summary)/iu.test(question)) tasks.push("writing");
  if (ranking) tasks.push("ranking");
  if (DEFINITION_REQUEST.test(question)) tasks.push("definition");
  if (FORMULA_REQUEST.test(question)) tasks.push("formula");
  const operation = /换算|计算|差多少|少了多少|多了多少|减少多少|\b(?:convert|calculat|difference|subtract)/iu.test(question);
  if (operation || (!ranking || aggregate) && /多少钱|金额|总额|总损失|\b(?:how much|amount|total|combined|aggregate)/iu.test(question)) tasks.push("calculation");
  if (/为什么|为何|原因|怎么.*(?:会|发生)|机制|\b(?:why|how does|mechanism)/iu.test(question)) tasks.push("mechanism");
  if (COMPARISON_REQUEST.test(question)) tasks.push("comparison");
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
  return ids.slice(0, 12).flatMap(id => {
    const candidates = corpus.filter(hit => hit.source.id === id && !bibliography(hit));
    const definitions = tasks.includes("definition") ? candidates.map(hit => ({ hit, score: definitionScore(hit.chunk.text) })).filter(item => item.score >= 8).sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.hit) : [];
    const counterfactual = candidates.map(hit => ({hit,score:counterfactualScore(hit.chunk.text)})).filter(item => item.score >= 14).sort((a,b)=>b.score-a.score).slice(0,1).map(item=>item.hit);
    const chosen = groups.flatMap(pattern => candidates.map(hit => ({ hit, score: (hit.chunk.text.replace(/\s+/g, " ").match(new RegExp(pattern.source, "giu")) ?? []).length + (pattern.test(hit.chunk.anchor.heading ?? "") ? 3 : 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 1).map(item => item.hit));
    const primary = [...new Map([...definitions, ...counterfactual].map(hit => [hit.chunk.id, hit])).values()];
    const reserved = new Set(primary.map(hit => hit.chunk.id)), remaining = chosen.filter(hit => !reserved.has(hit.chunk.id));
    return [...primary.map(hit => [hit]), ...(remaining.length ? [remaining] : [])];
  });
}
