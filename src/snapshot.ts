import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { Store, validate } from './store.ts';
function safeTree(root:string) {for(const e of readdirSync(root,{withFileTypes:true})){const p=join(root,e.name);if(lstatSync(p).isSymbolicLink())throw Error('快照不能包含链接');if(e.isDirectory())safeTree(p);}}
export async function exportAgent(store:Store,home:string,id:string,dest:string) {
  const agent=store.agent(id);if(!agent.paused)throw Error('请先停止该 agent，等待当前活动结束后导出');
  if(existsSync(dest))throw Error('导出目标已存在');mkdirSync(dest,{recursive:true});
  const world=join(home,'worlds',id);safeTree(world);
  cpSync(world,join(dest,'world'),{recursive:true,filter:p=>!/(archive\.sqlite(?:-wal|-shm)?|wechat\.json|qq-native\.json|platform-options\.json|weixin-ilink\.json|weixin-cursor\.json|panel\.json)$/.test(p)});
  const dbFile=join(world,'archive.sqlite');if(existsSync(dbFile)){const db=new DatabaseSync(dbFile,{readOnly:true});try{await backup(db,join(dest,'world','archive.sqlite'));}finally{db.close();}}
  const emotion=join(home,'companion','agents',id);if(existsSync(emotion)){safeTree(emotion);cpSync(emotion,join(dest,'emotion'),{recursive:true});}
  const select=(table:string)=>store.db.prepare(`SELECT * FROM ${table} WHERE agent=?`).all(id);
  const manifest={schema:1,snapshotId:randomUUID(),agent,at:new Date().toISOString(),day:store.day(),calls:select('calls'),costs:select('costs'),notes:select('notes'),tasks:select('tasks'),history:select('history'),receipts:select('receipts'),bindings:select('bindings')};
  writeFileSync(join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
  const sums:Record<string,string>={};const walk=(dir:string,base='')=>{for(const e of readdirSync(dir,{withFileTypes:true})){const relative=base+e.name;if(e.isDirectory())walk(join(dir,e.name),relative+'/');else sums[relative]=createHash('sha256').update(readFileSync(join(dir,e.name))).digest('hex');}};walk(dest);writeFileSync(join(dest,'sha256.json'),JSON.stringify(sums,null,2));return {path:dest,snapshotId:manifest.snapshotId};
}
export function importAgent(store:Store,home:string,src:string,name:string) {
  safeTree(src);const manifest=JSON.parse(readFileSync(join(src,'manifest.json'),'utf8'));if(manifest.schema!==1)throw Error('不支持的快照版本');validate(manifest.agent.config);
  const sums=JSON.parse(readFileSync(join(src,'sha256.json'),'utf8'));
  for(const [file,sum] of Object.entries(sums)){if(file.includes('..')||file.startsWith('/')||file.includes(':')||file.includes('\\'))throw Error('无效快照路径');if(createHash('sha256').update(readFileSync(join(src,file))).digest('hex')!==sum)throw Error('快照摘要不匹配');}
  const a=store.create(name,manifest.agent.basePreset);store.update(a.id,a.version,{config:manifest.agent.config},'snapshot:'+manifest.snapshotId);
  const dest=join(home,'worlds',a.id);mkdirSync(dest,{recursive:true});cpSync(join(src,'world'),dest,{recursive:true});writeFileSync(join(dest,'world.json'),JSON.stringify({running:false,wechatEnabled:false,qqEnabled:false}));
  // Sessions are host-owned and cannot be attached to both cloned identities. Archives retain original provenance.
  const archive=join(dest,'archive.sqlite');if(existsSync(archive)){const db=new DatabaseSync(archive);try{db.exec('DELETE FROM progress; DELETE FROM channelSessions;');const originalSessions=new Set<string>();for(const row of db.prepare('SELECT recordId,body FROM records').all()){const body=JSON.parse(String(row.body));body.originalWorldId??=body.worldId;body.worldId=a.id;if(body.sourceSessionId)originalSessions.add(body.sourceSessionId);db.prepare('UPDATE records SET body=? WHERE recordId=?').run(JSON.stringify(body),row.recordId);}writeFileSync(join(dest,'imported-sources.json'),JSON.stringify([...originalSessions]));}finally{db.close();}}
  const life=join(dest,'life.json');if(existsSync(life)){const state=JSON.parse(readFileSync(life,'utf8'));delete state.homeSessionId;delete state.greeting;delete state.alarm;delete state.review;writeFileSync(life,JSON.stringify(state));}
  if(existsSync(join(src,'emotion'))){const emotional=join(home,'companion','agents',a.id);mkdirSync(emotional,{recursive:true});cpSync(join(src,'emotion'),emotional,{recursive:true});const file=join(emotional,'emotion.json');if(existsSync(file)){const state=JSON.parse(readFileSync(file,'utf8'));state.companion_snapshot_origin={agent:manifest.agent.id,snapshotId:manifest.snapshotId};if(state.identity){state.identity.character_id=a.id;state.identity.relationship_id=`${a.id}:user`;}writeFileSync(file,JSON.stringify(state));}}
  store.transaction(()=>{
    const remap=new Map<string,string>();for(const table of ['notes','tasks','history','receipts'])for(const row of manifest[table]??[])remap.set(row.id,randomUUID());
    for(const n of manifest.notes??[])store.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?)').run(remap.get(n.id)!,a.id,n.kind,n.text,JSON.stringify(JSON.parse(n.sources).map((s:string)=>remap.get(s)??s)),n.version,n.at);
    for(const t of manifest.tasks??[]){const body=JSON.parse(t.body);body.id=remap.get(t.id);body.agent=a.id;if(body.status==='running')body.status='uncertain';store.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run(body.id,a.id,body.at,body.status,JSON.stringify(body));}
    for(const h of manifest.history??[])store.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(remap.get(h.id)!,a.id,h.at,'snapshot:'+manifest.snapshotId,h.before,h.after);
    for(const r of manifest.receipts??[])store.db.prepare('INSERT OR IGNORE INTO receipts VALUES(?,?,?)').run(`${a.id}:${r.id}`,a.id,r.body);
    // Importing the same snapshot again never creates extra allowance. Host quota is never imported.
    for(const c of manifest.costs??[])if(c.day===store.day()){if(!Number.isSafeInteger(c.reserved)||c.reserved<0||(c.actual!==null&&(!Number.isSafeInteger(c.actual)||c.actual<0)))throw Error('无效快照费用');store.db.prepare('INSERT OR IGNORE INTO costs VALUES(?,?,?,?,?,?,?)').run(c.id,c.day,a.id,c.reserved,c.actual,c.status==='settled'?'settled':'uncertain',c.pricing);}
    for(const call of manifest.calls??[])if(call.day===store.day()){
      if(!Number.isSafeInteger(call.reserved)||call.reserved<0||(call.actual!==null&&(!Number.isSafeInteger(call.actual)||call.actual<0)))throw Error('无效快照用量');
      store.db.prepare('INSERT OR IGNORE INTO calls VALUES(?,?,?,?,?,?)').run(call.id,call.day,a.id,call.reserved,call.actual,call.status==='settled'?'settled':'uncertain');
    }
  });return store.agent(a.id);
}
