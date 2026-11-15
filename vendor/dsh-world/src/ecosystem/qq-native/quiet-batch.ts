import {realTimers,type LifeTimers} from '../../life/alarmTimer.ts';
export const QQ_MESSAGE_WAIT_MS=5_000;
export const QQ_LONG_MESSAGE_WAIT_MS=15_000;
/** Trailing-edge batching: the third message lengthens this burst's quiet window. */
export function createQuietBatch<T>(deliver:(items:readonly T[])=>Promise<void>|void,options:{timers?:LifeTimers;onError?:(error:unknown)=>void}={}){
 const timers=options.timers??realTimers;
 const pending=new Map<string,{items:T[];timer:unknown;revision:number}>();
 let stopped=false,epoch=0;
 function clear(){epoch++;for(const batch of pending.values())timers.clear(batch.timer);pending.clear();}
 return {
  has(key:string){return pending.has(key);},
  size(){return pending.size;},
  add(key:string,item:T){
   if(stopped)return;
   let batch=pending.get(key);
   if(batch)timers.clear(batch.timer);
   else{batch={items:[],timer:undefined,revision:0};pending.set(key,batch);}
   batch.items.push(item);const revision=++batch.revision,current=batch;
   batch.timer=timers.set(()=>{
    if(stopped||pending.get(key)!==current||current.revision!==revision)return;
    pending.delete(key);const items=current.items.slice(),atEpoch=epoch;
    void Promise.resolve().then(()=>{if(!stopped&&epoch===atEpoch)return deliver(items);}).catch(error=>options.onError?.(error));
   },batch.items.length>=3?QQ_LONG_MESSAGE_WAIT_MS:QQ_MESSAGE_WAIT_MS);
  },
  clear,
  stop(){stopped=true;clear();}
 };
}
