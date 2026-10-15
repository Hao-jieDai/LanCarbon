// @vitest-environment node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { AIPriceStore, AIUsageStore } from "../electron/ai-usage";
import { AIBalanceStore } from "../electron/ai-balances";
import type { AIUsagePurpose } from "../src/shared/aiUsage";
const roots:string[]=[]; const source={providerId:"siliconflow",providerName:"SiliconFlow",baseUrl:"https://api.siliconflow.cn/v1"};
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),"lancarbon-balances-"));roots.push(root);const prices=new AIPriceStore(path.join(root,"Config")),usage=new AIUsageStore(root,prices),balances=new AIBalanceStore(root,usage);let next=0;
 const start=async(purpose:AIUsagePurpose="chat",target=source)=>{const id=`request-${++next}`;await usage.record({type:"start",request:{...target,id,startedAt:new Date().toISOString(),modelId:`model-${next%2}`,modelName:"Fixture",purpose,attempt:1}});return id;};
 const finish=async(id:string,amount?:number,currency:"CNY"|"USD"="CNY")=>usage.record({type:"finish",id,completedAt:new Date().toISOString(),status:amount===undefined?"error":"complete",usage:amount===undefined?{}:{reportedCost:amount,currency,inputTokens:10,outputTokens:5}});
 const current=async()=> (await balances.list([source],7)).find(value=>value.providerId===source.providerId)!;return{root,prices,usage,balances,start,finish,current};}
afterEach(async()=>{for(const root of roots.splice(0)){const resolved=path.resolve(root);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("lancarbon-balances-"))await fs.rm(resolved,{recursive:true,force:true,maxRetries:5});}});
it("keeps the entered balance unchanged, subtracts only new costs, and resets after a top-up without deleting history",async()=>{const f=await fixture();await f.finish(await f.start(),3);await f.balances.save({...source,amount:50,currency:"CNY"});expect((await f.current()).remaining).toBe(50);await f.finish(await f.start(),3);expect((await f.current()).remaining).toBe(47);await f.balances.save({...source,amount:67,currency:"CNY"});expect((await f.current()).remaining).toBe(67);await f.finish(await f.start(),1);expect((await f.current()).remaining).toBe(66);expect((await f.usage.query()).summary.requests).toBe(3);});
it("combines chat, tests, translation and all models and counts a request finishing after calibration",async()=>{const f=await fixture(),pending=await f.start();await f.balances.save({...source,amount:10,currency:"CNY"});await f.finish(pending,1);for(const purpose of ["test","translation"] as const)await f.finish(await f.start(purpose),2);expect((await f.current()).remaining).toBe(5);expect((await f.current()).low).toBe(false);});
it("separates endpoints and sources and converts only incremental mixed-currency costs",async()=>{const f=await fixture(),other={...source,baseUrl:"https://api.siliconflow.com/v1"};await f.finish(await f.start(),4,"USD");await f.balances.save({...source,amount:20,currency:"USD"});await f.finish(await f.start(),1,"USD");await f.finish(await f.start(),7,"CNY");await f.finish(await f.start("chat",other),100,"USD");expect((await f.current()).remaining).toBe(18);});
it("uses all records beyond request pagination and retains estimates when model prices are removed",async()=>{const f=await fixture();await f.balances.save({...source,amount:50,currency:"CNY"});for(let i=0;i<15;i++)await f.finish(await f.start(),1);expect((await f.usage.query()).records).toHaveLength(10);expect((await f.current()).remaining).toBe(35);await f.prices.retain([]);expect((await f.current()).remaining).toBe(35);});
it("preserves unknown fees, zero-cost calls and negative estimates across offline restart",async()=>{const f=await fixture();await f.balances.save({...source,amount:1,currency:"CNY"});await f.finish(await f.start(),0);await f.finish(await f.start());await f.finish(await f.start(),2);const value=(await new AIBalanceStore(f.root,new AIUsageStore(f.root,f.prices)).list([source],7))[0];expect(value).toMatchObject({remaining:-1,low:true,unknownRequests:1});await f.balances.remove(source);expect((await f.current()).checkpoint).toBeUndefined();expect((await f.usage.query()).summary.requests).toBe(3);});
it("rejects invalid balance values and preserves malformed files",async()=>{const f=await fixture();await expect(f.balances.save({...source,amount:NaN,currency:"CNY"})).rejects.toThrow();await expect(f.balances.save({...source,amount:-1,currency:"CNY"})).rejects.toThrow();await f.balances.save({...source,amount:0,currency:"CNY"});const file=path.join(f.root,"Research/Usage/balances.json");await fs.writeFile(file,"malformed");await expect(f.balances.list([source],7)).rejects.toThrow();expect(await fs.readFile(file,"utf8")).toBe("malformed");});

