import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createNote } from "../../src/shared/notes";
import { addNoteToBook, createBook } from "../../src/shared/books";

const launch = (root: string) => electron.launch({ ...(process.env.E2E_EXECUTABLE ? {executablePath:process.env.E2E_EXECUTABLE} : {}), args:["--in-process-gpu","--disable-gpu","--no-sandbox",...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(".")])],env:{...process.env,LANCARBON_ROOT:root,E2E_USER_DATA_DIR:""} });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"lancarbon-writing-ui-")); await fs.mkdir(path.join(root,"Data"));
  const a = createNote({id:"writing-a",title:"Memo Alpha",content:"Alpha carbon policy evidence."}), b = createNote({id:"writing-b",title:"Memo Beta",content:"Beta energy investment evidence."});
  const one = createBook("First Book"), two = createBook("Second Book");
  const section = createNote({id:"writing-section",title:"Methods",content:"SectionMarker methodology evidence."});
  const child = createNote({id:"writing-child",title:"Results page",content:"ChildMarker carbon results."});
  const other = createNote({id:"writing-other",title:"Other section",content:"OutsideSectionMarker unrelated analysis."});
  one.book = addNoteToBook(one.book,section,{section:true});
  const sectionId = Object.values(one.book.pages).find(p=>p.noteId===section.id)!.id;
  one.book = addNoteToBook(one.book,child,{parentPageId:sectionId}); one.book = addNoteToBook(one.book,other,{section:true});
  one.homeNote.content=`HomeMarker first book overview.\n\n[Go to results](${Object.values(one.book.pages).find(p => p.noteId === child.id)!.exportPath})`; two.homeNote.content="UnselectedSecondBookMarker.";
  const notes=[a,b,one.homeNote,two.homeNote,section,child,other],books=[one.book,two.book];
  await fs.writeFile(path.join(root,"Data/notes.json"),JSON.stringify({version:2,notes,books}));
  return {root,a,b,one,two,child,section,notes};
}
async function cleanup(root: string) { if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith("lancarbon-writing-ui-"))throw Error("Unsafe cleanup");await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }

test("writing tabs preserve edits, undo and preview across Notes and different Books, then reopen after restart",async({},info)=>{
  const f=await fixture();let app=await launch(f.root);
  try {
    let page=await app.firstWindow();await page.getByRole("main").waitFor();
    await page.evaluate(ids=>localStorage.setItem("lancarbon-navigation-v1",JSON.stringify({mode:"notes",noteId:ids[0],writingTabs:ids})),[f.a.id,f.b.id,f.one.homeNote.id,f.two.homeNote.id]);await page.reload();
    const content=page.locator('.markdown-workspace:not([hidden]) .cm-content');
    await expect(content).toContainText(f.a.content);await content.click();await page.keyboard.press("Control+End");await page.keyboard.type(" LatestAlphaMarker");
    await page.getByRole("tab",{name:/Memo Beta/}).click();await expect(content).toContainText(f.b.content);await content.click();await page.keyboard.press("Control+End");await page.keyboard.type(" BetaEdit");
    await page.getByRole("tab",{name:/Memo Alpha/}).click();await expect(content).toContainText("LatestAlphaMarker");await content.click();await page.keyboard.press("Control+z");await expect(content).not.toContainText("LatestAlphaMarker");await page.screenshot({path:info.outputPath("after-undo.png")});await page.keyboard.press("Control+Shift+KeyZ");await expect(content).toContainText("LatestAlphaMarker");
    await page.keyboard.press("Control+e");await expect(page.locator('.markdown-preview:not([hidden])')).toContainText("LatestAlphaMarker");
    await page.getByRole("tab",{name:/First Book/}).click();await expect(page.getByLabel("Note title")).toHaveValue(f.one.homeNote.title);await page.getByRole("button",{name:"Preview",exact:true}).click();await page.getByRole("link",{name:"Go to results",exact:true}).click();await expect(page.getByLabel("Note title")).toHaveValue("Results page");await expect(page.getByLabel("Rendered preview")).toBeVisible();
    await page.getByRole("tab",{name:/Second Book/}).click();await expect(page.getByLabel("Note title")).toHaveValue(f.two.homeNote.title);
    await page.getByRole("tab",{name:/Memo Alpha/}).click();await expect(page.locator('.markdown-preview:not([hidden])')).toBeVisible();
    await page.getByRole("button",{name:"AI Chat",exact:true}).click();await expect(page.getByLabel("Page sidebar",{exact:true})).toBeVisible();await expect(page.locator('.sidebar')).toBeHidden();
    await page.screenshot({path:info.outputPath("writing-sidebar.png")});
    await page.getByRole("button",{name:"Open workspace list",exact:true}).click();await expect(page.getByLabel("Page sidebar",{exact:true})).toBeHidden();await expect(page.locator('.sidebar')).toBeVisible();
    await page.getByRole("button",{name:"Close page Memo Beta",exact:true}).click();await expect(page.getByRole("tab",{name:/Memo Beta/})).toHaveCount(0);
    await app.close();app=await launch(f.root);page=await app.firstWindow();await page.getByRole("main").waitFor();
    await expect(page.getByRole("tab",{name:/Memo Alpha/})).toBeVisible();await expect(page.getByRole("tab",{name:/Memo Beta/})).toHaveCount(0);
    const saved=await page.evaluate(()=>window.notesDesktop.loadWorkspace());expect(saved.ok&&saved.workspace.notes.find(n=>n.id==="writing-b")?.content).toContain("BetaEdit");
    await page.locator('.note-card').filter({has:page.getByRole("heading",{name:"Memo Beta",exact:true})}).click();await expect(page.getByRole("tab",{name:/Memo Beta/})).toBeVisible();
  }finally{await app.close().catch(()=>undefined);await cleanup(f.root);}
});

