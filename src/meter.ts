import {priceFor,usageCost,reserveCost} from './money.ts';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import { Store } from './store.ts';
export function totalUsage(u:TokenUsage) {return u.totalTokens ?? u.inputTokens + u.outputTokens + (u.cacheReadTokens??0)+(u.cacheWriteTokens??0);}
type Projection=Partial<Pick<Context['llm'],'imageRequestPricing'|'fileRequestText'>>;
function reservation(request:GenerateOptions,capacity:number,defaultMax?:number,projection?:Projection) {
  const full={tokens:capacity,bounded:false},output=request.maxTokens??defaultMax;
  if(!['deepseek-official','deepseek-account'].includes(request.provider)||!output||!Number.isSafeInteger(output))return full;
  let visual=0;
  const images=request.messages.flatMap(m=>m.content.filter(b=>b.type==='image'));
  const pricing=images.length?projection?.imageRequestPricing?.(request.provider,request.model):undefined;
  if(images.length&&!pricing)return full;
  const prices=pricing?.priceImages(images)??[];
  if(prices.length!==images.length||prices.some(p=>!Number.isSafeInteger(p.visualTokens)||p.visualTokens<0||typeof p.text!=='string'))return full;
  let image=0,unknown=false;
  const messages=request.messages.map(m=>({...m,content:m.content.map(block=>{
    if(block.type==='image'){const p=prices[image++];visual+=p.visualTokens;return {type:'text',text:p.text};}
    if(block.type==='file'){
      if(!projection?.fileRequestText){unknown=true;return block;}
      return {type:'text',text:projection.fileRequestText(block.attachment)};
    }
    if(!['text','reasoning','tool-call','tool-addition','tool-removal'].includes(block.type))unknown=true;
    return block;
  })}));
  if(unknown)return full;
  // UTF-8 bytes bound text tokens; price every image occurrence using the same
  // route-owned projection as the serializer, including offload/handle text.
  const wire=JSON.stringify({system:request.system,messages,tools:request.tools,toolHistory:request.toolHistory});
  const inputUpper=Buffer.byteLength(wire,'utf8')+visual+1024+256*messages.length+256*(request.tools?.length??0);
  return {tokens:Math.min(capacity,inputUpper+output),bounded:true};
}
export function reservationFor(request:GenerateOptions,capacity:number,defaultMax?:number,projection?:Projection) {
  return reservation(request,capacity,defaultMax,projection).tokens;
}
/** A provider context bound covers text, images, cached input, tools and maximum output together.
 * Refuse metadata-free routes rather than silently treating a heuristic as a hard cap. */
export async function* metered(store:Store,ctx:Pick<Context,'llm'>,request:GenerateOptions,next:()=>AsyncIterable<StreamChunk>):AsyncIterable<StreamChunk> {
  const metadata=await ctx.llm.resolveModelInfo(request.provider,request.model,request.signal);
  const capacity=metadata.context?.contextWindow;
  if(!capacity || !Number.isSafeInteger(capacity)||capacity<=0)throw Error('该模型未声明可信上下文总容量，无法保证共享额度；请在宿主模型配置中补齐容量');
  const id=randomUUID(); const agent=request.sessionId?store.owner(request.sessionId)??'host':'host';
  const plan=reservation(request,capacity,metadata.defaultMaxTokens,ctx.llm),tokens=plan.tokens,money=store.moneyMode(),pricing=money?priceFor(request.provider,request.model):undefined,startedAt=new Date();
  if(pricing)store.reserveMoney(id,agent,tokens,reserveCost(tokens,request.maxTokens??metadata.defaultMaxTokens,capacity,pricing,!plan.bounded),pricing);else store.reserve(id,agent,tokens);let actual:number|undefined,units:number|undefined;
  const localRefusal=(code:unknown)=>['MISSING_CREDENTIAL','NO_ADAPTER','MODEL_NOT_FOUND','UNSUPPORTED_CONFIG'].includes(String(code));
  try {for await(const chunk of next()){if(chunk.type==='usage'){actual=totalUsage(chunk.usage);if(pricing)units=usageCost(chunk.usage,pricing,startedAt);}if(chunk.type==='finish'&&chunk.reason.kind==='error'&&localRefusal(chunk.reason.failure.code)){actual=0;units=0;}yield chunk;}}
  catch(e){if(localRefusal((e as any)?.code??(e as any)?.failure?.code)){actual=0;units=0;}throw e;}
  finally{if(money)store.settleMoney(id,actual,units);else store.settle(id,actual);}
}
