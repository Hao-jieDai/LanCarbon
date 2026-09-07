import { expect,it } from "vitest";
import { removeResourceReferences, withoutResources } from "../src/shared/removeResourceReferences";
import { createBook } from "../src/shared/books";
const id="a".repeat(64)+".png", url="assets/"+id, ids=new Set([id]);
it("removes direct and reference links and whole figures while retaining prose and literal examples",()=>{
  const source=`Before ![image](${url}) after [file](${url} "Title").\n\n\`![example](${url})\`\n\n\`\`\`markdown\n![example](${url})\n\`\`\`\n\n\`\`\`{figure} ${url}\n:width: 50%\n\nCaption\n\`\`\`\n\n[ref]: ${url}\n![description][ref] [ref][] [ref] [ref](https://example.com)\nKeep`;
  const result=removeResourceReferences(source,ids);
  expect(result).toBe(`Before  after .\n\n\`![example](${url})\`\n\n\`\`\`markdown\n![example](${url})\n\`\`\`\n\n\n [ref](https://example.com)\nKeep`.replace("\n [ref]","\n   [ref]"));
});
it("cleans all notes and Book settings without changing unrelated pages",()=>{
  const {book,homeNote}=createBook("Book");book.settings.logo=url;book.settings.bibliography=[{assetId:id,name:"references.bib",entries:[]}];
  homeNote.content=`![image](${url})`;
  const next=withoutResources({version:2,books:[book],notes:[homeNote]},[id]);
  expect(next.notes[0].content).toBe("");expect(next.books[0].settings.logo).toBeUndefined();
  expect(next.books[0].settings.bibliography).toEqual([]);expect(next.books[0].pages).toEqual(book.pages);
});
