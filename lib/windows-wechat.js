import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
export function wechatMode(value) { if (value === undefined || value === 'ilink')
    return 'ilink'; if (value === 'windows')
    return 'windows'; throw Error('无效微信接入方式'); }
export function validateWindowsConfig(c) {
    if (!c || !['account', 'selfId', 'dbDir'].every(k => typeof c[k] === 'string' && c[k].trim()))
        throw Error('连接配置缺少账号或数据目录');
    if (!/^[A-Za-z0-9_.-]{1,127}$/.test(c.account) || !isAbsolute(c.dbDir) || ['.', '..'].includes(c.account) || !/^[A-Za-z0-9_.@-]{1,127}$/.test(c.selfId))
        throw Error('账号目录或微信数据路径无效');
    if (!Array.isArray(c.chats) || !c.chats.length || c.chats.some((x) => !x || typeof x.id !== 'string' || typeof x.name !== 'string' || !x.name.trim() || !x.id.trim() || (x.id.endsWith('@chatroom') && x.trigger !== 'mention')))
        throw Error('请选择明确允许的聊天，群聊需设置被 @ 时回复');
    if (new Set(c.chats.map((x) => x.id)).size !== c.chats.length)
        throw Error('允许聊天不能重复');
    return c;
}
export function installWindowsConfig(input, dest, moduleFile, defaultEngine) {
    if (typeof input !== 'string' || !isAbsolute(input))
        throw Error('请选择连接配置文件的完整路径');
    const c = validateWindowsConfig(JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')));
    const next = { ...c, moduleFile, engineDir: c.engineDir ?? defaultEngine };
    delete next.processId;
    if (!isAbsolute(next.engineDir))
        throw Error('发送组件路径需要完整目录');
    mkdirSync(resolve(dest, '..'), { recursive: true });
    writeFileSync(dest, JSON.stringify(next, null, 2), { mode: 0o600 });
    return dest;
}
export function windowsPreflight(file, python, source) {
    if (!file || !existsSync(file))
        return { status: 'needs_config', ready: false, error: '请先选择 Windows 微信连接配置' };
    try {
        const c = validateWindowsConfig(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
        if (!existsSync(python))
            return { status: 'missing_component', ready: false, error: '缺少微信运行组件' };
        if (!existsSync(join(c.dbDir, c.account, 'db_storage')))
            return { status: 'needs_login', ready: false, error: '未找到所选账号的数据，请先在 Windows 微信登录' };
        if (!c.engineDir || !existsSync(join(c.engineDir, 'current.json')))
            return { status: 'missing_component', ready: false, error: '缺少 Windows 微信发送组件' };
        const build = JSON.parse(readFileSync(join(c.engineDir, 'current.json'), 'utf8').replace(/^\uFEFF/, ''));
        if (!build.file || !isAbsolute(build.file) || !existsSync(build.file))
            throw Error('发送组件文件不存在');
        const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
        if (hash(build.file) !== build.sha256 || hash(source) !== build.sourceSha256)
            throw Error('发送组件校验失败，请重新构建');
        return { status: 'ready', ready: true };
    }
    catch (e) {
        return { status: 'needs_config', ready: false, error: e.message };
    }
}
