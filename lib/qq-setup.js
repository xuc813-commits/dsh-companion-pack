import { chooseQqProcess, compatibleProcess } from "./qq-process.js";
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
export class QqSetup {
    program;
    runtime;
    child;
    enabled = false;
    error = '';
    busy = false;
    account = '';
    sessionToken = '';
    boundPid = 0;
    loadAttempted = false;
    timer;
    boundStartedAt = '';
    selection;
    processCache = [];
    processCacheAt = 0;
    loadAttempts = 0;
    nextLoadAt = 0;
    dataDir;
    webSecret;
    dir;
    token;
    wsPort = 45301;
    httpPort = 45300;
    constructor(program, runtime) {
        this.program = program;
        this.runtime = runtime;
        this.dir = runtime.snowluma;
        this.dataDir = join(program, 'platforms', 'qq-data');
        mkdirSync(this.dataDir, { recursive: true });
        const secretFile = join(this.dataDir, 'service-secret.json');
        let secret;
        try {
            secret = JSON.parse(readFileSync(secretFile, 'utf8'));
        }
        catch { }
        this.webSecret = secret?.password ?? ('Rp!' + randomBytes(32).toString('base64url'));
        if (!secret)
            writeFileSync(secretFile, JSON.stringify({ password: this.webSecret }), { mode: 0o600 });
        const secrets = join(this.dataDir, 'connection.json');
        let saved;
        try {
            saved = JSON.parse(readFileSync(secrets, 'utf8'));
        }
        catch { }
        try {
            this.selection = JSON.parse(readFileSync(join(this.dataDir, 'binding.json'), 'utf8'));
        }
        catch { }
        this.token = saved?.token ?? randomBytes(32).toString('hex');
        if (!saved)
            writeFileSync(secrets, JSON.stringify({ token: this.token }), { mode: 0o600 });
    }
    connection() { return { wsUrl: `ws://127.0.0.1:${this.wsPort}`, accessToken: this.token, autoReply: false, allowPrivate: [], allowGroups: [] }; }
    async enable() {
        if (this.enabled && this.child && !this.child.killed)
            return;
        const consent = join(this.dataDir, 'consent.json');
        const policyHash = (file) => createHash('sha256').update(readFileSync(join(this.dir, file))).digest('hex');
        let accepted = false;
        try {
            const receipt = JSON.parse(readFileSync(consent, 'utf8'));
            accepted = receipt.eula === policyHash('EULA.md') && receipt.privacy === policyHash('PRIVACY.md');
        }
        catch { }
        if (!accepted)
            throw Error('请先运行 setup-runtime.ps1 配置 SnowLuma，并阅读与确认许可协议');
        const node = this.runtime.snowlumaNode, entry = join(this.dir, 'index.mjs');
        if (!existsSync(node) || !existsSync(entry))
            throw Error('QQ 适配文件尚未安装完成');
        const processes = await this.processes(true);
        let selection = this.selection;
        if (selection && !processes.some(p => p.pid === selection.pid && p.startedAt === selection.startedAt)) {
            selection = undefined;
            this.selection = undefined;
        }
        const chosen = chooseQqProcess(processes, selection, this.runtime.qq);
        if (!chosen && !(this.runtime.qq && existsSync(this.runtime.qq)))
            throw Error('请打开专用 QQ 窗口，或在运行组件配置中填写 QQ.exe 路径');
        this.boundPid = chosen?.pid ?? 0;
        this.boundStartedAt = chosen?.startedAt ?? '';
        this.loadAttempted = false;
        this.loadAttempts = 0;
        this.nextLoadAt = 0;
        const config = join(this.dataDir, 'config');
        mkdirSync(config, { recursive: true });
        const onebot = join(config, 'onebot.json');
        if (!existsSync(onebot))
            writeFileSync(onebot, JSON.stringify({ networks: { httpServers: [{ name: 'http-default', host: '127.0.0.1', port: this.httpPort, path: '/', enableWebSocket: false, accessToken: this.token, messageFormat: 'array', reportSelfMessage: false }], httpClients: [], wsServers: [{ name: 'ws-default', host: '127.0.0.1', port: this.wsPort, path: '/', role: 'Universal', accessToken: this.token, messageFormat: 'array', reportSelfMessage: false }], wsClients: [] }, statusCommand: { enabled: false }, historySync: { enabled: false }, notifications: { channelIds: [] } }, null, 2));
        const temp = join(this.program, 'tmp');
        mkdirSync(temp, { recursive: true });
        const log = openSync(join(this.dataDir, 'roleplay-gateway.log'), 'a');
        this.child = spawn(node, [entry], { cwd: this.dataDir, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, TEMP: temp, TMP: temp, SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD: this.webSecret, SNOWLUMA_ACCEPT_EULA: '1', SNOWLUMA_ACCEPT_PRIVACY: '1', SNOWLUMA_WEBUI_HOST: '127.0.0.1', SNOWLUMA_WEBUI_PORT: '45299', SNOWLUMA_ONEBOT_HTTP_PORT: String(this.httpPort), SNOWLUMA_ONEBOT_WS_PORT: String(this.wsPort), SNOWLUMA_HOOK_AUTOLOAD: '0', SNOWLUMA_HOOK_AUTOLOAD_ALL: '0' } });
        closeSync(log);
        this.child.on('error', () => { this.error = 'QQ 适配程序未能启动'; });
        this.child.on('exit', code => { if (this.enabled)
            this.error = `QQ 适配程序已退出（${code}）`; });
        this.enabled = true;
        this.timer = setInterval(() => void this.status(), 2500);
        this.timer.unref();
        if (!this.boundPid) {
            const exe = this.runtime.qq;
            const qq = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
            qq.unref();
            this.boundPid = qq.pid ?? 0;
            writeFileSync(join(this.dataDir, 'session.json'), JSON.stringify({ createdAt: new Date().toISOString(), dedicatedLogin: true }));
        }
    }
    async processes(force = false) {
        if (!force && Date.now() - this.processCacheAt < 10000)
            return this.processCache;
        const command = "@(Get-CimInstance Win32_Process -Filter \"Name = 'QQ.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type(?:=|\\s)' } | ForEach-Object { $qqProcess=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [PSCustomObject]@{pid=$_.ProcessId;path=$_.ExecutablePath;startedAt=$_.CreationDate.ToUniversalTime().ToString('o');visible=($null -ne $qqProcess -and $qqProcess.MainWindowHandle -ne 0)} }) | ConvertTo-Json -Compress";
        const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
        const raw = JSON.parse(result.stdout.trim() || '[]'), list = Array.isArray(raw) ? raw : [raw];
        this.processCache = list.filter(p => Number.isSafeInteger(p.pid) && typeof p.startedAt === 'string');
        this.processCacheAt = Date.now();
        return this.processCache;
    }
    async select(pid, startedAt) { if (this.enabled)
        throw Error('请先关闭 QQ 接入，再切换窗口'); const selected = chooseQqProcess(await this.processes(true), { pid, startedAt }, this.runtime.qq); if (!selected)
        throw Error('QQ 窗口不存在'); this.selection = { pid: selected.pid, startedAt: selected.startedAt }; writeFileSync(join(this.dataDir, 'binding.json'), JSON.stringify(this.selection)); return { selected: this.selection }; }
    async web(path, body) {
        const response = await fetch('http://127.0.0.1:45299' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(this.sessionToken ? { authorization: 'Bearer ' + this.sessionToken } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (!response.ok)
            throw Error(result.message ?? `QQ 适配请求失败（${response.status}）`);
        return result;
    }
    async status() {
        if (!this.enabled) {
            try {
                const processes = (await this.processes()).filter(p => compatibleProcess(p, this.runtime.qq)), valid = this.selection && processes.some(p => p.pid === this.selection.pid && p.startedAt === this.selection.startedAt);
                return { enabled: false, status: processes.length > 1 && !valid ? 'needs_selection' : 'closed', processes, selectedPid: valid ? this.selection?.pid : undefined };
            }
            catch {
                return { enabled: false, status: 'error', error: '读取 QQ 窗口失败，请重试', processes: [] };
            }
        }
        if (this.busy)
            return { enabled: true, status: this.account ? 'connected' : 'waiting_qq' };
        this.busy = true;
        try {
            if (!this.sessionToken) {
                const login = await this.web('/api/login', { password: this.webSecret });
                if (!login.token)
                    throw Error('QQ 适配登录失败');
                this.sessionToken = login.token;
            }
            const processes = (await this.web('/api/processes')).list ?? [];
            const current = processes.find((p) => p.pid === this.boundPid);
            if (this.boundStartedAt) {
                const live = (await this.processes(!this.loadAttempted)).find(p => p.pid === this.boundPid && p.startedAt === this.boundStartedAt);
                if (!live)
                    throw Error('所选 QQ 已重启，请关闭接入后重新选择');
            }
            if (!current) {
                this.error = '等待独立 QQ 窗口';
                return { enabled: true, status: 'waiting_qq', error: this.error };
            }
            if (!this.loadAttempted) {
                if (this.loadAttempts >= 3)
                    throw Error('QQ 适配加载失败，请关闭接入后重试');
                if (Date.now() < this.nextLoadAt)
                    return { enabled: true, status: 'waiting_qq', error: this.error || undefined };
                this.loadAttempts++;
                this.nextLoadAt = Date.now() + 15000;
                const loaded = await this.web(`/api/processes/${this.boundPid}/load`, {});
                if (loaded.success === false)
                    throw Error(loaded.message ?? loaded.process?.error ?? 'QQ 版本暂不支持');
                this.loadAttempted = true;
            }
            const r = await fetch(`http://127.0.0.1:${this.httpPort}/get_login_info`, { method: 'POST', headers: { authorization: 'Bearer ' + this.token, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(1500) });
            if (r.ok) {
                const data = await r.json();
                if (data.retcode === 0 && data.data?.user_id) {
                    const expected = String(current.account?.uin ?? current.uin ?? '');
                    if (!expected || expected !== String(data.data.user_id))
                        throw Error('网关账号与所选 QQ 不一致，暂未接入');
                    this.account = String(data.data.user_id);
                    this.error = '';
                    return { enabled: true, status: 'connected', account: this.account };
                }
            }
            return { enabled: true, status: 'waiting_qq', ...(this.error ? { error: this.error } : {}) };
        }
        catch (e) {
            this.error = e.message.replace(/Bearer \S+/g, '[hidden]');
            return { enabled: true, status: 'waiting_qq', error: this.error };
        }
        finally {
            this.busy = false;
        }
    }
    stop() { this.enabled = false; clearInterval(this.timer); if (this.child?.pid)
        spawnSync('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); this.child = undefined; this.sessionToken = ''; this.account = ''; }
}
