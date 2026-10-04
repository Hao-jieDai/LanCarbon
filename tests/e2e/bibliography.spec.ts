import{_electron as electron,expect,test}from"@playwright/test";
import{promises as fs}from"node:fs";import os from"node:os";import path from"node:path";import{promisify}from"node:util";import{execFile}from"node:child_process";
import{createBook}from"../../src/shared/books";
const run=promisify(execFile);
test("imports, validates, previews and strictly builds a Book bibliography",async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"lancarbon-bib-")),output=await fs.mkdtemp(path.join(os.tmpdir(),"lancarbon-bib-export-")),bib=path.join(root,"references.bib");
 await fs.writeFile(bib,'@article{Smith2020, author={Smith, Jane and Wang, Wei}, title={A Climate Study}, year={2020}, journal={Energy Journal}, doi={10.1000/example}}');
 const {book,homeNote}=createBook("Bibliography Book");await fs.writeFile(path.join(root,"notes.json"),JSON.stringify({version:2,books:[book],notes:[homeNote]}));
 const app=await electron.launch({...(process.env.E2E_EXECUTABLE?{executablePath:process.env.E2E_EXECUTABLE}:{}),args:["--in-process-gpu","--disable-gpu","--no-sandbox",...(process.env.E2E_EXECUTABLE?[]:[path.resolve(__dirname,"../..")])],env:{...process.env,E2E_USER_DATA_DIR:root,E2E_EXPORT_DIR:output}});
 try{const page=await app.firstWindow();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[file]}))as typeof dialog.showOpenDialog;},bib);
  await page.getByRole("button",{name:"Books",exact:true}).click();await page.getByRole("button",{name:"Citations",exact:true}).click();await page.getByRole("button",{name:"Import .bib",exact:true}).click();
  await expect(page.getByText("A Climate Study",{exact:true})).toBeVisible();await expect(page.getByText("Book validation passed",{exact:true})).toBeVisible();await page.getByText("A Climate Study",{exact:true}).click();await page.getByLabel("Citation style").selectOption("narrative");await page.getByRole("button",{name:"Insert citation (1)",exact:true}).click();
  await expect(page.getByLabel("Note content")).toContainText("@Smith2020");await page.getByRole("button",{name:"Preview",exact:true}).click();await expect(page.getByLabel("Rendered preview")).toContainText("Smith et al. (2020)");await expect(page.getByLabel("Rendered preview")).toContainText("References");
  await page.getByRole("button",{name:"Export",exact:true}).click();await expect(page.locator(".toast")).toContainText("Exported to");await expect.poll(async()=>fs.readFile(path.join(output,"myst.yml"),"utf8")).toContain("bibliography:");
  await fs.mkdir(path.join(output,"_build"),{recursive:true});await fs.symlink(path.resolve(".builder-cache/phase3-build/_build/templates"),path.join(output,"_build","templates"),"junction");
  await run("jupyter",["book","build","--html","--strict","--ci"],{cwd:output,timeout:120000,windowsHide:true});expect(await fs.stat(path.join(output,"_build","html"))).toBeTruthy();
 }finally{await app.close().catch(()=>undefined);await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:500});await fs.rm(output,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
});
