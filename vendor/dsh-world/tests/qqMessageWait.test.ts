import assert from 'node:assert/strict';
import test from 'node:test';
import {SessionId} from '@deepseek-ai/dsh-session';
import {hostFixture,textResponse} from './hostFixture.ts';
import {createQuietBatch} from '../src/ecosystem/qq-native/quiet-batch.ts';
import {createQqNativeModule,type QqNativeConfig,type QqTransportOptions} from '../src/ecosystem/qq-native/index.ts';
function clock(){let now=0,id=0;const tasks=new Map<number,{at:number;fn:()=>void}>();return {set(fn:()=>void,ms:number){const key=++id;tasks.set(key,{at:now+ms,fn});return key;},clear(handle:unknown){tasks.delete(handle as number);},advance(ms:number){const end=now+ms;for(;;){const entry=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;tasks.delete(entry[0]);entry[1].fn();}now=end;},size:()=>tasks.size};}
const micro=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('first and second messages reset a five-second trailing window',async()=>{
 const timers=clock(),sent:string[][]=[];const batch=createQuietBatch<string>(items=>{sent.push([...items]);},{timers});
 batch.add('one','first');timers.advance(4999);await micro();assert.equal(sent.length,0);
 batch.add('one','second');timers.advance(4999);await micro();assert.equal(sent.length,0);
 timers.advance(1);await micro();assert.deepEqual(sent,[['first','second']]);batch.stop();
});
test('third and later messages reset a fifteen-second window, with no forced early flush',async()=>{
 const timers=clock(),sent:string[][]=[];const batch=createQuietBatch<string>(items=>{sent.push([...items]);},{timers});
 batch.add('one','a');timers.advance(4000);batch.add('one','b');timers.advance(4000);batch.add('one','c');
 timers.advance(14999);await micro();assert.equal(sent.length,0);batch.add('one','d');timers.advance(14999);await micro();assert.equal(sent.length,0);
 timers.advance(1);await micro();assert.deepEqual(sent,[['a','b','c','d']]);
 batch.add('one','new burst');timers.advance(4999);await micro();assert.equal(sent.length,1);timers.advance(1);await micro();assert.deepEqual(sent[1],['new burst']);batch.stop();
});
test('different senders are independent; clearing and stopping suppress pending callbacks',async()=>{
 const timers=clock(),sent:string[][]=[];const batch=createQuietBatch<string>(items=>{sent.push([...items]);},{timers});
 batch.add('alice','a');timers.advance(4000);batch.add('bob','b');timers.advance(1000);await micro();assert.deepEqual(sent,[['a']]);batch.clear();timers.advance(20000);await micro();assert.equal(sent.length,1);
 batch.add('alice','old');timers.advance(5000);batch.stop();await micro();assert.equal(sent.length,1);assert.equal(timers.size(),0);
});

const config:QqNativeConfig={enabled:true,wsUrl:'ws://127.0.0.1:1',accessToken:'',allowPrivate:['alice','bob'],allowGroups:['group'],autoReply:true,contextMessages:3,bindHomeSession:'none',groupTrigger:'mention',groupKeywords:[],bridge:{port:0,token:'',title:'',contextMessages:3}};
const incoming=(id:string,text:string,userId='alice')=>({kind:'private',groupId:null,userId,messageId:id,selfId:'bot',text});
async function fixture(t:Parameters<typeof hostFixture>[0]){
 const requests:string[]=[],sent:Array<{to:string;text:string}>=[],timers=clock();let wire:QqTransportOptions|undefined;
 const {ctx,cleanup}=await hostFixture(t,request=>{requests.push(request.messages.flatMap(m=>m.content.flatMap(b=>b.type==='text'?[b.text]:[])).join('\n'));return textResponse('一次回复');});
 const agent=(await ctx.agents.create({sessionId:SessionId('home'),agentOptions:{provider:'test',model:'test'}})).agent;
 const module=createQqNativeModule({ctx,home:async()=>agent,config:()=>config,messageTimers:timers,logger:{info(){},warn(){},error(){}},transport:options=>{wire=options;return {async start(){},async stop(){},getState:()=> 'online',async sendPrivate(to,text){sent.push({to,text});return {messageId:String(sent.length)};},async sendGroup(to,text){sent.push({to,text});return {messageId:String(sent.length)};}};}});
 module.start();cleanup.push(module.stop);return {module,timers,requests,sent,emit:(m:unknown)=>wire?.onPrivateMessage?.(m),emitGroup:(m:unknown)=>wire?.onGroupMessage?.(m)};
}
async function settled(){await new Promise(resolve=>setTimeout(resolve,400));}

test('three QQ clauses create one real agent turn, duplicate/blocked/echo messages never reset the timer',async t=>{
 const f=await fixture(t);f.emit(incoming('1','看这个视频'));f.timers.advance(4000);f.emit(incoming('2','主要看他的观点'));f.timers.advance(4000);f.emit(incoming('3','不用总结剧情'));
 f.timers.advance(14999);await settled();assert.equal(f.requests.length,0);assert.equal(f.sent.length,0);
 f.emit(incoming('3','重复消息'));f.emit(incoming('blocked','别的账号','blocked'));f.emit(incoming('echo','自己的回声','bot'));
 f.timers.advance(1);await settled();assert.equal(f.requests.length,1);assert.match(f.requests[0],/看这个视频\n主要看他的观点\n不用总结剧情/);assert.deepEqual(f.sent,[{to:'alice',text:'一次回复'}]);
 f.emit(incoming('4','下一句话'));f.timers.advance(5000);await settled();assert.equal(f.requests.length,2);
});
test('group continuation joins only the originally addressed speaker; other group members stay separate',async t=>{
 const f=await fixture(t),group=(id:string,text:string,userId:string,mention=false)=>({...incoming(id,text,userId),kind:'group',groupId:'group',segments:mention?[{type:'at',data:{qq:'bot'}}]:[]});
 f.emitGroup(group('g1','@bot 帮我看一下','alice',true));f.timers.advance(4000);f.emitGroup(group('g2','还有这一点','alice'));f.emitGroup(group('g3','旁人的聊天','bob'));
 f.timers.advance(5000);await settled();assert.equal(f.requests.length,1);assert.match(f.requests[0],/@bot 帮我看一下\n还有这一点/);assert.deepEqual(f.sent,[{to:'group',text:'一次回复'}]);
});
test('turning off automatic replies or stopping the module discards the waiting burst without model work',async t=>{
 const f=await fixture(t);f.emit(incoming('1','待处理'));f.module.setAutoReply(false);f.timers.advance(20000);await settled();assert.equal(f.requests.length,0);
 f.module.setAutoReply(true);f.emit(incoming('2','停止前的消息'));f.module.stop();f.timers.advance(20000);await settled();assert.equal(f.requests.length,0);assert.equal(f.sent.length,0);
});
