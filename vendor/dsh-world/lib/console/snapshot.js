import { SessionId } from '@deepseek-ai/dsh-session';
import { createHistory, renderHistory } from "../history.js";
import { createDiaryReader } from "../life/diary.js";
const SNAPSHOT_TTL_MS = 5000;
export function estimateTokens(text) {
    const cjk = (text.match(/[㐀-鿿豈-﫿　-〿＀-￯]/g) ?? []).length;
    return Math.round(cjk * 0.6 + (text.length - cjk) / 3.5);
}
/** Read-only views for the console; repeated polling within a few seconds reuses one snapshot until `invalidate`. */
export function consoleSources(deps) {
    const { config, archive, lifeStore } = deps;
    const history = createHistory(archive);
    const diary = createDiaryReader(deps.diaryDir);
    let cached;
    async function compute() {
        const life = deps.life()?.snapshot();
        const home = life?.homeSessionId ? deps.ctx.agents.get(SessionId(life.homeSessionId)) : undefined;
        const window = deps.memoryTurns();
        const turns = await history.loadRecentTurns(config.worldId, window, deps.includesSession);
        const archiveScope = config.archiveScope ?? 'workspace';
        const selectedArchiveScope = deps.selectedArchiveScope?.() ?? archiveScope;
        // Never let a dead bridge take the whole console down with it: a broken QQ module shows as "not running".
        const qq = deps.qq ? await deps.qq().catch(() => null) : null;
        const native = deps.native?.() ?? null;
        return {
            worldId: config.worldId, timeZone: config.timeZone, now: new Date().toISOString(), running: deps.running(), name: deps.names().companion,
            budget: { daily: deps.dailyBudget() ?? null, today: life?.spend ?? null },
            life: life ? { homeSessionId: life.homeSessionId, status: home ? home.status : 'cold', alarm: life.alarm, review: life.review, recentWakes: lifeStore?.wakes().slice(-5).reverse() ?? [] } : null,
            health: [...(life?.faults ?? []), ...deps.faults()],
            memory: { turns: turns.length, windowTurns: window, archiveScope, selectedArchiveScope, restartRequired: archiveScope !== selectedArchiveScope, approxTokens: estimateTokens(renderHistory(turns, config.timeZone, deps.names(), archiveScope === 'home')), oldest: turns.at(-1)?.messages[0]?.occurredAt, ...archive.stats() },
            wechat: deps.wechat?.() ?? null,
            compactions: lifeStore?.compactions().slice(-5).reverse() ?? [],
            diaryDates: diary.dates(), activityDays: lifeStore?.activityDays() ?? [],
            qq: deps.qq ? qq : null,
            native,
            modules: deps.modules?.() ?? null,
        };
    }
    return {
        snapshot() {
            if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS)
                return cached.value;
            const entry = { at: Date.now(), value: compute() };
            cached = entry;
            entry.value.catch(() => { if (cached === entry)
                cached = undefined; });
            return entry.value;
        },
        invalidate() { cached = undefined; },
        activity: (day, outsideOnly) => lifeStore?.activity(day).filter(record => !outsideOnly || record.outside).reverse() ?? [],
        diary: date => diary.read(date),
    };
}
