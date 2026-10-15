import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { LibraryStore } from "./library";
import { managedDirectory } from "./resource-files";
import { validReaderId } from "../src/shared/readerTabs";
import { validEpubPosition, type EpubPosition, type EpubSession, type EpubMatch } from "../src/shared/epubReader";

const MiB = 1024 * 1024;
function safePath(value: string) { if (!value || value.length>1000 || /[\\\x00-\x1f]/.test(value) || value.startsWith("/") || value.split("/").some(part=>!part||part===".."||part==="."||part.includes(":"))) throw Error("Invalid EPUB resource path."); return value; }
function target(base: string, href: string): { file: string; anchor: string } | undefined {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href) || href.startsWith("/")) return;
  try { const [name, anchor=""] = href.split("#",2), decoded=decodeURIComponent(name.split("?")[0]); return {file:safePath(name?path.posix.normalize(path.posix.join(path.posix.dirname(base),decoded)):base),anchor:decodeURIComponent(anchor)}; } catch { return; }
}
function crc32(bytes: Buffer) { let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0; }
interface ZipItem { offset: number; compressed: number; size: number; method: number; crc: number }
/** Bounded, in-memory ZIP reads. No archive entry is extracted to the filesystem. */
export class EpubArchive {
  readonly items=new Map<string,ZipItem>();
  constructor(private readonly bytes:Buffer) {
    let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
    if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw Error("Unsupported or incomplete EPUB archive.");
    const count=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16),expanded=0;
    if(count===65535||count>10000||cursor+bytes.readUInt32LE(end+12)!==end)throw Error("EPUB archive exceeds supported limits.");
    for(let i=0;i<count;i++){
      if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error("Invalid EPUB directory.");
      const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),length=bytes.readUInt16LE(cursor+28),next=cursor+46+length+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
      if(next>end||flags&1||![0,8].includes(method)||size>32*MiB||compressed>bytes.length||offset+30>cursor)throw Error("Encrypted or oversized EPUB resources are not supported.");
      const name=bytes.toString("utf8",cursor+46,cursor+46+length);safePath(name.replace(/\/$/,""));expanded+=size;
      if(expanded>256*MiB||this.items.has(name))throw Error("EPUB contents exceed supported limits or contain duplicate paths.");
      if(!name.endsWith("/"))this.items.set(name,{offset,compressed,size,method,crc:bytes.readUInt32LE(cursor+16)});cursor=next;
    }
    if(cursor!==end)throw Error("Invalid EPUB directory length.");
  }
  read(name:string,limit=8*MiB):Buffer {
    const entry=this.items.get(safePath(name));if(!entry)throw Error(`EPUB resource is missing: ${name}`);
    const {offset,compressed,size,method}=entry;if(size>limit||this.bytes.readUInt32LE(offset)!==0x04034b50)throw Error("EPUB resource exceeds the reader limit or is damaged.");
    const start=offset+30+this.bytes.readUInt16LE(offset+26)+this.bytes.readUInt16LE(offset+28);if(start+compressed>this.bytes.length)throw Error("Incomplete EPUB resource.");
    const raw=this.bytes.subarray(start,start+compressed),value=method===0?raw:inflateRawSync(raw,{maxOutputLength:limit});
    if(value.length!==size||crc32(value)!==entry.crc)throw Error("EPUB resource failed its integrity check.");return value;
  }
}
const elements=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagName("*")).filter(element=>element.localName===name);
function xml(bytes:Buffer,html=false):Document {
  if(/<!ENTITY/i.test(bytes.toString("utf8")))throw Error("Custom XML entities are not supported.");
  let invalid=false;const doc=new DOMParser({errorHandler:{warning:()=>undefined,error:()=>{invalid=true;},fatalError:()=>{invalid=true;}}}).parseFromString(bytes.toString("utf8"),html?"text/html":"application/xml");
  if(invalid||!doc.documentElement)throw Error("The EPUB contains invalid XML.");return doc;
}
interface Publication { archive:EpubArchive; session:EpubSession; media:Map<string,string> }
export class EpubReaderStore {
  private grant?:Publication;
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private readonly data:string,private readonly library:LibraryStore){}
  private async positions():Promise<Record<string,EpubPosition>> {
    const directory=await managedDirectory(this.data,"Library"),file=path.join(directory,"epub-reading.json");
    try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*MiB)throw Error("Invalid EPUB reading-position data.");const value=JSON.parse(await fs.readFile(file,"utf8"));if(value.version!==1||!value.positions||typeof value.positions!=="object"||Array.isArray(value.positions)||Object.keys(value.positions).length>10000||Object.entries(value.positions).some(([id,position])=>!validReaderId(id)||!validEpubPosition(position as EpubPosition)))throw Error("Unsupported EPUB reading-position data. Existing records are preserved.");return value.positions;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return{};throw error;}
  }
  open(id:string):Promise<EpubSession> {
    const action=this.queue.then(async()=>{
      const {entry,bytes}=await this.library.read(id);if(entry.format!=="epub")throw Error("Choose an EPUB document.");
      const archive=new EpubArchive(bytes),container=xml(archive.read("META-INF/container.xml",MiB)),opfName=elements(container,"rootfile")[0]?.getAttribute("full-path");if(!opfName)throw Error("The EPUB package could not be located.");safePath(opfName);
      if(archive.items.has("META-INF/encryption.xml")){const encrypted=archive.read("META-INF/encryption.xml",MiB).toString("utf8");if(elements(xml(Buffer.from(encrypted)),"EncryptionMethod").some(element=>!/(?:idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC)$/.test(element.getAttribute("Algorithm")??"")))throw Error("This EPUB is protected by DRM. Use an authorized external reader.");}
      const opf=xml(archive.read(opfName,2*MiB));if(elements(opf,"meta").some(element=>element.getAttribute("property")==="rendition:layout"&&element.textContent?.trim()==="pre-paginated"))throw Error("Fixed-layout EPUB is not supported by this text reader. Use Open externally.");
      const media=new Map<string,string>(),items=new Map<string,{file:string;type:string;properties:string}>();
      for(const item of elements(opf,"item")){const href=item.getAttribute("href"),key=item.getAttribute("id"),resolved=href?target(opfName,href):undefined;if(key&&resolved){const type=item.getAttribute("media-type")??"";items.set(key,{file:resolved.file,type,properties:item.getAttribute("properties")??""});media.set(resolved.file,type);}}
      const chapters=elements(opf,"itemref").map(ref=>items.get(ref.getAttribute("idref")??"")).filter((item):item is NonNullable<typeof item>=>!!item&&["application/xhtml+xml","text/html"].includes(item.type)).map(item=>({path:item.file,title:path.posix.basename(item.file).replace(/\.[^.]+$/,"" )}));
      if(!chapters.length||chapters.length>3000)throw Error("This EPUB has no readable chapters or exceeds the 3,000-chapter limit.");
      const toc:EpubSession["toc"]=[],nav=[...items.values()].find(item=>item.properties.split(/\s+/).includes("nav")),ncx=[...items.values()].find(item=>item.type==="application/x-dtbncx+xml");
      if(nav||ncx){const source=nav??ncx!,doc=xml(archive.read(source.file,2*MiB));const links=nav?elements(doc,"a").filter(element=>{let parent:Element|null=element.parentNode as Element;while(parent?.nodeType===1){if(parent.localName==="nav")return(parent.getAttribute("epub:type")??parent.getAttribute("type")??"toc").split(/\s+/).includes("toc");parent=parent.parentNode as Element;}return false;}):elements(doc,"navPoint");for(const link of links.slice(0,5000)){const href=nav?link.getAttribute("href"):elements(link,"content")[0]?.getAttribute("src"),dest=href?target(source.file,href):undefined,chapter=dest?chapters.findIndex(item=>item.path===dest.file):-1;if(chapter<0||!dest)continue;const title=(nav?link.textContent:elements(link,"text")[0]?.textContent)?.trim().slice(0,200)||chapters[chapter].title;let depth=0,parent=link.parentNode;while(parent&&parent!==doc.documentElement){if((parent as Element).localName===(nav?"ol":"navPoint"))depth++;parent=parent.parentNode;}toc.push({title,chapter,anchor:dest.anchor,depth:Math.min(7,Math.max(0,depth-(nav?1:0)))});if(!toc.some(item=>item!==toc.at(-1)&&item.chapter===chapter))chapters[chapter].title=title;}}
      const readingId=entry.documentId??entry.id,positions=await this.positions(),session:EpubSession={token:randomUUID(),readingId,entry,title:elements(opf,"title")[0]?.textContent?.trim().slice(0,300)||entry.name,chapters,toc,position:positions[readingId]};
      this.grant={archive,session,media};return session;
    });this.queue=action.catch(()=>undefined);return action;
  }
  private active(token:string){if(!this.grant||this.grant.session.token!==token)throw Error("This EPUB session has closed. Reopen the document.");return this.grant;}
  chapter(token:string,index:number):string {
    const {archive,session,media}=this.active(token);if(!Number.isInteger(index)||index<0||index>=session.chapters.length)throw Error("Invalid EPUB chapter.");
    const chapter=session.chapters[index],doc=xml(archive.read(chapter.path),true),body=elements(doc,"body")[0];if(!body)throw Error("The EPUB chapter has no readable body.");let imageBytes=0;
    // Only document content and local raster/SVG images cross into the renderer. Publisher scripts, styles and URLs do not.
    for(const element of [body,...Array.from(body.getElementsByTagName("*"))]){
      if(["script","style","link","iframe","object","embed","form","input","button","audio","video","source","base","meta"].includes(element.localName)){element.parentNode?.removeChild(element);continue;}
      const originalId=element.getAttribute("id"),href=element.getAttribute("href")??element.getAttribute("xlink:href"),source=element.getAttribute("src")??href;
      for(const attr of Array.from(element.attributes))if(!["id","title","alt","colspan","rowspan","lang","dir","scope"].includes(attr.name))element.removeAttribute(attr.name);
      if(originalId)element.setAttribute("id","epub-content-"+originalId);
      if(element.localName==="a"&&href){const dest=target(chapter.path,href),destination=dest?session.chapters.findIndex(item=>item.path===dest.file):-1;if(dest&&destination>=0){element.setAttribute("href","#");element.setAttribute("data-epub-chapter",String(destination));element.setAttribute("data-epub-anchor",dest.anchor);}}
      if(["img","image"].includes(element.localName)){
        const resource=source;
        if(resource){const dest=target(chapter.path,resource),type=dest?media.get(dest.file):undefined;if(dest&&type&&/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(type)){const bytes=archive.read(dest.file,16*MiB);imageBytes+=bytes.length;if(imageBytes>24*MiB)throw Error("This chapter contains too much image data. Use Open externally.");const img=element.localName==="image"?doc.createElement("img"):element;img.setAttribute("src",`data:${type};base64,${bytes.toString("base64")}`);if(img!==element)element.parentNode?.replaceChild(img,element);}}
      }
    }
    return Array.from(body.childNodes).map(node=>new XMLSerializer().serializeToString(node)).join("");
  }
  async search(token:string,query:string):Promise<{matches:EpubMatch[];truncated:boolean}> {
    if(typeof query!=="string"||!query.trim()||query.length>120)throw Error("Enter a search of up to 120 characters.");const publication=this.active(token),needle=query.trim().toLocaleLowerCase(),matches:EpubMatch[]=[];
    for(let chapter=0;chapter<publication.session.chapters.length;chapter++){
      if(chapter%8===0){await new Promise<void>(resolve=>setImmediate(resolve));this.active(token);}
      const doc=xml(publication.archive.read(publication.session.chapters[chapter].path),true),body=elements(doc,"body")[0];for(const element of [...elements(doc,"script"),...elements(doc,"style")])element.parentNode?.removeChild(element);
      const text=(body?.textContent??"").replace(/\s+/g," "),lower=text.toLocaleLowerCase();let cursor=0,occurrence=0;
      while((cursor=lower.indexOf(needle,cursor))>=0){if(matches.length>=250)return{matches,truncated:true};matches.push({chapter,occurrence:occurrence++,excerpt:text.slice(Math.max(0,cursor-55),Math.min(text.length,cursor+needle.length+80))});cursor+=needle.length;}
    }return{matches,truncated:false};
  }
  release(token?:string){if(token===undefined||this.grant?.session.token===token)this.grant=undefined;}
  savePosition(id:string,input:EpubPosition):Promise<void>{const action=this.queue.then(async()=>{if(!validReaderId(id)||!validEpubPosition(input))throw Error("Invalid EPUB reading position.");const positions=await this.positions();positions[id]={chapter:input.chapter,progress:input.progress,fontSize:input.fontSize,lineHeight:input.lineHeight,width:input.width,updatedAt:new Date().toISOString()};const entries=Object.entries(positions).sort((a,b)=>(b[1].updatedAt??"").localeCompare(a[1].updatedAt??"")).slice(0,10000),directory=await managedDirectory(this.data,"Library"),file=path.join(directory,"epub-reading.json"),temp=`${file}.${randomUUID()}.tmp`;try{await fs.writeFile(temp,JSON.stringify({version:1,positions:Object.fromEntries(entries)},null,2),{flag:"wx"});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>undefined);}});this.queue=action.catch(()=>undefined);return action;}
  async flush(){await this.queue;}
}
