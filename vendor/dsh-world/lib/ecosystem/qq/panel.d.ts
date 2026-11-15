import { spawn } from 'node:child_process';
/**
 * The one console her partner opens from the QQ card, reached from this machine only.
 *
 * SnowLuma's console answers on loopback, but it can not be framed (`X-Frame-Options: DENY`) and its session
 * token lives in SnowLuma's own memory (a fresh 64-hex string per login, dead on restart). The only way to get
 * one is `POST /api/login` with the panel password. So he types that password exactly once; it is kept in
 * `<world>/panel.json` with mode 600 and used from then on to trade for a token behind his back. The page
 * itself takes `?token=` and wipes it off the address bar.
 *
 * Where SnowLuma lives used to be read out of the standalone `qq-bridge` process's config. That process is
 * gone, so the home now comes from `qqNative.snowlumaHome` in the plugin's own config, with a short list of
 * usual install locations as a fallback for a machine that has never been told.
 */
export declare const PANEL_FILE = "panel.json";
export interface PanelUrl {
    url: string;
}
export interface PanelNeeds {
    needs: 'password';
    url?: string;
    username?: string;
}
export interface PanelError {
    error: string;
}
export type PanelResult = PanelUrl | PanelNeeds | PanelError;
/** Where SnowLuma's console listens, learned from its own config; undefined when it is not installed here. */
export declare function findSnowlumaConsole(homeDir: string): {
    base: string;
    username?: string;
} | undefined;
/** 常见安装位置，按顺序试；只认「里面有 config/runtime.json」的那个。给 ，没有就返回空。 */
export declare function discoverSnowlumaHome(configured?: string, candidates?: readonly string[]): string;
/** The panel password he typed once, kept beside her room rather than inside her world settings. */
export declare function createPanelSecrets(worldDir: string): {
    read: () => {
        username: string;
        password: string;
    } | undefined;
    remember(username: string, password: string): void;
    forget(): void;
};
export type PanelSecrets = ReturnType<typeof createPanelSecrets>;
/** Trades the panel password for a session token and hands back a URL that opens already logged in. */
export declare function loginSnowluma(base: string, username: string, password: string, fetchImpl?: typeof fetch): Promise<PanelResult>;
/** The door the QQ card's button knocks on. */
export interface ConsoleDoors {
    snowluma(): Promise<PanelResult>;
    remember(username: string, password: string): Promise<PanelResult>;
    /** Hand a console URL to the desktop's own browser; it does not allow being framed. */
    open(kind: 'snowluma'): Promise<{
        opened: true;
    } | {
        error: string;
    }>;
}
/**
 * SnowLuma's console sends `X-Frame-Options: DENY` (and `frame-ancestors 'none'`), so no page of ours can hold
 * it in a frame. Opening the desktop's own browser is the honest way in: it is where that console was meant to
 * run, and the token rides in the URL so it lands already logged in.
 */
export declare function openInBrowser(url: string, spawnImpl?: typeof spawn): {
    opened: true;
} | {
    error: string;
};
export declare function createConsoleDoors(options: {
    worldDir: string;
    snowlumaHome?: string;
}): ConsoleDoors;
