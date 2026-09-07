import { _electron as electron, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBook, addNoteToBook } from "../../src/shared/books";
import { createNote } from "../../src/shared/notes";

test("images, screenshot paste, file drop, reuse, restart and portable export", async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),"lancarbon-asset-e2e-"));
  const output = path.join(directory,"output"); await fs.mkdir(output);
  const png = await fs.readFile(path.resolve("build/icon.png"));
  const imageFile = path.join(directory,"中文 图.png"), documentFile = path.join(directory,"document.txt");
  await fs.writeFile(imageFile,png); await fs.writeFile(documentFile,"A portable attachment");
  const original = createBook("Asset Book"), note = createNote({title:"Asset sample",content:"## Images and attachments\n\n"});
  const book = addNoteToBook(original.book,note);
  Object.values(book.pages).find(p=>p.noteId===note.id)!.exportPath="chapters/nested/sample.md";
  await fs.writeFile(path.join(directory,"notes.json"),JSON.stringify({version:2,books:[book],notes:[original.homeNote,note]}));
  const launch = () => electron.launch({
    ...(process.env.E2E_EXECUTABLE ? {executablePath:process.env.E2E_EXECUTABLE} : {}),
    args:["--in-process-gpu","--disable-gpu","--no-sandbox",...(process.env.E2E_EXECUTABLE ? [] : [path.resolve(__dirname,"../..")])],
    env:{...process.env,E2E_USER_DATA_DIR:directory,E2E_EXPORT_DIR:output}
  });
  let app=await launch();
  try {
    let page=await app.firstWindow();
    await page.getByRole("button",{name:"Jupyter Book",exact:true}).click();
    await page.getByRole("button",{name:"Asset sample",exact:true}).click();
    await page.getByLabel("Note content").click(); await page.getByLabel("Note content").press("Control+End");
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[file]})) as typeof dialog.showOpenDialog;},imageFile);
    await page.getByRole("button",{name:"Insert image",exact:true}).click();
    await expect(page.getByLabel("Note content")).toContainText("中文 图.png");
    await page.getByLabel("Note content").press("End"); await page.getByLabel("Note content").press("Enter");
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[file]})) as typeof dialog.showOpenDialog;},documentFile);
    await page.getByRole("button",{name:"Attach file",exact:true}).click();
    await expect(page.getByLabel("Note content")).toContainText("document.txt");
    // Exercise clipboard and drop DOM paths, with real browser File objects.
    await page.getByLabel("Note content").press("End"); await page.getByLabel("Note content").press("Enter");
    await page.getByLabel("Note content").evaluate((element,data)=>{
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)); const transfer=new DataTransfer(); transfer.items.add(new File([bytes],"Screenshot.png",{type:"image/png"}));
      element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:transfer,bubbles:true,cancelable:true}));
    },png.toString("base64"));
    await expect(page.getByRole("button",{name:"Insert image",exact:true})).toBeEnabled();
    await page.getByLabel("Note content").press("End"); await page.getByLabel("Note content").press("Enter");
    await page.getByLabel("Note content").evaluate(element=>{
      const transfer=new DataTransfer(); transfer.items.add(new File(["Dropped content"],"dropped.txt",{type:"text/plain"}));
      element.dispatchEvent(new DragEvent("drop",{dataTransfer:transfer,bubbles:true,cancelable:true}));
    });
    await expect(page.getByLabel("Note content")).toContainText("dropped.txt");
    await page.getByRole("button",{name:"Resources",exact:true}).click();
    const resource=page.locator(".asset-row").filter({hasText:"中文 图.png"});
    await expect(resource).toHaveCount(1);
    await expect(resource).toContainText("2 references");
    await resource.getByRole("button",{name:"Insert",exact:true}).click();
    await page.getByRole("button",{name:"Preview",exact:true}).click();
    await expect(page.locator(".markdown-preview img")).toHaveCount(3);
    await expect.poll(()=>page.locator(".markdown-preview img").first().evaluate((n:HTMLImageElement)=>n.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".preview-diagnostics")).toHaveCount(0);
    for (const mode of ["Light","Dark"]) {
      await page.locator(".theme-option").filter({hasText:mode}).click();
      await page.screenshot({path:info.outputPath(`assets-${mode}.png`)});
    }
    const copy=path.join(directory,"saved.txt");
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=(async()=>({canceled:false,filePath:file})) as typeof dialog.showSaveDialog;},copy);
    await page.getByRole("link",{name:"document.txt",exact:true}).click();
    await expect.poll(()=>fs.readFile(copy,"utf8").catch(()=>"")).toBe("A portable attachment");
    await expect(page.getByText("All changes saved",{exact:true})).toBeVisible();
    await fs.rename(imageFile,path.join(directory,"moved.png")); await fs.unlink(documentFile);
    await app.close(); app=await launch(); page=await app.firstWindow();
    await page.getByRole("button",{name:"Jupyter Book",exact:true}).click();
    await page.getByRole("button",{name:"Asset sample",exact:true}).click();
    await page.getByRole("button",{name:"Preview",exact:true}).click();
    await expect(page.locator(".markdown-preview img")).toHaveCount(3);
    await page.getByRole("button",{name:"Export",exact:true}).click();
    await expect(page.locator(".toast")).toContainText("Exported to");
    const catalog=JSON.parse(await fs.readFile(path.join(directory,"assets.json"),"utf8"));
    expect(catalog.assets).toHaveLength(3);
    const md=await fs.readFile(path.join(output,"chapters/nested/sample.md"),"utf8");
    expect(md).toContain("../../assets/");
    // Keep an exported fixture for official CLI validation, outside the test data.
    await fs.cp(output,info.outputPath("export"),{recursive:true});
  } finally { await app.close().catch(()=>undefined); await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:500}); }
});
