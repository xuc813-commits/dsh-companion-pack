import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportAgent, importAgent } from "./snapshot.js";
export function registerConsole(ctx, services) {
    const web = ctx.get('webServer'), { store, memory, create, update, mount, faults, scheduler, home, remove, restoreAgent, platform, wechatStatus, selectWechatMode, configureWindows, openWindowsWechat, weixins, qqSetup } = services;
    const body = async (req) => { let raw = ''; for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 1024 * 1024)
            throw Error('请求过大');
    } return JSON.parse(raw || '{}'); };
    ctx.effect(() => web.register({ kind: 'prefix', path: '/roleplay/api', handler: async (req, res) => {
            try {
                if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? '') || req.headers['sec-fetch-site'] === 'cross-site')
                    throw Error('只接受本机同源请求');
                const path = new URL(req.url, 'http://localhost').pathname.replace('/roleplay/api', '');
                let result;
                if (req.method === 'GET' && path === '/state')
                    result = { agents: store.list(), deleted: store.list(true).filter((a) => a.deletedAt).map((a) => ({ id: a.id, name: a.name })), tasks: scheduler.list().filter((t) => !store.agent(t.agent).deletedAt), ...store.budgetState(), faults: Object.fromEntries(faults) };
                else if (req.method === 'GET' && path === '/platform/status') {
                    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
                    store.agent(id);
                    result = { wechat: wechatStatus(id), qq: { ...await qqSetup.status(), enabled: store.agent(id).config.modules.qq } };
                }
                else if (req.method === 'POST' && req.headers['x-roleplay'] === '1' && String(req.headers['content-type']).startsWith('application/json')) {
                    const p = await body(req);
                    if (path === '/agents')
                        result = await create(p.name, p.basePreset ?? 'standard', p.copyConfigFrom);
                    else if (path === '/config')
                        result = await update(p.id, p.version, { config: p.config }, 'user');
                    else if (path === '/limit') {
                        store.setBudgetByUser(p.yuan);
                        result = { budget: store.budgetUnits() / 1e8 };
                    }
                    else if (path === '/agents/delete')
                        result = await remove(p.id, p.version);
                    else if (path === '/agents/restore')
                        result = await restoreAgent(p.id);
                    else if (path === '/platform')
                        result = await platform(p.id, p.kind, p.enabled);
                    else if (path === '/platform/qq/select') {
                        store.agent(p.id);
                        result = await qqSetup.select(p.pid, p.startedAt);
                    }
                    else if (path === '/platform/wechat/mode')
                        result = await selectWechatMode(p.id, p.mode);
                    else if (path === '/platform/wechat/windows/config')
                        result = await configureWindows(p.id, p.file);
                    else if (path === '/platform/wechat/windows/login')
                        result = openWindowsWechat(p.id);
                    else if (path === '/platform/wechat/refresh') {
                        if (wechatStatus(p.id).mode !== 'ilink')
                            throw Error('当前选择的是 Windows 微信');
                        store.agent(p.id);
                        result = await weixins.get(p.id)?.login();
                    }
                    else if (path === '/platform/wechat/test') {
                        store.agent(p.id);
                        result = await weixins.get(p.id)?.connectionTest();
                    }
                    else if (path === '/platform/wechat/verify') {
                        store.agent(p.id);
                        result = await weixins.get(p.id)?.checkLogin(p.code);
                    }
                    else if (path === '/export') {
                        result = await exportAgent(store, home, p.id, join(home, 'companion', 'exports', randomUUID()));
                    }
                    else if (path === '/import') {
                        result = importAgent(store, home, p.path, p.name);
                        await mount(result);
                        scheduler.arm();
                    }
                    else if (path === '/history')
                        result = store.history(p.id);
                    else if (path === '/self')
                        result = memory.self(p.id);
                    else
                        throw Error('未知接口');
                }
                else {
                    res.statusCode = 404;
                    result = { error: 'not found' };
                }
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(result));
            }
            catch (e) {
                res.statusCode = 400;
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
            }
        } }));
}
