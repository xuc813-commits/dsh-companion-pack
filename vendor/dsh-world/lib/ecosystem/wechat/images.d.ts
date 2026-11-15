import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { type ChannelContextMessage, type ChannelReference } from '../shared/context.ts';
import { type SpeakerIdentity } from '../shared/identity.ts';
export declare function admitContextImages(ctx: Context, incomingDir: string, identity: SpeakerIdentity, context: ChannelContextMessage[], suppliedReference?: ChannelReference): Promise<ContentBlock[]>;
