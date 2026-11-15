import { Store } from './store.ts';
export interface Task {
    id: string;
    agent: string;
    at: string;
    status: 'pending' | 'running' | 'done' | 'paused' | 'cancelled' | 'uncertain';
    note: string;
    kind: 'activity' | 'reminder' | 'review';
    silenceMinutes?: number;
    attempts: number;
}
export declare class Scheduler {
    store: Store;
    private send;
    timer?: NodeJS.Timeout;
    running: boolean;
    stopped: boolean;
    private waiters;
    constructor(store: Store, send: (task: Task, actual: string) => Promise<void>);
    list(agent?: string): Task[];
    save(t: Task): Task;
    add(agent: string, input: {
        at?: string;
        after_minutes?: number;
        silenceMinutes?: number;
        note: string;
        kind?: Task['kind'];
    }, now?: number): Task;
    change(agent: string, id: string, patch: Partial<Pick<Task, 'at' | 'note' | 'status'>>): Task;
    spoke(agent: string, now?: number): void;
    arm(): void;
    tick(now?: number): Promise<void>;
    stop(): void;
    settled(): Promise<void>;
}
