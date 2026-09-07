import type { BibliographyEntry, BibliographySource, Book,Note } from "./types";
import { ASSET_ID } from "./assets";
const MAX_BIB_BYTES=5*1024*1024,MAX_ENTRIES=10_000;
export {MAX_BIB_BYTES};
function unwrap(value:string){let v=value.trim();if((v.startsWith("{")&&v.endsWith("}"))||(v.startsWith('"')&&v.endsWith('"')))v=v.slice(1,-1);return v.replace(/\s+/g," ").replace(/[{}]/g,"").trim();}
export function parseBibTeX(source:string):BibliographyEntry[]{
  if(!source.trim())throw new Error("The BibTeX file is empty");
  const entries:BibliographyEntry[]=[];let at=0;
  while((at=source.indexOf("@",at))>=0){const header=/@([A-Za-z]+)\s*([({])\s*/y;header.lastIndex=at;const found=header.exec(source);if(!found){at++;continue;}const close=found[2]==="{"?"}":")";let depth=1,quoted=false,escaped=false,end=header.lastIndex;
    for(;end<source.length;end++){const c=source[end];if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}if(c==='"')quoted=!quoted;if(!quoted){if(c===found[2])depth++;else if(c===close&&!--depth)break;}}
    if(depth)throw new Error(`Unclosed BibTeX entry near character ${at+1}`);
    const body=source.slice(header.lastIndex,end),comma=body.indexOf(",");if(comma<1){at=end+1;continue;}const type=found[1].toLowerCase();if(["comment","preamble","string"].includes(type)){at=end+1;continue;}
    const key=body.slice(0,comma).trim();if(!/^[A-Za-z0-9_.:+/-]{1,200}$/.test(key))throw new Error(`Invalid citation key: ${key||"(empty)"}`);
    const fields:Record<string,string>={};let pos=comma+1;
    while(pos<body.length){while(/[\s,]/.test(body[pos]??""))pos++;const name=/^[A-Za-z][\w-]*/.exec(body.slice(pos));if(!name)break;pos+=name[0].length;while(/\s/.test(body[pos]??""))pos++;if(body[pos++]!== '=')throw new Error(`Invalid field in ${key}`);while(/\s/.test(body[pos]??""))pos++;const start=pos;let braces=0,q=false,esc=false;
      for(;pos<body.length;pos++){const c=body[pos];if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}if(c==='"'&&!braces)q=!q;if(!q){if(c==="{")braces++;else if(c==="}")braces--;else if(c===","&&!braces)break;}}
      fields[name[0].toLowerCase()]=unwrap(body.slice(start,pos));
    }
    entries.push({key,type,title:fields.title||"Untitled reference",authors:(fields.author||fields.editor||"").split(/\s+and\s+/i).map(unwrap).filter(Boolean),year:fields.year||fields.date?.slice(0,4)||"n.d.",container:fields.journal||fields.booktitle||fields.publisher,doi:fields.doi});if(entries.length>MAX_ENTRIES)throw new Error(`A bibliography may contain at most ${MAX_ENTRIES} entries`);at=end+1;
  }
  if(!entries.length)throw new Error("No BibTeX entries were found");const seen=new Set<string>();for(const entry of entries){const key=entry.key.toLowerCase();if(seen.has(key))throw new Error(`Duplicate citation key: ${entry.key}`);seen.add(key);}return entries;
}
export function bibliographyEntries(book?:Book){return (book?.settings.bibliography??[]).flatMap(source=>source.entries);}
export function validateBibliographies(value:unknown):value is BibliographySource[]{return value===undefined||Array.isArray(value)&&value.length<=20&&value.every(source=>source&&typeof source==="object"&&ASSET_ID.test(source.assetId)&&typeof source.name==="string"&&source.name.length<=200&&Array.isArray(source.entries)&&source.entries.length<=MAX_ENTRIES&&source.entries.every((entry:BibliographyEntry)=>typeof entry.key==="string"&&/^[A-Za-z0-9_.:+/-]{1,200}$/.test(entry.key)&&typeof entry.type==="string"&&entry.type.length<=50&&typeof entry.title==="string"&&entry.title.length<=2000&&Array.isArray(entry.authors)&&entry.authors.length<=100&&entry.authors.every(a=>typeof a==="string"&&a.length<=500)&&typeof entry.year==="string"&&entry.year.length<=50&&(entry.container===undefined||typeof entry.container==="string"&&entry.container.length<=2000)&&(entry.doi===undefined||typeof entry.doi==="string"&&entry.doi.length<=500)));}
export function citationText(entry:BibliographyEntry,narrative=false){const value=entry.authors[0]??"",first=(value.includes(",")?value.split(",")[0]:value.split(/\s+/).at(-1))||entry.title;const author=entry.authors.length>1?`${first} et al.`:first;return narrative?`${author} (${entry.year})`:`${author}, ${entry.year}`;}
export function citationKeys(source:string):Array<{key:string;line:number}>{const result:Array<{key:string;line:number}>=[];let fence="";source.split("\n").forEach((line,index)=>{const marker=/^\s*(`{3,}|~{3,})/.exec(line);if(fence){if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence="";return;}if(marker){fence=marker[1];return;}const clean=line.replace(/`[^`]*`/g,"");for(const match of clean.matchAll(/(^|[\s[(;,{])@([A-Za-z0-9_.:+/-]{1,200})\b/g))result.push({key:match[2],line:index+1});});return result;}
export function validateBookCitations(book:Book,notes:Note[]):string[]{const errors:string[]=[],entries=bibliographyEntries(book),known=new Set<string>();for(const entry of entries){const key=entry.key.toLowerCase();if(known.has(key))errors.push(`Duplicate citation key: ${entry.key}`);known.add(key);}for(const page of Object.values(book.pages)){const note=notes.find(n=>n.id===page.noteId);if(!note)continue;for(const cite of citationKeys(note.content))if(!known.has(cite.key.toLowerCase()))errors.push(`${note.title} — line ${cite.line}: missing @${cite.key}`);}return [...new Set(errors)];}
