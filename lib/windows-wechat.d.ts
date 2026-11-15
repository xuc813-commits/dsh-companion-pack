export type WechatMode = 'ilink' | 'windows';
export declare function wechatMode(value: unknown): WechatMode;
export declare function validateWindowsConfig(c: any): any;
export declare function installWindowsConfig(input: string, dest: string, moduleFile: string, defaultEngine: string): string;
export declare function windowsPreflight(file: string | undefined, python: string, source: string): {
    status: string;
    ready: boolean;
    error: string;
} | {
    status: string;
    ready: boolean;
    error?: undefined;
};
