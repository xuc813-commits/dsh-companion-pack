import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Store} from '../lib/store.js';
import {Scheduler} from '../lib/scheduler.js';
import {Memory} from '../lib/memory.js';
import {Emotion} from '../lib/emotion.js';
import {metered,reservationFor} from '../lib/meter.js';
import {exportAgent,importAgent} from '../lib/snapshot.js';
import {DatabaseSync} from 'node:sqlite';
const scratch=resolve(process.env.ROLEPLAY_TEST_ROOT??'../../work/tests');mkdirSync(scratch,{recursive:true});
function fixture(){const home=mkdtempSync(join(scratch,'case-'));return {home,store:new Store(join(home,'companion','host.sqlite'))};}
test('new and configuration-copy agents keep independent identity, blank state and immutable session ownership',()=>{
 const {store}=fixture(),a=store.create('A'),b=store.create('B','standard',a.id);assert.notEqual(a.id,b.id);assert.notEqual(a.preset,b.preset);store.bind('one',a.id);assert.throws(()=>store.bind('one',b.id));assert.equal(store.owner('one'),a.id);assert.deepEqual(store.history(b.id),[]);store.close();
});
test('optimistic configuration version rejects stale review; quota cannot enter agent config',()=>{
 const {store}=fixture(),a=store.create('A');store.update(a.id,1,{config:{...a.config,emotion:true}},'ai');assert.throws(()=>store.update(a.id,1,{name:'old'},'ai'),/版本/);assert.throws(()=>store.update(a.id,2,{config:{...a.config,dailyLimit:999999}},'ai'),/额度/);assert.equal(store.limit(),0);store.close();
});
test('atomic reservations, cache-inclusive usage, idempotent settlement, unknown consumption and restart retain shared quota',async()=>{
 const {home,store}=fixture(),a=store.create('A'),b=store.create('B');store.setLimitByUser(100);store.reserve('a',a.id,70);assert.throws(()=>store.reserve('b',b.id,40),/额度/);store.settle('a',40);store.settle('a',0);assert.equal(store.available(),60);store.reserve('b',b.id,50);store.settle('b');store.close();const reopen=new Store(join(home,'companion','host.sqlite'));assert.equal(reopen.available(),10);assert.throws(()=>reopen.reserve('c',a.id,11));reopen.close();
});
test('host model boundary accounts auxiliary requests, cached input and abort without usage',async()=>{
 const {store}=fixture();store.setLimitByUser(1000);const ctx={llm:{resolveModelInfo:async()=>({context:{contextWindow:200}})}};
 const req={provider:'test',model:'test',messages:[],purpose:'compaction'};
 for await(const _ of metered(store,ctx,req,async function*(){yield {type:'usage',usage:{inputTokens:10,cacheReadTokens:20,cacheWriteTokens:5,outputTokens:15}};})){}
 assert.equal(store.available(),950);
 await assert.rejects(async()=>{for await(const _ of metered(store,ctx,req,async function*(){throw Error('cancelled');})){};},/cancelled/);
 assert.equal(store.available(),750);assert.equal(store.usage()[0].agent,'host');store.close();
});
test('known text requests reserve UTF-8 envelope and capped output; media and unknown adapters keep full capacity',()=>{
 const request={provider:'deepseek-account',model:'deepseek-flash',messages:[{role:'user',content:[{type:'text',text:'你好，UTF-8'}]}],maxTokens:256};const n=reservationFor(request,1048576);assert.ok(n>256&&n<1048576);assert.equal(reservationFor({...request,provider:'unknown'},1048576),1048576);assert.equal(reservationFor({...request,messages:[{role:'user',content:[{type:'image',image:{id:'local'}}]}]},1048576),1048576);
});
test('multiple reminders survive ordinary activity, silence resets only silence tasks, restart restores queue',async()=>{
 const {home,store}=fixture(),a=store.create('A');store.update(a.id,1,{paused:false},'user');store.setLimitByUser(100);const sent=[];const scheduler=new Scheduler(store,async t=>sent.push(t.id));
 const now=Date.now(),r=scheduler.add(a.id,{after_minutes:5,note:'五点前提醒',kind:'reminder'},now),activity=scheduler.add(a.id,{after_minutes:1,note:'浏览'},now),silence=scheduler.add(a.id,{silenceMinutes:3,note:'回顾',kind:'review'},now);
 scheduler.spoke(a.id,now+60000);assert.equal(scheduler.list(a.id).find(t=>t.id===r.id).at,r.at);assert.equal(Date.parse(scheduler.list(a.id).find(t=>t.id===silence.id).at),now+240000);
 await scheduler.tick(now+120000);assert.deepEqual(sent,[activity.id]);scheduler.stop();store.close();const reopen=new Store(join(home,'companion','host.sqlite'));const restored=new Scheduler(reopen,async()=>{});assert.equal(restored.list(a.id).find(t=>t.id===r.id).status,'pending');restored.stop();reopen.close();
});
test('background activities run one at a time across agents and ambiguous delivery is not retried blindly',async()=>{
 const {store}=fixture(),a=store.create('A'),b=store.create('B');store.update(a.id,1,{paused:false},'user');store.update(b.id,1,{paused:false},'user');store.setLimitByUser(1000);let release;const gate=new Promise(r=>release=r),started=[];
 const scheduler=new Scheduler(store,async t=>{started.push(t.agent);if(t.agent===a.id)await gate;else throw Object.assign(Error('flush uncertain'),{uncertain:true});});const now=Date.now();scheduler.add(a.id,{after_minutes:1,note:'A'},now);const bt=scheduler.add(b.id,{after_minutes:1,note:'B'},now);const running=scheduler.tick(now+61000);await Promise.resolve();assert.deepEqual(started,[a.id]);await scheduler.tick(now+61000);assert.equal(started.length,1);release();await running;assert.deepEqual(started,[a.id,b.id]);assert.equal(scheduler.list(b.id).find(t=>t.id===bt.id).status,'uncertain');scheduler.stop();store.close();
});
test('self-description and notes reject stale writes, cross-agent sources never resolve',()=>{
 const {home,store}=fixture(),a=store.create('A'),b=store.create('B'),memory=new Memory(store,home),self=memory.self(a.id);
 memory.revise(a.id,'我喜欢星空',self.version,[]);assert.throws(()=>memory.revise(a.id,'旧总结',self.version,[]),/更新/);assert.equal(memory.self(b.id).text,'');const n=memory.note(a.id,'interest','天文',[]);assert.throws(()=>memory.note(b.id,'summary','复制误认',[n.id]),/来源/);store.close();
});
test('actual bundled Python/MCP engine binds per-agent state, disabled engine never creates state',async()=>{
 const {home,store}=fixture(),a=store.create('on'),b=store.create('off');store.update(a.id,1,{config:{...a.config,emotion:true}},'user');const engine=new Emotion(store,resolve('.'),join(home,'companion','agents'));
 await engine.enable(a.id,true);const summary=await engine.summary(a.id);assert.ok(summary);await assert.rejects(engine.summary(b.id),/关闭/);assert.equal(existsSync(join(home,'companion','agents',b.id,'emotion.json')),false);
 const file=join(home,'companion','agents',a.id,'emotion.json'),state=JSON.parse(readFileSync(file));state.trust=0.2;state.companion_trust_settled_at='2020-01-01T00:00:00Z';writeFileSync(file,JSON.stringify(state));await engine.request(a.id,{operation:'decay'});assert.equal(JSON.parse(readFileSync(file)).trust,0.2);store.close();
});
test('emotion semantic event is persisted once and repeated recall does not reapply its impact',async()=>{
 const {home,store}=fixture(),a=store.create('emotion');store.update(a.id,1,{config:{...a.config,emotion:true}},'user');const engine=new Emotion(store,resolve('.'),join(home,'companion','agents'));await engine.enable(a.id,true);
 const args=[a.id,'real-experience-1','2026-10-29T00:00:00Z','谢谢你一直陪着我，我希望我们更亲近',{pleasure:0.6,arousal:0.3,dominance:0.5},'relationship','intimacy'];
 const first=await engine.submit(...args);const file=join(home,'companion','agents',a.id,'emotion.json'),before=JSON.parse(readFileSync(file));await engine.submit(...args);const after=JSON.parse(readFileSync(file));
 assert.equal(before.emotion.pleasure,0.6);assert.deepEqual(after.trust_settlements,before.trust_settlements);assert.equal(after.trust,before.trust);assert.equal(after.emotion_log.filter(e=>e.event_id==='real-experience-1').length,before.emotion_log.filter(e=>e.event_id==='real-experience-1').length);assert.ok(first);store.close();
});
test('provider refusal before dispatch releases reservation while an unknown abort keeps it',async()=>{
 const {store}=fixture();store.setLimitByUser(1000);const ctx={llm:{resolveModelInfo:async()=>({context:{contextWindow:200}})}};
 await assert.rejects(async()=>{for await(const _ of metered(store,ctx,{provider:'test',model:'test',messages:[]},async function*(){throw Object.assign(Error('no local key'),{code:'MISSING_CREDENTIAL'});})){};});assert.equal(store.available(),1000);store.close();
});
test('paused snapshot migrates local original text, self and tasks; imports retain quota and reject modified data',async()=>{
 const {home,store}=fixture(),a=store.create('original');store.setLimitByUser(500);store.reserve('actual',a.id,100);store.settle('actual',80);const memory=new Memory(store,home);memory.revise(a.id,'持续的我',memory.self(a.id).version,[]);
 const dir=join(home,'worlds',a.id);mkdirSync(dir,{recursive:true});const db=new DatabaseSync(join(dir,'archive.sqlite'));db.exec('CREATE TABLE records(recordId TEXT PRIMARY KEY,body TEXT,occurredAt TEXT); CREATE TABLE progress(id TEXT);CREATE TABLE channelSessions(id TEXT)');db.prepare('INSERT INTO records VALUES(?,?,?)').run('origin-1',JSON.stringify({recordId:'origin-1',worldId:a.id,content:'共同经历',occurredAt:'2026-10-29T00:00:00Z'}),'2026-10-29');db.close();
 const snapshot=join(home,'export');await exportAgent(store,home,a.id,snapshot);const imported=importAgent(store,home,snapshot,'copy');assert.notEqual(imported.id,a.id);assert.equal(memory.self(imported.id).text,'持续的我');assert.equal(memory.archive(imported.id,'共同经历')[0].originalWorldId,a.id);const limit=store.limit(),available=store.available();importAgent(store,home,snapshot,'copy2');assert.equal(store.limit(),limit);assert.equal(store.available(),available);writeFileSync(join(snapshot,'world','room','我是谁.md'),'corrupt');assert.throws(()=>importAgent(store,home,snapshot,'bad'),/摘要/);store.close();
});
