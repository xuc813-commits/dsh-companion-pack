import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = path.dirname(fileURLToPath(import.meta.url));
export const workspace = path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'companion', 'undermind');
export const authDir = path.join(workspace, 'oauth');
export const configPath = path.join(workspace, 'client.json');
export const endpoint = 'https://mcp.undermind.ai/mcp';
export const callback = 'http://127.0.0.1:37891/oauth/callback';

async function config() {
  try { return JSON.parse(await fs.readFile(configPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function argsFor(mode, settings) {
  if (!!settings.clientId === !!settings.metadataUrl) {
    throw new Error('需要 Undermind 为 DSH 登记的 client ID，或你控制的公开 HTTPS 客户端说明文件地址。请先运行 configure。');
  }
  const args = [endpoint, '37891', '--host', '127.0.0.1', '--transport', 'http-only',
    '--auth-timeout', '600', '--connect-timeout', '20',
    '--static-oauth-client-metadata', JSON.stringify({
      client_name: 'DeepSeek Harness - Undermind Bridge',
      scope: 'mcp', token_endpoint_auth_method: 'none',
    })];
  if (settings.clientId) args.push('--static-oauth-client-info', JSON.stringify({ client_id: settings.clientId }));
  else args.push('--client-metadata-url', settings.metadataUrl);
  if (mode === 'stdio') args.push('--silent');
  return args;
}

async function secureStore() {
  await fs.mkdir(authDir, { recursive: true });
  const temp = path.join(workspace, 'work', 'tmp');
  await fs.mkdir(temp, { recursive: true });
  process.env.TEMP = temp;
  process.env.TMP = temp;
  process.env.MCP_REMOTE_CONFIG_DIR = authDir;
  if (process.platform === 'win32') {
    const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = identity.stdout?.match(/S-1-5-[0-9-]+/)?.[0];
    if (identity.status !== 0 || !sid) throw new Error('无法确认本机用户，未创建登录凭据。');
    const acl = spawnSync('icacls.exe', [authDir, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
    if (acl.status !== 0) throw new Error('无法保护本地凭据目录，已停止登录。');
  } else await fs.chmod(authDir, 0o700);
}

async function tokenSummaries(dir) {
  const summaries = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) summaries.push(...await tokenSummaries(full));
    else if (entry.name.endsWith('tokens.json')) {
      try {
        const tokens = JSON.parse(await fs.readFile(full, 'utf8'));
        summaries.push({ hasAccessToken: !!tokens.access_token, hasRefreshToken: !!tokens.refresh_token,
          expiresAt: typeof tokens.expires_at === 'number' ? new Date(tokens.expires_at).toISOString() : null });
      } catch { summaries.push({ unreadable: true }); }
    }
  }
  return summaries;
}

async function configure(argv) {
  const key = argv[0];
  const value = argv[1]?.trim();
  if (!value || !['--client-id', '--metadata-url'].includes(key) || argv.length !== 2) {
    throw new Error('用法：node bridge.mjs configure --client-id <Undermind 登记的 ID>，或 --metadata-url <HTTPS JSON 地址>');
  }
  let settings;
  if (key === '--metadata-url') {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname === '/') throw new Error('客户端说明文件必须使用公开 HTTPS 地址。');
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`读取客户端说明文件失败：${response.status}`);
    const document = await response.json();
    if (document.client_id !== value || !document.redirect_uris?.includes(callback) || document.token_endpoint_auth_method !== 'none') {
      throw new Error(`客户端说明必须声明正确的 client_id、回调 ${callback} 和 token_endpoint_auth_method: none。`);
    }
    settings = { metadataUrl: value };
  } else {
    if (/\s/.test(value) || value.length > 500) throw new Error('client ID 格式无效。');
    settings = { clientId: value };
  }
  await fs.mkdir(workspace, {recursive:true});
  await fs.writeFile(configPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('应用身份配置已保存。下一步运行 node bridge.mjs auth。');
}

async function main() {
  const [mode = 'status', ...argv] = process.argv.slice(2);
  if (mode === 'configure') return configure(argv);
  const settings = await config();
  if (mode === 'status') {
    console.log(JSON.stringify({ identityConfigured: !!(settings.clientId || settings.metadataUrl),
      endpoint, callback, tokenStore: authDir, tokens: await tokenSummaries(authDir) }, null, 2));
    return;
  }
  if (!['auth', 'stdio'].includes(mode)) throw new Error('支持的命令：configure、auth、stdio、status。');
  const args = argsFor(mode, settings);
  if (mode === 'stdio' && !(await tokenSummaries(authDir)).some(t => t.hasAccessToken)) {
    throw new Error('请先运行 node bridge.mjs auth 完成浏览器授权，然后重启 DSH。');
  }
  await secureStore();
  process.argv = [process.execPath, '', ...args];
  const entry = path.join(root, 'node_modules', 'mcp-remote', 'dist', mode === 'auth' ? 'client.js' : 'proxy.js');
  await import(pathToFileURL(entry).href);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
