import { randomUUID } from 'node:crypto';
export class Scheduler {
    store;
    send;
    timer;
    running = false;
    stopped = false;
    waiters = [];
    constructor(store, send) {
        this.store = store;
        this.send = send;
        // A crash during delivery is ambiguous; never silently repeat a potentially delivered action.
        for (const t of this.list())
            if (t.status === 'running')
                this.save({ ...t, status: 'uncertain' });
    }
    list(agent) { return this.store.db.prepare('SELECT body FROM tasks' + (agent ? ' WHERE agent=?' : '')).all(...(agent ? [agent] : [])).map(r => JSON.parse(String(r.body))); }
    save(t) { this.store.db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?,?,?,?)').run(t.id, t.agent, t.at, t.status, JSON.stringify(t)); this.arm(); return t; }
    add(agent, input, now = Date.now()) {
        this.store.agent(agent);
        const at = input.at ? Date.parse(input.at) : now + (input.after_minutes ?? input.silenceMinutes ?? 0) * 60000;
        if (!Number.isFinite(at) || at <= now || !input.note?.trim() || (input.silenceMinutes !== undefined && !(input.silenceMinutes > 0)))
            throw Error('任务需要未来时间与事项说明；绝对时间须带时区');
        if (input.at && !/(Z|[+-]\d\d:\d\d)$/.test(input.at))
            throw Error('请提供含时区的 ISO 时间');
        return this.save({ id: randomUUID(), agent, at: new Date(at).toISOString(), note: input.note, kind: input.kind ?? 'activity', silenceMinutes: input.silenceMinutes, status: 'pending', attempts: 0 });
    }
    change(agent, id, patch) { const task = this.list(agent).find(t => t.id === id); if (!task)
        throw Error('任务不存在'); if (patch.at && !Number.isFinite(Date.parse(patch.at)))
        throw Error('无效时间'); return this.save({ ...task, ...patch }); }
    spoke(agent, now = Date.now()) { for (const t of this.list(agent))
        if (t.status === 'pending' && t.silenceMinutes)
            this.save({ ...t, at: new Date(now + t.silenceMinutes * 60000).toISOString() }); }
    arm() { clearTimeout(this.timer); if (this.stopped)
        return; const next = this.list().filter(t => t.status === 'pending' && !this.store.agent(t.agent).paused).sort((a, b) => a.at.localeCompare(b.at))[0]; if (next) {
        this.timer = setTimeout(() => void this.tick(), Math.min(2147483647, Math.max(20, Date.parse(next.at) - Date.now())));
        this.timer.unref();
    } }
    async tick(now = Date.now()) {
        if (this.running || this.stopped)
            return;
        this.running = true;
        try {
            for (const t of this.list().filter(t => t.status === 'pending' && Date.parse(t.at) <= now && !this.store.agent(t.agent).paused).sort((a, b) => a.at.localeCompare(b.at))) {
                if (this.store.available() <= 0) {
                    this.save({ ...t, at: new Date(now + 60000).toISOString() });
                    continue;
                }
                this.save({ ...t, status: 'running' });
                try {
                    await this.send(t, new Date(now).toISOString());
                    if (!this.stopped)
                        this.save({ ...t, status: 'done' });
                }
                catch (e) {
                    if (!this.stopped)
                        this.save({ ...t, status: e?.uncertain ? 'uncertain' : 'pending', attempts: t.attempts + 1, at: new Date(now + Math.min(3600000, 60000 * 2 ** Math.min(t.attempts, 6))).toISOString() });
                }
                if (this.stopped)
                    break;
            }
        }
        finally {
            this.running = false;
            for (const resolve of this.waiters.splice(0))
                resolve();
            this.arm();
        }
    }
    stop() { this.stopped = true; clearTimeout(this.timer); }
    async settled() { if (this.running)
        await new Promise(resolve => this.waiters.push(resolve)); }
}
