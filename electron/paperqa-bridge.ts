import { spawn } from "node:child_process";
import type { ChatEvidence } from "../src/shared/grounding";
import { citationLocation } from "../src/shared/grounding";

export interface PaperQAPrompt { messages: Array<{ role: string; content: string }>; labels: string[]; engine: "paperqa"; version: string }
export type PaperQACompiler = (question: string, evidence: ChatEvidence[], signal: AbortSignal) => Promise<PaperQAPrompt>;

/** No API keys enter this child. Its Python adapter also denies network access. */
export function paperQACompiler(python: string, script: string): PaperQACompiler {
  return (question, evidence, signal) => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const env: NodeJS.ProcessEnv = { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", LITELLM_LOCAL_MODEL_COST_MAP: "True" };
    for (const name of ["SystemRoot", "WINDIR", "PATH", "Path", "TEMP", "TMP"]) if (process.env[name]) env[name] = process.env[name];
    const child = spawn(python, ["-I", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
    let output = "", bytes = 0, failure: Error | undefined;
    const fail = (message: string) => { failure ??= Error(message); child.kill(); };
    const abort = () => fail("Document question stopped.");
    const timer = setTimeout(() => fail("PaperQA preparation timed out. No model request was sent."), 60_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (part: string) => { bytes += Buffer.byteLength(part); if (bytes > 4_000_000) fail("Select fewer sources: full-text request is too large."); else output += part; });
    child.stderr.resume(); // Never expose document data from dependency diagnostics.
    child.on("error", () => { failure = Error("PaperQA runtime is unavailable. Run the development setup before trying again."); });
    child.stdin.on("error", () => { failure ??= Error("PaperQA could not read the selected sources."); });
    child.on("close", code => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (failure || code !== 0) { reject(failure ?? Error("PaperQA could not prepare the request. Check the runtime and source limits; no model request was sent.")); return; }
      try {
        const result = JSON.parse(output) as PaperQAPrompt;
        if (result.engine !== "paperqa" || result.version !== "2026.8.12" || JSON.stringify(result.labels) !== JSON.stringify(evidence.map(hit => hit.label)) || !Array.isArray(result.messages) || result.messages.length !== 2 || result.messages[0].role !== "system" || result.messages[1].role !== "user" || result.messages.some(m => typeof m.content !== "string") || evidence.some(hit => !result.messages[1].content.includes(hit.chunk.text.trim()))) throw Error();
        resolve(result);
      } catch { reject(Error("PaperQA returned an invalid or incomplete source context. No model request was sent.")); }
    });
    child.stdin.end(JSON.stringify({ question, passages: evidence.map(hit => ({ label: hit.label, sourceId: hit.source.id, fingerprint: hit.fingerprint, title: hit.source.title, location: citationLocation(hit), text: hit.chunk.text })) }));
  });
}