test("page chat saves latest edits, isolates page conversations and drafts, and binds page/section/Book sources",async({},info)=>{
  const f=await fixture();let app=await launch(f.root);
  const mock=async()=>app.evaluate(({net})=>{(globalThis as any).writingRequests=[];net.fetch=async(url,init)=>{
    if(!String(url).endsWith("/chat/completions"))throw Error("Unexpected request");
    const body=JSON.parse(init!.body as string);(globalThis as any).writingRequests.push(body);
    await new Promise(resolve=>setTimeout(resolve,250));
    return new Response(JSON.stringify({choices:[{message:{content:"A supported fixture response [S1]."}}],usage:{prompt_tokens:60,completion_tokens:12,total_tokens:72}}),{headers:{"content-type":"application/json"}});
  };});
  try{
    let page=await app.firstWindow();await page.getByRole("main").waitFor();await mock();
    await page.evaluate(async ids=>{localStorage.setItem("lancarbon-navigation-v1",JSON.stringify({mode:"notes",noteId:ids[0],writingTabs:ids}));const p=await window.notesDesktop.ai!.saveProvider({id:"openrouter",kind:"openrouter",name:"OpenRouter",baseUrl:"https://openrouter.ai/api/v1",apiKey:"fixture-key",models:[{id:"fixture-chat",name:"Chat fixture",purpose:"chat"}],defaultModel:"fixture-chat"});if(!p.ok)throw Error(p.error);},[f.a.id,f.b.id,f.child.id]);await page.reload();
    const content=page.locator('.markdown-workspace:not([hidden]) .cm-content');await content.click();await page.keyboard.press("Control+End");await page.keyboard.type(" LatestAlphaMarker.");
    await page.getByRole("button",{name:"AI Chat",exact:true}).click();const right=page.getByLabel("Page sidebar",{exact:true});await expect(right.getByRole("combobox",{name:"Page chat scope",exact:true})).toContainText("Current Note");
    expect(await app.evaluate(()=>(globalThis as any).writingRequests.length)).toBe(0);
    await right.getByLabel("Chat message").fill("Summarize the carbon policy evidence.");await right.getByRole("button",{name:"Send",exact:true}).click();
    await page.getByRole("tab",{name:/Memo Beta/}).click();await expect(right.getByLabel("Chat message")).toHaveValue("");await right.getByLabel("Chat message").fill("Beta draft kept");
    await expect.poll(async()=>{const r=await page.evaluate(()=>window.notesDesktop.ai!.chats());return r.ok&&r.chats.find(c=>c.contextNoteId==="writing-a")?.messages.at(-1)?.status;},{timeout:60000}).toBe("complete");
    await page.getByRole("tab",{name:/Memo Alpha/}).click();await expect(right.locator('.ai-message-assistant')).toContainText("supported fixture");
    const requests=await app.evaluate(()=>(globalThis as any).writingRequests);expect(JSON.stringify(requests)).toContain("LatestAlphaMarker");expect(JSON.stringify(requests)).not.toContain("Beta energy");
    await page.getByRole("tab",{name:/Memo Beta/}).click();await expect(right.getByLabel("Chat message")).toHaveValue("Beta draft kept");await expect(right.locator('.ai-message')).toHaveCount(0);
    await page.getByRole("tab",{name:/Results page/}).click();
    let count = 0;
    for(const [label,expected]of [["Current page",[f.child.id]],["Current section",[f.section.id,f.child.id]],["Whole Book",Object.values(f.one.book.pages).map(p=>p.noteId)]] as const){
      await right.getByRole("combobox",{name:"Page chat scope",exact:true}).click();await page.getByRole("option",{name:label,exact:true}).click();
      count += 2;
      await right.getByLabel("Chat message").fill("Summarize the methods and results from all selected sources.");await right.getByRole("button",{name:"Send",exact:true}).click();
      await expect.poll(async()=>{const r=await page.evaluate(()=>window.notesDesktop.ai!.chats());const c=r.ok?r.chats.find(c=>c.contextNoteId==="writing-child"):undefined;return c?.messages.length === count ? c.messages.at(-1)?.status : "waiting";},{timeout:60000}).toBe("complete");
      const r=await page.evaluate(()=>window.notesDesktop.ai!.chats());if(!r.ok)throw Error(r.error);const c=r.chats.find(c=>c.contextNoteId==="writing-child")!;expect(new Set(c.messages.at(-1)!.grounding!.sourceIds)).toEqual(new Set(expected.map(id=>`note:${id}`)));
    }
    await page.screenshot({path:info.outputPath("page-chat-scopes.png")});
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(900,650));
    await expect(right.getByLabel("Chat message")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath("page-chat-small-light.png")});
    await app.close();app=await launch(f.root);page=await app.firstWindow();await page.getByRole("main").waitFor();await mock();await page.getByRole("button",{name:"AI Chat",exact:true}).click();await expect(page.locator('.writing-chat:visible .ai-message-assistant')).toHaveCount(3);
    expect(await app.evaluate(()=>(globalThis as any).writingRequests.length)).toBe(0);
  }finally{await app.close().catch(()=>undefined);await cleanup(f.root);}
});
