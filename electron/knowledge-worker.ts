import { parentPort } from "node:worker_threads";
import { extractEpub } from "./knowledge-epub";
import { extractMarkdown } from "../src/shared/knowledgeText";
parentPort?.on("message", (job: { kind: "markdown" | "epub"; content?: string; bytes?: Uint8Array }) => {
  try {
    const result = job.kind === "markdown" ? extractMarkdown(job.content ?? "") : extractEpub(Buffer.from(job.bytes!), (unit, total) => parentPort!.postMessage({ progress: { unit, total } }));
    parentPort!.postMessage({ result });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "Text extraction failed." }); }
});
