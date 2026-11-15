export interface MediaRuntime {
    nodePath?: string;
    ffmpegPath?: string;
    ffprobePath?: string;
    mediaCacheRoot?: string;
}
export declare function callerCache(root: string | undefined, scope: string): string;
export declare function pin(file: string): () => void;
export declare function pruneMedia(root: string): Promise<void>;
export declare function downloadMedia(url: string, file: string, signal?: AbortSignal): Promise<boolean>;
/** A dedicated process keeps upstream media work and cache outside the host.
 * On Windows cancellation kills this owned child tree, including ffmpeg. */
export declare function mediaWorker(options: Record<string, unknown>, root: string, runtime: MediaRuntime, signal?: AbortSignal, timeoutMs?: number): Promise<any>;
