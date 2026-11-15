import {loadRuntime} from './runtime-paths.ts';
import {createDesktopChat,desktopIdentity} from './desktop-chat.ts';
import {wechatMode,windowsPreflight,installWindowsConfig} from './windows-wechat.ts';
import {spawn} from 'node:child_process';
import {Weixin} from './weixin.ts';
import {createChannelHome} from './channel-home.ts';
import {QqSetup} from './qq-setup.ts';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import '@deepseek-ai/dsh-agent-preset';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import * as world from '../vendor/dsh-world/lib/index.js';
import { apply as biliApply, Config as biliConfig } from '../vendor/dsh-bilibili/lib/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store, type Companion } from './store.ts';
import { Scheduler, type Task } from './scheduler.ts';
import { Emotion } from './emotion.ts';
import { Memory } from './memory.ts';
import { metered } from './meter.ts';
import { registerConsole } from './routes.ts';
import { parsePreset } from './yaml.ts';
export const name='dsh-companion-coordinator';
export const inject=['agents','sessions','sessionPersistence','llm','agentPresets','tools'];
export const Config=z.object({timeZone:z.string().default('Asia/Shanghai')});
export async function apply(ctx:Context, config:{timeZone:string}) {
  const home=resolveDshHome(),program=dirname(dirname(fileURLToPath(import.meta.url))),data=join(home,'companion');
  const runtime=loadRuntime(data);
  const store=new Store(join(data,'host.sqlite'),config.timeZone), emotion=new Emotion(store,program,join(data,'agents'),runtime.python), memory=new Memory(store,home);
  const lives=new Map<string,any>(), controls=new Map<string,any>(), mounted=new Set<string>(), faults=new Map<string,string>();
  const moduleSync=new Map<string,Set<()=>Promise<void>>>();
  const background=new Map<string,any>();
  const desktops=new Map<string,ReturnType<typeof createDesktopChat>>();
  const mounts=new Map<string,{scope:any;unpreset:()=>any}>(),weixins=new Map<string,Weixin>();
  const qqSetup=new QqSetup(data,runtime);ctx.effect(()=>()=>qqSetup.stop());
  const scheduler=new Scheduler(store,async(task:Task,actual:string)=>{
    const life=lives.get(task.agent); if(!life)throw Error('角色生活线尚未启动');
    const agent=await life.home();
    if(agent.status==='running')throw Error('用户对话/当前活动进行中，稍后重试');
    background.set(task.agent,agent);
    try{agent.steer(createUserMessage({source:{kind:'dsh-world-life'},content:[{type:'text',text:`事项 ${task.id}（${task.kind}）：${task.note}\n计划时间：${task.at}；实际唤起：${actual}。离线期间未执行。回顾、日记、自述、兴趣和情绪整理的时机由你决定；用 companion 工具保存成果与后续安排。`}]}));
      try{await ctx.sessions.flush(agent.session);}catch(e){throw Object.assign(new Error('事项已送入会话，持久化待核对'),{uncertain:true,cause:e});}
      await agent.whenIdle();
    }finally{background.delete(task.agent);}
  });
  const platformFile=(id:string)=>join(home,'worlds',id,'platform-options.json');
  const platformOptions=(id:string)=>existsSync(platformFile(id))?JSON.parse(readFileSync(platformFile(id),'utf8')):{};
  const mode=(id:string)=>wechatMode(platformOptions(id).wechatMode);
  const nativeCheck=(id:string)=>windowsPreflight(platformOptions(id).wechatAdapterConfig,runtime.python,join(program,'vendor','dsh-world','src','ecosystem','wechat','windows','engine','bridge.cpp'));
  const wechatStatus=(id:string)=>{const a=store.agent(id),selected=mode(id);if(selected==='ilink')return {...(weixins.get(id)?.snapshot()??{status:'closed'}),mode:selected,enabled:a.config.modules.wechat};
    const check=nativeCheck(id);if(!check.ready)return {...check,mode:selected,enabled:a.config.modules.wechat,configFile:platformOptions(id).wechatAdapterConfig??''};
    if(!a.config.modules.wechat)return {mode:selected,enabled:false,status:'closed',configFile:platformOptions(id).wechatAdapterConfig};
    if(a.paused)return {mode:selected,enabled:true,status:'ready',configFile:platformOptions(id).wechatAdapterConfig};
    const native=controls.get(id)?.wechatStatus?.();const contacted=native?.lastContactAt&&Date.now()-Date.parse(native.lastContactAt)<30000;
    return {mode:selected,enabled:true,status:contacted&&native.account!=='offline'?'connected':native?.adapter?.needsHuman?'needs_review':native?.adapter?.error?'error':'connecting',...(native?.adapter?.error?{error:native.adapter.error}:{}),configFile:platformOptions(id).wechatAdapterConfig};
  };
  const mount=async(a:Companion)=>{
    if(mounted.has(a.id))return;
    const document=await ctx.agentPresets.readDocument(a.basePreset);
    const plugins=parsePreset(document.content);
    const unpreset=await ctx.agentPresets.register({id:a.preset,name:a.name,plugins});ctx.effect(()=>unpreset);
    const dir=join(home,'worlds',a.id);mkdirSync(dir,{recursive:true});
    if(!existsSync(join(dir,'world-prompt.md')))writeFileSync(join(dir,'world-prompt.md'),readFileSync(join(program,'templates','world-prompt.md'),'utf8'));
    if(!existsSync(join(dir,'world.json')))writeFileSync(join(dir,'world.json'),JSON.stringify({running:!a.paused,wechatEnabled:a.config.modules.wechat,qqEnabled:a.config.modules.qq}));
    const powerFile=join(dir,'world.json');const savedPower=JSON.parse(readFileSync(powerFile,'utf8'));writeFileSync(powerFile,JSON.stringify({...savedPower,wechatEnabled:mode(a.id)==='windows'&&a.config.modules.wechat}));
    const platformFile=join(dir,'platform-options.json');
    const platform=existsSync(platformFile)?JSON.parse(readFileSync(platformFile,'utf8')):{};
    const worldConfig=world.Config({worldId:a.id,agentPreset:a.preset,timeZone:config.timeZone,life:true,toast:true,archiveScope:'workspace',companionName:a.name,bridge:false,wechat:mode(a.id)==='windows',qqNative:{...qqSetup.connection(),...platform.qqNative,enabled:true},...(platform.wechatAdapterConfig?{wechatAdapter:{python:runtime.python,config:platform.wechatAdapterConfig}}:{})} as never);
    worldConfig.companion={routePrefix:`/roleplay/${a.id}`,includesSession:(id:string)=>store.owner(id)===a.id,includesHistory:(id:string)=>store.owner(id)===a.id||(existsSync(join(dir,'imported-sources.json'))&&JSON.parse(readFileSync(join(dir,'imported-sources.json'),'utf8')).includes(id)),modules:(patch:{qq?:boolean;wechat?:boolean})=>{const current=store.agent(a.id);const modules={...current.config.modules,...(patch.qq===undefined?{}:{qq:patch.qq})};if(JSON.stringify(modules)!==JSON.stringify(current.config.modules))store.update(a.id,current.version,{config:{...current.config,modules}},'world-console');},recentChars:()=>store.agent(a.id).config.recentChars,ready:(life:any)=>lives.set(a.id,life),controls:(actions:any)=>controls.set(a.id,actions),power:(running:boolean)=>{const current=store.agent(a.id);store.update(a.id,current.version,{paused:!running},'world-console');scheduler.arm();},plan:(input:{at?:string;after_minutes?:number},note:string)=>JSON.stringify(scheduler.add(a.id,{...input,note})),check:()=>JSON.stringify(scheduler.list(a.id)),cancel:()=>{const pending=scheduler.list(a.id).filter(t=>t.status==='pending'&&t.kind==='activity').at(-1);return pending?JSON.stringify(scheduler.change(a.id,pending.id,{status:'cancelled'})):'没有待取消的普通活动；提醒仍保留';}};
    const scope=ctx.plugin({name:`companion-world-${a.id}`,inject:world.inject,apply:async scope=>world.apply(scope,worldConfig)});mounts.set(a.id,{scope,unpreset});
    const channel=createChannelHome({ctx,home:async()=>{const life=lives.get(a.id);if(!life)throw Error('请先启动角色');return life.home();}});
    const desktop=createDesktopChat({worldDir:dir,enabled:()=>{const current=store.agent(a.id);return !current.paused&&!current.deletedAt;},ask:text=>channel.ask(text,desktopIdentity(a.id)),log:error=>ctx.logger.error(error)});
    desktops.set(a.id,desktop);desktop.start();ctx.effect(()=>()=>desktop.stop());
    const wx=new Weixin(dir,store,a.id,'qrcode',(text,identity)=>channel.ask(text,identity),()=>{const current=store.agent(a.id);return !current.paused&&!current.deletedAt;},fetch,()=>channel.stop());
    weixins.set(a.id,wx);ctx.effect(()=>()=>{wx.stop();channel.stop();});if(a.config.modules.wechat&&mode(a.id)==='ilink')void wx.enable();
    if(a.config.emotion)try{await emotion.enable(a.id,a.config.resumeEmotion==='freeze');}catch(e){faults.set(a.id,String(e));}
    mounted.add(a.id);if(a.config.modules.qq)void qqSetup.enable().catch(e=>faults.set(a.id,String(e)));scheduler.arm();
  };
  const create=async(name:string,base='standard',copy?:string)=>{const a=store.create(name,base,copy);await mount(a);return a;};
  const update=async(id:string,version:number,patch:Partial<Pick<Companion,'name'|'paused'|'config'>>,actor:string)=>{
    const before=store.agent(id),after=store.update(id,version,patch,actor);
    if(!before.config.emotion&&after.config.emotion)await emotion.enable(id,after.config.resumeEmotion==='freeze');
    const control=controls.get(id);if(control)await control.setModules({qq:after.config.modules.qq,...(mode(id)==='windows'?{wechat:after.config.modules.wechat}:{})});
    if(before.config.modules.wechat!==after.config.modules.wechat){if(after.config.modules.wechat&&mode(id)==='ilink')await weixins.get(id)?.enable();else weixins.get(id)?.stop();}
    for(const sync of moduleSync.get(id)??[])await sync();
    scheduler.arm();return after;
  };
  const remove=async(id:string,version:number)=>{
    const a=store.agent(id);if(a.version!==version)throw Error('角色已更新，请刷新');
    for(const agent of ctx.agents.list())if(agent.session.header.agentPreset===a.preset){agent.cancel({kind:'hook',reason:'用户删除角色'});await agent.whenIdle();}
    desktops.get(id)?.stop();desktops.delete(id);await controls.get(id)?.stop();await weixins.get(id)?.shutdown();store.deleteAgent(id,store.agent(id).version);scheduler.arm();
    const record=mounts.get(id);if(record){await record.scope.dispose();await record.unpreset();mounts.delete(id);}controls.delete(id);lives.delete(id);weixins.delete(id);mounted.delete(id);faults.delete(id);return {ok:true};
  };
  const restoreAgent=async(id:string)=>{const a=store.restoreAgent(id);await mount(a);return a;};
  const platform=async(id:string,kind:string,enabled:boolean)=>{
    const a=store.agent(id);if(a.deletedAt)throw Error('角色已删除');if(!['wechat','qq'].includes(kind))throw Error('未知平台');
    if(kind==='wechat'&&enabled&&mode(id)==='windows'){const check=nativeCheck(id);if(!check.ready)throw Error(check.error??'Windows 微信尚未准备好');}
    if(kind==='qq'&&enabled){const other=store.list().find(a=>a.id!==id&&a.config.modules.qq);if(other)throw Error('当前独立 QQ 已连接到其他角色，请先关闭那一角色的 QQ');await qqSetup.enable();}
    const after=await update(id,a.version,{config:{...a.config,modules:{...a.config.modules,[kind]:enabled}}},'user:platform');
    if(kind==='qq'&&!enabled&&!store.list().some(a=>a.config.modules.qq))qqSetup.stop();
    if(kind==='wechat'&&enabled&&mode(id)==='ilink'&&!weixins.get(id)?.snapshot().enabled)await weixins.get(id)?.enable();
    return {agent:after,connection:kind==='wechat'?wechatStatus(id):await qqSetup.status()};
  };
  const remount=async(id:string)=>{desktops.get(id)?.stop();desktops.delete(id);await weixins.get(id)?.shutdown();const record=mounts.get(id);if(record){await record.scope.dispose();await record.unpreset();}mounts.delete(id);mounted.delete(id);controls.delete(id);lives.delete(id);weixins.delete(id);await mount(store.agent(id));};
  const selectWechatMode=async(id:string,value:unknown)=>{const selected=wechatMode(value),a=store.agent(id);if(mode(id)===selected)return wechatStatus(id);if(!a.paused)throw Error('请先停止角色，再切换微信方式');await update(id,a.version,{config:{...a.config,modules:{...a.config.modules,wechat:false}}},'user:wechat-mode');const old=platformOptions(id);writeFileSync(platformFile(id),JSON.stringify({...old,version:(old.version??0)+1,wechatMode:selected},null,2));await remount(id);return wechatStatus(id);};
  const configureWindows=async(id:string,file:string)=>{const a=store.agent(id);if(!a.paused||a.config.modules.wechat)throw Error('请先停止角色并关闭微信接入，再修改连接配置');const dest=join(data,'platforms','wechat',id,'config.json');installWindowsConfig(file,dest,join(home,'worlds',id,'wechat.json'),join(data,'platforms','wechat','engine'));const old=platformOptions(id);writeFileSync(platformFile(id),JSON.stringify({...old,version:(old.version??0)+1,wechatAdapterConfig:dest},null,2));await remount(id);return wechatStatus(id);};
  const openWindowsWechat=(id:string)=>{store.agent(id);if(mode(id)!=='windows')throw Error('请先选择 Windows 微信');const exe=runtime.wechat && existsSync(runtime.wechat) ? runtime.wechat : undefined;if(!exe)throw Error('未找到 Windows 微信客户端');const child=spawn(exe,[],{windowsHide:false,detached:true,stdio:'ignore'});child.on('error',e=>faults.set(id,String(e)));child.unref();return {opened:true};};
  ctx.on('llm/stream',async function*(request,next){
    const owner=request.sessionId&&store.owner(request.sessionId);if(owner&&(store.agent(owner).paused||store.agent(owner).deletedAt))throw Error('当前 agent 已暂停');
    yield* metered(store,ctx,request,next);
  });
  ctx.on('agent/request',async(payload,next)=>{const request=await next(),id=store.owner(payload.agent.id);return id?{...request,maxTokens:Math.min(request.maxTokens??Infinity,store.agent(id).config.maxOutputTokens)}:request;});
  const output={schema:{type:'string' as const},render:(_args:unknown,value:string)=>[{type:'text' as const,text:value}]};
  const attached=new WeakSet<object>();
  const attach=async(agent:any)=>{
    const a=store.list().find(a=>a.preset===agent.session.header.agentPreset);if(!a||attached.has(agent))return;
    store.bind(agent.id,a.id);attached.add(agent);
    const tool=(name:string,description:string,execute:(arg:any)=>Promise<unknown>|unknown)=>{const dispose=agent.ctx.tools.register(defineTool({name,description,parameters:{input:{type:'string',required:true}},output,execute:async({input})=>JSON.stringify(await execute(JSON.parse(input)))}));ctx.effect(()=>dispose);};
    tool('companion_config','input JSON: {op:get|update|history|restore,version,config}. 普通详细参数可自主修改，update 提交完整 config；没有额度写入能力。',async p=>{
      if(p.op==='history')return store.history(a.id);if(p.op==='get')return store.agent(a.id);
      if(p.op==='restore'){const history=store.history(a.id).find(h=>h.id===p.id);if(!history)throw Error('历史不存在');return update(a.id,p.version,{config:JSON.parse(String(history.before)).config},'ai:restore');}
      if(p.op!=='update')throw Error('未知操作');return update(a.id,p.version,{config:p.config},'ai');
    });
    tool('companion_agents','input JSON: {op:create,name,basePreset?,copyConfigFrom?} 或 {op:self}。新角色经历为空，复制仅复制配置。',p=>p.op==='create'?create(p.name,p.basePreset??a.basePreset,p.copyConfigFrom):store.agent(a.id));
    tool('companion_tasks','input JSON: {op:list|add|change,id?,at?,after_minutes?,silenceMinutes?,note?,kind?:activity|reminder|review,status?:pending|paused|cancelled}。多事项独立保存；可自行安排总结与提醒。',p=>{
      if(p.op==='list')return scheduler.list(a.id);if(p.op==='add')return scheduler.add(a.id,p);if(p.op==='change'){if(p.status&&!['pending','paused','cancelled'].includes(p.status))throw Error('无效任务状态');return scheduler.change(a.id,p.id,{...(p.at?{at:p.at}:{}),...(p.note?{note:p.note}:{}),...(p.status?{status:p.status}:{})});}throw Error('未知操作');
    });
    tool('companion_memory','input JSON: {op:search,query,limit?} 按原文线索找回含来源ID的冷存；{op:notes}；{op:write,kind:summary|observation|interest|open_loop|external,text,sources:[],id?,version?}。外部内容与共同经历分开，派生记忆保留来源。',p=>p.op==='search'?memory.archive(a.id,p.query,p.limit):p.op==='write'?memory.note(a.id,p.kind,p.text,p.sources,p.id,p.version):memory.notes(a.id));
    tool('companion_self','input JSON: {op:get} 或 {op:write,text,version,sources:[]}。版本使用 get 的摘要值；回顾过期时禁止覆盖新自述。',p=>p.op==='write'?memory.revise(a.id,p.text,p.version,p.sources):memory.self(a.id));
    tool('companion_platform','input JSON: {op:get} 或 {op:update,version,qqNative?:{wsUrl,accessToken,allowPrivate,allowGroups,...},wechatAdapterConfig?:string}。用户授权保存本地平台配置，不要求登录、收发或测试客户端。连接参数在下次插件重载生效；开关用 companion_config。',p=>{
      const file=join(home,'worlds',a.id,'platform-options.json'),old=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:0};if(p.op==='get')return old;
      if(p.op!=='update'||p.version!==old.version)throw Error('平台配置版本冲突');
      world.Config({worldId:a.id,agentPreset:a.preset,timeZone:config.timeZone,qqNative:p.qqNative} as never);
      if(p.wechatAdapterConfig!==undefined&&typeof p.wechatAdapterConfig!=='string')throw Error('适配器配置须为文件路径');
      const next={...old,version:old.version+1,qqNative:p.qqNative??old.qqNative,wechatAdapterConfig:p.wechatAdapterConfig??old.wechatAdapterConfig,effective:'next-plugin-load'};writeFileSync(file,JSON.stringify(next,null,2));
      const redact=(value:any)=>({...value,qqNative:{...value.qqNative,accessToken:value.qqNative?.accessToken?'[redacted]':undefined}});
      store.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(),a.id,new Date().toISOString(),'ai:platform;effective=next-plugin-load',JSON.stringify(redact(old)),JSON.stringify(redact(next)));return {version:next.version,effective:next.effective};
    });
    tool('companion_emotion','input JSON: {op:summary} 或 {op:submit,sourceId,pleasure,arousal,dominance,subject:relationship|self|mixed,eventType,trustEvidence?}。适时整理即可；重复 sourceId 不重复结算。',async p=>{
      if(p.op==='summary')return emotion.summary(a.id);const source=memory.source(a.id,p.sourceId);if(!source)throw Error('必须引用本 agent 已归档真实经历');
      const receipt=store.db.prepare('SELECT body FROM receipts WHERE id=? AND agent=?').get(`emotion:${p.sourceId}`,a.id);if(receipt)return JSON.parse(String(receipt.body));
      const result=await emotion.submit(a.id,p.sourceId,source.occurredAt,source.content,p,p.subject,p.eventType,p.trustEvidence);store.db.prepare('INSERT OR REPLACE INTO receipts VALUES(?,?,?)').run(`emotion:${p.sourceId}`,a.id,JSON.stringify(result));return result;
    });
    // Dynamic system section: disabled Emotion Engine contributes nothing, including old summaries.
    let emotional='';
    if(store.agent(a.id).config.emotion)try{emotional=JSON.stringify(await emotion.summary(a.id));}catch(e){faults.set(a.id,String(e));}
    const unprompt=agent.ctx.systemPrompt.section({name:'companion-continuity',order:55,interpolate:false,text:()=>{
      const current=store.agent(a.id);return `你是独立长期角色 ${current.name}。日程、回顾、兴趣、自述与普通参数可自主安排和修订，无需逐项审批。需要时调用 companion 工具。用户只填写名字和你是谁；性格、表达方式、愿景与其他细节由你依据真实经历自行决定和修订。所有模型请求共用用户设置的人民币预算，不能提高限额。\n${memory.context(a.id)}\n${current.config.emotion?emotional:''}`;
    }});
    ctx.effect(()=>unprompt);
    const unbudget=agent.ctx.systemPrompt.context({name:'companion-budget',order:10,required:true,interpolate:false,text:()=>`今日共享模型预算余额 ¥${(Math.max(0,store.moneyAvailable())/1e8).toFixed(4)}；预算不足时收尾或推迟事项。按实际输入、缓存和输出结算，不预占额度。`});ctx.effect(()=>unbudget);
    // Scope registration preserves native Bilibili schemas/vision integration; no global name collision.
    let biliScope:any;
    const biliOptions={timeoutMs:30000,nodePath:runtime.node,ffmpegPath:runtime.ffmpeg,ffprobePath:runtime.ffprobe,mediaCacheRoot:join(data,'cache','bilibili')};
    const sync=async()=>{const enabled=store.agent(a.id).config.modules.bilibili;if(enabled&&!biliScope)biliScope=agent.ctx.plugin({name:'companion-bilibili',apply:(scope:Context)=>biliApply(scope,biliConfig(biliOptions))});if(!enabled&&biliScope){await biliScope.dispose();biliScope=undefined;}};
    if(!moduleSync.has(a.id))moduleSync.set(a.id,new Set());moduleSync.get(a.id)!.add(sync);await sync();
    ctx.effect(()=>async()=>{moduleSync.get(a.id)?.delete(sync);await biliScope?.dispose();});
    const unsearch=agent.ctx.on('tools/pre-execute',async(exec:any,next:any)=>{if(['web_search','web_fetch'].includes(exec.name)&&!store.agent(a.id).config.modules.search)throw Error('当前 agent 的联网搜索模块已关闭');return next();});ctx.effect(()=>unsearch);
    const unstep=agent.ctx.on('agent/pre-step',async(payload:any,next:any)=>{if(store.agent(a.id).config.emotion)try{emotional=JSON.stringify(await emotion.summary(a.id));}catch(e){faults.set(a.id,String(e));}return next();});ctx.effect(()=>unstep);
  };
  ctx.on('agent/created',async({agent})=>{await attach(agent);return undefined;});
  ctx.on('session/event',(session,event)=>{const id=store.owner(session.id);if(id&&event.type==='user/message'&&event.data.source.kind==='user'){scheduler.spoke(id);const busy=background.get(id);if(busy&&busy.id!==session.id)busy.cancel({kind:'hook',reason:'用户在另一窗口回来，优先接话'});}});
  ctx.inject(['webServer','sessionController'],web=>registerConsole(web,{store,scheduler,memory,emotion,create,update,mount,remove,restoreAgent,platform,wechatStatus,selectWechatMode,configureWindows,openWindowsWechat,weixins,qqSetup,faults,lives,home}));
  let retry:NodeJS.Timeout|undefined,closed=false;
  const restore=async()=>{
    for(const a of store.list())if(!mounted.has(a.id))try{await mount(a);faults.delete(a.id);}catch(e){faults.set(a.id,String(e));}
    for(const agent of ctx.agents.list())await attach(agent);
    if(!closed&&store.list().some(a=>!mounted.has(a.id)))retry=setTimeout(()=>void restore(),500);
    scheduler.arm();
  };
  retry=setTimeout(()=>void restore(),0);
  ctx.effect(()=>async()=>{closed=true;clearTimeout(retry);scheduler.stop();for(const agent of background.values())agent.cancel({kind:'hook',reason:'协调插件停止'});await scheduler.settled();await Promise.all([...weixins.values()].map(wx=>wx.shutdown()));store.close();});
}

