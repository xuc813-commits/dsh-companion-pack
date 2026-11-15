import { spawn } from 'node:child_process';
import { join } from 'node:path';
export class Emotion {
    store;
    program;
    data;
    python;
    tails = new Map();
    constructor(store, program, data, python = process.env.DSH_COMPANION_PYTHON ?? 'python') {
        this.store = store;
        this.program = program;
        this.data = data;
        this.python = python;
    }
    request(id, operation) {
        if (!this.store.agent(id).config.emotion)
            return Promise.reject(Error('Emotion Engine 已关闭；没有状态读取或更新'));
        const run = async () => {
            if (!this.store.agent(id).config.emotion)
                throw Error('Emotion Engine 已关闭');
            return new Promise((resolve, reject) => {
                const child = spawn(this.python, ['-I', '-B', '-X', 'utf8', join(this.program, 'python', 'companion_rpc.py'), join(this.data, id, 'emotion.json')], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
                let out = '', err = '';
                const timer = setTimeout(() => { child.kill(); reject(Error('Emotion Engine 超时')); }, 30000);
                child.stdout.on('data', v => out += v);
                child.stderr.on('data', v => err += v);
                child.on('error', e => { clearTimeout(timer); reject(e); });
                child.on('close', () => { clearTimeout(timer); try {
                    const parsed = JSON.parse(out);
                    if (parsed.error)
                        reject(Error(parsed.error.message));
                    else
                        resolve(parsed.result);
                }
                catch {
                    reject(Error(err || 'Emotion Engine 无有效回复'));
                } });
                child.stdin.end(JSON.stringify({ ...operation, policy: this.store.agent(id).config.decay }));
            });
        };
        const result = (this.tails.get(id) ?? Promise.resolve()).catch(() => { }).then(run);
        this.tails.set(id, result);
        return result;
    }
    call(id, name, args = {}) { return this.request(id, { request: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { ...args, character_id: id, relationship_id: `${id}:user` } } } }); }
    async enable(id, freeze) { await this.call(id, 'emotion_engine_bind_identity'); await this.request(id, { operation: 'decay', freeze }); }
    async summary(id) { return this.call(id, 'emotion_engine_summary', { limit: 5 }); }
    async submit(id, source, at, text, pad, subject, eventType, trustEvidence) {
        const session = `experience-${source}`;
        await this.request(id, { operation: 'decay' });
        await this.call(id, 'emotion_engine_session_start', { session_id: session, event_id: `${source}:start`, occurred_at: at });
        const result = await this.call(id, 'emotion_engine_evaluate_and_record_turn', { ...pad, event: { session_id: session, event_id: source, occurred_at: at, message: text, subject, event_type: eventType, host_approved: true, memory_owner: 'self', source: 'model_inferred', trust_evidence: trustEvidence } });
        await this.call(id, 'emotion_engine_session_end', { session_id: session, event_id: `${source}:end`, occurred_at: at });
        await this.call(id, 'emotion_engine_settle_trust', { session_id: session, event_id: `${source}:settlement`, occurred_at: at });
        return result;
    }
}