const translation={providerId:"translation-siliconflow",providerName:"SiliconFlow",baseUrl:source.baseUrl,usage:"translation" as const};
it("uses strict currency thresholds regardless of exchange rate",async()=>{
 const f=await fixture();
 for(const [currency,amount,low] of [["CNY",5,false],["CNY",4.999,true],["USD",2,false],["USD",1.999,true]] as const){await f.balances.save({...source,amount,currency});expect((await f.current()).low).toBe(low);}
 const value=(await f.balances.list([source],1))[0];expect(value.low).toBe(true);
});
it("Unlimited persists without estimates or alerts while preserving metered tokens and costs",async()=>{
 const f=await fixture();await f.balances.save({...source,mode:"unlimited",amount:0,currency:"CNY"});await f.finish(await f.start(),8);
 const value=(await new AIBalanceStore(f.root,f.usage).list([source],7))[0];expect(value.checkpoint?.mode).toBe("unlimited");expect(value.remaining).toBeUndefined();expect(value.low).toBe(false);expect((await f.usage.query()).summary.requests).toBe(1);expect((await f.usage.allRecords())[0].cost?.amount).toBe(8);
 await f.balances.save({...source,amount:20,currency:"CNY",mode:"limited"});expect((await f.current()).remaining).toBe(20);
});
it("does not infer shared accounts from platform names or URLs, but merges selected connections without adding balances or charging past usage",async()=>{
 const f=await fixture();await f.finish(await f.start(),3);await f.finish(await f.start("translation",translation),4);await f.balances.save({...source,amount:50,currency:"CNY"});await f.balances.save({...translation,amount:60,currency:"CNY"});
 let cards=await f.balances.list([source,translation],7);expect(cards).toHaveLength(2);const initial=cards.find(card=>card.providerId===source.providerId)!;
 await f.balances.save({...source,accountId:initial.accountId,accountName:"Shared account",sources:[source,translation],amount:20,currency:"CNY"},[source,translation]);
 cards=await f.balances.list([source,translation],7);expect(cards).toHaveLength(1);expect(cards[0]).toMatchObject({providerName:"Shared account",remaining:20});
 await f.finish(await f.start(),1);await f.finish(await f.start("translation",translation),2);cards=await f.balances.list([source,translation],7);expect(cards[0].remaining).toBe(17);expect((await f.usage.query()).summary.requests).toBe(4);
});
it("includes a translation request that finishes after grouping and persists shared membership on restart and Stop tracking",async()=>{
 const f=await fixture(),pending=await f.start("translation",translation);await f.balances.save({...source,sources:[source,translation],amount:20,currency:"CNY"});await f.finish(pending,2);
 const store=new AIBalanceStore(f.root,f.usage);let cards=await store.list([source,translation],7);expect(cards).toHaveLength(1);expect(cards[0].remaining).toBe(18);await store.remove(cards[0]);cards=await store.list([source,translation],7);expect(cards).toHaveLength(1);expect(cards[0].sources).toHaveLength(2);expect(cards[0].checkpoint).toBeUndefined();expect((await f.usage.query()).summary.requests).toBe(1);
});
it("splits connections and invalidates affected baselines without moving historical charges",async()=>{
 const f=await fixture(),other={...source,providerId:"others",providerName:"Other"};await f.balances.save({...source,sources:[source,translation],amount:20,currency:"CNY"});await f.finish(await f.start(),1);await f.finish(await f.start("translation",translation),2);
 let cards=await f.balances.list([source,translation],7);const id=cards[0].accountId;
 await f.balances.save({...other,accountName:"Translation only",sources:[other,translation],amount:10,currency:"CNY"},[source,translation,other]);cards=await f.balances.list([source,translation,other],7);
 expect(cards).toHaveLength(2);expect(cards.find(card=>card.accountId===id)).toMatchObject({needsCalibration:true,checkpoint:undefined});expect(cards.find(card=>card.providerName==="Translation only")?.remaining).toBe(10);expect((await f.usage.query()).summary.requests).toBe(2);
 const original=cards.find(card=>card.accountId===id)!;await f.balances.save({...source,accountId:id,amount:30,currency:"CNY"});await f.finish(await f.start(),2);cards=await f.balances.list([source,translation,other],7);expect(cards.find(card=>card.accountId===id)?.remaining).toBe(28);expect(cards.find(card=>card.providerName==="Translation only")?.remaining).toBe(10);
});
it("releases the original first connection without duplicating account IDs and permits reusing it",async()=>{
 const f=await fixture();await f.balances.save({...source,sources:[source,translation],amount:20,currency:"CNY"});const first=(await f.balances.list([source,translation],7))[0];await f.balances.save({...translation,accountId:first.accountId,sources:[translation],amount:15,currency:"CNY"});
 let cards=await f.balances.list([source,translation],7);expect(new Set(cards.map(card=>card.accountId)).size).toBe(2);const separate=cards.find(card=>card.providerId===source.providerId)!;await f.balances.save({...source,accountId:separate.accountId,amount:5,currency:"CNY"},[source,translation]);cards=await f.balances.list([source,translation],7);expect(cards).toHaveLength(2);expect(new Set(cards.map(card=>card.accountId)).size).toBe(2);
});
it("reads legacy checkpoints without modifying bytes and preserves the calibration when saving another account",async()=>{
 const f=await fixture();await f.finish(await f.start(),3);await fs.mkdir(path.join(f.root,"Research/Usage"),{recursive:true});const file=path.join(f.root,"Research/Usage/balances.json"),legacy=JSON.stringify({version:1,balances:[{...source,amount:50,currency:"CNY",calibratedAt:new Date().toISOString(),spent:{CNY:3,USD:0}}]});await fs.writeFile(file,legacy);
 expect((await f.current()).remaining).toBe(50);expect(await fs.readFile(file,"utf8")).toBe(legacy);await f.balances.save({...translation,mode:"unlimited",amount:0,currency:"CNY"});expect((await f.current()).remaining).toBe(50);expect(JSON.parse(await fs.readFile(file,"utf8")).version).toBe(2);await f.finish(await f.start(),1);expect((await f.current()).remaining).toBe(49);
});
it("rejects duplicate or unconfigured connections, stale account IDs and corrupt group data without overwriting",async()=>{
 const f=await fixture();await f.balances.save({...source,amount:20,currency:"CNY"});const file=path.join(f.root,"Research/Usage/balances.json"),before=await fs.readFile(file,"utf8");
 await expect(f.balances.save({...source,sources:[source,source],amount:1,currency:"CNY"})).rejects.toThrow();await expect(f.balances.save({...source,sources:[source,translation],amount:1,currency:"CNY"},[source])).rejects.toThrow();await expect(f.balances.save({...source,accountId:"account-stale",amount:1,currency:"CNY"})).rejects.toThrow();expect(await fs.readFile(file,"utf8")).toBe(before);
 const corrupt=JSON.parse(before);corrupt.balances.push({...corrupt.balances[0],id:"account-duplicate"});await fs.writeFile(file,JSON.stringify(corrupt));await expect(f.balances.list([source],7)).rejects.toThrow();expect(await fs.readFile(file,"utf8")).toBe(JSON.stringify(corrupt));
});
