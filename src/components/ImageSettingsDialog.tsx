import { useState } from "react";
import { createPortal } from "react-dom";
import { findImages, imageDirective, type ImageSettings } from "../editor/imageSettings";
export function ImageSettingsDialog({source,cursor,onApply,onClose}:{source:string;cursor:number;onApply(image:ImageSettings,replacement:string):string|void;onClose():void}) {
  const [images]=useState(()=>findImages(source));
  const [index,setIndex]=useState(()=>Math.max(0,images.findIndex(i=>cursor>=i.from&&cursor<=i.to)));
  const [draft,setDraft]=useState<ImageSettings|undefined>(images[index]);
  const [error,setError]=useState("");
  return createPortal(<div className="modal-backdrop"><form className="settings-modal image-settings-panel" role="dialog" aria-modal="true" aria-label="Image settings" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}}} onSubmit={e=>{e.preventDefault();try{if(draft){const result=onApply(draft,imageDirective(draft));if(result)setError(result);}}catch(error){setError(String(error));}}}>
    <h2>Image settings</h2>
    {!draft?<p>Insert an image first. Standard managed images and image/figure blocks can be adjusted here.</p>:<>
      <label>Image<select autoFocus aria-label="Image to adjust" value={index} onChange={e=>{const next=Number(e.target.value);setIndex(next);setDraft(images[next]);setError("");}}>{images.map((image,i)=><option key={i} value={i}>{image.alt||"Image"} — line {source.slice(0,image.from).split("\n").length}</option>)}</select></label>
      <label>Width<input aria-label="Image width" placeholder="Auto, 50% or 600px" value={draft.width} onChange={e=>setDraft({...draft,width:e.target.value})}/></label>
      <label>Alignment<select aria-label="Image alignment" value={draft.align} onChange={e=>setDraft({...draft,align:e.target.value})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Description<input aria-label="Image description" value={draft.alt} onChange={e=>setDraft({...draft,alt:e.target.value})}/></label>
      <label>Caption (optional)<textarea aria-label="Image caption" value={draft.caption} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label>
      <p className="modal-help">Changes apply to this image occurrence. The original file stays at full resolution. Width is limited by the page width.</p>
    </>}
    {error&&<p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!draft}>Apply</button></footer>
  </form></div>,document.body);
}
