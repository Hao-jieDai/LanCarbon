"""Generic source/ranking/provenance regressions; no papers or live calls."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('paperqa_evidence', Path(__file__).parents[1]/'scripts/paperqa_evidence.py')
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

def text(source, name, body):
    return SimpleNamespace(doc=SimpleNamespace(dockey=source), name=name, text=body)

class PlanTests(unittest.TestCase):
    def test_composite_question_is_retained_without_model_paraphrase(self):
        question='比较临床定义，并计算两个交通情景的差额。'
        tasks=m.parse_tasks(json.dumps({'questions':[{'query':'definitions','sources':['S1','S2']}]}),question,['S1','S2'])
        self.assertEqual([t.query for t in tasks[-2:]],[question,question])

    def test_bad_scope_and_missing_source_are_rejected(self):
        for chosen in [['S3'],['S1'],['S1','S1'],[]]:
            with self.subTest(chosen=chosen),self.assertRaises(ValueError):
                m.parse_tasks(json.dumps({'questions':[{'query':'evidence','sources':chosen}]}),'question',['S1','S2'])

    def test_nonfinite_and_duplicate_ranks_rejected(self):
        for rows in [[{'index':0,'relevance_score':float('nan')}],
                     [{'index':True,'relevance_score':1}],
                     [{'index':0,'relevance_score':1},{'index':0,'relevance_score':0}]]:
            with self.subTest(rows=rows),self.assertRaises(ValueError):m.validate_ranks({'results':rows},len(rows))

    def test_identical_openings_different_sources_and_tails_have_distinct_ids(self):
        a=text('A','1','opening '*100+'first result')
        b=text('A','1','opening '*100+'second result')
        c=text('B','1',a.text)
        self.assertEqual(len({m.citation_id(t) for t in [a,b,c]}),3)

class EvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def scenario(self, domain, *, limit=2):
        first=text('A','page 1',domain+' general background (2019 baseline).')
        method=text('A','page 2',domain+' exact counterfactual and population (2019 baseline).')
        other=text('B','page 4',domain+' alternative population and reference case.')
        calls=[]
        async def retrieve(task,k):return [first,method] if task.source=='A' else [other]
        async def rerank(query,documents):
            calls.append((query,documents))
            return {'results':[{'index':i,'relevance_score':i+1} for i in range(len(documents))]}
        result=await m.gather([m.Task('a','What is the reference case?','A'),m.Task('b','Who is covered?','B')],
            {'A':{m.identity(first),m.identity(method)},'B':{m.identity(other)}},retrieve,rerank,max_sources=limit)
        return result,calls,method,other

    async def test_reranking_and_source_reservation_across_domains(self):
        for domain in ['clinical trial','rail transport']:
            with self.subTest(domain=domain):
                result,calls,method,other=await self.scenario(domain)
                self.assertEqual(result.texts,[method,other])
                self.assertIn('(2019 baseline)',result.texts[0].text)
                self.assertEqual(len(calls),2)
                self.assertTrue(all(row['retained'] for row in result.audit))

    async def test_insufficient_budget_is_not_silent_source_loss(self):
        with self.assertRaisesRegex(ValueError,'cannot cover'):
            await self.scenario('education',limit=1)

    async def test_scope_violation_fails_before_reranking(self):
        item=text('OTHER','page 1','Private information outside selected source')
        async def retrieve(task,k):return [item]
        async def rerank(*args):self.fail('Escaped evidence reached reranker')
        with self.assertRaisesRegex(ValueError,'escaped'):
            await m.gather([m.Task('a','q','A')],{'A':set()},retrieve,rerank)

    async def test_dedup_preserves_all_subquestion_associations(self):
        item=text('A','p1','One original excerpt answers two questions.')
        async def retrieve(task,k):return [item,item]
        async def rerank(q,texts):
            self.assertEqual(texts,[item.text])
            return {'results':[{'index':0,'relevance_score':0.3}]}
        result=await m.gather([m.Task('a','how','A'),m.Task('b','why','A')],{'A':{m.identity(item)}},retrieve,rerank)
        self.assertEqual(len(result.texts),1)
        self.assertEqual(result.questions[m.identity(item)],['how','why'])

    async def test_native_paperqa_receives_originals_and_distinct_citations(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        environment = patch.dict(os.environ, {'PQA_HOME':temporary.name,'LITELLM_LOCAL_MODEL_COST_MAP':'True'})
        environment.start()
        self.addCleanup(environment.stop)
        try:
            from paperqa import Docs, Settings
            from paperqa.types import Doc, Text
            from lmi import LLMResult
        except ImportError:
            self.skipTest('Run with the pinned PaperQA environment for native integration')
        texts=[Text(name='page 1',text='Shared opening. Transport baseline (2019 prices).',
                    doc=Doc(docname=name,dockey=name,citation=name)) for name in ['A','B']]
        evidence=m.Evidence(texts,{m.identity(t):['Compare the baselines'] for t in texts},[])
        session=m.native_session('Compare the baselines',evidence)
        captured=[]
        async def call_single(**kwargs):
            captured.extend(kwargs['messages'])
            return LLMResult(model='mock',date='',text='Both baselines (2019 prices). ('+', '.join(c.id for c in session.contexts)+')')
        fake=SimpleNamespace(call_single=call_single)
        settings=Settings(answer={'get_evidence_if_no_contexts':False,'answer_max_sources':2,'group_contexts_by_question':True})
        result=await Docs().aquery(session,settings=settings,llm_model=fake,summary_llm_model=fake,embedding_model=object())
        prompt=captured[-1].content
        self.assertEqual(prompt.count(texts[0].text),2)
        self.assertEqual(len({c.id for c in result.contexts}),2)
        self.assertIn('(2019 prices)',result.answer)
        self.assertIn('A',result.references)
        self.assertIn('B',result.references)

    async def test_native_retrieval_stays_inside_selected_document(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        environment = patch.dict(os.environ, {'PQA_HOME':temporary.name,'LITELLM_LOCAL_MODEL_COST_MAP':'True'})
        environment.start()
        self.addCleanup(environment.stop)
        try:
            from paperqa import Docs, Settings
            from paperqa.types import Doc, Text
        except ImportError:
            self.skipTest('Pinned PaperQA environment required')
        a=Doc(docname='Clinical',dockey='A',citation='Clinical study')
        b=Doc(docname='Transit',dockey='B',citation='Transit study')
        all_texts=[Text(name='p1',text='Clinical definitions',doc=a,embedding=[1.,0.]),
                   Text(name='p1',text='Transit definitions',doc=b,embedding=[1.,0.])]
        selected=[t for t in all_texts if t.doc.dockey=='A']
        docs=Docs(docs={'A':a},texts=selected)
        await docs.texts_index.add_texts_and_embeddings(selected)
        async def embed_documents(texts):return [[1.,0.] for _ in texts]
        fake=SimpleNamespace(set_mode=lambda mode:None,embed_documents=embed_documents)
        matches=await docs.retrieve_texts('definitions',12,Settings(),embedding_model=fake)
        self.assertEqual([t.doc.dockey for t in matches],['A'])

if __name__=='__main__':unittest.main()
