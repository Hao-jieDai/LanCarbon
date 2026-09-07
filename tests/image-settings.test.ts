import { expect, it } from "vitest";
import { findImages, imageDirective } from "../src/editor/imageSettings";
import { renderMystPreview } from "../src/preview/mystPreview";
const id="a".repeat(64)+".png";
it("round-trips width, alignment and caption and renders safe local image styles",()=>{
  const source=`![Description](assets/${id})`;
  const image=findImages(source)[0];
  const updated=imageDirective({...image,width:"50%",align:"right",caption:"A caption"});
  const reopened=findImages(updated)[0];
  expect(reopened).toMatchObject({width:"50%",align:"right",caption:"A caption",alt:"Description"});
  const rendered=renderMystPreview({id:"note",title:"Test",content:updated},undefined,{[id]:{name:"Image",url:"data:image/png;base64,AAAA"}});
  expect(rendered.error).toBeUndefined();
  const host=document.createElement("div");host.innerHTML=rendered.html;
  expect(host.querySelector("img")?.style.width).toBe("50%");
  expect(host.querySelector("img")?.style.marginRight).toBe("0px");
  expect(host.textContent).toContain("A caption");
  expect(()=>imageDirective({...image,width:"101%"})).toThrow();
  expect(()=>imageDirective({...image,width:"url(https://example.com)"})).toThrow();
});
