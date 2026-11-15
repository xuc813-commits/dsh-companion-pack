import {spawn} from 'node:child_process'
import {mkdir,stat,open,rename,rm,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
export interface MediaRuntime {nodePath?:string;ffmpegPath?:string;ffprobePath?:string;mediaCacheRoot?:string}
const MAX_VIDEO=192*1024*1024,MAX_CACHE=768*1024*1024
const active=new Map<string,number>()
export function callerCache(root:string|undefined,scope:string){return join(root??join(tmpdir(),'dsh-bilibili-media'),createHash('sha256').update(scope).digest('hex').slice(0,24))}
export function pin(file:string){active.set(file,(active.get(file)??0)+1);return ()=>{const n=(active.get(file)??1)-1;if(n)active.set(file,n);else active.delete(file)}}
export async function pruneMedia(root:string){
 const entries=[]
 for(const name of await readdir(root).catch(()=>[])){if(!['.mp4','.png','-result.json','-subtitles.json'].some(suffix=>name.endsWith(suffix)))continue;const file=join(root,name);try{const s=await stat(file);entries.push({file,size:s.size,at:s.mtimeMs})}catch{}}
 let size=entries.reduce((n,x)=>n+x.size,0)
 for(const x of entries.sort((a,b)=>a.at-b.at)){if(size<=MAX_CACHE)break;if(active.has(x.file))continue;await rm(x.file,{force:true});size-=x.size}
}
export async function downloadMedia(url:string,file:string,signal?:AbortSignal){
 signal?.throwIfAborted()
 try{if((await stat(file)).size>0)return true}catch{}
 await mkdir(join(file,'..'),{recursive:true})
 const temp=file+'.'+randomUUID()+'.part';let handle
 try{
  const response=await fetch(url,{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90_000)]),redirect:'manual',headers:{'user-agent':'Mozilla/5.0',referer:'https://www.bilibili.com/'}})
  if(!response.ok||!response.body)throw Error('video download failed (HTTP '+response.status+')')
  if(Number(response.headers.get('content-length'))>MAX_VIDEO)throw Error('video exceeds local download budget')
  handle=await open(temp,'wx');let total=0
  for await(const chunk of response.body){signal?.throwIfAborted();total+=chunk.byteLength;if(total>MAX_VIDEO)throw Error('video exceeds local download budget');await handle.writeFile(chunk)}
  await handle.close();handle=undefined;if(!total)throw Error('empty video download')
  // Another concurrent call may have populated this immutable cache entry first.
  try{await rename(temp,file)}catch(e){try{if((await stat(file)).size>0){await rm(temp,{force:true});return true}}catch{};throw e}
  return false
 }finally{await handle?.close();await rm(temp,{force:true})}
}
/** A dedicated process keeps upstream media work and cache outside the host.
 * On Windows cancellation kills this owned child tree, including ffmpeg. */
export function mediaWorker(options:Record<string,unknown>,root:string,runtime:MediaRuntime,signal?:AbortSignal,timeoutMs=180_000):Promise<any>{
 signal?.throwIfAborted()
 return new Promise((resolve,reject)=>{
  const env:NodeJS.ProcessEnv={}
  for(const key of ['SystemRoot','WINDIR','PATH','HOME','USERPROFILE','PATHEXT','COMSPEC'])if(process.env[key])env[key]=process.env[key]
  Object.assign(env,{TEMP:root,TMP:root,DSH_HOME:join(root,'isolated-home'),DSH_VIDEO_CACHE_DIR:join(root,'scan-cache'),ELECTRON_RUN_AS_NODE:'1'})
  const child=spawn(runtime.nodePath??process.execPath,[fileURLToPath(new URL('./watch-worker.js',import.meta.url))],{env,windowsHide:true,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'})
  let out='',err='',failure:Error|undefined,closed=false
  const kill=(reason:Error)=>{
   if(closed||failure)return;failure=reason
   if(child.pid&&process.platform==='win32'){
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill())
   }else if(child.pid){try{process.kill(-child.pid,'SIGKILL')}catch{child.kill()}}
  }
  const abort=()=>kill(Object.assign(Error('video task cancelled'),{name:'AbortError'}))
  const timer=setTimeout(()=>kill(Error('video processing timed out')),timeoutMs)
  const clean=()=>{closed=true;clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
  child.stdout.on('data',b=>{out+=String(b);if(out.length>4*1024*1024)kill(Error('video worker output exceeded limit'))})
  child.stderr.on('data',b=>{err=(err+String(b)).slice(-2000)})
  child.on('error',e=>{clean();reject(e)})
  child.on('close',code=>{clean();if(failure)return reject(failure);if(code!==0)return reject(Error('video worker failed: '+err.slice(-180)));try{resolve(JSON.parse(out))}catch{reject(Error('invalid video worker result'))}})
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...options,ffmpegPath:runtime.ffmpegPath,ffprobePath:runtime.ffprobePath}))
 })
}
