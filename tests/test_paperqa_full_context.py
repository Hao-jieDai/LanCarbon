"""Full versus audited-subset invariants with native PaperQA; no live APIs."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from paperqa_full_context import prepare
from paperqa_evidence import identity


class FullContextTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        environment = patch.dict(os.environ, {'PQA_HOME': temp.name, 'LITELLM_LOCAL_MODEL_COST_MAP': 'True'})
        environment.start()
        self.addCleanup(environment.stop)
        from paperqa import Settings
        from paperqa.types import Doc, Text
        self.settings = Settings(answer={'answer_length': 'about 600 words'})
        self.texts = [Text(name=name, text=body, doc=Doc(docname=source, citation=source, dockey=source))
                      for source, name, body in [
                          ('Clinical', 'page 2', 'Population: enrolled adults. (2019 baseline)'),
                          ('Clinical', 'page 10', 'Exclusion: emergency admissions.'),
                          ('Transit', 'page 2', 'Passengers are distinct from journeys.'),
                      ]]

    async def test_native_request_retains_all_originals_in_parser_order(self):
        from paperqa import Docs
        from lmi import LLMResult
        session, settings = prepare('Compare scope', self.texts, self.settings, flexible_length=True)
        captured = []
        async def call_single(**kwargs):
            captured.extend(kwargs['messages'])
            return LLMResult(model='mock', date='', text='Different scopes.')
        fake = SimpleNamespace(call_single=call_single)
        await Docs().aquery(session, settings=settings, llm_model=fake,
                           summary_llm_model=fake, embedding_model=object())
        self.assertEqual(len(captured), 2)
        prompt = captured[-1].content
        offsets = [prompt.index(t.text) for t in self.texts]
        self.assertEqual(offsets, sorted(offsets))
        for t in self.texts:
            self.assertEqual(prompt.count(t.text), 1)
        self.assertIn('without a fixed word target', prompt)
        self.assertEqual(self.settings.answer.answer_length, 'about 600 words')
        self.assertEqual(len({c.id for c in session.contexts}), 3)

    async def test_subset_scope_and_budget_fail_closed(self):
        session, _ = prepare('Compare scope', self.texts, self.settings,
                             selected_ids=[identity(self.texts[2]), identity(self.texts[0])])
        self.assertEqual([c.text.doc.docname for c in session.contexts], ['Clinical', 'Transit'])
        self.assertNotIn(self.texts[1].text, '\n'.join(c.context for c in session.contexts))
        with self.assertRaises(ValueError):
            prepare('Question', self.texts, self.settings, selected_ids=['unknown'])
        with self.assertRaises(ValueError):
            prepare('Question', self.texts, self.settings, max_characters=10)


if __name__ == '__main__':
    unittest.main()
