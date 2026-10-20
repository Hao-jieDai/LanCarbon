import { randomUUID } from "node:crypto";
import type { AIChat } from "../src/shared/ai";
import { citedLabels, hasChatSources, scopeKey, type ChatGrounding, type CitationTarget } from "../src/shared/grounding";
import { KNOWLEDGE_MAX_SOURCES, selectedKnowledgeSources, type KnowledgeHit, type KnowledgeScope } from "../src/shared/knowledge";
import { validKnowledgeScope } from "./knowledge-sources";
import type { KnowledgeStore } from "./knowledge-store";
import type { RetrievalService } from "./retrieval-service";
import { chooseEvidence, documentQuestions, evidenceKey } from "./chat-evidence";
import { broadQuestion, localResearchPlan, planMessages, readResearchPlan, readReview, reviewMessages, sourceProfiles, type ResearchConsult } from "./chat-plan";
import { arithmeticWarnings } from "./chat-checks";
import { followupEvidenceGroups, localEvidenceGroups, referencedTableShape, tableTransformRequirement } from "./chat-context";
import { bibliography, bibliographyQuestion, comparativeResultCoverage, quantityNotes, quantityQuestion, quantityWarnings, resultCoverage, scenarioWarnings } from "./chat-quality";
import { repairCitedUnits } from "./chat-repair";
import { answerTasks, methodCoverage } from "./chat-answer-plan";
import { scopeCoverage, unitCompanions } from "./chat-completeness";
import { formalEvidenceGroups } from "./chat-formal-evidence";
export { chooseEvidence } from "./chat-evidence";

import { groundingInstructions } from "./chat-policy";

