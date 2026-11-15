import { createQuietBatch } from "./quiet-batch.js";
import { replyParagraphs } from "./reply-paragraphs.js";
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { speakerIdentity, conversationKey } from "../shared/identity.js";
import { createBridge } from "./snowluma.js";
import { createQqHome } from "./home.js";
import { createNativeBridge } from "./native-bridge.js";
/** The largest single message we accept from QQ; anything longer is cut before it reaches her. */
const MAX_INCOMING = 2_000;
/** How many distinct messages we remember to drop repeats of. */
const SEEN_LIMIT = 500;
export function createQqNativeModule(deps) {
    const home = createQqHome({ ctx: deps.ctx, home: deps.home });
    const seen = new Set();
    const contexts = new Map();
    const answering = new Set();
    // 她自己的那条线：最后一次见到的账号。
    let lastSelfId = '';
    let client;
    let nativeBridge;
    let stopped = false;
    // 面板要的那几个数自己记：传输层只交出一个 getState()，不带计数。
    const stats = {
        sent: 0, failed: 0, blocked: 0, lastEventAt: null, lastBlockedAt: null, lastError: null,
    };
    // 拨过的开关写在 stateFile 里，重载不丢；配置里那个是出厂默认。
    let overrides = {};
    let overridesRead = false;
    function readOverrides() {
        if (overridesRead)
            return;
        overridesRead = true;
        const file = deps.stateFile;
        if (!file)
            return;
        try {
            overrides = JSON.parse(readFileSync(file, 'utf8'));
        }
        catch {
            overrides = {};
        }
    }
    function writeOverrides() {
        const file = deps.stateFile;
        if (!file)
            return;
        try {
            writeFileSync(file, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
        }
        catch (error) {
            deps.logger.warn('QQ 原生通道：开关没存下来', error);
        }
    }
    const settings = () => {
        readOverrides();
        const base = deps.config();
        // 面板上改过端口就以面板为准；其余字段还是配置里那套。
        const bridge = overrides.bridge?.port === undefined ? base.bridge : { ...base.bridge, port: overrides.bridge.port };
        return {
            ...base,
            ...(overrides.autoReply === undefined ? {} : { autoReply: overrides.autoReply }),
            bridge,
        };
    };
    const batches = createQuietBatch(async (messages) => {
        const latest = messages[messages.length - 1];
        await respond({ ...latest, text: messages.map(message => message.text).join('\n') });
    }, { ...(deps.messageTimers ? { timers: deps.messageTimers } : {}), onError: error => deps.logger.warn('QQ 连续消息处理失败', error) });
    function remember(messageId) {
        if (!messageId)
            return true;
        if (seen.has(messageId))
            return false;
        seen.add(messageId);
        if (seen.size > SEEN_LIMIT) {
            const first = seen.values().next().value;
            if (first !== undefined)
                seen.delete(first);
        }
        return true;
    }
    // 她说出去的消息 id。有人引用她的话，引用的就是这个 id。
    const sentIds = new Set();
    function rememberSent(id) {
        const value = id == null ? '' : String(id);
        if (value === '')
            return;
        sentIds.add(value);
        if (sentIds.size > SEEN_LIMIT) {
            const oldest = sentIds.values().next().value;
            if (oldest !== undefined)
                sentIds.delete(oldest);
        }
    }
    /**
     * 群里这句是不是在叫她。
     *
     * 量过：不做这个判断时，群里没被叫到的每一句都会让她跑完一整轮、还往群里冒一条——哪怕她自己在话里
     * 写的是「这句不接」，钱和噪声都已经花了。所以只有被 @ 到、有人引用过她的话、或者命中配的关键词，
     * 才把话递到她跟前；其余只记进那个群的上下文，等她真被叫到时知道刚才在说什么。
     */
    function directedAtHer(message, config) {
        if (config.groupTrigger === 'all')
            return true;
        for (const segment of message.segments ?? []) {
            const data = segment?.data ?? {};
            if (segment?.type === 'at' && (data.qq === 'all' || String(data.qq ?? '') === message.selfId))
                return true;
            if (segment?.type === 'reply' && data.id != null && sentIds.has(String(data.id)))
                return true;
        }
        return config.groupKeywords.some(word => word !== '' && message.text.includes(word));
    }
    function allowed(identity) {
        const config = settings();
        return identity.conversationType === 'group'
            ? config.allowGroups.includes(identity.conversationId)
            : config.allowPrivate.includes(identity.speakerId.slice('qq:'.length));
    }
    function pushContext(key, message, limit) {
        const list = contexts.get(key) ?? [];
        list.push(message);
        while (list.length > Math.max(1, Math.min(limit, 20)))
            list.shift();
        contexts.set(key, list);
    }
    async function deliver(message) {
        if (stopped)
            return;
        const config = settings();
        if (!config.enabled)
            return;
        const messageId = message.messageId;
        if (!remember(messageId))
            return;
        const selfId = message.selfId;
        const userId = message.userId;
        // Her own words come back through the same socket; answering them would be talking to herself.
        if (!userId || userId === selfId)
            return;
        const text = message.text.trim().slice(0, MAX_INCOMING);
        if (!text)
            return;
        const isGroup = message.kind === 'group';
        const conversationId = isGroup ? message.groupId ?? '' : userId;
        if (!conversationId)
            return;
        stats.lastEventAt = new Date().toISOString();
        // 有人说话了：房间安静了多久她得记得，顺带记住自己这个号是哪个。
        lastSelfId = selfId || lastSelfId;
        // 引擎开没开都得记 —— 不然开关一拨开，它以为「一直没人说过话」。
        const speakerName = message.sender?.card || message.sender?.nickname || '';
        let identity;
        try {
            identity = speakerIdentity({
                channel: 'qq',
                accountId: selfId || '0',
                speakerId: `qq:${userId}`,
                ...(speakerName ? { speakerName } : {}),
                conversationId,
                conversationType: isGroup ? 'group' : 'private',
                ...(isGroup ? { conversationName: `群 ${conversationId}` } : {}),
                ...(messageId ? { platformMessageId: messageId } : {}),
            });
        }
        catch (error) {
            deps.logger.warn('QQ 消息身份不合法:', error);
            return;
        }
        // 不在白名单也算「到过」：不然分不清「消息根本没送到」和「送到了但被白名单挡下」——
        // 明天拿手机发一条时，这两件事的区别就是全部的意义。
        if (!allowed(identity)) {
            stats.blocked += 1;
            stats.lastBlockedAt = new Date().toISOString();
            return;
        }
        const key = conversationKey(identity);
        // 关掉自动回复的意思就是「别理它」：连问都不问。原来是先问完再决定发不发，
        // 于是开关关着每条还是照样花一轮（今晚拿假服务器实测：两条合成消息各烧了一轮）。
        // 群里没叫她的消息只进上下文，不开口、不花一轮。私聊不受这条管。
        const batchKey = JSON.stringify([key, identity.speakerId]);
        if (isGroup && !directedAtHer(message, config) && !batches.has(batchKey)) {
            pushContext(key, { id: messageId || String(Date.now()), occurredAt: new Date().toISOString(), text, identity }, config.contextMessages);
            return;
        }
        if (!config.autoReply || stopped) {
            pushContext(key, { id: messageId || `${Date.now()}`, occurredAt: new Date().toISOString(), text, identity }, config.contextMessages);
            return;
        }
        batches.add(batchKey, { identity, key, conversationId, isGroup, text });
    }
    async function respond({ identity, key, conversationId, isGroup, text }) {
        const config = settings();
        if (stopped || !config.enabled || !config.autoReply || !allowed(identity))
            return;
        const context = contexts.get(key) ?? [];
        answering.add(key);
        try {
            const answer = await home.ask(text, identity, context);
            if (stopped || !settings().enabled || !settings().autoReply || !allowed(identity))
                return;
            // 她那句话记成她自己说的：不然后面拿这段上下文问她「刚才聊到哪了」时，
            // 她说过的会被当成对方说的（home.ts 里按 speakerId 判 role 为 assistant）。
            const herIdentity = speakerIdentity({
                channel: 'qq',
                accountId: identity.accountId,
                speakerId: `qq:${identity.accountId}`,
                conversationId: identity.conversationId,
                conversationType: identity.conversationType,
            });
            pushContext(key, { id: answer.id, occurredAt: new Date().toISOString(), text: answer.text, identity: herIdentity }, config.contextMessages);
            for (const reply of replyParagraphs(answer.text)) {
                // Check again between sends in case the channel was stopped or access changed.
                const current = settings();
                if (stopped || !current.enabled || !current.autoReply || !allowed(identity) || !client)
                    return;
                const sent = isGroup
                    ? await client.sendGroup(conversationId, reply)
                    : await client.sendPrivate(conversationId, reply);
                rememberSent(sent.messageId);
                stats.sent += 1;
            }
        }
        catch (error) {
            stats.failed += 1;
            stats.lastError = error instanceof Error ? error.message : String(error);
            deps.logger.warn(`QQ 回复 ${key} 失败: ${stats.lastError}`);
        }
        finally {
            answering.delete(key);
        }
    }
    /**



  /**
   * 阳台：给机器上别的程序留的一条线。
   *
   * 和 QQ 那条完全分开 —— 它是外面递话进来，不是 QQ 消息。一条线一间屋子（会话键里带着
   * `qq-bridge`），所以它跟她别的会话互不打扰。口令落在世界目录（qq-bridge.json），
   * 重启 DSH 对面那份配置不用改。
   */
    function startBridge(config) {
        if (nativeBridge || !config.bridge.port)
            return;
        nativeBridge = createNativeBridge({
            ctx: deps.ctx,
            session: identity => deps.home(identity),
            config: () => {
                const live = settings().bridge;
                return { port: live.port, token: live.token, title: live.title, contextMessages: live.contextMessages };
            },
            worldDir: deps.stateFile ? dirname(deps.stateFile) : process.cwd(),
            script: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'qq-line.js'),
            log: (message) => deps.logger.info(message),
        });
        void nativeBridge.start().catch((error) => deps.logger.error('阳台没能开起来', error));
    }
    return {
        status() {
            const config = settings();
            return {
                enabled: config.enabled,
                connected: client?.getState() === 'online',
                url: config.wsUrl,
                allowPrivate: config.allowPrivate.length,
                allowGroups: config.allowGroups.length,
                autoReply: config.autoReply,
                bindHomeSession: config.bindHomeSession,
                bridge: nativeBridge?.status() ?? null,
                groupTrigger: config.groupTrigger,
                conversations: contexts.size,
                answering: answering.size,
                lastEventAt: stats.lastEventAt,
                blocked: stats.blocked,
                lastBlockedAt: stats.lastBlockedAt,
                lastError: stats.lastError,
                sent: stats.sent,
                failed: stats.failed,
            };
        },
        /** 面板上改阳台的端口：当场关掉重开那条线（0 就是关）。 */
        setBridge(patch) {
            if (patch.port !== undefined) {
                overrides.bridge = { port: patch.port };
                writeOverrides();
            }
            nativeBridge?.stop();
            nativeBridge = undefined;
            startBridge(settings());
            return this.status();
        },
        /** 面板上那个「会不会自己回」的开关。 */
        setAutoReply(value) {
            readOverrides();
            overrides.autoReply = value;
            if (!value)
                batches.clear();
            writeOverrides();
            return this.status();
        },
        start() {
            if (stopped)
                return;
            const config = settings();
            if (!config.enabled)
                return;
            const bridge = (deps.transport ?? createBridge)({
                wsUrl: config.wsUrl,
                ...(config.accessToken ? { accessToken: config.accessToken } : {}),
                log: (level, message) => {
                    const line = `QQ 原生通道：${message}`;
                    // 连回来就把上次的报错擦掉（不然面板上挂着一句昨天的错，会让人以为现在还坏着）。
                    // 「QQ 账号离线」不是这一层的事，留着。
                    if (level === 'info') {
                        if (message.startsWith('WS 已连接') && stats.lastError !== 'QQ 账号离线')
                            stats.lastError = null;
                        deps.logger.info(line);
                    }
                    else if (level === 'warn')
                        deps.logger.warn(line);
                    else {
                        stats.lastError = message;
                        deps.logger.error(line);
                    }
                },
                // 传输层只交出一条归一化过的消息，形状见 QqIncoming；两边对不上的字段这里本来也不用。
                onGroupMessage: (message) => { void deliver(message); },
                onPrivateMessage: (message) => { void deliver(message); },
                // bot_status 是 SnowLuma 的自有扩展：账号掉线时让它显示成「QQ 账号离线」，别和「桥挂了」混在一起。
                onNotice: (type) => {
                    if (type === 'bot_offline')
                        stats.lastError = 'QQ 账号离线';
                    if (type === 'bot_online')
                        stats.lastError = null;
                },
            });
            client = bridge;
            startBridge(config);
            bridge.start().catch((error) => {
                stats.lastError = error instanceof Error ? error.message : String(error);
                deps.logger.warn('QQ 原生通道首次连接失败：', stats.lastError);
            });
        },
        stop() {
            if (stopped)
                return;
            stopped = true;
            batches.stop();
            home.stop();
            nativeBridge?.stop();
            nativeBridge = undefined;
            void client?.stop();
            client = undefined;
            contexts.clear();
            seen.clear();
        },
    };
}
