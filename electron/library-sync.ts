import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_ASSET_BYTES } from "../src/shared/assets";
import { folderLocation, type LibraryFolder, type LibraryImportRecord } from "../src/shared/library";
import { digest, diskIdentity, existingDirectory, managedFile, numberedName, relativeParts, validName } from "./resource-files";
export interface LibraryCatalog { version: 2; folders: LibraryFolder[]; documents: LibraryImportRecord[] }
interface DiskItem { relative: string; identity: string; size: number; signature: string; modified?: number }
const key = (value: string) => process.platform === "win32" ? value.toLocaleLowerCase() : value;
const under = (value: string, directory: string) => key(value).startsWith(key(directory) + "/");
export function importPath(value: string): boolean {
  try { const parts = relativeParts(value); return parts[0] === "Imports" && parts.length >= 2 && parts.length <= 9 && parts.every((part,index) => index === parts.length - 1 ? !!validName(part) : !!validName(part,80)) && /\.(pdf|epub)$/i.test(parts.at(-1)!); } catch { return false; }
}
/** Examines only Imports. No read operation creates folders, moves bytes or deletes files. */
export class LibraryDiskSync {
  private hashes = new Map<string, { signature: string; hash: string }>();
  constructor(private readonly root: string) {}
  async scan(catalog: LibraryCatalog, validate: (bytes: Buffer, format: "pdf" | "epub") => void) {
    const folders: DiskItem[] = [], files: DiskItem[] = [], issues: string[] = [], blocked: string[] = [];
    const oldPaths = new Map(catalog.folders.map(folder => [folder.id, folderLocation(catalog.folders,folder.id)]));
    const visit = async (relative: string) => {
      const directory = await existingDirectory(this.root,relative);
      for (const item of await fs.readdir(directory,{withFileTypes:true})) {
        if (folders.length + files.length > 20000) throw Error("Imports contains too many items to scan safely.");
        const next = `${relative}/${item.name}`, filename = path.join(directory,item.name);
        if (item.isSymbolicLink()) { blocked.push(next); issues.push(`${next}: linked paths are not followed.`); continue; }
        if (item.isDirectory()) {
          try { validName(item.name,80); if(next.split("/").length>8)throw Error("Folder hierarchy is too deep."); const identity=await diskIdentity(filename); folders.push({relative:next,identity,size:0,signature:identity}); await visit(next); }
          catch(error){blocked.push(next);issues.push(`${next}: ${error instanceof Error?error.message:String(error)}`);}
        } else if (item.isFile()) {
          const stat=await fs.lstat(filename,{bigint:true}),identity=`${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
          files.push({relative:next,identity,size:Number(stat.size),signature:`${identity}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,modified:Number(stat.mtimeMs)});
        }
      }
    };
    try { await visit("Imports"); } catch(error) { if((error as NodeJS.ErrnoException).code==="ENOENT")return{catalog,changed:false,issues:["Imports is missing. Restore the folder or choose the correct LanCarbon data location."],errors:new Map<string,string>()};throw error; }
    const fileByPath=new Map(files.map(file=>[key(file.relative),file])), dirByPath=new Map(folders.map(folder=>[key(folder.relative),folder]));
    const bytes=async(file:DiskItem)=>{
      if(file.size<=0||file.size>MAX_ASSET_BYTES)throw Error("File must be non-empty and no larger than 100 MB.");
      const filename=await managedFile(this.root,file.relative),handle=await fs.open(filename,"r");
      try {const before=await handle.stat({bigint:true});const data=await handle.readFile();const after=await handle.stat({bigint:true});if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||data.length!==file.size)throw Error("File is still being saved. Try again after the save finishes.");return data;}finally{await handle.close();}
    };
    const hash=async(file:DiskItem)=>{const cached=this.hashes.get(file.relative);if(cached?.signature===file.signature)return cached.hash;const value=digest(await bytes(file));this.hashes.set(file.relative,{signature:file.signature,hash:value});return value;};
    const matching=async(expected:string,size:number,format:string)=>{
      const result:DiskItem[]=[];
      for(const file of files.filter(file=>file.size===size&&path.posix.extname(file.relative).toLowerCase()===`.${format}`)){try{if(await hash(file)===expected)result.push(file);}catch{/* In-progress or oversized files are preserved. */}}
      return result;
    };
    const located = new Map<string,string>(), used = new Set<string>();
    // Native directory identities also distinguish a moved folder from an empty directory recreated at its old name.
    for(const folder of catalog.folders)if(folder.diskId){const found=folders.filter(item=>item.identity===folder.diskId);if(found.length===1&&!used.has(key(found[0].relative))){located.set(folder.id,found[0].relative);used.add(key(found[0].relative));}}
    for(const folder of catalog.folders.filter(folder=>!located.has(folder.id))){
      const old=oldPaths.get(folder.id)!,records=catalog.documents.filter(record=>under(record.relativePath,old));
      const intact=records.some(record=>fileByPath.has(key(record.relativePath)));
      if(records.length&&!intact){
        const targets=new Set<string>();let unresolved=false;
        for(const record of records){
          const matches=await matching(record.sha256,record.size,record.format);
          if(matches.length!==1){unresolved=true;break;}
          const suffix=path.posix.dirname(record.relativePath).slice(old.length);
          const actualParent=path.posix.dirname(matches[0].relative);
          if(suffix&&!key(actualParent).endsWith(key(suffix))){unresolved=true;break;}
          targets.add(suffix?actualParent.slice(0,-suffix.length):actualParent);
        }
        if(!unresolved&&targets.size===1){const target=[...targets][0];if(target!=="Imports"&&dirByPath.has(key(target))&&!used.has(key(target))&&!catalog.folders.some(other=>other.id!==folder.id&&key(oldPaths.get(other.id)!)===key(target)&&dirByPath.has(key(target)))){located.set(folder.id,target);used.add(key(target));continue;}}
      }
      const exact=dirByPath.get(key(old));if(exact&&!used.has(key(exact.relative))){located.set(folder.id,exact.relative);used.add(key(exact.relative));}
    }
    const idsByPath=new Map<string,string>([[key("Imports"),""]]), nextFolders:LibraryFolder[]=[];
    for(const folder of [...folders].sort((a,b)=>a.relative.split("/").length-b.relative.split("/").length)){
      const old=[...located].find(([,relative])=>key(relative)===key(folder.relative));
      const parentId=idsByPath.get(key(path.posix.dirname(folder.relative)));if(parentId===undefined)continue;
      const id=old?.[0]??`folder_${randomUUID().replace(/-/g,"")}`;
      nextFolders.push({id,parentId:parentId||null,name:path.posix.basename(folder.relative),diskId:folder.identity});idsByPath.set(key(folder.relative),id);
    }
    const missing=catalog.folders.filter(folder=>!located.has(folder.id));
    const retained=new Set<string>();
    for(const folder of missing){const old=oldPaths.get(folder.id)!;if(catalog.documents.some(record=>under(record.relativePath,old))||blocked.some(value=>key(value)===key(old)||under(old,value))) {let current:LibraryFolder|undefined=folder;while(current&&!located.has(current.id)){retained.add(current.id);current=catalog.folders.find(value=>value.id===current!.parentId);}}}
    for(const folder of missing.filter(folder=>retained.has(folder.id)))nextFolders.push({...folder,missing:true});
    const remap=(relative:string)=>{
      const parents=catalog.folders.filter(folder=>located.has(folder.id)&&under(relative,oldPaths.get(folder.id)!)).sort((a,b)=>oldPaths.get(b.id)!.length-oldPaths.get(a.id)!.length);
      const parent=parents[0];return parent?located.get(parent.id)!+relative.slice(oldPaths.get(parent.id)!.length):relative;
    };
    const claimed=new Set<string>(), errors=new Map<string,string>(), documents:LibraryImportRecord[]=[];
    for(const record of catalog.documents){
      const versions=[];
      for(const version of record.versions??[{version:1,file:record.relativePath,sha256:record.sha256,size:record.size,mime:record.format==="pdf"?"application/pdf":"application/epub+zip",createdAt:record.createdAt}]){
        const expected=remap(version.file);let found=fileByPath.get(key(expected));
        if(!found&&version.version===(record.version??1)&&record.diskId){const native=files.filter(file=>file.identity===record.diskId&&path.posix.extname(file.relative).toLowerCase()===`.${record.format}`);if(native.length===1)found=native[0];}
        if(!found){const candidates=await matching(version.sha256,version.size,record.format);if(candidates.length===1)found=candidates[0];}
        if(found){claimed.add(key(found.relative));try{if(await hash(found)!==version.sha256)throw Error("Changed outside LanCarbon. The changed file is preserved; restore or re-import it. Use Open externally for versioned edits.");}catch(error){const message=`${record.title}: ${error instanceof Error?error.message:String(error)}`;errors.set(record.id,message);issues.push(message);}}
        versions.push({...version,file:found?.relative??expected});
      }
      const latest=versions.at(-1)!,current=fileByPath.get(key(latest.file));let folderId=record.folderId??null,title=record.title;
      if(current){folderId=idsByPath.get(key(path.posix.dirname(current.relative)))||null;const newName=path.posix.basename(current.relative);if(key(path.posix.basename(record.relativePath))!==key(newName)&&!/^[a-f0-9]{64}\.(pdf|epub)$/i.test(newName)){try{title=validName(newName);}catch{/* Keep the last valid display name. */}}}
      if(!current)issues.push(`${record.title}: File is missing or moved outside Imports.`);
      if(folderId&&!nextFolders.some(folder=>folder.id===folderId))folderId=null;
      documents.push({...record,folderId,title,relativePath:latest.file,versions,...(current?{diskId:current.identity}:{})});
    }
    const names=new Map<string,string[]>();
    for(const record of documents.filter(record=>record.title===catalog.documents.find(old=>old.id===record.id)?.title)){const group=names.get(record.folderId??"")??[];group.push(record.title);names.set(record.folderId??"",group);}
    for(const record of documents.filter(record=>record.title!==catalog.documents.find(old=>old.id===record.id)?.title)){const group=names.get(record.folderId??"")??[];record.title=numberedName(record.title,group);group.push(record.title);names.set(record.folderId??"",group);}
    // New PDF/EPUB files copied into Imports become local entries, without moving or deleting the source.
    for(const file of files.filter(file=>!claimed.has(key(file.relative))&&/\.(pdf|epub)$/i.test(file.relative))){
      if(Date.now()-(file.modified??0)<700)continue;
      try{
        const format=path.posix.extname(file.relative).slice(1).toLowerCase() as "pdf"|"epub",sha=await hash(file);
        if(documents.some(record=>record.format===format&&record.versions?.some(version=>version.sha256===sha)))continue;
        const data=await bytes(file);validate(data,format);const folderId=idsByPath.get(key(path.posix.dirname(file.relative)))||null;
        const title=numberedName(validName(path.posix.basename(file.relative)),documents.filter(record=>(record.folderId??null)===folderId).map(record=>record.title)),now=new Date().toISOString();
        documents.push({id:`import:${sha}.${format}`,title,format,source:"import",size:file.size,createdAt:now,folderId,relativePath:file.relative,sha256:sha,version:1,diskId:file.identity,versions:[{version:1,file:file.relative,sha256:sha,size:file.size,mime:format==="pdf"?"application/pdf":"application/epub+zip",createdAt:now}]});
      }catch(error){issues.push(`${file.relative}: ${error instanceof Error?error.message:String(error)}`);}
    }
    for(const cached of this.hashes.keys())if(!fileByPath.has(key(cached)))this.hashes.delete(cached);
    const next:LibraryCatalog={version:2,folders:nextFolders,documents};return{catalog:next,changed:JSON.stringify(catalog)!==JSON.stringify(next),issues:[...new Set(issues)],errors};
  }
}
