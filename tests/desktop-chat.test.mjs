import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createDesktopChat,desktopIdentity} from '../lib/desktop-chat.js';
import {speakerIdentity} from '../vendor/dsh-world/lib/ecosystem/shared/identity.js';
import {extractConversationRecords} from '../vendor/dsh-world/lib/archive.js';
const root=process.env.ROLEPLAY_TEST_ROOT;
assert.ok(root);
mkdirSync(root,{recursive:true});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(ask=async()=>({id:'reply-1',text:'看见了'})) {
  const worldDir=mkdtempSync(join(root,'poke-')), dir=join(worldDir,'room','工具');mkdirSync(dir,{recursive:true});
  const poke=join(dir,'poke.txt'),queue=join(dir,'danmaku_queue.txt');
  writeFileSync(poke,'1793763023\n');writeFileSync(queue,'');
  let enabled=true,calls=0;
  const bridge=createDesktopChat({worldDir,enabled:()=>enabled,ask:async text=>{calls++;return ask(text);},log:()=>{}});
  return {worldDir,poke,queue,bridge,setEnabled:v=>enabled=v,calls:()=>calls,push:s=>appendFileSync(poke,s??'1793764989\n'),lines:()=>readFileSync(queue,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
}
test('old pokes are not replayed; a new poke gets a real response through ask',async()=>{
  const f=fixture();f.bridge.poll();await settle();assert.equal(f.calls(),0);
  f.push();f.bridge.poll();await settle();assert.equal(f.calls(),1);assert.equal(f.lines()[0].text,'看见了');assert.equal(f.lines()[0].requestId,'reply-1');
  f.bridge.poll();await settle();assert.equal(f.calls(),1);f.bridge.stop();
});
test('partial lines wait until newline; a rapid burst is coalesced',async()=>{
  const f=fixture();f.push('1793764989');f.bridge.poll();await settle();assert.equal(f.calls(),0);
  f.push('\n1793764989\n1793764989\n');f.bridge.poll();await settle();assert.equal(f.calls(),1);f.bridge.stop();
});
test('new pokes during a response are serialized into one following turn',async()=>{
  let finish;let n=0;
  const f=fixture(()=>++n===1?new Promise(resolve=>finish=resolve):Promise.resolve({id:'two',text:'又拍啦'}));
  f.push();f.bridge.poll();await settle();f.push();f.bridge.poll();f.push();f.bridge.poll();assert.equal(f.calls(),1);
  finish({id:'one',text:'第一句'});await settle();assert.equal(f.calls(),2);assert.deepEqual(f.lines().map(x=>x.text),['第一句','又拍啦']);f.bridge.stop();
});
test('a restart does not repeat a completed request',async()=>{
  const f=fixture();f.push();f.bridge.poll();await settle();f.bridge.stop();
  let calls=0;const next=createDesktopChat({worldDir:f.worldDir,enabled:()=>true,ask:async()=>{calls++;return {id:'x',text:'x'};},log:()=>{}});
  next.poll();await settle();assert.equal(calls,0);assert.equal(f.lines().length,1);next.stop();
});
test('paused roles never invoke the model; next poke after resume works',async()=>{
  const f=fixture();f.setEnabled(false);f.push();f.bridge.poll();await settle();assert.equal(f.calls(),0);assert.match(f.lines()[0].text,/暂停/);
  f.setEnabled(true);f.push();f.bridge.poll();await settle();assert.equal(f.calls(),1);f.bridge.stop();
});
test('failed requests are visible and do not prevent the next poke',async()=>{
  let count=0;const f=fixture(async()=>{if(++count===1)throw Error('offline');return {id:'ok',text:'回来啦'};});
  f.push();f.bridge.poll();await settle();assert.equal(f.bridge.snapshot().phase,'error');
  f.push();f.bridge.poll();await settle();assert.equal(f.lines().at(-1).text,'回来啦');f.bridge.stop();
});
test('stopping during a request prevents stale replies',async()=>{
  let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));f.push();f.bridge.poll();await settle();f.bridge.stop();finish({id:'x',text:'stale'});await settle();assert.equal(f.lines().length,0);
});
test('in-flight requests at restart are not silently repeated',async()=>{
  const f=fixture();writeFileSync(join(f.worldDir,'chatbox-bridge.json'),JSON.stringify({offset:11,pending:true,phase:'answering'}));
  let calls=0;const next=createDesktopChat({worldDir:f.worldDir,enabled:()=>true,ask:async()=>{calls++;return {id:'x',text:'x'};},log:()=>{}});
  next.poll();await settle();assert.equal(calls,0);assert.equal(next.snapshot().phase,'error');next.stop();f.bridge.stop();
});

test('desktop identities pass the actual world archive validation, including the first stored client',()=>{
  const identity=desktopIdentity('world-1');assert.equal(speakerIdentity(identity).speakerId,'desktop:owner');
  const event={type:'user/message',seq:1,time:Date.now(),surfaceOp:'append',data:{id:'poke',source:{kind:'user',identity},content:[{type:'text',text:'拍了一下'}]}};
  const scope={worldId:'world-1',agentPreset:'standard',header:{id:'s',agentPreset:'standard'},inheritedEventCount:0,turn:1};
  assert.equal(extractConversationRecords(event,scope)[0].speakerId,'desktop:owner');
  event.data.source.identity={...identity,speakerId:'owner'};
  assert.equal(extractConversationRecords(event,scope)[0].speakerId,'desktop:owner');
  event.data.source.identity={...identity,channel:'qq',speakerId:'owner'};
  assert.throws(()=>extractConversationRecords(event,scope),/namespace/);
});
