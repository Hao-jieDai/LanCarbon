import type { ChatEvidence } from "../src/shared/grounding";
import { ANSWER_REVIEW_POLICY } from "./chat-policy";
import { documentQuestions } from "./chat-evidence";
import { referencedTableShape } from "./chat-context";

const parts = (question: string) => documentQuestions(question).map((text, index) => ({ id: `Q${index + 1}`, text }));
const readable = (text: string) => text.replace(/ﬁ/gu, "fi").replace(/ﬂ/gu, "fl").replace(/\s+/gu, "").trim();

/** Originals stay unchanged; draft and previous table labels are never evidence. */
export function answerReviewMessages(messages: Array<{ role: string; content: string }>, draft: string) {
  if (messages.filter(message => message.role === "system").length !== 1 || messages[0]?.role !== "system" || messages.at(-1)?.role !== "user") throw Error("Invalid source review context");
  const request = JSON.parse(messages.at(-1)!.content);
  if (typeof request.latestQuestion !== "string") throw Error("Missing current source question");
  const table = referencedTableShape(draft);
  return messages.map((message, index) => index === 0 ? { ...message, content: message.content + "\n\n" + ANSWER_REVIEW_POLICY } : index === messages.length - 1 ? { ...message, content: JSON.stringify({ ...request, operation: "verify-and-finalize", questionParts: parts(request.latestQuestion), ...(table ? { draftLayout: { tableDataRows: table.rows.length } } : {}), proposedDraft: draft }) } : message);
}

/** Verify protocol, scope and verbatim quotes, not the model's scientific judgment. */
export function readAnswerReview(text: string, question: string, evidence: ChatEvidence[]): string {
  const fail = () => { throw Error("The source check did not return a complete answer with verifiable original quotations. Its draft is retained; retry the reply."); };
  let value: any;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")); } catch { return fail(); }
  const requested = new Set(parts(question).map(part => part.id)), covered = new Set<string>();
  if (!value || typeof value.answer !== "string" || !value.answer.trim() || value.answer.length > 100_000 || !Array.isArray(value.checks) || value.checks.length !== requested.size) return fail();
  const original = new Map(evidence.map(hit => [hit.label, readable(hit.chunk.text)])); let quotations = 0;
  for (const check of value.checks) {
    if (!check || !requested.has(check.part) || covered.has(check.part) || typeof check.finding !== "string" || !check.finding.trim() || check.finding.length > 1500 || !["supported", "limited"].includes(check.status) || !Array.isArray(check.quotes) || check.quotes.length > 8 || check.status === "supported" && !check.quotes.length) return fail();
    for (const quote of check.quotes) {
      if (!quote || typeof quote.citation !== "string" || typeof quote.text !== "string" || (readable(quote.text).length < 12 && readable(quote.text) !== original.get(quote.citation)) || quote.text.length > 1200 || !original.get(quote.citation)?.includes(readable(quote.text))) return fail();
      quotations++;
    }
    covered.add(check.part);
  }
  if (!quotations || [...requested].some(part => !covered.has(part))) return fail();
  return value.answer.trim();
}
