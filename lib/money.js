import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
// Tariffs and holiday calendar follow the installed dsh-whale-widget-bowl.
// Official tariff verified 2026-10-29. Reasoning tokens are part of outputTokens.
const HOLIDAYS = {
    '2026-01-01': 1, '2026-01-02': 1, '2026-01-03': 1, // 元旦 1/1–1/3（1/4 周日上班）
    '2026-02-15': 1, '2026-02-16': 1, '2026-02-17': 1, '2026-02-18': 1, '2026-02-19': 1, // 春节 2/15–2/23（9 天）
    '2026-02-20': 1, '2026-02-21': 1, '2026-02-22': 1, '2026-02-23': 1,
    '2026-04-04': 1, '2026-04-05': 1, '2026-04-06': 1, // 清明 4/4–4/6
    '2026-05-01': 1, '2026-05-02': 1, '2026-05-03': 1, '2026-05-04': 1, '2026-05-05': 1, // 劳动节 5/1–5/5（5/9 周六上班）
    '2026-06-19': 1, '2026-06-20': 1, '2026-06-21': 1, // 端午 6/19–6/21
    '2026-09-25': 1, '2026-09-26': 1, '2026-09-27': 1, // 中秋 9/25–9/27
    '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, // 国庆 10/1–10/7（9/20 周日、10/10 周六上班）
    '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1,
};
export function isPeak(at = new Date()) { const bj = new Date(at.getTime() + 8 * 3600000), h = bj.getUTCHours(), d = bj.getUTCDay(); return d !== 0 && d !== 6 && !HOLIDAYS[bj.toISOString().slice(0, 10)] && ((h >= 9 && h < 12) || (h >= 14 && h < 18)); }
export function priceFor(provider, model) {
    const m = model.toLowerCase();
    if (['deepseek-account', 'deepseek-official'].includes(provider)) {
        if (m === 'deepseek-v4-pro')
            return { model, hit: [.15, .3], miss: [4.5, 9], out: [13.5, 27], source: 'DeepSeek' };
        if (['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(m))
            return { model, hit: [.02, .04], miss: [1, 2], out: [4, 8], source: 'DeepSeek' };
    }
    try {
        const models = JSON.parse(readFileSync(join(resolveDshHome(), '.dshw-api.json'), 'utf8')).models ?? [];
        const matches = models.filter((x) => x.price && (x.matchIds ?? [x.name, x.id]).some((k) => k?.length >= 3 && m.includes(k.toLowerCase())));
        const entry = matches.sort((a, b) => Math.max(...(b.matchIds ?? [b.id]).map((s) => s.length)) - Math.max(...(a.matchIds ?? [a.id]).map((s) => s.length)))[0];
        if (entry) {
            const p = entry.price, rate = String(p.cur ?? 'CNY').toUpperCase() === 'CNY' ? 1 : String(p.cur).toUpperCase() === 'USD' ? Number(p.rate) : NaN;
            const vals = [p.hit, p.miss, p.out].map(Number);
            if (!(rate > 0) || vals.some(v => !Number.isFinite(v) || v < 0))
                throw Error('单价无效');
            return { model, hit: [vals[0] * rate, vals[0] * rate], miss: [vals[1] * rate, vals[1] * rate], out: [vals[2] * rate, vals[2] * rate], source: 'whale-custom' };
        }
    }
    catch { }
    throw Error('此模型尚未配置人民币单价，请先在鲸鱼插件中填写单价');
}
export function usageCost(u, p, at = new Date()) { const slot = isPeak(at) ? 1 : 0; return Math.round(((u.inputTokens + (u.cacheWriteTokens ?? 0)) * p.miss[slot] + (u.cacheReadTokens ?? 0) * p.hit[slot] + u.outputTokens * p.out[slot]) * 100); }
export function reserveCost(tokens, output, capacity, p, media = false) { const miss = Math.max(...p.miss), out = Math.max(...p.out); if (media || !output)
    return Math.ceil(tokens * Math.max(miss, out) * 100); return Math.ceil(Math.min(capacity * Math.max(miss, out), Math.max(0, tokens - output) * miss + output * out) * 100); }
