import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../lib/store.js';
import {metered,reservationFor} from '../lib/meter.js';
const root=process.env.ROLEPLAY_TEST_ROOT;mkdirSync(root,{recursive:true});
function fixture(){return new Store(join(mkdtempSync(join(root,'budget-')),'host.sqlite'));}
const request={provider:'deepseek-account',model:'deepseek-flash',maxTokens:8192,messages:[{role:'user',content:[{type:'image',attachment:{id:'frame',width:1009,height:620}}]}]};
const projection={imageRequestPricing:()=>({priceImages:images=>images.map(b=>({visualTokens:b.offloaded?0:384,text:'image handle'}))}),fileRequestText:()=> 'file handle'};

test('Shanghai budget rolls at 01:00 across ordinary days, month and year boundaries',()=>{
 const s=fixture();
 for(const [at,day,next] of [
 ['2026-10-29T16:00:00Z','2026-10-29','2026-10-29T17:00:00.000Z'],
 ['2026-10-29T16:59:59.999Z','2026-10-29','2026-10-29T17:00:00.000Z'],
 ['2026-10-29T17:00:00Z','2026-10-30','2026-10-30T17:00:00.000Z'],
 ['2026-10-31T16:30:00Z','2026-10-31','2026-10-31T17:00:00.000Z'],
 ['2026-12-31T16:30:00Z','2026-12-31','2026-12-31T17:00:00.000Z']
 ]){const now=new Date(at);assert.equal(s.day(now),day);assert.equal(s.nextResetAt(now),next);}s.close();
});

test('rollover replenishes exactly once without deleting history; a late settlement stays on its original day',()=>{
 const s=fixture(),original=s.day.bind(s);let now=new Date('2026-10-29T16:30:00Z');s.day=(date=now)=>original(date);s.setBudgetByUser(1);
 s.reserveMoney('before','role',100,50000000,{});assert.equal(s.moneyAvailable(),1e8);
 now=new Date('2026-10-29T16:59:59.999Z');assert.equal(s.moneyAvailable(),1e8);
 now=new Date('2026-10-29T17:00:00Z');assert.equal(s.moneyAvailable(),1e8);s.settleMoney('before',20,10000000);assert.equal(s.moneyAvailable(),1e8);assert.equal(s.moneyAvailable('2026-10-29'),90000000);
 s.reserveMoney('after','role',100,20000000,{});const state=s.budgetState(now);assert.equal(state.available,1);assert.equal(state.reserved,0);assert.equal(state.budgetDay,'2026-10-30');assert.equal(state.resetAt,'2026-10-30T17:00:00.000Z');assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM costs').get().n,2);s.close();
});

test('route image pricing replaces the full-context hold, preserving each repeated image and offload occurrence',()=>{
 const capacity=1048576,n=reservationFor(request,capacity,undefined,projection);assert.ok(n>8192&&n<15000);assert.equal(reservationFor(request,capacity),capacity);
 const repeated={...request,messages:[{role:'user',content:[request.messages[0].content[0],request.messages[0].content[0]]}]};assert.ok(reservationFor(repeated,capacity,undefined,projection)>n);
 const offloaded={...request,messages:[{role:'user',content:[{...request.messages[0].content[0],offloaded:true}]}]};assert.equal(n-reservationFor(offloaded,capacity,undefined,projection),384);
 assert.equal(reservationFor({...request,provider:'unknown'},capacity,undefined,projection),capacity);
 const file={...request,messages:[{role:'user',content:[{type:'file',attachment:{id:'file'}}]}]};assert.ok(reservationFor(file,capacity,undefined,projection)<15000);assert.equal(reservationFor(file,capacity),capacity);
});

test('image request proceeds with the reported 8.34367884 yuan balance and settles actual usage',async()=>{
 const s=fixture();s.setBudgetByUser(10);s.reserveMoney('old','role',100,165632116,{});s.settleMoney('old',100,165632116);assert.equal(s.moneyAvailable()/1e8,8.34367884);
 const ctx={llm:{...projection,resolveModelInfo:async()=>({context:{contextWindow:1048576},defaultMaxTokens:8192})}};let dispatched=false;
 for await(const _ of metered(s,ctx,request,async function*(){dispatched=true;assert.ok(s.moneyAvailable()/1e8>8);yield {type:'usage',usage:{inputTokens:1500,outputTokens:20}};})){}
 assert.equal(dispatched,true);assert.ok(s.moneyAvailable()/1e8>8);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM costs WHERE status='reserved'").get().n,0);s.close();
});

test('requests with positive remaining budget are never refused for a predicted hold; spent budget blocks only the next request',async()=>{
 const s=fixture();s.setBudgetByUser(.001);const ctx={llm:{...projection,resolveModelInfo:async()=>({context:{contextWindow:1048576}})}};let dispatched=false;
 for await(const _ of metered(s,ctx,request,async function*(){dispatched=true;assert.equal(s.moneyAvailable(),100000);yield {type:'usage',usage:{inputTokens:1000000,outputTokens:1000000}};})){};
 assert.equal(dispatched,true);assert.ok(s.moneyAvailable()<0);
 await assert.rejects(async()=>{for await(const _ of metered(s,ctx,request,async function*(){throw Error('must not dispatch');})){};},/预算已用完.*01:00/);
 s.close();
});

test('legacy stale holds are not actual spend and new unfinished requests never occupy the budget across restart',()=>{
 const s=fixture(),file=s.file;s.setBudgetByUser(10);
 s.db.prepare("INSERT INTO costs VALUES('legacy',?,'role',643891200,NULL,'uncertain','{}')").run(s.day());
 s.db.prepare("INSERT INTO costs VALUES('paid',?,'role',0,233827016,'settled','{}')").run(s.day());
 assert.equal(s.moneyAvailable()/1e8,7.66172984);assert.equal(s.budgetState().usage[0].yuan,2.33827016);assert.equal(s.budgetState().reserved,0);
 s.reserveMoney('new','role',1048576,838860800,{});assert.equal(s.db.prepare("SELECT reserved FROM costs WHERE id='new'").get().reserved,0);s.settleMoney('new');
 assert.equal(s.moneyAvailable()/1e8,7.66172984);s.close();
 const reopened=new Store(file);assert.equal(reopened.moneyAvailable()/1e8,7.66172984);assert.equal(reopened.db.prepare("SELECT reserved FROM costs WHERE id='legacy'").get().reserved,643891200);reopened.close();
});
