import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Store} from './store.ts';
const DEFAULT_BASE='https://ilinkai.weixin.qq.com';
const VERSION='2.4.8';
function baseUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||!(u.hostname==='weixin.qq.com'||u.hostname.endsWith('.weixin.qq.com')))throw Error('微信返回了未知服务地址');return u.origin;}
function headers(token?:string){return {'content-type':'application/json','AuthorizationType':'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64'),'iLink-App-Id':'bot','iLink-App-ClientVersion':String((2<<16)|(4<<8)|8),...(token?{'Authorization':`Bearer ${token}`}:{})};}
export function incomingText(msg:any){return (msg.item_list??[]).flatMap((i:any)=>i.type===1?[i.text_item?.text??'']:i.type===3&&i.voice_item?.text?[i.voice_item.text]:['[收到媒体消息，当前未读取内容]']).join('\n').trim();}
export class Weixin {
  timer?:NodeJS.Timeout;abort?:AbortController;closed=false;busy=false;loginBusy=false;generation=0;
  state:any={enabled:false,status:'closed'};auth:any;cursor='';qr='';loginBase=DEFAULT_BASE;
  constructor(public dir:string,public store:Store,public id:string,public qrModule:string,private reply:(text:string,identity:any)=>Promise<{id:string;text:string}>,private isRunning:()=>boolean,private fetcher:typeof fetch=fetch,private cancelReply:()=>void=()=>{}){
    mkdirSync(dir,{recursive:true});try{this.auth=JSON.parse(readFileSync(join(dir,'weixin-ilink.json'),'utf8'));baseUrl(this.auth.baseurl);this.state={enabled:false,status:'closed',account:this.auth.botId};}catch{this.auth=undefined;}
    for(const row of store.db.prepare("SELECT id,body FROM receipts WHERE agent=? AND id LIKE 'wx:%'").all(id)){const item=JSON.parse(String(row.body));if(['processing','sending','sending_test'].includes(item.state)){item.state='uncertain';store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),row.id);}}
    try{this.cursor=JSON.parse(readFileSync(join(dir,'weixin-cursor.json'),'utf8')).cursor??'';}catch{}
  }
  snapshot(){return {...this.state,paused:!this.isRunning()};}
  private save(file:string,value:any){const target=join(this.dir,file),tmp=target+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});renameSync(tmp,target);}
  private async api(path:string,data:any,base=DEFAULT_BASE,token?:string,timeout=45000){const signal=AbortSignal.any([AbortSignal.timeout(timeout),...(this.abort?[this.abort.signal]:[])]);const response=await this.fetcher(baseUrl(base)+path,{method:'POST',headers:headers(token),body:JSON.stringify(data),signal,redirect:'error'});if(!response.ok)throw Error(`微信连接失败（${response.status}）`);const json:any=await response.json();if(json.ret&&json.ret!==0||json.errcode&&json.errcode!==0)throw Object.assign(Error(json.errmsg||'微信请求被拒绝'),{code:json.ret||json.errcode});return json;}
  async enable(){this.generation++;this.closed=false;this.abort?.abort();this.abort=new AbortController();this.state={enabled:true,status:this.auth?'connected':'preparing',account:this.auth?.botId};if(this.auth){this.poll();return this.snapshot();}return this.login();}
  async login(){if(this.loginBusy)return this.snapshot();this.loginBusy=true;this.closed=false;this.abort?.abort();this.abort=new AbortController();const generation=++this.generation;
    try{const data=await this.api('/ilink/bot/get_bot_qrcode?bot_type=3',{local_token_list:[]});if(generation!==this.generation)return this.snapshot();this.qr=data.qrcode;this.loginBase=DEFAULT_BASE;if(!this.qr||!data.qrcode_img_content)throw Error('微信未返回登录二维码');const require=createRequire(import.meta.url),qr=require(this.qrModule);const image=await qr.toDataURL(data.qrcode_img_content,{width:280,margin:2});this.state={enabled:true,status:'wait',qrImage:image};this.schedule(()=>this.checkLogin(),100);return this.snapshot();}
    catch(e){if(generation===this.generation&&!this.closed)this.state={enabled:true,status:'error',error:String((e as Error).message)};return this.snapshot();}finally{this.loginBusy=false;}}
  private schedule(fn:()=>unknown,delay=2000){clearTimeout(this.timer);if(!this.closed){this.timer=setTimeout(()=>void fn(),delay);this.timer.unref();}}
  async checkLogin(verifyCode?:string){if(this.closed||!this.qr)return this.snapshot();const generation=this.generation;
    try{const url=baseUrl(this.loginBase)+'/ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(this.qr)+(verifyCode?'&verify_code='+encodeURIComponent(verifyCode):'');const r=await this.fetcher(url,{headers:{'iLink-App-Id':'bot','iLink-App-ClientVersion':String((2<<16)|(4<<8)|8)},signal:AbortSignal.any([AbortSignal.timeout(40000),this.abort!.signal]),redirect:'error'});if(!r.ok)throw Error('微信扫码状态读取失败');const data:any=await r.json();if(this.closed||generation!==this.generation)return this.snapshot();
      if(data.status==='confirmed'){if(!data.bot_token||!data.ilink_bot_id||!data.ilink_user_id)throw Error('微信登录信息不完整');this.auth={token:data.bot_token,baseurl:baseUrl(data.baseurl??DEFAULT_BASE),botId:data.ilink_bot_id,userId:data.ilink_user_id};this.save('weixin-ilink.json',this.auth);this.qr='';this.state={enabled:true,status:'connected',account:this.auth.botId};this.poll();}
      else if(data.status==='scaned_but_redirect'&&data.redirect_host){this.loginBase=baseUrl('https://'+data.redirect_host.replace(/^https?:\/\//,''));this.schedule(()=>this.checkLogin());}
      else {this.state={...this.state,status:data.status??'wait'};if(!['expired','verify_code_blocked','need_verifycode','binded_redirect'].includes(data.status))this.schedule(()=>this.checkLogin());}
    }catch(e){if(!this.closed&&generation===this.generation){this.state={...this.state,error:'微信连接中断，正在重试'};this.schedule(()=>this.checkLogin(),5000);}}
    return this.snapshot();
  }
  async connectionTest(){
    if(!this.auth||this.closed)throw Error('微信尚未连接');
    const candidates=this.store.db.prepare("SELECT id,body FROM receipts WHERE agent=? AND id LIKE 'wx:%'").all(this.id).map(row=>({id:row.id,item:JSON.parse(String(row.body))})).filter(({item})=>item.state==='pending'&&item.msg.from_user_id===this.auth.userId&&incomingText(item.msg)==='连接测试');
    const selected=candidates.at(-1);if(!selected)throw Error('尚未收到连接测试消息，请稍候');
    const item=selected.item;if(!item.msg.context_token)throw Error('测试消息缺少上下文');item.state='sending_test';item.clientId=randomUUID();this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),selected.id);
    try{await this.sendText(item.msg,'微信连接正常，DSH 已收到你的测试消息。',item.clientId);item.state='done';item.testOnly=true;this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),selected.id);return {received:true,sent:true,modelCalls:0};}
    catch(e){item.state='uncertain';this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),selected.id);throw e;}
  }
  async sendText(msg:any,text:string,clientId:string){if(!this.auth||this.closed||msg.from_user_id!==this.auth.userId||!msg.context_token)throw Error('微信回复上下文不可用');return this.api('/ilink/bot/sendmessage',{msg:{from_user_id:'',to_user_id:msg.from_user_id,client_id:clientId,message_type:2,message_state:2,context_token:msg.context_token,item_list:[{type:1,text_item:{text}}]},base_info:{channel_version:VERSION,bot_agent:'DSHRoleplay/0.2.0'}},this.auth.baseurl,this.auth.token);}
  async poll(){if(this.closed||this.busy||!this.auth)return;const generation=this.generation;this.busy=true;
    try{const data=await this.api('/ilink/bot/getupdates',{get_updates_buf:this.cursor,base_info:{channel_version:VERSION,bot_agent:'DSHRoleplay/0.2.0'}},this.auth.baseurl,this.auth.token);if(this.closed)return;this.state={enabled:true,status:'connected',account:this.auth.botId,lastContactAt:new Date().toISOString()};
      // Persist incoming before advancing the opaque cursor, so pauses/crashes do not drop it.
      for(const msg of data.msgs??[]){if(msg.message_type!==1||msg.from_user_id!==this.auth.userId||msg.group_id)continue;const key='wx:'+this.id+':'+String(msg.message_id??msg.client_id??msg.seq);this.store.db.prepare('INSERT OR IGNORE INTO receipts VALUES(?,?,?)').run(key,this.id,JSON.stringify({state:'pending',msg}));}
      if(data.get_updates_buf){this.cursor=data.get_updates_buf;this.save('weixin-cursor.json',{cursor:this.cursor});}
      if(this.isRunning())for(const row of this.store.db.prepare("SELECT id,body FROM receipts WHERE agent=? AND id LIKE 'wx:%'").all(this.id)){const item=JSON.parse(String(row.body));if(item.state!=='pending')continue;const text=incomingText(item.msg);if(!text)continue;
        item.state='processing';this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),row.id);
        try{const response=await this.reply(text,{channel:'wechat-ilink',accountId:this.auth.botId,conversationType:'private',conversationId:item.msg.from_user_id,speakerId:'wechat-ilink:'+item.msg.from_user_id,speakerName:'微信用户'});if(this.closed||generation!==this.generation)throw Error('微信接入已关闭');if(!item.msg.context_token)throw Error('微信消息缺少回复上下文');item.state='sending';item.clientId=randomUUID();this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),row.id);
          await this.sendText(item.msg,response.text,item.clientId);item.state='done';item.replyId=response.id;
        }catch(e){item.state='uncertain';item.error='处理未完成，请核对本条消息';this.state.error=item.error;}this.store.db.prepare('UPDATE receipts SET body=? WHERE id=?').run(JSON.stringify(item),row.id);if(!this.isRunning()||this.closed)break;
      }
    }catch(e){if(!this.closed){this.state={...this.state,status:(e as any).code===-14?'expired':'reconnecting',error:(e as Error).message};if((e as any).code===-14){this.auth=undefined;this.closed=true;}}}finally{this.busy=false;this.schedule(()=>this.poll(),this.state.status==='connected'?200:5000);}
  }
  async shutdown(){this.stop();this.cancelReply();while(this.busy||this.loginBusy)await new Promise(resolve=>setTimeout(resolve,10));}
  stop(){this.closed=true;this.generation++;clearTimeout(this.timer);this.abort?.abort();this.state={enabled:false,status:'closed',account:this.auth?.botId};}
}
