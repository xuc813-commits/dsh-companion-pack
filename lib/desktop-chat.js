import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const desktopIdentity = (accountId) => ({ channel: 'desktop', accountId, conversationType: 'private', conversationId: 'chatbox', speakerId: 'desktop:owner', speakerName: '用户' });
export const DESKTOP_POKE_TEXT = '（你拍了拍我）看一眼屏幕，看完就停。';
export function createDesktopChat(deps) {
    const dir = join(deps.worldDir, 'room', '工具');
    const poke = join(dir, 'poke.txt'), queue = join(dir, 'danmaku_queue.txt');
    const file = join(deps.worldDir, 'chatbox-bridge.json');
    const size = () => existsSync(poke) ? statSync(poke).size : 0;
    let state;
    try {
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        if (!Number.isSafeInteger(saved.offset) || saved.offset < 0)
            throw Error('invalid cursor');
        state = { ...saved, pending: saved.pending === true };
        // A dispatched turn may have completed before a crash. Never repeat it automatically.
        if (state.phase === 'answering')
            state = { ...state, phase: 'error', pending: false, error: '上次拍拍处理被重启打断，请再拍一次' };
    }
    catch {
        state = { offset: size(), pending: false, phase: 'idle' };
    }
    let busy = false, stopped = false, timer;
    const save = () => {
        mkdirSync(deps.worldDir, { recursive: true });
        writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
        renameSync(file + '.tmp', file);
    };
    const output = (text, id) => {
        if (!text.trim() || stopped)
            return;
        mkdirSync(dir, { recursive: true });
        appendFileSync(queue, JSON.stringify({ text: text.trim(), at: Date.now(), source: 'chatbox-poke', ...(id ? { requestId: id } : {}) }) + '\n', 'utf8');
    };
    async function deliver() {
        if (busy || stopped || !state.pending)
            return;
        state.pending = false;
        if (!deps.enabled()) {
            state.phase = 'error';
            state.error = '角色已暂停，启动后再拍一下头像';
            save();
            output(state.error);
            return;
        }
        busy = true;
        try {
            state.phase = 'answering';
            delete state.error;
            save();
            const reply = await deps.ask(DESKTOP_POKE_TEXT);
            if (stopped || !deps.enabled())
                return;
            if (!reply.text.trim())
                throw Error('角色这一轮没有返回文字，请再拍一下');
            output(reply.text, reply.id);
            state.phase = 'replied';
            state.replyId = reply.id;
            state.lastReplyAt = new Date().toISOString();
        }
        catch (error) {
            if (stopped)
                return;
            state.phase = 'error';
            state.error = error instanceof Error ? error.message : String(error);
            deps.log(error);
            output('这次拍拍没能接通，请稍后再拍一下。');
        }
        finally {
            busy = false;
            if (!stopped) {
                save();
                if (state.pending)
                    void deliver().catch(deps.log);
            }
        }
    }
    function poll() {
        if (stopped)
            return;
        try {
            const end = size();
            if (end < state.offset) {
                state.offset = 0;
                save();
            }
            if (end > state.offset) {
                // Read a bounded chunk, and commit only complete lines.
                const bytes = Buffer.alloc(Math.min(64 * 1024, end - state.offset));
                const fd = openSync(poke, 'r');
                let n;
                try {
                    n = readSync(fd, bytes, 0, bytes.length, state.offset);
                }
                finally {
                    closeSync(fd);
                }
                const chunk = bytes.subarray(0, n), newline = chunk.lastIndexOf(10);
                if (newline >= 0) {
                    state.offset += newline + 1;
                    if (chunk.subarray(0, newline + 1).toString('utf8').split(/\r?\n/).some(line => /^\d{10,13}$/.test(line.trim()))) {
                        state.pending = true;
                        state.lastPokeAt = new Date().toISOString();
                    }
                    save();
                }
            }
            void deliver().catch(deps.log);
        }
        catch (error) {
            deps.log(error);
        }
    }
    return {
        poll,
        snapshot: () => ({ ...state, busy }),
        start() { if (timer || stopped)
            return; save(); timer = setInterval(poll, 500); timer.unref(); poll(); },
        stop() { stopped = true; clearInterval(timer); },
    };
}
