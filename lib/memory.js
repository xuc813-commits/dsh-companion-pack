import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export class Memory {
    store;
    home;
    constructor(store, home) {
        this.store = store;
        this.home = home;
    }
    room(id) { this.store.agent(id); return join(this.home, 'worlds', id, 'room'); }
    archive(id, query = '', limit = 30) {
        this.store.agent(id);
        const file = join(this.home, 'worlds', id, 'archive.sqlite');
        if (!existsSync(file))
            return [];
        const db = new DatabaseSync(file, { readOnly: true });
        try {
            return db.prepare('SELECT body FROM records WHERE body LIKE ? ORDER BY occurredAt DESC LIMIT ?').all('%' + query + '%', Math.max(1, Math.min(100, limit))).map(r => JSON.parse(String(r.body)));
        }
        finally {
            db.close();
        }
    }
    source(id, source) { return this.archive(id, source, 100).find(r => r.recordId === source); }
    notes(id) { return this.store.db.prepare('SELECT * FROM notes WHERE agent=? ORDER BY at DESC').all(id); }
    note(agent, kind, text, sources, id = randomUUID(), version = 0) {
        if (!['summary', 'observation', 'interest', 'open_loop', 'external'].includes(kind) || !text?.trim() || !Array.isArray(sources))
            throw Error('无效记录');
        for (const source of sources)
            if (!this.source(agent, source) && !this.store.db.prepare('SELECT id FROM notes WHERE id=? AND agent=?').get(source, agent))
                throw Error('来源不存在于当前 agent');
        return this.store.transaction(() => {
            const old = this.store.db.prepare('SELECT * FROM notes WHERE id=?').get(id);
            if (old && (old.agent !== agent || old.version !== version))
                throw Error('记录版本冲突');
            if (!old && version !== 0)
                throw Error('记录不存在');
            this.store.db.prepare('INSERT OR REPLACE INTO notes VALUES(?,?,?,?,?,?,?)').run(id, agent, kind, text, JSON.stringify(sources), version + 1, new Date().toISOString());
            return { id, version: version + 1 };
        });
    }
    self(id) { const file = join(this.room(id), '我是谁.md'); const text = existsSync(file) ? readFileSync(file, 'utf8') : ''; return { text, version: createHash('sha256').update(text).digest('hex') }; }
    revise(id, text, expected, sources) {
        for (const source of sources)
            if (!this.source(id, source) && !this.store.db.prepare('SELECT id FROM notes WHERE id=? AND agent=?').get(source, id))
                throw Error('自述来源不存在');
        const old = this.self(id);
        if (old.version !== expected)
            throw Error('自述已更新，请重新读取');
        const file = join(this.room(id), '我是谁.md'), history = join(this.room(id), '我是谁.history');
        mkdirSync(history, { recursive: true });
        if (existsSync(file))
            copyFileSync(file, join(history, `${Date.now()}-${randomUUID()}.md`));
        mkdirSync(dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        writeFileSync(tmp, text, 'utf8');
        renameSync(tmp, file);
        this.store.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(randomUUID(), id, new Date().toISOString(), 'self:' + JSON.stringify(sources), JSON.stringify(old), JSON.stringify(this.self(id)));
        return this.self(id);
    }
    context(id) { return this.notes(id).slice(0, 20).map(n => `[${n.kind}; ${n.at}; 来源 ${n.sources}] ${n.text}`).join('\n').slice(0, 12000); }
}
