// @vitest-environment node
import { createRequire } from "node:module";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { prepare, applySelection } = require("../scripts/rag-context-select.cjs");
const e = (citation:string, sourceId:string, text:string, page=1) => ({citation, sourceId, text, fingerprint:sourceId+"v1", valid:true, anchor:{kind:"pdf",page}});
const make = () => [{role:"system",content:"Original"},{role:"user",content:JSON.stringify({selectedSources:[{id:"trial"},{id:"transport"}],questionEvidence:[{question:"Compare treatment and transport costs",citations:["S1","S2","S3"]}],evidence:[e("S1","trial","Table 2. Treatment costs (USD million)."),e("S2","transport","Unrelated introduction"),e("S3","trial","Control 20; treatment 12. Excludes staffing."),e("S4","trial","Other scenario",2)]})},{role:"user",content:JSON.stringify({latestQuestion:"Compare treatment and transport costs",dialogueContext:{recentUserQuestions:["Earlier"]}})}];
const raw = JSON.stringify({questions:[{index:0,citations:["S1"]}]});
it("preserves originals, citation identity, table context and all non-context messages",()=>{
 const m=make(),p=prepare(m),saved=structuredClone(m),r=applySelection(m,p,raw);
 expect(m).toEqual(saved);expect(r.selectedLabels).toEqual(["S1","S3"]);expect(r.dependentLabels).toEqual(["S3"]);
 const c=JSON.parse(r.messages[1].content);expect(c.evidence).toEqual(JSON.parse(m[1].content).evidence.filter((x:any)=>["S1","S3"].includes(x.citation)));
 expect(r.messages[0]).toEqual(m[0]);expect(r.messages[2]).toEqual(m[2]);expect(c.selectedSources).toEqual(JSON.parse(m[1].content).selectedSources);
 expect(c.questionEvidence[0].citations).toEqual(["S1"]);
});
it("rejects invented labels, missing subquestions, duplicates and generated facts",()=>{
 const m=make(),p=prepare(m);
 for(const s of [{questions:[]},{questions:[{index:0,citations:["S99"]}]},{questions:[{index:0,citations:["S1","S1"]}]},{questions:[{index:0,citations:["S1"],answer:"Costs fall"}]},{questions:[{index:1,citations:["S1"]}]}])expect(()=>applySelection(m,p,JSON.stringify(s))).toThrow();
});
it("rejects stale, uncertain and mixed-version evidence",()=>{
 for(const change of [{needsReview:true},{valid:false},{fingerprint:""}]){const m=make(),c=JSON.parse(m[1].content);Object.assign(c.evidence[0],change);m[1].content=JSON.stringify(c);expect(()=>prepare(m)).toThrow();}
 const m=make(),p=prepare(m);m[0].content="Changed";expect(()=>applySelection(m,p,raw)).toThrow();
});
it("does not add same-page text from another source or a different page",()=>{
 const m=make(),r=applySelection(m,prepare(m),raw);expect(r.selectedLabels).not.toContain("S2");expect(r.selectedLabels).not.toContain("S4");
});
it("retains explicit empty question evidence without fabricating an answer",()=>{
 const m=make(),c=JSON.parse(m[1].content);c.questionEvidence.push({question:"Unknown detail",citations:[]});m[1].content=JSON.stringify(c);
 const r=applySelection(m,prepare(m),JSON.stringify({questions:[{index:0,citations:["S3"]},{index:1,citations:[]}]}));
 expect(JSON.parse(r.messages[1].content).questionEvidence[1].citations).toEqual([]);
});
it("validates internal provenance without adding it to the original model payload",()=>{
 const m=make(),c=JSON.parse(m[1].content),proof=structuredClone(c.evidence);
 for(const e of c.evidence){delete e.valid;delete e.fingerprint;}m[1].content=JSON.stringify(c);
 expect(()=>prepare(m)).toThrow();const p=prepare(m,proof),r=applySelection(m,p,raw);
 expect(JSON.parse(r.messages[1].content).evidence[0]).toEqual(c.evidence[0]);
 proof[0].text="Changed";expect(()=>prepare(m,proof)).toThrow();
});
