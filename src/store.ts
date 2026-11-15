import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AgentConfig {
  emotion: boolean; resumeEmotion: 'freeze' | 'elapsed'; recentChars: number; maxOutputTokens:number;
  decay: { moodPerHour: number; trustPerDay: number; disconnectFloor: number };
  modules: { bilibili: boolean; search: boolean; qq: boolean; wechat: boolean };
}
export interface Companion { id: string; name: string; preset: string; basePreset: string; version: number; paused: boolean; config: AgentConfig; createdAt: string; deletedAt?:string }
export const defaults = (): AgentConfig => ({ emotion: false, resumeEmotion: 'freeze', recentChars: 18000, maxOutputTokens:8192, decay: { moodPerHour: 0.015, trustPerDay: 0.1, disconnectFloor: 70 }, modules: { bilibili: true, search: true, qq: false, wechat: false } });
export function validate(config: AgentConfig) {
  if (!config || typeof config.emotion !== 'boolean' || !['freeze','elapsed'].includes(config.resumeEmotion)) throw Error('无效情绪配置');
  if (!Number.isSafeInteger(config.recentChars) || config.recentChars < 1000 || config.recentChars > 500000) throw Error('recentChars 范围 1000..500000');
  if(!Number.isSafeInteger(config.maxOutputTokens)||config.maxOutputTokens<1||config.maxOutputTokens>1000000)throw Error('无效最大输出 token');
  for (const key of ['moodPerHour','trustPerDay','disconnectFloor'] as const) if (!Number.isFinite(config.decay?.[key]) || config.decay[key] < 0) throw Error('无效衰减参数');
  if (config.decay.disconnectFloor > 100) throw Error('信任下限范围 0..100');
  if (!config.modules || Object.values(config.modules).some(v => typeof v !== 'boolean')) throw Error('无效模块配置');
  if (Object.keys(config).sort().join() !== Object.keys(defaults()).sort().join()) throw Error('未知配置字段；额度走独立宿主入口');
}
export class Store {
  db: DatabaseSync;
  constructor(public file: string, public zone = 'Asia/Shanghai') {
    mkdirSync(dirname(file), { recursive: true }); this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA locking_mode=EXCLUSIVE;
      CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bindings(session TEXT PRIMARY KEY, agent TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,agent TEXT,at TEXT,actor TEXT,before TEXT,after TEXT);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,day TEXT,agent TEXT,reserved INTEGER,actual INTEGER,status TEXT);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,agent TEXT,at TEXT,status TEXT,body TEXT);
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,agent TEXT,kind TEXT,text TEXT,sources TEXT,version INTEGER,at TEXT);
      CREATE TABLE IF NOT EXISTS costs(id TEXT PRIMARY KEY,day TEXT,agent TEXT,reserved INTEGER,actual INTEGER,status TEXT,pricing TEXT);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,agent TEXT,body TEXT);
    `);
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES('hostId',?)").run(randomUUID());
  }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  // A budget day runs from 01:00 to the following 01:00 in the configured zone.
  day(now = new Date()) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:this.zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get=(type:string)=>parts.find(p=>p.type===type)!.value;
    const date=new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
    if(Number(get('hour'))<1)date.setUTCDate(date.getUTCDate()-1);
    return date.toISOString().slice(0,10);
  }
  nextResetAt(now=new Date()) {
    const day=this.day(now);let left=now.getTime(),right=left;
    do {right+=3600000;} while(this.day(new Date(right))===day);
    while(right-left>1){const middle=Math.floor((left+right)/2);if(this.day(new Date(middle))===day)left=middle;else right=middle;}
    return new Date(right).toISOString();
  }
  decode(body:string):Companion {const a=JSON.parse(body);a.config.maxOutputTokens??=8192;return a;}
  list(includeDeleted=false): Companion[] { return this.db.prepare('SELECT body FROM agents').all().map(r => this.decode(String(r.body))).filter(a=>includeDeleted||!a.deletedAt); }
  agent(id: string): Companion { const row = this.db.prepare('SELECT body FROM agents WHERE id=?').get(id); if (!row) throw Error('agent 不存在'); return this.decode(String(row.body)); }
  create(name: string, basePreset = 'standard', copy?: string): Companion {
    if (!name?.trim() || name.length > 100) throw Error('请提供角色名称');
    const id = randomUUID(); const config = copy ? structuredClone(this.agent(copy).config) : defaults();
    const a: Companion = { id, name: name.trim(), preset: `companion-${id}`, basePreset: copy ? this.agent(copy).basePreset : basePreset, config, version:1, paused:true, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO agents VALUES(?,?)').run(id, JSON.stringify(a)); return a;
  }
  update(id: string, expected: number, patch: Partial<Pick<Companion,'name'|'paused'|'config'>>, actor: string): Companion {
    return this.transaction(() => { const before = this.agent(id); if(before.deletedAt)throw Error('角色已删除，请先恢复'); if (before.version !== expected) throw Error('版本冲突，请重新读取后提交');
      const after = { ...before, ...patch, version: expected + 1 }; validate(after.config);
      this.db.prepare('UPDATE agents SET body=? WHERE id=?').run(JSON.stringify(after),id);
      this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(),id,new Date().toISOString(),actor,JSON.stringify(before),JSON.stringify(after)); return after; });
  }
  bind(session: string, id: string) { this.agent(id); const old = this.owner(session); if(old && old !== id) throw Error('既有会话身份不可切换，请新建会话'); this.db.prepare('INSERT OR IGNORE INTO bindings VALUES(?,?)').run(session,id); }
  owner(session: string): string | undefined { return this.db.prepare('SELECT agent FROM bindings WHERE session=?').get(session)?.agent as string | undefined; }
  limit(): number { return Number(this.db.prepare("SELECT value FROM settings WHERE id='dailyLimit'").get()?.value ?? 0); }
  setLimitByUser(value: number) { this.db.prepare("INSERT OR REPLACE INTO settings VALUES('budgetMode','token')").run(); if (!Number.isSafeInteger(value) || value < 0) throw Error('额度须为非负整数'); this.db.prepare("INSERT OR REPLACE INTO settings VALUES('dailyLimit',?)").run(String(value)); }
  usage(day = this.day()) { return this.db.prepare("SELECT agent,SUM(CASE WHEN status='settled' THEN actual ELSE reserved END) AS used FROM calls WHERE day=? GROUP BY agent").all(day); }
  available(day = this.day()) { if(this.moneyMode())return this.moneyAvailable(day);return this.limit() - this.usage(day).reduce((n,r) => n + Number(r.used),0); }
  reserve(id: string, agent: string, tokens: number) { if (!Number.isSafeInteger(tokens) || tokens < 0) throw Error('invalid reservation');
    return this.transaction(() => { if(this.db.prepare('SELECT id FROM calls WHERE id=?').get(id)) throw Error('重复请求 ID'); const day=this.day();if(tokens > this.available(day)) throw Error('共享 token 额度不足，已停止模型请求'); this.db.prepare("INSERT INTO calls VALUES(?,?,?,?,NULL,'reserved')").run(id,day,agent,tokens); }); }
  settle(id: string, actual?: number) { this.transaction(() => { const row = this.db.prepare('SELECT * FROM calls WHERE id=?').get(id); if(!row || row.status === 'settled') return;
    if(actual !== undefined && (!Number.isSafeInteger(actual) || actual < 0)) throw Error('invalid usage');
    this.db.prepare('UPDATE calls SET actual=?,status=? WHERE id=?').run(actual ?? null,actual === undefined ? 'uncertain' : 'settled',id); }); }
  history(id: string) { return this.db.prepare('SELECT * FROM history WHERE agent=? ORDER BY at').all(id); }
  deleteAgent(id:string,version:number) {
    return this.transaction(()=>{
      const before=this.agent(id);if(before.version!==version||before.deletedAt)throw Error('角色状态已变化，请刷新');
      const after={...before,paused:true,deletedAt:new Date().toISOString(),version:before.version+1};
      this.db.prepare('UPDATE agents SET body=? WHERE id=?').run(JSON.stringify(after),id);
      for(const row of this.db.prepare('SELECT id,body FROM tasks WHERE agent=?').all(id)){
        const task=JSON.parse(String(row.body));if(['pending','paused','running'].includes(task.status)){task.status='cancelled';this.db.prepare('UPDATE tasks SET status=?,body=? WHERE id=?').run(task.status,JSON.stringify(task),row.id);}
      }
      this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(),id,after.deletedAt,'user:delete',JSON.stringify(before),JSON.stringify(after));return after;
    });
  }
  restoreAgent(id:string) {
    return this.transaction(()=>{const before=this.agent(id);if(!before.deletedAt)throw Error('角色未删除');const after={...before,paused:true,version:before.version+1};delete after.deletedAt;after.config={...after.config,modules:{...after.config.modules,wechat:false,qq:false}};
      this.db.prepare('UPDATE agents SET body=? WHERE id=?').run(JSON.stringify(after),id);this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(),id,new Date().toISOString(),'user:restore',JSON.stringify(before),JSON.stringify(after));return after;});
  }
  moneyMode(){return this.db.prepare("SELECT value FROM settings WHERE id='budgetMode'").get()?.value!=='token';}
  budgetUnits(){return Number(this.db.prepare("SELECT value FROM settings WHERE id='dailyBudgetUnits'").get()?.value??0);}
  setBudgetByUser(yuan:number){const units=Math.round(yuan*1e8);if(!Number.isFinite(yuan)||yuan<0||!Number.isSafeInteger(units))throw Error('请输入有效人民币金额');this.transaction(()=>{this.db.prepare("INSERT OR REPLACE INTO settings VALUES('dailyBudgetUnits',?)").run(String(units));this.db.prepare("INSERT OR REPLACE INTO settings VALUES('budgetMode','cny')").run();});}
  costUsage(day=this.day()){return this.db.prepare("SELECT agent,SUM(actual) AS used FROM costs WHERE day=? AND status='settled' GROUP BY agent").all(day);}
  moneyAvailable(day=this.day()){return this.budgetUnits()-this.costUsage(day).reduce((n,r)=>n+Number(r.used),0);}
  budgetState(now=new Date()){
    const day=this.day(now),usage=this.costUsage(day).map(u=>({agent:u.agent,yuan:Number(u.used)/1e8}));
    const reserved=0; // Requests never occupy the budget before actual usage arrives.
    return {budget:this.budgetUnits()/1e8,usage,available:this.moneyAvailable(day)/1e8,reserved,budgetDay:day,resetAt:this.nextResetAt(now),timeZone:this.zone};
  }
  reserveMoney(id:string,agent:string,tokens:number,units:number,pricing:unknown){
    if(!Number.isSafeInteger(units)||units<0)throw Error('无效费用记录');
    this.transaction(()=>{
      const day=this.day();
      if(this.moneyAvailable(day)<=0)throw Error('今日模型预算已用完；每日 01:00 刷新预算');
      // Keep the request receipt for settlement, without reserving tokens or money.
      this.db.prepare("INSERT INTO calls VALUES(?,?,?,?,NULL,'reserved')").run(id,day,agent,0);
      this.db.prepare("INSERT INTO costs VALUES(?,?,?,?,NULL,'reserved',?)").run(id,day,agent,0,JSON.stringify(pricing));
    });
  }
  settleMoney(id:string,tokens?:number,units?:number){this.transaction(()=>{const row=this.db.prepare('SELECT status FROM costs WHERE id=?').get(id);if(!row||row.status==='settled')return;if(units!==undefined&&(!Number.isSafeInteger(units)||units<0))throw Error('无效实际费用');this.db.prepare('UPDATE calls SET actual=?,status=? WHERE id=?').run(tokens??null,tokens===undefined?'uncertain':'settled',id);this.db.prepare('UPDATE costs SET actual=?,status=? WHERE id=?').run(units??null,units===undefined?'uncertain':'settled',id);});}
  close() { this.db.close(); }
}
