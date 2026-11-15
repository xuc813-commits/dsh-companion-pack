import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
type SpeakerIdentity = any;
type LifeTimers = {
    set(fn: () => void, ms: number): unknown;
    clear(t: unknown): void;
};
type ChannelContextMessage = any;
export declare const QQ_REPLY_TIMEOUT_MS: number;
/**
 * One home, serialized QQ requests; each caller receives only its own final answer.
 *
 * This is deliberately the same shape as the WeChat home: a QQ message becomes one turn in the
 * conversation that owns that chat, and the caller gets back exactly the words of that turn.
 * The difference is only in what arrives and what we do with the answer — QQ has no outbox of
 * its own, so the caller sends the reply straight back to the group.
 */
export declare function createChannelHome(deps: {
    ctx: Context;
    home(identity: SpeakerIdentity): Promise<Agent>;
    timers?: LifeTimers;
}): {
    ask: (text: string, suppliedIdentity: SpeakerIdentity, suppliedContext?: ChannelContextMessage[]) => Promise<{
        id: string;
        text: string;
    }>;
    stop(): void;
};
export {};
