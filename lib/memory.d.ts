import { Store } from './store.ts';
export declare class Memory {
    store: Store;
    home: string;
    constructor(store: Store, home: string);
    room(id: string): string;
    archive(id: string, query?: string, limit?: number): any[];
    source(id: string, source: string): any;
    notes(id: string): Record<string, import("node:sqlite").SQLOutputValue>[];
    note(agent: string, kind: string, text: string, sources: string[], id?: `${string}-${string}-${string}-${string}-${string}`, version?: number): {
        id: `${string}-${string}-${string}-${string}-${string}`;
        version: number;
    };
    self(id: string): {
        text: string;
        version: string;
    };
    revise(id: string, text: string, expected: string, sources: string[]): {
        text: string;
        version: string;
    };
    context(id: string): string;
}
