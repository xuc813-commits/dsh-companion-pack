import type { RuntimePaths } from './runtime-paths.ts';
import { type QqProcess } from './qq-process.ts';
import { type ChildProcess } from 'node:child_process';
export declare class QqSetup {
    program: string;
    private readonly runtime;
    child?: ChildProcess;
    enabled: boolean;
    error: string;
    busy: boolean;
    account: string;
    sessionToken: string;
    boundPid: number;
    loadAttempted: boolean;
    timer?: NodeJS.Timeout;
    boundStartedAt: string;
    selection?: {
        pid: number;
        startedAt: string;
    };
    processCache: QqProcess[];
    processCacheAt: number;
    loadAttempts: number;
    nextLoadAt: number;
    dataDir: string;
    webSecret: string;
    readonly dir: string;
    readonly token: string;
    readonly wsPort = 45301;
    readonly httpPort = 45300;
    constructor(program: string, runtime: RuntimePaths);
    connection(): {
        wsUrl: string;
        accessToken: string;
        autoReply: boolean;
        allowPrivate: never[];
        allowGroups: never[];
    };
    enable(): Promise<void>;
    processes(force?: boolean): Promise<QqProcess[]>;
    select(pid: number, startedAt: string): Promise<{
        selected: {
            pid: number;
            startedAt: string;
        };
    }>;
    private web;
    status(): Promise<{
        enabled: boolean;
        status: string;
        processes: QqProcess[];
        selectedPid: number | undefined;
        error?: undefined;
        account?: undefined;
    } | {
        enabled: boolean;
        status: string;
        error: string;
        processes: never[];
        selectedPid?: undefined;
        account?: undefined;
    } | {
        enabled: boolean;
        status: string;
        account: string;
        processes?: undefined;
        selectedPid?: undefined;
        error?: undefined;
    } | {
        error?: string | undefined;
        enabled: boolean;
        status: string;
        processes?: undefined;
        selectedPid?: undefined;
        account?: undefined;
    }>;
    stop(): void;
}