export interface PreparedChat { grounding: ChatGrounding; messages: Array<{ role: string; content: string }> }
export class ChatGrounder {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly knowledge: () => KnowledgeStore, private readonly retrieval: () => RetrievalService, private readonly semanticEnabled: () => Promise<boolean>) {}
  async catalogue() { const { sources, books, folders } = await this.knowledge().inspect(); return { sources, books, folders }; }
  async validate(scope: KnowledgeScope) {
    const valid = validKnowledgeScope(scope), catalogue = await this.catalogue(), ids = selectedKnowledgeSources(catalogue, valid);
    if (ids.size > KNOWLEDGE_MAX_SOURCES) throw Error("The local index supports up to 20,000 sources. Reduce the selection before preparing it.");
    return valid;
  }
  async prepare(chat: AIChat, signal: AbortSignal, progress: (message: string) => void, consult?: ResearchConsult): Promise<PreparedChat> {
    let started = false;
    const work = this.queue.catch(() => undefined).then(async () => {
      started = true; const knowledge = this.knowledge(), retrieval = this.retrieval();
      signal.throwIfAborted(); const scope = await this.validate(chat.sourceScope!);
      if (!hasChatSources(scope)) throw Error("No sources selected. Select sources or use ordinary Chat.");
      const question = chat.messages.filter(message => message.role === "user").at(-1)!.content;
      if (question.length > 1500) throw Error("For document questions, use up to 1,500 characters per message.");
      progress("Reading selected sources…"); await retrieval.stop();
      const view = await knowledge.prepare(scope, signal, progress), ids = [...selectedKnowledgeSources(view, scope)], selected = new Set(ids), warnings: string[] = [];
      const requested = [...scope.noteIds.map(id => `note:${id}`), ...scope.fileIds.map(id => `file:${id}`)];
      const excluded = new Set([...(scope.excludedNoteIds ?? []).map(id => `note:${id}`), ...(scope.excludedFileIds ?? []).map(id => `file:${id}`)]);
      if (requested.some(id => !selected.has(id) && !excluded.has(id))) warnings.push("Some explicitly selected sources are missing or excluded; they were not replaced by other sources.");
      if (scope.bookIds.some(id => !view.books.some(book => book.id === id))) warnings.push("A selected Book is no longer available.");
      if (!ids.length) throw Error("The selected sources are no longer available. Choose sources again; no other documents were searched.");
      const records = new Map(view.records.map(record => [record.sourceId, record])), sources = new Map(view.sources.map(source => [source.id, source]));
      const incomplete = ids.filter(id => records.get(id)?.status !== "ready");
      if (incomplete.length) warnings.push(`${incomplete.length} selected sources are not fully readable; coverage is incomplete.`);
      for (const id of incomplete.slice(0, 20)) warnings.push(`${sources.get(id)!.title}: ${records.get(id)?.message ?? "Text is not ready."}`);
      let corpus = (await knowledge.corpus()).filter(hit => selected.has(hit.source.id));
      if (!corpus.length) throw Error(`No readable text is available. ${warnings.join(" ")} Check the scan quality or retry local OCR in the PDF reader.`);
      if (await this.semanticEnabled()) {
        progress("Preparing selected sources for retrieval…");
        try { await retrieval.build(true, signal, progress, ids); }
        catch (error) { signal.throwIfAborted(); warnings.push(`Vector preparation unavailable: ${error instanceof Error ? error.message : String(error)}`); }
      }
      signal.throwIfAborted(); progress("Finding evidence…");
      const previous = chat.messages.filter(message => message.role === "user" && scopeKey(message.sourceScope) === scopeKey(scope)).slice(-4, -1).map(message => message.content.slice(0, 350));
      const earlierMessage = chat.messages.filter(message => message.role === "assistant" && message.grounding && scopeKey(message.sourceScope) === scopeKey(scope)).at(-1);
      const earlier = earlierMessage?.grounding;
      const savedFocus = earlier?.research?.focusSourceIds;
      const previousFocus = savedFocus?.length ? savedFocus : [...new Set(earlier?.evidence.map(hit => hit.source.id) ?? [])];
      const profiles = sourceProfiles(corpus);
      let plan = localResearchPlan(question, profiles, previous, previousFocus), modelChecks = 0;
      const unresolvedLargeSelection = profiles.length > 24 && !plan.sourceIds.length;
      // Small self-contained sources already fit in context; avoid unnecessary paid planning calls.
      const enhanced = !!consult && (corpus.length > 36 || previous.length > 0);
      const needsPlanning = enhanced && (plan.compare || plan.ambiguous || !plan.sourceIds.length || plan.sourceIds.length > 1);
      if (needsPlanning) {
        progress("Identifying papers and resolving the question…"); modelChecks++;
        try {
          const planned = readResearchPlan(await consult!(planMessages(question, profiles, previous, previousFocus, plan), "plan"), plan, profiles, question);
          if (planned) plan = planned; else warnings.push("Question planning unavailable; local source matching is being used.");
        } catch { signal.throwIfAborted(); warnings.push("Question planning unavailable; local source matching is being used."); }
      }
      const questions = documentQuestions(question), groups: KnowledgeHit[][] = [];
      let mode: ChatGrounding["mode"] = "reranked", followups = 0, searches = 0;
      const searched = new Set<string>();
      const search = async (query: string, sourceIds: string[], extra = false): Promise<KnowledgeHit[]> => {
        signal.throwIfAborted();
        query = query.slice(0, 1500);
        const key = JSON.stringify([query, [...sourceIds].sort()]);
        if (extra && (followups >= 6 || searched.has(key))) return [];
        if (extra) followups++;
        searched.add(key); searches++;
        const result = await retrieval.search(query, sourceIds, 20, signal); warnings.push(...result.warnings);
        if (result.mode === "keyword" || result.mode === "hybrid" && mode === "reranked") mode = result.mode;
        return result.hits;
      };
      for (const [index, item] of questions.entries()) {
        signal.throwIfAborted(); progress(questions.length > 1 ? `Finding evidence ${index + 1} / ${questions.length}…` : "Finding evidence…");
        const query = questions.length === 1 ? plan.question : item;
        const targets = !unresolvedLargeSelection && !plan.compare && plan.sourceIds.length ? plan.sourceIds : ids;
        let hits = await search(query, targets);
        const clauses = item.split(/[?？;；]/u).map(part => part.trim()).filter(Boolean);
        const focused = !hits.length ? clauses[0] : clauses.length > 1 ? clauses.at(-1) : undefined;
        if (focused && focused !== query && followups < 2 && (!hits.length || hits.length < 3 || clauses.length > 1)) {
          const extra = await search(focused, targets, true);
          // Interleave two relevance lists so the subpart does not disappear at the tail.
          const combined = new Map<string, KnowledgeHit>();
          for (let depth = 0; depth < Math.max(hits.length, extra.length); depth++) for (const hit of [hits[depth], extra[depth]]) if (hit && !combined.has(evidenceKey(hit))) combined.set(evidenceKey(hit), hit);
          hits = [...combined.values()];
        }
        groups.push(hits);
      }
      const questionGroups = groups.map(group => [...group]), required = plan.sourceIds.length ? plan.sourceIds : plan.compare ? ids : [];
      // A globally high-ranked paper cannot crowd out a named/comparison paper.
      if (corpus.length > 36) for (const id of required.slice(0, 6)) {
        if (groups.flat().filter(hit => hit.source.id === id).length >= 4 && !plan.compare) continue;
        progress("Checking evidence across relevant sources…");
        const hits = await search(plan.question, [id], true); if (hits.length) groups.push(hits);
      }
      for (const query of plan.queries) { if (followups >= 4) break; const hits = await search(query.query, query.sourceIds, true); if (hits.length) groups.push(hits); }
      corpus = (await knowledge.corpus()).filter(hit => selected.has(hit.source.id));
      const broad = broadQuestion.test(question) || plan.compare;
      const withBibliography = bibliographyQuestion.test(question);
      // Reserve monetary results per relevant source before broad semantic matches consume context.
      // Reuse only original excerpts that still match the current source fingerprint/text.
      const remembered = chat.messages.filter(message => message.role === "assistant" && scopeKey(message.sourceScope) === scopeKey(scope)).slice(-6).reverse().flatMap(message => message.grounding?.evidence ?? []);
      const tasks = answerTasks(question);
      const coverage = tasks.includes("ranking") && !tasks.includes("calculation") ? [] : resultCoverage(corpus, required.length ? required : ids, remembered, question);
      const outcomes = plan.compare ? comparativeResultCoverage(corpus, required.length ? required : ids) : [];
      const methods = methodCoverage(corpus, required.length ? required : ids, tasks, question);
      const formalGroups = await formalEvidenceGroups(corpus, questions, required.length ? required : ids, signal), formal = formalGroups.map(group => group.hits);
      for (const group of formalGroups) questionGroups[group.questionIndex].push(...group.hits);
      const local = await localEvidenceGroups(corpus, questions, !plan.compare && required.length ? required : ids, signal);
      local.forEach((hits, index) => questionGroups[index].push(...hits));
      groups.unshift(...methods, ...local); groups.push(...coverage);
      groups.unshift(...scopeCoverage(corpus, required.length ? required : ids, question, tasks));
      groups.unshift(...unitCompanions(corpus, groups, required.length ? required : ids));
      const evidenceBudget = plan.compare || questions.length >= 3 ? 18_000 : broad ? 14_000 : quantityQuestion.test(question) ? 12_000 : 9_000;
      const evidenceIds = !plan.compare && required.length ? required : ids;
      const followup = plan.lockedFocus && earlierMessage ? followupEvidenceGroups(corpus, earlierMessage, evidenceIds) : [];
      const referencedTable = plan.lockedFocus && earlierMessage ? referencedTableShape(earlierMessage.content) : undefined;
      const selectEvidence = () => chooseEvidence(corpus, [...followup, ...formal, ...outcomes, ...coverage, ...groups], evidenceIds, broad, required, evidenceBudget, withBibliography);
      let evidence = selectEvidence();
      let review: NonNullable<ChatGrounding["research"]>["review"] = "not-needed", supplemented = followups > 0;
      const missingFocus = required.some(id => !evidence.some(hit => hit.source.id === id && !bibliography(hit)));
      // A focused question with usable local coverage does not need two paid checks every turn.
      const needsReview = enhanced && (plan.compare || plan.ambiguous || questions.length >= 3 || missingFocus || evidence.length < 3);
      if (needsReview && evidence.length) {
        progress("Checking evidence coverage…"); modelChecks++;
        try {
          const checked = readReview(await consult!(reviewMessages(plan.question, evidence, required, profiles), "review"), selected);
          if (!checked) review = "unavailable";
          else {
            review = checked.sufficient ? "sufficient" : "limited";
            if (!checked.sufficient) for (const query of checked.queries) {
              progress("Searching for missing evidence…");
              const hits = await search(query.query, query.sourceIds, true);
              if (hits.length) { groups.unshift(hits); supplemented = true; }
            }
            // Never call a second review or silently loop until the model approves itself.
            groups.unshift(...unitCompanions(corpus, groups, evidenceIds));
            // Supplemental overview matches must not displace the requested equation/definition.
            evidence = selectEvidence();
          }
        } catch { signal.throwIfAborted(); review = "unavailable"; }
        if (review === "limited") warnings.push("Evidence coverage has unresolved gaps. Supplementary searches are bounded; an omitted fact is not proof that the paper does not contain it.");
        if (review === "unavailable") warnings.push("Evidence review unavailable; check the excerpts against the question.");
      }
      // Neighbour expansion/review may introduce an incomplete amount that was not in the initial seeds.
      const companions = unitCompanions(corpus, evidence.map(hit => [hit]), evidenceIds);
      if (companions.length) { groups.unshift(...companions); evidence = selectEvidence(); }
      if (!evidence.length) throw Error("No supporting passages were found. Try a specific term from the document, or configure and enable Embedding in AI Settings → Retrieval for cross-language questions.");
      const represented = new Set(evidence.map(hit => hit.source.id)), notRepresented = ids.filter(id => !represented.has(id));
      if (notRepresented.length) warnings.push(`${notRepresented.length} of ${ids.length} selected sources have no excerpt in this answer. The answer does not establish what those sources contain.`);
      const included = new Set(evidence.map(hit => `${hit.source.id}:${hit.chunk.id}`));
      if (corpus.some(hit => !included.has(`${hit.source.id}:${hit.chunk.id}`))) warnings.push("This answer uses selected excerpts; it is not a full-text audit of every page.");
      const questionEvidence = questions.map((text, index) => ({ question: text, citations: evidence.filter(hit => questionGroups[index].some(candidate => evidenceKey(candidate) === evidenceKey(hit))).map(hit => hit.label) }));
      for (const [index, item] of questionEvidence.entries()) if (!item.citations.length) warnings.push(`Question ${index + 1}: no matching ranked passages; check the available context before drawing a conclusion.`);
      const grounding: ChatGrounding = { scope, sourceIds: ids, evidence, warnings: [...new Set(warnings)].slice(0, 90), mode, research: { focusSourceIds: required, searches, modelChecks, supplemented, review } };
      const convertToCny = /(?:换(?:算|成)|折(?:算|合)|统一).{0,35}(?:人民币|CNY|RMB)|(?:convert|express).{0,40}(?:CNY|RMB|yuan)/iu.test(question);
      const emittedUnits = new Set<string>(); let unitCharacters = 0;
      return { grounding, messages: [
        { role: "system", content: groundingInstructions(tasks, referencedTable ? tableTransformRequirement(question, referencedTable.rows) : undefined) },
        { role: "user", content: JSON.stringify({ selectedSources: view.sources.filter(source => represented.has(source.id)).slice(0, 24).map(source => ({ id: source.id, title: source.title })), selectionSummary: { sourcesWithExcerpts: represented.size, excerpts: evidence.length }, missingRelevantSources: required.filter(id => !represented.has(id)).slice(0, 12).map(id => ({ id, title: sources.get(id)!.title })), questionEvidence, evidence: evidence.map(hit => {
          // Incidental amounts need the same arithmetic aids as explicitly requested totals.
          // Original context is already supplied verbatim, so do not duplicate it in these aids.
          const units = quantityNotes(hit, false, convertToCny).filter(note => {
            const key = hit.source.id + ":" + note.replace(/\s+/gu, " ");
            // Arithmetic aids are deduplicated and bounded separately from original evidence.
            if (emittedUnits.has(key) || unitCharacters + note.length > 6000) return false;
            emittedUnits.add(key); unitCharacters += note.length; return true;
          });
          return { citation: hit.label, source: hit.source.title, sourceId: hit.source.id, anchor: hit.chunk.anchor, text: hit.chunk.text, ...(units.length ? { unitEquivalents: units } : {}) };
        }) }) },
        { role: "user", content: JSON.stringify({ dialogueContext: { recentUserQuestions: previous, currentFocus: required.slice(0, 24).map(id => ({ id, title: sources.get(id)?.title })), ...(referencedTable ? { referencedTable } : {}) }, latestQuestion: question, resolvedRetrievalQuestion: plan.question, tasks }) }
      ] };
    });
    this.queue = work.catch(() => undefined); progress("Preparing document question…");
    // Cancellation while queued returns immediately; the queued task will see its aborted signal before running.
    return new Promise((resolve, reject) => { const abort = () => { if (!started) reject(Error("Document question stopped.")); }; signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort)); });
  }
  async finish(grounding: ChatGrounding, text: string) {
    const repaired = repairCitedUnits(text, grounding.evidence); text = repaired.text;
    grounding.warnings.push(...repaired.corrections);
    grounding.warnings.push(...arithmeticWarnings(text));
    grounding.warnings.push(...quantityWarnings(text, grounding.evidence));
    grounding.warnings.push(...scenarioWarnings(text, grounding.evidence));
    try {
      const current = new Map((await this.catalogue()).sources.map(source => [source.id, source]));
      if (grounding.evidence.some(hit => current.get(hit.source.id)?.fingerprint !== hit.fingerprint || current.get(hit.source.id)?.unavailable)) grounding.warnings.push("A cited source changed or became unavailable while this answer was generated. Saved excerpts are retained; ask again using the current documents.");
    } catch { grounding.warnings.push("The source status could not be rechecked. Verify the saved excerpts."); }
    const labels = citedLabels(text), known = new Set(grounding.evidence.map(hit => hit.label));
    if ([...labels].some(label => !known.has(label))) grounding.warnings.push("The reply contains an unrecognized citation. Only the saved evidence entries below can be opened.");
    if (![...labels].some(label => known.has(label))) grounding.warnings.push("The model did not supply valid inline citations. Check the retrieved evidence before relying on this answer.");
    grounding.warnings = [...new Set(grounding.warnings)].slice(0, 100);
    return text;
  }
  async open(chat: AIChat, messageId: string, label: string): Promise<CitationTarget> {
    const hit = chat.messages.find(message => message.id === messageId)?.grounding?.evidence.find(hit => hit.label === label);
    if (!hit) throw Error("This citation is not part of the saved evidence.");
    const source = (await this.catalogue()).sources.find(source => source.id === hit.source.id);
    if (!source || source.unavailable) throw Error("The original source is unavailable. The quoted excerpt remains in this chat.");
    if (source.fingerprint !== hit.fingerprint) throw Error("This source has changed since the answer was generated. The saved excerpt is still available; ask again to cite the latest version.");
    return { source, anchor: hit.chunk.anchor, excerpt: hit.chunk.text, requestId: randomUUID() };
  }
}
