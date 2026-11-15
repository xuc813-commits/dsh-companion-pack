import type { BilibiliProviderLike, BilibiliSubtitleCue } from './types.ts';
import { type MediaRuntime } from './media-runtime.ts';
export declare const WATCH_ACTIONS: readonly ["overview", "zoom", "locate", "text", "probe"];
export interface WatchArgs {
    bvid: string;
    action?: string;
    from?: number;
    to?: number;
    count?: number;
    query?: string;
}
export interface WatchInput {
    bvid: string;
    action: typeof WATCH_ACTIONS[number];
    from: number;
    to?: number;
    count: number;
    query?: string;
}
export interface WatchArtifact {
    text: string;
    images: Array<{
        data: Uint8Array;
        name: string;
    }>;
    source: string;
    cached?: boolean;
}
export declare function parseWatchArgs(args: WatchArgs): WatchInput;
export declare function compactTranscript(cues: readonly BilibiliSubtitleCue[], from: number, to: number, maxChars?: number): string;
export declare function createWatchReader(service: BilibiliProviderLike, runtime?: MediaRuntime): (input: WatchInput, scope: string, signal?: AbortSignal) => Promise<WatchArtifact>;
