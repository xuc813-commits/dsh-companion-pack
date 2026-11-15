import type { Store } from './store.ts';
export declare function incomingText(msg: any): any;
export declare class Weixin {
    dir: string;
    store: Store;
    id: string;
    qrModule: string;
    private reply;
    private isRunning;
    private fetcher;
    private cancelReply;
    timer?: NodeJS.Timeout;
    abort?: AbortController;
    closed: boolean;
    busy: boolean;
    loginBusy: boolean;
    generation: number;
    state: any;
    auth: any;
    cursor: string;
    qr: string;
    loginBase: string;
    constructor(dir: string, store: Store, id: string, qrModule: string, reply: (text: string, identity: any) => Promise<{
        id: string;
        text: string;
    }>, isRunning: () => boolean, fetcher?: typeof fetch, cancelReply?: () => void);
    snapshot(): any;
    private save;
    private api;
    enable(): Promise<any>;
    login(): Promise<any>;
    private schedule;
    checkLogin(verifyCode?: string): Promise<any>;
    connectionTest(): Promise<{
        received: boolean;
        sent: boolean;
        modelCalls: number;
    }>;
    sendText(msg: any, text: string, clientId: string): Promise<any>;
    poll(): Promise<void>;
    shutdown(): Promise<void>;
    stop(): void;
}
