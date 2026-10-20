import { ANSWER_REVIEW_POLICY } from "./chat-policy";

/** The draft is a proposed answer, never factual evidence. Reuse the same
 * originals, scope, task contract and current model identity without adding
 * prior assistant answers or a second system message. */
export function answerReviewMessages(messages: Array<{ role: string; content: string }>, draft: string) {
  if (messages[0]?.role !== "system" || messages.at(-1)?.role !== "user") throw Error("Invalid source review context");
  const request = JSON.parse(messages.at(-1)!.content);
  if (typeof request.latestQuestion !== "string") throw Error("Missing current source question");
  return messages.map((message, index) => index === 0 ? { ...message, content: message.content + "\n\n" + ANSWER_REVIEW_POLICY } : index === messages.length - 1 ? { ...message, content: JSON.stringify({ ...request, operation: "verify-and-finalize", proposedDraft: draft }) } : message);
}
