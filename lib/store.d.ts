import { DatabaseSync } from 'node:sqlite';
export interface AgentConfig {
    emotion: boolean;
    resumeEmotion: 'freeze' | 'elapsed';
    recentChars: number;
    maxOutputTokens: number;
    decay: {
        moodPerHour: number;
        trustPerDay: number;
        disconnectFloor: number;
    };
    modules: {
        bilibili: boolean;
        search: boolean;
        qq: boolean;
        wechat: boolean;
    };
}
export interface Companion {
    id: string;
    name: string;
    preset: string;
    basePreset: string;
    version: number;
    paused: boolean;
    config: AgentConfig;
    createdAt: string;
    deletedAt?: string;
}
export declare const defaults: () => AgentConfig;
export declare function validate(config: AgentConfig): void;
export declare class Store {
    file: string;
    zone: string;
    db: DatabaseSync;
    constructor(file: string, zone?: string);
    transaction<T>(fn: () => T): T;
    day(now?: Date): string;
    nextResetAt(now?: Date): string;
    decode(body: string): Companion;
    list(includeDeleted?: boolean): Companion[];
    agent(id: string): Companion;
    create(name: string, basePreset?: string, copy?: string): Companion;
    update(id: string, expected: number, patch: Partial<Pick<Companion, 'name' | 'paused' | 'config'>>, actor: string): Companion;
    bind(session: string, id: string): void;
    owner(session: string): string | undefined;
    limit(): number;
    setLimitByUser(value: number): void;
    usage(day?: string): Record<string, import("node:sqlite").SQLOutputValue>[];
    available(day?: string): number;
    reserve(id: string, agent: string, tokens: number): void;
    settle(id: string, actual?: number): void;
    history(id: string): Record<string, import("node:sqlite").SQLOutputValue>[];
    deleteAgent(id: string, version: number): {
        paused: boolean;
        deletedAt: string;
        version: number;
        id: string;
        name: string;
        preset: string;
        basePreset: string;
        config: AgentConfig;
        createdAt: string;
    };
    restoreAgent(id: string): {
        paused: boolean;
        version: number;
        id: string;
        name: string;
        preset: string;
        basePreset: string;
        config: AgentConfig;
        createdAt: string;
        deletedAt?: string;
    };
    moneyMode(): boolean;
    budgetUnits(): number;
    setBudgetByUser(yuan: number): void;
    costUsage(day?: string): Record<string, import("node:sqlite").SQLOutputValue>[];
    moneyAvailable(day?: string): number;
    budgetState(now?: Date): {
        budget: number;
        usage: {
            agent: import("node:sqlite").SQLOutputValue;
            yuan: number;
        }[];
        available: number;
        reserved: number;
        budgetDay: string;
        resetAt: string;
        timeZone: string;
    };
    reserveMoney(id: string, agent: string, tokens: number, units: number, pricing: unknown): void;
    settleMoney(id: string, tokens?: number, units?: number): void;
    close(): void;
}
