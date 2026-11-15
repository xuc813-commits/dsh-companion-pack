import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ContentBlock } from '@deepseek-ai/dsh-llm';
import { type SpeakerIdentity } from '../shared/identity.ts';
import { type LifeTimers } from '../../life/alarmTimer.ts';
import { type ChannelContextMessage, type ChannelReference } from '../shared/context.ts';
import '../../hostContract.ts';
export declare const WECHAT_REPLY_TIMEOUT_MS: number;
/** One home, serialized channel requests; each caller receives only its own final answer. */
export declare function createWechatHome(deps: {
    ctx: Context;
    home(identity: SpeakerIdentity): Promise<Agent>;
    timers?: LifeTimers;
    images?(identity: SpeakerIdentity, context: ChannelContextMessage[], reference?: ChannelReference): Promise<ContentBlock[]>;
}): {
    ask: (text: string, suppliedIdentity: SpeakerIdentity, suppliedContext?: ChannelContextMessage[], suppliedMedia?: ChannelContextMessage[], suppliedReference?: ChannelReference) => Promise<{
        id: string;
        text: string;
    }>;
    stop(): void;
};
