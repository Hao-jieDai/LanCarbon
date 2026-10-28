import { ReaderAnnotations, type AnnotationReaderProps } from "./ReaderAnnotations";
import type { CitationTarget } from "../shared/grounding";
import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import type { EpubPosition, EpubSession, EpubMatch } from "../shared/epubReader";
import { ThemedSelect } from "./ThemedSelect";

export function EpubReader({id,citation,...annotationProps}:{id:string;citation?:CitationTarget} & AnnotationReaderProps) {
  const root=useRef<HTMLElement>(null);
  const api=window.notesDesktop.epub!,viewport=useRef<HTMLDivElement>(null),prose=useRef<HTMLDivElement>(null),searchInput=useRef<HTMLInputElement>(null);
  const current=useRef<EpubSession|null>(null),position=useRef<EpubPosition|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),restoring=useRef(true),pendingAnchor=useRef(""),pendingMatch=useRef<number|null>(null);
  const [session,setSession]=useState<EpubSession>(),[chapter,setChapter]=useState(0),[html,setHtml]=useState(""),[busy,setBusy]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [fontSize,setFontSize]=useState(18),[lineHeight,setLineHeight]=useState(1.7),[width,setWidth]=useState(800),[sidebar,setSidebar]=useState(true),[query,setQuery]=useState(""),[matches,setMatches]=useState<EpubMatch[]>([]),[searching,setSearching]=useState(false),[truncated,setTruncated]=useState(false),[revision,setRevision]=useState(0),[newVersion,setNewVersion]=useState(false);
  const appliedCitation=useRef("");
  const [htmlChapter,setHtmlChapter]=useState(-1);
  const persist=async()=>{clearTimeout(timer.current);if(current.current&&position.current){const result=await api.savePosition(current.current.readingId,position.current);if(!result.ok)throw Error(result.error);}};
  useEffect(()=>{
    let live=true,opened:EpubSession|undefined;setSession(undefined);setHtml("");setBusy(true);setError("");setNewVersion(false);position.current=null;restoring.current=true;
    void api.open(id).then(async result=>{if(!result.ok)throw Error(result.error);opened=result.session;if(!live){await api.release(opened.token);return;}current.current=opened;const saved=opened.position,index=Math.max(0,opened.chapters.findIndex(item=>item.path===saved?.chapter));
      setChapter(index);setFontSize(saved?.fontSize??18);setLineHeight(saved?.lineHeight??1.7);setWidth(saved?.width??800);position.current={chapter:opened.chapters[index].path,progress:saved?.progress??0,fontSize:saved?.fontSize??18,lineHeight:saved?.lineHeight??1.7,width:saved?.width??800};setSession(opened);
    }).catch(error=>{if(live){setError(error.message??"Could not open this EPUB.");setBusy(false);}});
    return()=>{live=false;void persist().catch(()=>undefined);if(opened)void api.release(opened.token);current.current=null;};
  },[id,revision,api]);
  useEffect(()=>{
    if(!session)return;let live=true;restoring.current=true;setBusy(true);setError("");
    void api.chapter(session.token,chapter).then(result=>{if(!live)return;if(!result.ok)throw Error(result.error);const cleaned=DOMPurify.sanitize(result.html,{USE_PROFILES:{html:true,mathMl:true},FORBID_TAGS:["style","script","iframe","object","form","input","button"],FORBID_ATTR:["style","srcset"],ADD_ATTR:["data-epub-chapter","data-epub-anchor","data-epub-paragraph"]});setHtml(cleaned);setHtmlChapter(chapter);setBusy(false);}).catch(error=>{if(live){setError(error.message);setBusy(false);}});
    return()=>{live=false;};
  },[session?.token,chapter,api]);
  useEffect(()=>{
    if(busy||!html||!viewport.current||!prose.current)return;let live=true;
    const restore=()=>{if(!live||!viewport.current||!prose.current)return;const view=viewport.current;view.scrollTop=(position.current?.progress??0)*Math.max(0,view.scrollHeight-view.clientHeight);if(pendingAnchor.current){prose.current.querySelector<HTMLElement>(`#${CSS.escape("epub-content-"+pendingAnchor.current)}`)?.scrollIntoView({block:"start"});pendingAnchor.current="";}
      const marks=highlight(prose.current,query);if(pendingMatch.current!==null){marks[pendingMatch.current]?.scrollIntoView({block:"center"});pendingMatch.current=null;}if(citation && htmlChapter===chapter && session?.chapters[chapter]?.path===citation.anchor.chapter && appliedCitation.current!==citation.requestId){const target=prose.current.querySelector<HTMLElement>(`[data-epub-paragraph="${citation.anchor.paragraph}"]`);if(target){target.scrollIntoView({block:"center"});appliedCitation.current=citation.requestId;if(position.current)position.current={...position.current,progress:view.scrollTop/Math.max(1,view.scrollHeight-view.clientHeight)};}}
      restoring.current=false;};
    const frame=requestAnimationFrame(restore);void Promise.all(Array.from(prose.current.querySelectorAll("img")).map(img=>img.decode().catch(()=>undefined))).then(restore);
    return()=>{live=false;cancelAnimationFrame(frame);};
  },[html,busy,fontSize,lineHeight,width,htmlChapter,citation?.requestId]);
  useEffect(()=>{if(position.current){position.current={...position.current,fontSize,lineHeight,width};timer.current=setTimeout(()=>void persist().catch(error=>setNotice(error.message)),500);}return()=>clearTimeout(timer.current);},[fontSize,lineHeight,width]);
  useEffect(()=>window.notesDesktop.library?.onChanged?.(()=>{void window.notesDesktop.library!.list().then(result=>{const opened=current.current;if(!result.ok||!opened)return;const latest=result.entries.find(entry=>entry.id===opened.readingId||entry.id===id||entry.assetId===id);if(latest){setSession(previous=>previous?{...previous,entry:{...previous.entry,name:latest.name}}:previous);if(latest.version!==opened.entry.version)setNewVersion(true);}}).catch(()=>undefined);}),[id]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"){event.preventDefault();event.stopImmediatePropagation();searchInput.current?.focus();searchInput.current?.select();}};window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);},[]);
  useEffect(()=>{
    if(!session)return;let live=true;setMatches([]);setTruncated(false);setSearching(!!query.trim());if(!query.trim())return;
    const timeout=setTimeout(()=>{void api.search(session.token,query).then(result=>{if(!live)return;if(!result.ok)throw Error(result.error);setMatches(result.matches);setTruncated(result.truncated);setSearching(false);}).catch(error=>{if(live){setNotice(error.message);setSearching(false);}});},300);
    return()=>{live=false;clearTimeout(timeout);};
  },[query,session?.token,api]);
  const move=(next:number,anchor="",match:number|null=null)=>{
    if(!session||next<0||next>=session.chapters.length)return;pendingAnchor.current=anchor;pendingMatch.current=match;
    if(position.current)position.current={...position.current,chapter:session.chapters[next].path,progress:0};
    if(next===chapter&&prose.current&&viewport.current){viewport.current.scrollTop=0;if(anchor)prose.current.querySelector<HTMLElement>(`#${CSS.escape("epub-content-"+anchor)}`)?.scrollIntoView({block:"start"});if(match!==null)highlight(prose.current,query)[match]?.scrollIntoView({block:"center"});pendingAnchor.current="";pendingMatch.current=null;}else setChapter(next);
  };
  useEffect(()=>{if(!session||!citation||citation.anchor.kind!=="epub")return;const index=session.chapters.findIndex(item=>item.path===citation.anchor.chapter);if(index<0){setNotice("The cited chapter is unavailable.");return;}move(index,citation.anchor.fragment??"");setNotice(`Cited passage · Chapter ${index+1} · Paragraph ${citation.anchor.paragraph}`);},[session?.token,citation?.requestId]);
  const displayHtml=useMemo(()=>{
    if(!citation||htmlChapter!==chapter||session?.chapters[chapter]?.path!==citation.anchor.chapter)return html;
    const wrapper=window.document.createElement("div");wrapper.innerHTML=html;
    wrapper.querySelector<HTMLElement>(`[data-epub-paragraph="${citation.anchor.paragraph}"]`)?.classList.add("cited-passage");
    return wrapper.innerHTML;
  },[html,htmlChapter,chapter,session?.token,citation?.requestId]);
  const scroll=()=>{if(restoring.current||!position.current||!viewport.current)return;const view=viewport.current;position.current={...position.current,progress:Math.max(0,Math.min(1,view.scrollTop/Math.max(1,view.scrollHeight-view.clientHeight)))};clearTimeout(timer.current);timer.current=setTimeout(()=>void persist().catch(error=>setNotice(error.message)),500);};
  return <section ref={root} className="editor-panel document-reader epub-reader" aria-label="EPUB reader">
    {session && <ReaderAnnotations {...annotationProps} key={session.token} root={root} documentId={session.readingId} fingerprint={session.fingerprint} chapter={htmlChapter === chapter ? {...session.chapters[chapter], index:chapter} : undefined} navigate={a => { if(a.anchor.kind === "epub") { const anchor=a.anchor; const index=session.chapters.findIndex(item=>item.path===anchor.chapter); if(index>=0) move(index); } }}/>}

    <div className="pdf-reader-controls epub-controls" data-translation-exclude>
      <button className="toolbar-text-button" aria-pressed={sidebar} onClick={()=>setSidebar(value=>!value)}>Contents</button><button className="toolbar-text-button" aria-label="Previous EPUB chapter" disabled={!session||chapter===0||busy} onClick={()=>move(chapter-1)}>‹</button><span>{session?`${chapter+1} / ${session.chapters.length}`:"—"}</span><button className="toolbar-text-button" aria-label="Next EPUB chapter" disabled={!session||chapter>=session.chapters.length-1||busy} onClick={()=>move(chapter+1)}>›</button>
      <ThemedSelect label="EPUB font size" value={String(fontSize)} options={[14,16,18,20,24,28,32].map(value=>({value:String(value),label:`${value} px`}))} onChange={value=>setFontSize(Number(value))}/>
      <ThemedSelect label="EPUB line spacing" value={String(lineHeight)} options={[1.4,1.7,2].map(value=>({value:String(value),label:`Spacing ${value}`}))} onChange={value=>setLineHeight(Number(value))}/>
      <ThemedSelect label="EPUB reading width" value={String(width)} options={[{value:"640",label:"Narrow"},{value:"800",label:"Medium"},{value:"1000",label:"Wide"}]} onChange={value=>setWidth(Number(value))}/>
      <div className="reader-tools-end"><button className="toolbar-text-button" onClick={()=>void window.notesDesktop.library!.open(id).then(result=>{if(!result.ok)setNotice(result.error??"Could not open externally.");})}>Open externally</button><label className="pdf-find"><input ref={searchInput} aria-label="Find in EPUB" placeholder="Find in EPUB" maxLength={120} disabled={!session} value={query} onChange={event=>{setQuery(event.target.value);setSidebar(true);}}/><span role="status">{query?(searching?"Searching…":`${matches.length}${truncated?"+":""} matches`):""}</span></label></div>
    </div>
    {newVersion&&<div className="pdf-reader-notice" role="status">A newer file version is available.<button className="text-button" onClick={()=>void persist().catch(()=>undefined).finally(()=>setRevision(value=>value+1))}>Reload latest version</button></div>}
    {notice&&<p className="pdf-reader-notice" role="status">{notice}</p>}
    <div className="pdf-reader-body">
      {sidebar&&<aside className="epub-sidebar" aria-label="EPUB contents"><div className="pdf-sidebar-scroll">{query.trim()?matches.map((match,index)=><button className="epub-toc-item" key={index} onClick={()=>move(match.chapter,"",match.occurrence)}><strong>{session?.chapters[match.chapter].title}</strong><small>{match.excerpt}</small></button>):session?.toc.length?session.toc.map((item,index)=><button className="epub-toc-item" aria-current={item.chapter===chapter?"location":undefined} key={index} style={{paddingLeft:12+item.depth*12}} onClick={()=>move(item.chapter,item.anchor)}>{item.title}</button>):session?.chapters.map((item,index)=><button className="epub-toc-item" aria-current={index===chapter?"location":undefined} key={index} onClick={()=>move(index)}>{item.title}</button>)}</div></aside>}
      <div ref={viewport} className="epub-scroll" aria-label="EPUB pages" tabIndex={0} onScroll={scroll}>
        {busy?<p role="status">Opening EPUB…</p>:error?<div className="epub-error" role="alert"><h2>EPUB unavailable</h2><p>{error}</p><p>Your file is preserved. You can try Open externally.</p></div>:<div ref={prose} className="epub-prose" style={{fontSize,lineHeight,maxWidth:width}} onClick={event=>{const link=(event.target as Element).closest<HTMLAnchorElement>("a");if(link){event.preventDefault();const value=link.getAttribute("data-epub-chapter");if(value!==null)move(Number(value),link.getAttribute("data-epub-anchor")??"");}}} dangerouslySetInnerHTML={{__html:displayHtml}}/>}
      </div>
    </div><footer className="pdf-reader-footer"><span>{session?`${session.chapters[chapter]?.title??"EPUB"} · Version ${session.entry.version??1}`:"EPUB reader"}</span><span>Local reading · Select text to use translation</span></footer>
  </section>;
}
function highlight(root:HTMLElement,query:string):HTMLElement[] {
  for(const mark of root.querySelectorAll("mark.epub-match"))mark.replaceWith(...Array.from(mark.childNodes));root.normalize();if(!query.trim())return[];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as Text);const marks:HTMLElement[]=[],needle=query.trim().toLocaleLowerCase();
  for(const node of nodes){const text=node.textContent??"",lower=text.toLocaleLowerCase();let start=0,index=lower.indexOf(needle);if(index<0)continue;const fragment=document.createDocumentFragment();while(index>=0){fragment.append(text.slice(start,index));const mark=document.createElement("mark");mark.className="epub-match";mark.textContent=text.slice(index,index+needle.length);fragment.append(mark);marks.push(mark);start=index+needle.length;index=lower.indexOf(needle,start);}fragment.append(text.slice(start));node.replaceWith(fragment);}return marks;
}
