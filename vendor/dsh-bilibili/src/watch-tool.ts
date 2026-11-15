import type {Context} from '@deepseek-ai/cordis'
import {AttachmentId} from '@deepseek-ai/dsh-attachment'
import {createUserMessage,type ContentBlock} from '@deepseek-ai/dsh-llm'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {assertImageCapableRoute,type BilibiliFrameImage} from './frames.ts'
import type {BilibiliProviderLike} from './types.ts'
import {createWatchReader,parseWatchArgs,WATCH_ACTIONS,type WatchArgs} from './watch.ts'
import type {MediaRuntime} from './media-runtime.ts'
interface WatchValue {text:string;source:string;images:BilibiliFrameImage[];cached?:boolean}
function content(value:WatchValue):ContentBlock[]{return [{type:'text',text:value.text},...value.images.map(image=>({type:'image' as const,attachment:{...image,attachmentId:AttachmentId(image.attachmentId)}}))]}
function mediaType(data:Uint8Array){if(data[0]===137&&data[1]===80)return 'image/png' as const;if(data[0]===71)return 'image/gif' as const;if(data[0]===82)return 'image/webp' as const;return 'image/jpeg' as const}
export function applyBilibiliWatchTool(ctx:Context,service:BilibiliProviderLike,runtime:MediaRuntime={}){
 const read=createWatchReader(service,runtime)
 ctx.tools.register(defineTool({
  name:'bilibili_watch',
  description:'Read a Bilibili video efficiently in one tool: overview (one scene-aware image grid + short timed subtitles), zoom (closer frames of from/to), locate (subtitle query, text only), text (bounded timed transcript), probe (metadata only). Reuses Bilibili login and local cache; no ASR or extra model call. Use this before shell downloads or repeated individual frame calls. The original bilibili tools remain available.',
  parameters:{bvid:{type:'string',required:true,description:'BV id.'},action:{type:'string',enum:[...WATCH_ACTIONS],description:'overview by default; zoom needs from/to, locate needs query.'},from:{type:'number',description:'Start seconds, default 0.'},to:{type:'number',description:'End seconds. text defaults to a 180-second page.'},count:{type:'integer',description:'Cells (1-16), default overview=9, zoom=4; locate default 5 matches.'},query:{type:'string',description:'Subtitle words to locate.'}},
  output:{schema:{type:'object',additionalProperties:false,properties:{text:{type:'string',required:true},source:{type:'string',required:true},cached:{type:'boolean'},images:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{attachmentId:{type:'string',required:true},mediaType:{type:'string',enum:['image/png','image/jpeg','image/webp','image/gif'],required:true},bytes:{type:'integer',required:true},width:{type:'integer',required:true},height:{type:'integer',required:true},name:{type:'string'}}}}}},render:(_args:WatchArgs,value:WatchValue)=>content(value)},
  timeoutMs:240000,isConcurrencySafe:()=>false,
  async execute(args,exec){
   const input=parseWatchArgs(args),visual=input.action==='overview'||input.action==='zoom'
   if(visual)await assertImageCapableRoute(ctx,exec)
   const attachments=ctx.get('attachments')
   if(visual&&(!attachments||attachments.imageLimits.maxImagesPerMessage<1))throw Error('bilibili_watch requires an image attachment store')
   const signal=AbortSignal.any([exec.signal,AbortSignal.timeout(210000)])
   const artifact=await read(input,String(exec.agent?.id??'direct-call'),signal),images:BilibiliFrameImage[]=[]
   for(const image of artifact.images){const type=mediaType(image.data);if(!attachments?.imageLimits.mediaTypes.includes(type))throw Error('video image format is unsupported');const ref=await attachments.saveImage({data:image.data,mediaType:type,name:image.name});images.push({attachmentId:String(ref.attachmentId),mediaType:ref.mediaType,bytes:ref.bytes,width:ref.width,height:ref.height,...ref.name===undefined?{}:{name:ref.name}})}
   const value:WatchValue={text:artifact.text,source:artifact.source,images,...artifact.cached===undefined?{}:{cached:artifact.cached}}
   if(visual&&exec.parent!==undefined)exec.deferContext(createUserMessage({source:{kind:'bilibili-frames'},content:content(value)}))
   return value
  },presentCall(args:WatchArgs){return {card:'generic',kind:'read',title:'bilibili_watch '+args.bvid+' '+(args.action??'overview')}}
 }))
}
