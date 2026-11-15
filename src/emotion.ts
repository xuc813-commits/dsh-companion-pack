import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Store } from './store.ts';
export class Emotion {
  private tails = new Map<string,Promise<unknown>>();
  constructor(public store: Store, public program: string, public data: string, public python = process.env.DSH_COMPANION_PYTHON ?? 'python') {}
  request(id:string, operation:Record<string,unknown>):Promise<any> {
    if(!this.store.agent(id).config.emotion) return Promise.reject(Error('Emotion Engine 已关闭；没有状态读取或更新'));
    const run=async()=>{
      if(!this.store.agent(id).config.emotion) throw Error('Emotion Engine 已关闭');
      return new Promise<any>((resolve,reject)=>{
        const child=spawn(this.python,['-I','-B','-X','utf8',join(this.program,'python','companion_rpc.py'),join(this.data,id,'emotion.json')],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
        let out='',err=''; const timer=setTimeout(()=>{child.kill();reject(Error('Emotion Engine 超时'));},30000);
        child.stdout.on('data',v=>out+=v); child.stderr.on('data',v=>err+=v);
        child.on('error',e=>{clearTimeout(timer);reject(e);});
        child.on('close',()=>{clearTimeout(timer);try{const parsed=JSON.parse(out);if(parsed.error) reject(Error(parsed.error.message));else resolve(parsed.result);}catch{reject(Error(err||'Emotion Engine 无有效回复'));}});
        child.stdin.end(JSON.stringify({...operation,policy:this.store.agent(id).config.decay}));
      });
    };
    const result=(this.tails.get(id)??Promise.resolve()).catch(()=>{}).then(run); this.tails.set(id,result); return result;
  }
  call(id:string,name:string,args:Record<string,unknown>={}) { return this.request(id,{request:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{...args,character_id:id,relationship_id:`${id}:user`}}}}); }
  async enable(id:string,freeze:boolean) { await this.call(id,'emotion_engine_bind_identity'); await this.request(id,{operation:'decay',freeze}); }
  async summary(id:string) { return this.call(id,'emotion_engine_summary',{limit:5}); }
  async submit(id:string,source:string,at:string,text:string,pad:{pleasure:number;arousal:number;dominance:number},subject:string,eventType:string,trustEvidence?:unknown) {
    const session=`experience-${source}`;
    await this.request(id,{operation:'decay'});
    await this.call(id,'emotion_engine_session_start',{session_id:session,event_id:`${source}:start`,occurred_at:at});
    const result=await this.call(id,'emotion_engine_evaluate_and_record_turn',{...pad,event:{session_id:session,event_id:source,occurred_at:at,message:text,subject,event_type:eventType,host_approved:true,memory_owner:'self',source:'model_inferred',trust_evidence:trustEvidence}});
    await this.call(id,'emotion_engine_session_end',{session_id:session,event_id:`${source}:end`,occurred_at:at});
    await this.call(id,'emotion_engine_settle_trust',{session_id:session,event_id:`${source}:settlement`,occurred_at:at}); return result;
  }
}
