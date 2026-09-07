import {expect,it}from"vitest";
import YAML from "yaml";
import {citationKeys,parseBibTeX,validateBookCitations}from"../src/shared/bibliography";
import {createBook}from"../src/shared/books";
import {buildMystConfig}from"../src/shared/jupyter-book";
import {renderMystPreview}from"../src/preview/mystPreview";
const bib=`@article{Smith2020,
 author = {Smith, Jane and Wang, Wei},
 title = {A {Nested} Climate Study},
 year = {2020},
 journal = {Energy Journal},
 doi = {10.1000/example}
}
@book{Doe2021, author="Doe, John", title="Carbon Systems", date="2021-03", publisher="Example Press"}`;
it("parses BibTeX, validates citation keys and exports the managed bibliography",()=>{
 const entries=parseBibTeX(bib);expect(entries).toHaveLength(2);expect(entries[0]).toMatchObject({key:"Smith2020",title:"A Nested Climate Study",year:"2020",authors:["Smith, Jane","Wang, Wei"]});
 const {book,homeNote}=createBook("Research");const id="a".repeat(64)+".bib";book.settings.bibliography=[{assetId:id,name:"references.bib",entries}];homeNote.content="@Smith2020 and [@Doe2021]. `@ignored`\n```text\n@ignored\n```";
 expect(citationKeys(homeNote.content).map(x=>x.key)).toEqual(["Smith2020","Doe2021"]);expect(validateBookCitations(book,[homeNote])).toEqual([]);
 expect(YAML.parse(buildMystConfig(book)).project.bibliography).toEqual([`./assets/${id}`]);
});
it("renders citations and a reference list and reports missing keys",()=>{
 const entries=parseBibTeX(bib),content="According to @Smith2020, both studies agree [@Smith2020; @Doe2021].";
 const result=renderMystPreview({id:"x",title:"Page",content,bibliography:entries});
 expect(result.warnings).toEqual([]);expect(result.html).toContain("Smith et al. (2020)");expect(result.html).toContain("preview-bibliography");expect(result.html).toContain("A Nested Climate Study");
 expect(renderMystPreview({id:"x",title:"Page",content:"[@Missing]",bibliography:entries}).warnings).toContain("Missing citation: @missing");
});
it("rejects duplicate keys and malformed entries",()=>{expect(()=>parseBibTeX(bib+"\n@misc{smith2020,title={Duplicate}}" )).toThrow(/Duplicate/);expect(()=>parseBibTeX("@article{bad,title={x}")).toThrow(/Unclosed/);});
