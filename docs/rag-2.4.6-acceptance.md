# RAG corrections and chat PDF export

This is a working patch, not a GitHub Release. No new provider, automatic model choice, OCR or paid acceptance run is included.

## Retrieval and answer checks

- Monetary questions reserve bounded result passages per relevant source before broad ranked matches consume context. Fresh original excerpts from recent same-scope rounds may contribute; assistant claims never become evidence. Changed, deleted and unselected passages are rejected.
- Dense bibliographies are omitted from factual evidence; explicit reference-list questions can include them. No arbitrary last-page overview is added.
- Original amounts can be accompanied by deterministic unit equivalents and verbatim context. The answer instructions require scenario, currency, price year, discount basis and ownership-stage qualifiers where supplied. Model estimates must not be described as observational causal identification, nor independent estimates as mathematical subsets without evidence.
- Local checks flag exact cited same-currency scale conflicts and explicit scenario-level contradictions tied to a matching amount. They do not silently replace factual claims. These checks are conservative, incomplete and can need human interpretation; they are not a general fact checker.
- Resolved focused questions with usable coverage skip paid planning/review. Complex comparisons retain bounded checks. Evidence budgets depend on question complexity (9k–18k estimated tokens), separate from real billed token counts. Checks still use the selected Chat model and existing retrieval configuration, at most two additional Chat calls and six supplementary searches. Actual fees depend on evidence and generated Thinking; no fixed savings or accuracy guarantee is made.

Offline replay uses the saved 13-round five-paper test and its 282 cached original passages. It checks that the missing refinery totals can enter the evidence and that the three observed billion-to-yi errors are flagged. This is not a fresh DeepSeek answer or academic acceptance.

Suggested limited live acceptance, using the existing five selected papers and the same DS+BGE setup:

1. Ask whether the five papers' loss amounts can be compared or added after currency conversion. Check that the refinery totals are actually reported before comparability is discussed; verify the investor paper's Medium realignment instead of Severe. Shared objects do not prove one independent estimate contains another estimate mathematically.
2. Ask for the top ten refinery losses under MIX. It should not fabricate unread supplementary results; if it supplies national/provincial figures, verify 339.0 billion CNY = 3390 亿元, 133.91 billion = 1339.1 亿元 and 127.13 billion = 1271.3 亿元.
3. Only if needed, follow up on the shared NPV definition behind early retirement versus low utilization. No need to rerun all thirteen rounds immediately.

## Chat PDF

Use **Workshop → Chat → Export PDF** next to the conversation title. The dialog defaults to **Include Thinking** checked and **Include cited evidence excerpts** unchecked. Only saved content is used; no API request or fee is generated. The default save directory is the root **PDFs** folder.

Verify a multi-model/multi-round chat with repeated [S1] labels: messages remain chronological, each model name is retained, and each PDF citation points to its own reply's source/location. Long Thinking is fully expanded and paginated, independently of the screen's collapsed state. Formulae, Chinese text, tables and long code lines remain readable. Stopped/error messages retain partial status. Excerpts are optional; source locations remain included without them. An empty/live chat is refused. Cancel or rendering failure preserves an existing destination file and closes the hidden print window. Printing rejects remote resource requests.

Automated checks use temporary workspaces and mock network calls. Validate extracted PDF text, distinct internal citation destinations, page rendering, upgrade preservation of personal Notes/Books/Library/Chat/Usage/configuration, and final installed payload equality. ReadMe and evergreen tutorial instructions are synchronized. Retain three rollback installers after validation.
