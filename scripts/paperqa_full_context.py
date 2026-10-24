"""Bounded original-text comparison helper; experimental, no app/network hooks."""
from __future__ import annotations

from paperqa_evidence import Evidence, identity, native_session


def prepare(question, texts, settings, *, selected_ids=None, flexible_length=False,
            max_characters=500_000):
    """Keep index reading order; fail rather than truncate a full-text condition.

    The caller must scope texts to the user's selected sources. selected_ids is
    an audited subset for a controlled comparison, never a generated summary.
    Full text means every parsed chunk supplied here, not visual PDF coverage.
    """
    texts = list(texts)
    ids = [identity(t) for t in texts]
    if not question.strip() or not texts or len(ids) != len(set(ids)):
        raise ValueError('Empty input or duplicate source chunk identity')
    if selected_ids is not None:
        requested = list(selected_ids)
        if not requested or len(requested) != len(set(requested)) or not set(requested) <= set(ids):
            raise ValueError('Unknown, empty or duplicate selection')
        selected = set(requested)
        texts = [t for t in texts if identity(t) in selected]
    if any(not t.text.strip() for t in texts):
        raise ValueError('Empty original chunk')
    if sum(len(t.text) for t in texts) > max_characters:
        raise ValueError('Full evidence exceeds experiment limit; no silent truncation')
    evidence = Evidence(texts, {identity(t): [question] for t in texts}, [])
    session = native_session(question, evidence)
    # Native serializer sorts by score then lexicographic page name. Preserve
    # the parser's sequence, including page 2 before page 10, in both conditions.
    for i, context in enumerate(session.contexts):
        context.score = 5 - i / (len(texts) + 1)
    configured = settings.model_copy(deep=True)
    configured.answer.answer_max_sources = len(texts)
    configured.answer.evidence_relevance_score_cutoff = 0
    configured.answer.get_evidence_if_no_contexts = False
    configured.answer.group_contexts_by_question = False
    configured.answer.evidence_skip_summary = True
    configured.answer.skip_evidence_citation_strip = True
    if flexible_length:
        configured.answer.answer_length = (
            'enough detail to answer every part of the question, without a fixed '
            'word target or unnecessary repetition, in the language of the question'
        )
    # No pre-answer generation or rewrite may slip into a one-answer comparison.
    if configured.prompts.pre is not None:
        raise ValueError('Unexpected additional generation prompt')
    return session, configured
