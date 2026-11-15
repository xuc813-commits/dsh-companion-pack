export interface RuntimePaths {
    python: string;
    node: string;
    ffmpeg: string;
    ffprobe: string;
    snowluma: string;
    snowlumaNode: string;
    qq?: string;
    wechat?: string;
}
export declare function loadRuntime(data: string): RuntimePaths;
