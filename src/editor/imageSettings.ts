import { assetReferences } from "../shared/assets";
export interface ImageSettings {from:number;to:number;original:string;url:string;alt:string;width:string;align:string;caption:string;extra:string[]}
export function findImages(source:string): ImageSettings[] {
  const images:ImageSettings[]=[];
  const references=assetReferences(source);
  const allowed=(url:string,offset:number)=>references.some(r=>r.id===url.slice(7)&&r.line===source.slice(0,offset).split("\n").length);
  const blocks=/^(`{3,}|~{3,})\{(image|figure)\}\s+(assets\/[a-f0-9]{64}\.[a-z0-9]{1,12})\s*\r?\n([\s\S]*?)^\1\s*$/gm;
  for(const match of source.matchAll(blocks)) {
    if(!allowed(match[3],match.index!))continue;
    const options:Record<string,string>={},extra:string[]=[];const body:string[]=[];let inBody=false;
    for(const line of match[4].split("\n")) {
      const option=/^:([\w-]+):\s*(.*)$/.exec(line);
      if(option&&!inBody) { if(["width","align","alt"].includes(option[1]))options[option[1]]=option[2];else extra.push(line); }
      else if(line.trim()||inBody){inBody=true;body.push(line);}
    }
    images.push({from:match.index!,to:match.index!+match[0].length,original:match[0],url:match[3],alt:options.alt??"",width:options.width??"",align:options.align??"center",caption:body.join("\n").trim(),extra});
  }
  for(const match of source.matchAll(/!\[([^\]\n]*)\]\((assets\/[a-f0-9]{64}\.[a-z0-9]{1,12})\)/g)) {
    if(!allowed(match[2],match.index!)||images.some(i=>match.index!>=i.from&&match.index!<i.to))continue;
    images.push({from:match.index!,to:match.index!+match[0].length,original:match[0],url:match[2],alt:match[1],width:"",align:"center",caption:"",extra:[]});
  }
  return images.sort((a,b)=>a.from-b.from);
}
export function imageDirective(value:ImageSettings):string {
  const width=value.width.trim();
  if(width&&!/^(?:[1-9]\d{0,3}px|(?:100|[1-9]\d?)(?:\.\d+)?%)$/.test(width))throw new Error("Width must be 1–9999px or 1–100% (or leave blank for automatic size).");
  if(width.endsWith("%")&&parseFloat(width)>100)throw new Error("Percentage width cannot exceed 100%.");
  if(!["left","center","right"].includes(value.align))throw new Error("Choose left, center or right alignment.");
  const caption=value.caption.trim();
  const fence="`".repeat(Math.max(3,...Array.from(caption.matchAll(/`+/g),m=>m[0].length+1)));
  return `${fence}{${caption?"figure":"image"}} ${value.url}\n${width?`:width: ${width}\n`:""}:align: ${value.align}\n:alt: ${value.alt.replace(/[\r\n]/g," ")}\n${value.extra.length?value.extra.join("\n")+"\n":""}${caption?"\n"+caption+"\n":""}${fence}`;
}
