import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,readdir} from 'node:fs/promises'
import {join,resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {createWatchReader,parseWatchArgs,compactTranscript} from '../vendor/dsh-bilibili/lib/watch.js'
import {callerCache,mediaWorker} from '../vendor/dsh-bilibili/lib/media-runtime.js'
import {applyBilibiliWatchTool} from '../vendor/dsh-bilibili/lib/watch-tool.js'
import {deepSeekImageTokens,resolveRequestImageTarget} from '@deepseek-ai/dsh-llm-deepseek'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {LocalAttachmentStore} from '@deepseek-ai/dsh-attachment-local'
import * as plugin from '../vendor/dsh-bilibili/lib/index.js'
const base=process.env.ROLEPLAY_TEST_ROOT;await mkdir(base,{recursive:true})
const ffmpeg=process.env.DSH_COMPANION_FFMPEG??'ffmpeg',ffprobe=process.env.DSH_COMPANION_FFPROBE??'ffprobe'
const sample=join(base,'watch-fixture.mp4'),cover=join(base,'watch-cover.png')
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=8:duration=12','-an','-c:v','libx264','-pix_fmt','yuv420p','-threads','2',sample],{windowsHide:true})
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',sample,'-frames:v','1',cover],{windowsHide:true})
const media=await readFile(sample),png=await readFile(cover)
let downloads=0,subtitleReads=0
const server=createServer((req,res)=>{downloads++;res.setHeader('content-type','video/mp4');res.setHeader('content-length',media.length);res.end(media)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/sample.mp4'
after(()=>new Promise(r=>server.close(r)))
const bvid='BV1GJ411x7h7',cues=[{from:0,to:5,content:'第一段是蓝色场景'},{from:5,to:12,content:'第二段是绿色场景'}]
const provider={video:async()=>({bvid,cid:123,title:'测试视频',duration:12,coverUrl:'https://i0.hdslb.com/cover.png'}),subtitles:async()=>{subtitleReads++;return {cues}},playurl:async()=>({url}),playerInfo:async()=>({}),fetchBytes:async()=>png}
const runtime={nodePath:process.execPath,ffmpegPath:ffmpeg,ffprobePath:ffprobe,mediaCacheRoot:await mkdtemp(join(base,'watch-'))}
const reader=createWatchReader(provider,runtime)

test('watch validates BV identities, modes, counts and zoom/query requirements',()=>{
 assert.equal(parseWatchArgs({bvid}).action,'overview');assert.equal(parseWatchArgs({bvid}).count,9)
 for(const args of [{bvid:'../../x'},{bvid,action:'bad'},{bvid,count:0},{bvid,count:17},{bvid,action:'zoom'},{bvid,from:5,to:2},{bvid,action:'locate'}])assert.throws(()=>parseWatchArgs(args))
 assert.notEqual(callerCache(runtime.mediaCacheRoot,'one'),callerCache(runtime.mediaCacheRoot,'two'))
})
test('transcript pages stay bounded with a concrete continuation point',()=>{
 const text=compactTranscript(Array.from({length:300},(_,i)=>({from:i,to:i+1,content:'很长的字幕'.repeat(60)})),0,300,700)
 assert.ok(text.length<900);assert.match(text,/继续用 action=text/)
})
test('all five old Bilibili tools remain registered, with one unified video reader added',async()=>{
 const ctx=new Context();await ctx.plugin(SystemPrompt,{}).await();await ctx.plugin(ToolRuntime,{}).await();const mounted=ctx.plugin(plugin,{});await mounted.await()
 const names=ctx.tools.schemas().map(s=>s.name);for(const name of ['bilibili_search','bilibili_video','bilibili_subtitles','bilibili_playurl','bilibili_frames','bilibili_watch'])assert.ok(names.includes(name));assert.equal(names.length,6)
 await mounted.dispose()
})
test('overview runs actual upstream scan/composition and reuses its per-caller cached result',async()=>{
 const before=downloads;const result=await reader(parseWatchArgs({bvid}),'one');assert.equal(result.source,'storyboard');assert.equal(result.images.length,1);assert.equal(result.cached,false);assert.match(result.text,/frame@/);assert.ok(result.text.length<2600)
 const data=Buffer.from(result.images[0].data);assert.equal(data.readUInt32BE(16)*data.readUInt32BE(20)<=640000,true)
 const second=await reader(parseWatchArgs({bvid}),'one');assert.equal(second.cached,true);assert.deepEqual(second.images[0].data,result.images[0].data);assert.equal(downloads-before,1)
})
test('locate and paged text reuse Bilibili subtitles and do not download video or attach images',async()=>{
 const before=downloads,subs=subtitleReads
 const found=await reader(parseWatchArgs({bvid,action:'locate',query:'绿色'}),'one');assert.equal(found.images.length,0);assert.match(found.text,/5-12s/)
 const text=await reader(parseWatchArgs({bvid,action:'text',from:0,to:4}),'one');assert.match(text.text,/蓝色/);assert.doesNotMatch(text.text,/绿色/);assert.equal(downloads,before);assert.equal(subtitleReads,subs)
})
test('zoom produces one closer grid for only the requested video window',async()=>{
 const result=await reader(parseWatchArgs({bvid,action:'zoom',from:2,to:5,count:4}),'one');assert.equal(result.source,'storyboard');assert.equal(result.images.length,1);assert.match(result.text,/2\.00-5\.00s/)
})
test('cache, transcripts and viewed-window metadata are isolated between callers',async()=>{
 const before=downloads;const result=await reader(parseWatchArgs({bvid}),'two');assert.equal(result.cached,false);assert.equal(downloads-before,1)
 const a=join(callerCache(runtime.mediaCacheRoot,'one'),'scan-cache','seen.jsonl'),b=join(callerCache(runtime.mediaCacheRoot,'two'),'scan-cache','seen.jsonl');assert.notEqual(a,b);assert.ok((await readFile(a,'utf8')).length);assert.ok((await readFile(b,'utf8')).length)
})
test('missing media dependency falls back truthfully to the cover, while zoom never substitutes the wrong time window',async()=>{
 const fallback=createWatchReader(provider,{...runtime,mediaCacheRoot:await mkdtemp(join(base,'fallback-')),ffprobePath:join(base,'missing-ffprobe.exe')})
 const result=await fallback(parseWatchArgs({bvid}),'fallback');assert.equal(result.source,'cover');assert.match(result.text,/只有封面/);assert.equal(result.images.length,1)
 await assert.rejects(fallback(parseWatchArgs({bvid,action:'zoom',from:0,to:2}),'fallback'),/细看失败/)
})
test('cancellation kills the owned worker tree and is never disguised as a successful preview fallback',async()=>{
 const root=await mkdtemp(join(base,'cancel-'));const start=Date.now()
 await assert.rejects(mediaWorker({input:sample,output:root,cells:16,from:0,to:12},root,runtime,AbortSignal.timeout(150)),/cancelled|aborted|timeout/i);assert.ok(Date.now()-start<8000)
 const control=new AbortController();control.abort();await assert.rejects(reader(parseWatchArgs({bvid}),'cancelled',control.signal))
})
test('image gate runs before media work; nested results use durable attachment references',async()=>{
 let tool;const ctx={tools:{register:d=>{tool=d}},get:name=>name==='llm'?{resolveModelInfo:async()=>({inputModalities:['text']})}:undefined}
 applyBilibiliWatchTool(ctx,provider,runtime)
 const exec={agent:{id:'one',options:{provider:'deepseek-account',model:'deepseek-flash'},session:{requestHeader:()=>undefined}},signal:new AbortController().signal}
 await assert.rejects(tool.execute({bvid},exec),/image input/)
 const attachments={imageLimits:{maxImagesPerMessage:4,mediaTypes:['image/png','image/jpeg']},saveImage:async({data,mediaType,name})=>{const b=Buffer.from(data);return {attachmentId:createHash('sha256').update(b).digest('hex'),mediaType,name,bytes:b.length,width:b.readUInt32BE(16),height:b.readUInt32BE(20)}}}
 ctx.get=name=>name==='llm'?{resolveModelInfo:async()=>({inputModalities:['text','image']})}:attachments
 let deferred;const result=await tool.execute({bvid},{...exec,parent:{},deferContext:m=>{deferred=m}});assert.equal(result.images.length,1);assert.equal(deferred.content.filter(b=>b.type==='image').length,1);assert.equal(deferred.content[1].attachment.attachmentId,result.images[0].attachmentId)
})
test('route-owned image accounting demonstrates savings without a fixed per-image token assumption',()=>{
 const model={id:'deepseek-flash',inputModalities:['text','image']};const price=source=>{const t=resolveRequestImageTarget(model,source);return deepSeekImageTokens(t.width,t.height)}
 const old=8*price({width:512,height:288}),grid=price({width:1066,height:598});assert.ok(grid<old);assert.equal(old,1536);assert.equal(grid,407)
})

test('real attachment store normalizes and persists images without leaking extra fields into tool output',async()=>{
 const root=await mkdtemp(join(base,'durable-')),store=new LocalAttachmentStore(new Context(),{dshHome:root,normalizedImageMaxPixels:120000})
 let tool;const ctx={tools:{register:d=>{tool=d}},get:name=>name==='llm'?{resolveModelInfo:async()=>({inputModalities:['text','image']})}:store};applyBilibiliWatchTool(ctx,provider,runtime)
 const exec={agent:{id:'one',options:{provider:'deepseek-account',model:'deepseek-flash'},session:{requestHeader:()=>undefined}},signal:new AbortController().signal}
 const result=await tool.execute({bvid},exec);assert.equal(result.images.length,1);const ref=result.images[0];assert.equal(ref.originalDimensions,undefined);assert.ok(ref.width*ref.height<=120000);assert.ok((await readFile(store.imageHostPath(ref))).length>0)
})
