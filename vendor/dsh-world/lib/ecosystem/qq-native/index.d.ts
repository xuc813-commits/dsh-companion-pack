import type { LifeTimers } from '../../life/alarmTimer.ts';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SpeakerIdentity } from '../shared/identity.ts';
import { type BridgeStatus } from './native-bridge.ts';
export interface QqNativeConfig {
    enabled: boolean;
    wsUrl: string;
    accessToken: string;
    /** QQ numbers allowed to talk to her at all; empty means nobody. */
    allowPrivate: readonly string[];
    allowGroups: readonly string[];
    /** 她会不会回。关掉是「收到但不理」——连问都不问，不花调用。 */
    autoReply: boolean;
    /** How many earlier messages of the same conversation are shown to her with each new one. */
    contextMessages: number;
    /** 群里什么时候接话：mention 只接被叫到的（被 @ / 被引用她的消息 / 命中关键词），all 每句都接。 */
    groupTrigger: 'mention' | 'all';
    /** 群里命中这些词也算在叫她。 */
    groupKeywords: readonly string[];
    /** Who shares her home session: `owner` keeps it for the owner's private chat, `none` gives every
     *  conversation its own, empty follows whatever the bridge's own setting says. */
    bindHomeSession: 'owner' | 'all' | 'none' | '';
    /** 阳台：让这台机器上别的程序能跟家里说话的那条线。`port` 为 0 就整块不开。 */
    bridge: {
        port: number;
        token: string;
        title: string;
        contextMessages: number;
    };
}
export interface QqNativeStatus {
    enabled: boolean;
    connected: boolean;
    url: string;
    allowPrivate: number;
    allowGroups: number;
    autoReply: boolean;
    conversations: number;
    answering: number;
    lastEventAt: string | null;
    lastError: string | null;
    sent: number;
    failed: number;
    /** 阳台那条线现在什么样（没开就是 null）。 */
    bridge: BridgeStatus | null;
    /** 到了通道、但不在白名单里被挡下的条数。 */
    blocked: number;
    /** 最近一次被白名单挡下的时刻。 */
    lastBlockedAt: string | null;
    bindHomeSession: 'owner' | 'all' | 'none' | '';
    /** 群里接话的规矩。 */
    groupTrigger: 'mention' | 'all';
}
/**
 * QQ as another way into the same home, without a bridge process in between.
 *
 * One OneBot connection in, the same `home` the WeChat channel uses in the middle, and a reply sent
 * back out. There is no separate session store: a conversation's identity key is the whole mapping,
 * so a group keeps talking to the same conversation she already has for it.
 */
/** 传输层交给通道的那几件（真身上是 snowluma.js 的 createBridge，测试可以换掉）。 */
export interface QqTransport {
    start(): Promise<void>;
    stop(): Promise<void>;
    getState(): string;
    sendGroup(groupId: string, text: string): Promise<{
        messageId: string;
    }>;
    sendPrivate(userId: string, text: string): Promise<{
        messageId: string;
    }>;
}
/** createBridge 认的那几个选项，通道只用到这几个。 */
export interface QqTransportOptions {
    wsUrl: string;
    accessToken?: string;
    log(level: string, message: string): void;
    onGroupMessage?(message: unknown): void;
    onPrivateMessage?(message: unknown): void;
    onNotice?(type: string, notice?: unknown): void;
}
export declare function createQqNativeModule(deps: {
    ctx: Context;
    home(identity: SpeakerIdentity): Promise<Agent>;
    config(): QqNativeConfig;
    /** 面板拨的开关存这儿；不给就只在内存里活到下一次重载。 */
    stateFile?: string;
    logger: {
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    };
    /** 传输层；不给就用真身（snowluma.js 那条线）。测试靠它把合成事件灌进来。 */
    transport?(options: QqTransportOptions): QqTransport;
    /** Timer injection for deterministic receipt-window tests; production uses real time. */
    messageTimers?: LifeTimers;
}): {
    status(): QqNativeStatus;
    /** 面板上改阳台的端口：当场关掉重开那条线（0 就是关）。 */
    setBridge(patch: {
        port?: number;
    }): QqNativeStatus;
    /** 面板上那个「会不会自己回」的开关。 */
    setAutoReply(value: boolean): QqNativeStatus;
    start(): void;
    stop(): void;
};
export type QqNativeModule = ReturnType<typeof createQqNativeModule>;
