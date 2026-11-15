import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../lib/store.js';
import {Scheduler} from '../lib/scheduler.js';
import {usageCost,priceFor,isPeak,reserveCost} from '../lib/money.js';
import {metered} from '../lib/meter.js';
import {Weixin,incomingText} from '../lib/weixin.js';
const base=process.env.ROLEPLAY_TEST_ROOT;mkdirSync(base,{recursive:true});
const fixture=()=>{const home=mkdtempSync(join(base,'upgrade-'));return {home,store:new Store(join(home,'host.sqlite'))};};
test('recoverable removal preserves session identity, archives, usage and cancels reminders across restart',()=>{
  const {home,store}=fixture(),a=store.create('miku');store.bind('window',a.id);store.setBudgetByUser(1);store.reserveMoney('call',a.id,100,1000,{});store.settleMoney('call',90,900);
  const scheduler=new Scheduler(store,async()=>{});scheduler.add(a.id,{after_minutes:3,note:'reminder'});store.deleteAgent(a.id,1);assert.equal(store.list().length,0);assert.equal(store.list(true).length,1);assert.equal(store.owner('window'),a.id);assert.equal(scheduler.list(a.id)[0].status,'cancelled');assert.equal(store.moneyAvailable(),1e8-900);assert.throws(()=>store.update(a.id,2,{name:'reappear'},'ai'),/删除/);scheduler.stop();store.close();
  const reopened=new Store(join(home,'host.sqlite'));const restored=reopened.restoreAgent(a.id);assert.equal(restored.name,'miku');assert.equal(restored.paused,true);assert.equal(reopened.owner('window'),a.id);assert.equal(reopened.moneyAvailable(),1e8-900);assert.equal(restored.config.modules.qq,false);reopened.close();
});
test('CNY tariff distinguishes cached and uncached input and includes reasoning exactly once; peak and holidays match whale',()=>{
 const p=priceFor('deepseek-account','deepseek-flash');const u={inputTokens:1e6,cacheReadTokens:1e6,outputTokens:1e6,reasoningTokens:500000};
 assert.equal(isPeak(new Date('2026-10-29T02:00:00Z')),true);assert.equal(isPeak(new Date('2026-10-29T12:00:00Z')),false);assert.equal(isPeak(new Date('2026-10-03T02:00:00Z')),false);
 assert.equal(usageCost(u,p,new Date('2026-10-29T12:00:00Z')),502000000);assert.equal(usageCost(u,p,new Date('2026-10-29T02:00:00Z')),1004000000);
 assert.equal(reserveCost(200,50,1000,p),70000);assert.throws(()=>priceFor('other','unknown'),/单价/);
});
test('CNY charges only actual settlements; concurrent and unfinished calls do not reserve money',()=>{
 const {home,store}=fixture(),a=store.create('a'),b=store.create('b');store.setBudgetByUser(.01);store.reserveMoney('one',a.id,100,700000,{});store.reserveMoney('parallel',b.id,100,400000,{});assert.equal(store.moneyAvailable(),1000000);store.settleMoney('one',90,200000);store.settleMoney('one',0,0);assert.equal(store.moneyAvailable(),800000);store.reserveMoney('two',b.id,100,500000,{});store.settleMoney('two');store.close();const reopened=new Store(join(home,'host.sqlite'));assert.equal(reopened.moneyAvailable(),800000);reopened.close();
});
test('model interceptor records a tariff snapshot and money settlement; local rejection releases only its reservation',async()=>{
 const {store}=fixture();store.setBudgetByUser(10);const ctx={llm:{resolveModelInfo:async()=>({context:{contextWindow:1048576},defaultMaxTokens:32})}};
 const req={provider:'deepseek-account',model:'deepseek-flash',maxTokens:32,messages:[]};const usage={inputTokens:12,cacheReadTokens:20,outputTokens:3,reasoningTokens:2};
 for await(const _ of metered(store,ctx,req,async function*(){yield {type:'usage',usage};})){}
 const charged=1e9-store.moneyAvailable();assert.equal(charged,usageCost(usage,priceFor(req.provider,req.model)));assert.ok(store.db.prepare('SELECT pricing FROM costs').get().pricing.includes('DeepSeek'));
 await assert.rejects(async()=>{for await(const _ of metered(store,ctx,req,async function*(){throw Object.assign(Error('no key'),{code:'MISSING_CREDENTIAL'});})){};});assert.equal(1e9-store.moneyAvailable(),charged);store.close();
});
test('official WeChat QR authentication separates public polling from bot credentials; pending messages persist while role paused',async()=>{
 const {home,store}=fixture(),a=store.create('wx');const requests=[];
 const responses=[{qrcode:'opaque',qrcode_img_content:'https://weixin.qq.com/test-login'},{status:'confirmed',bot_token:'secret',ilink_bot_id:'bot',ilink_user_id:'owner',baseurl:'https://ilinkai.weixin.qq.com'},{ret:0,msgs:[{message_id:1,message_type:1,from_user_id:'owner',context_token:'ctx',item_list:[{type:1,text_item:{text:'你好'}}]}],get_updates_buf:'cursor'}];
 const fetcher=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>responses.shift()??{ret:0,msgs:[]}};};
 const wx=new Weixin(home,store,a.id,'D:/dsh/roleplay/platform-deps/node_modules/qrcode',async()=>{throw Error('paused must not call model');},()=>false,fetcher);
 await wx.enable();assert.equal(wx.snapshot().status,'wait');await wx.checkLogin();await new Promise(resolve=>setTimeout(resolve,10));wx.stop();assert.ok(requests[0].options.headers.AuthorizationType);assert.equal(requests[0].options.headers.Authorization,undefined);assert.equal(requests[1].options.headers.Authorization,undefined);assert.equal(requests[2].options.headers.Authorization,'Bearer secret');assert.equal(wx.cursor,'cursor');const saved=JSON.parse(store.db.prepare('SELECT body FROM receipts').get().body);assert.equal(saved.state,'pending');assert.equal(saved.msg.item_list[0].text_item.text,'你好');store.close();
});
test('WeChat rejects token redirection to non-WeChat services and does not expose credentials in UI state',async()=>{
 const {home,store}=fixture(),a=store.create('wx');writeFileSync(join(home,'weixin-ilink.json'),JSON.stringify({token:'secret',baseurl:'https://malicious.example',botId:'bot'}));
 const wx=new Weixin(home,store,a.id,'unused',async()=>({id:'x',text:'x'}),()=>false);assert.equal(wx.auth,undefined);assert.ok(!JSON.stringify(wx.snapshot()).includes('secret'));wx.stop();assert.equal(incomingText({item_list:[{type:3,voice_item:{text:'转写'}}]}),'转写');store.close();
});
