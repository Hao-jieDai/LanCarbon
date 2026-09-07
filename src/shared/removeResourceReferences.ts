import type { WorkspaceFile } from "./types";
import { assetId } from "./assets";

/** Remove resource occurrences, leaving surrounding prose and literal code intact. */
export function removeResourceReferences(source: string, ids: Set<string>): string {
  const lines = source.split("\n");
  const literal = new Set<number>(), removed = new Set<number>();
  const labels = new Set<string>();
  const normalize = (s: string) => s.trim().replace(/\s+/g," ").toLowerCase();
  let fence = "", deleting = false;
  for (let i=0;i<lines.length;i++) {
    const line=lines[i], marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      (deleting?removed:literal).add(i);
      if(marker && marker[1][0]===fence[0] && marker[1].length>=fence.length && !marker[2].trim()) {fence="";deleting=false;}
      continue;
    }
    if(marker) {
      fence=marker[1];
      const url=/^\{(?:image|figure)\}\s+(\S+)\s*$/.exec(marker[2])?.[1];
      deleting=!!url&&ids.has(assetId(url)??"");
      (deleting?removed:literal).add(i);continue;
    }
    if(/^(?: {4}|\t)/.test(line)){literal.add(i);continue;}
    const definition=/^ {0,3}\[([^\]]+)\]:\s*<?(assets\/[a-f0-9]{64}\.[a-z0-9]{1,12})>?(?:\s+.*)?$/.exec(line);
    if(definition&&ids.has(assetId(definition[2])??"")){labels.add(normalize(definition[1]));removed.add(i);}
  }
  if(deleting)throw new Error("Close the image/figure block before deleting its resource.");
  // Match escaped characters and nested brackets in image/link descriptions.
  const label=String.raw`(?:\\.|[^\[\]\\]|\[(?:\\.|[^\]\\])*\])*`;
  const pattern=new RegExp(String.raw`(\\.)|(`+"`+"+String.raw`)[\s\S]*?\2|!?\[(${label})\](?:\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|\[([^\]]*)\])?(?!\()`,"g");
  return lines.map((line,i)=> removed.has(i)?null:literal.has(i)?line:line.replace(pattern,(all,escaped,code,text,url,ref)=>{
    if(escaped||code)return all;
    if(url)return ids.has(assetId(url)??"")?"":all;
    return labels.has(normalize(ref||text))?"":all;
  })).filter(line=>line!==null).join("\n");
}

export function withoutResources(workspace: WorkspaceFile, ids: string[]): WorkspaceFile {
  const selected=new Set(ids), now=new Date().toISOString();
  return {...workspace,notes:workspace.notes.map(note=>{
    const content=removeResourceReferences(note.content,selected);
    return content===note.content?note:{...note,content,updatedAt:now};
  }),books:workspace.books.map(book=>{
    const settings={...book.settings};let changed=false;
    for(const field of ["logo","favicon"] as const)if(selected.has(assetId(settings[field]??"")??"")){delete settings[field];changed=true;}
    const bibliography=settings.bibliography?.filter(source=>!selected.has(source.assetId));if(bibliography?.length!==settings.bibliography?.length){settings.bibliography=bibliography;changed=true;}
    return changed?{...book,settings,updatedAt:now}:book;
  })};
}
