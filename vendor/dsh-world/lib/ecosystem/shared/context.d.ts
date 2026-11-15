import { type SpeakerIdentity } from './identity.ts';
export interface ChannelImage {
    file: string;
    quality: 'original' | 'cached' | 'thumbnail';
    firstFrame?: boolean;
}
export interface ChannelReference {
    id?: string;
    speakerId?: string;
    speakerName?: string;
    type: 'text' | 'image' | 'sticker' | 'other';
    text: string;
    error?: string;
    image?: ChannelImage;
}
export interface ChannelContextMessage {
    id: string;
    occurredAt: string;
    text: string;
    identity: SpeakerIdentity;
    image?: ChannelImage;
    reference?: ChannelReference;
}
export declare function channelReference(value: unknown, current: SpeakerIdentity): ChannelReference | undefined;
export declare function channelContext(value: unknown, current: SpeakerIdentity, limit?: number): ChannelContextMessage[];
export declare function channelMedia(value: unknown, current: SpeakerIdentity): ChannelContextMessage[];
