# Enhanced document questions

This update uses the selected Chat model for question planning and an evidence coverage check. It does not introduce another model, API provider, web search or OCR.

## Limits and billing

- At most two extra Chat completions per complex question: planning (1,400 output-token limit) and coverage review (1,800). Both use the selected connection/model, normal usage tracking and cancellation. No automatic retry of these checks. Final answer generation retains its existing behavior and retry rules.
- At most six supplementary retrieval searches in addition to the question's initial searches (at most sixteen subquestions). Embedding/Rerank retain their current settings and billing. A supplementary search is not an extra final-answer generation.
- Final evidence is limited to 96 excerpts and an approximate 22,000-token context budget. The reviewer receives at most approximately 6,500 excerpt tokens. These are local estimates, not exact billed token counts or a currency spending cap.
- Source selection, titles and excerpts are untrusted input. Searches can only access selected sources; model-generated IDs are checked. Planning failure uses local matching; review failure is disclosed. Earlier assistant claims are never used as evidence.
- A review that finds gaps remains marked limited after supplementary search; there is no unbounded review loop or claim of automatic academic approval.

## User acceptance

Create a new chat using the same five papers and DS + BGE settings. Keep the source selection unchanged through the conversation.

1. Ask naturally how the papers' definitions and measured losses differ. Every relevant paper should have supporting evidence. Check that facility investment losses, investor wealth and macroeconomic effects are not conflated.
2. Discuss refinery technologies, then explicitly switch to another named author and ask about economy-wide benefits. Open its citations and check that they lead to that paper, rather than the preceding refinery discussion.
3. Ask a short follow-up such as “那么产油国不加码政策就能避免损失吗？” Check the continued referent and evidence.
4. Ask for the investor paper's global total after discussing other papers. If the initial search misses it, check whether supplementary searches locate the relevant passage. An unresolved gap must be described as an excerpt limitation, not proof the original omits the value.
5. Ask to compare amounts and calculate a difference. Confirm operands, units and the numeric result in the original. Explicit incorrect equations should show a calculation warning; this local check does not validate every natural-language calculation.
6. Open citations, including any full-width or grouped citations. Restart and confirm that saved evidence remains navigable. Stop during checking and confirm no final-answer request starts after cancellation.

Inspect **Evidence** for represented sources, search counts, supplementary searches and limitations. **Usage** includes planning, review and the final answer as separate Chat requests. No changes to saved keys or retrieval model settings are required.

Automated tests use mocked model responses and synthetic sources. Offline replay can check retrieval coverage and citation/calculation handling with saved papers, but cannot establish the scientific accuracy of a fresh paid model answer. Academic acceptance remains a real conversation against the original papers.

## Verification recorded on 2026-10-18

- Production build and type checks passed; 407 tests in 59 test files passed.
- UI regression covered Chat configuration, usage, PDF/EPUB/Note/Book evidence navigation, scope persistence, source trees, cancellation, tutorial upgrade and preview safety. The final packaged executable also passed the enhanced-question/citation/usage scenario using a mock API.
- Offline replay used 282 cached passages from the five selected papers, without API calls. Component checks recovered the previously omitted paper and global-total passage, recognized grouped/full-width citations and flagged the incorrect subtraction. This is not a new academic-model acceptance result.
- Both the isolated upgrade and installation at `D:\LanCarbon` were launched and verified. Installed `app.asar` matched the final build. Personal writing and original files were preserved; Chat, Usage, model/pricing/retrieval/translation configurations were verified against the backup. Runtime logs and window geometry are excluded from byte comparisons; isolated directory settings are checked after path rebasing.
- Backup: `backups/pre-install-2.4.5-2026-10-18` (4,568 verified files, including the prior installer). Rollback installers retained: 2.4.5, 2.4.4 and 2.4.3.
- Installer: `LanCarbon-2.4.5-x64-Setup.exe`, 165,399,905 bytes.
- SHA-256: `20CE580C27C1D3B31D8ABF29D7A72982A7EA4F68AF6EFC1FBD3D65F4A3797F8B`.
