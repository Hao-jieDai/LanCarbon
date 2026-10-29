import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AIChatStore } from "../../electron/ai-storage";
import { createNote } from "../../src/shared/notes";

test("compact Chat layouts keep controls usable and separate page chats that can be continued and deleted in Workshop", async ({}, info) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-chat-layout-")), data = path.join(root, "Data");
  await fs.mkdir(data);
  const note = createNote({id:"layout-page",title:"Layout memo",content:"Personal writing is preserved."});
  await fs.writeFile(path.join(data,"notes.json"),JSON.stringify({version:2,notes:[note],books:[]}));
  const store = new AIChatStore(data);
  const workshop = await store.create("others", "fixture"), pageChat = await store.create("others", "fixture", note.id), orphan = await store.create("others","fixture","deleted-page");
  for (const [chat,title] of [[workshop,"Independent discussion"],[pageChat,"Page discussion"],[orphan,"Deleted-page discussion"]] as const) {
    await store.update(chat.id, saved => { saved.title=title; saved.messages=[{id:"message-"+chat.id,role:"user",status:"complete",content:title+" saved text.",createdAt:new Date().toISOString()}]; });
  }
  const app = await electron.launch({...(process.env.E2E_EXECUTABLE ? {executablePath:process.env.E2E_EXECUTABLE}:{}),args:["--in-process-gpu","--disable-gpu","--no-sandbox",...(process.env.E2E_EXECUTABLE?[]:[path.resolve(".")])],env:{...process.env,LANCARBON_ROOT:root,E2E_USER_DATA_DIR:""}});
  try {
    await app.evaluate(({net}) => { (globalThis as any).layoutCalls=[]; net.fetch=async (_url,init) => { (globalThis as any).layoutCalls.push(JSON.parse(init!.body as string)); return new Response(JSON.stringify({choices:[{message:{content:"Continued page conversation."}}]}),{headers:{"Content-Type":"application/json"}}); }; });
    const page = await app.firstWindow(); await page.getByRole("main").waitFor();
    await page.evaluate(async id => { localStorage.setItem("lancarbon-navigation-v1",JSON.stringify({mode:"notes",noteId:id,writingTabs:[id]})); const r=await window.notesDesktop.ai!.saveProvider({id:"others",kind:"others",name:"Long provider display name",baseUrl:"https://example.invalid/v1",apiKey:"fixture-private-key",models:[{id:"fixture",name:"A deliberately long chat model name",purpose:"chat"}],defaultModel:"fixture"});if(!r.ok)throw Error(r.error); },note.id); await page.reload();
    await page.getByRole("button",{name:"AI Chat",exact:true}).click();
    const right=page.getByLabel("Page sidebar",{exact:true}); await expect(right.getByText("Page discussion saved text.")).toBeVisible();
    const checkLayout=async (host: ReturnType<typeof page.locator>) => {
      const input=host.getByLabel("Chat message"), card=host.locator(".ai-composer-card");
      await input.evaluate(element => (element as HTMLTextAreaElement).blur());
      const idleBorder=await card.evaluate(element=>getComputedStyle(element).borderColor);
      await input.click();
      expect(await input.evaluate(element=>getComputedStyle(element).outlineStyle)).toBe("none");
      expect(await input.evaluate(element=>getComputedStyle(element).boxShadow)).toBe("none");
      expect(await card.evaluate(element=>getComputedStyle(element).borderColor)).toBe(idleBorder);
      const result=await host.evaluate(element => {
        const rect=(selector:string)=>element.querySelector(selector)!.getBoundingClientRect();
        const hint=element.querySelector(".ai-composer-shortcut")!, h=hint.getBoundingClientRect();
        return {hintLines:h.height/parseFloat(getComputedStyle(hint).lineHeight),hintFits:hint.scrollWidth<=hint.clientWidth,toolsAboveInput:rect(".ai-composer-tools").bottom<=rect(".ai-composer-card").top,modelBelowText:rect(".ai-composer-model").top>=rect("textarea").bottom,threadRatio:rect(".ai-thread").height/element.getBoundingClientRect().height,overflow:element.scrollWidth>element.clientWidth};
      });
      expect(result.hintLines).toBeCloseTo(1); expect(result).toMatchObject({hintFits:true,toolsAboveInput:true,modelBelowText:true,overflow:false}); expect(result.threadRatio).toBeGreaterThan(.4);
    };
    for (const [width,height,theme] of [[1280,900,"dark"],[900,650,"light"],[720,650,"dark"]] as const) {
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(size[0],size[1]),[width,height]);
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      await expect(right.getByLabel("Chat message")).toBeInViewport(); await checkLayout(right);
      await right.getByRole("button",{name:"Chat history",exact:true}).click();
      await expect(page.getByRole("menuitem",{name:"Page discussion",exact:true})).toBeVisible();
      await expect(page.getByRole("menuitem",{name:"Independent discussion",exact:true})).toHaveCount(0);
      await right.getByRole("button",{name:"Chat history",exact:true}).press("Escape");
      await right.getByLabel("Chat message").click();
      await page.screenshot({path:info.outputPath(`sidebar-${width}-${theme}.png`)});
    }
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,900));
    await page.getByRole("button",{name:"Open workspace list",exact:true}).click();
    await page.getByRole("button",{name:"Workshop",exact:true}).click(); await page.getByRole("button",{name:"Chat",exact:true}).click();
    const main=page.getByLabel("Workshop workspace",{exact:true});
    await expect(main.getByText("Independent discussion saved text.")).toBeVisible(); await checkLayout(main);
    const views=main.getByRole("group",{name:"Chat views"});
    await expect(views.getByRole("button",{name:"Workshop chats",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(views.getByRole("button",{name:"Page chats",exact:true})).toBeInViewport();
    expect(await views.evaluate(element=>element.closest(".editor-toolbar")?.querySelector(".foundation-breadcrumb")?.textContent)).toBe("Workshop / Chat");
    await main.getByLabel("Chat message").fill("Keep the independent draft");
    await main.getByRole("button",{name:"Page chats",exact:true}).click();
    await expect(views.getByRole("button",{name:"Page chats",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(main.getByLabel("Chat message")).toHaveValue("");
    await main.getByRole("button",{name:"Chat history",exact:true}).click(); await page.getByRole("menuitem",{name:"Page discussion",exact:true}).click();
    expect(await app.evaluate(()=>(globalThis as any).layoutCalls.length)).toBe(0);
    await main.getByLabel("Chat message").fill("Continue this page discussion"); await main.getByRole("button",{name:"Send",exact:true}).click();
    await expect(main.getByText("Continued page conversation.")).toBeVisible();
    let saved=await page.evaluate(()=>window.notesDesktop.ai!.chats()); if(!saved.ok)throw Error(saved.error);
    expect(saved.chats.find(c=>c.id===pageChat.id)?.contextNoteId).toBe(note.id);
    await main.getByRole("button",{name:"More chat actions",exact:true}).click(); await page.getByRole("menuitem",{name:"Delete chat",exact:true}).click();
    await page.getByRole("button",{name:"Delete conversation",exact:true}).click();
    await expect(main.getByText("Deleted-page discussion saved text.")).toBeVisible();
    await main.getByRole("button",{name:"Workshop chats",exact:true}).click(); await expect(main.getByLabel("Chat message")).toHaveValue("Keep the independent draft");
    await page.screenshot({path:info.outputPath("workshop-chat.png")});
    saved=await page.evaluate(()=>window.notesDesktop.ai!.chats()); if(!saved.ok)throw Error(saved.error);
    expect(saved.chats.map(c=>c.id).sort()).toEqual([workshop.id,orphan.id].sort());
    await page.getByRole("tab",{name:/Layout memo/}).click(); await page.getByRole("button",{name:"AI Chat",exact:true}).click();
    await expect(right.getByText("Page discussion saved text.")).toHaveCount(0);
    expect(await app.evaluate(()=>(globalThis as any).layoutCalls.length)).toBe(1);
  } finally {
    await app.close().catch(()=>undefined);
    if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith("lancarbon-chat-layout-"))throw Error("Unsafe cleanup");
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
