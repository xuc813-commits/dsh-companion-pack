import { type LifeTimers } from '../../life/alarmTimer.ts';
export declare const QQ_MESSAGE_WAIT_MS = 5000;
export declare const QQ_LONG_MESSAGE_WAIT_MS = 15000;
/** Trailing-edge batching: the third message lengthens this burst's quiet window. */
export declare function createQuietBatch<T>(deliver: (items: readonly T[]) => Promise<void> | void, options?: {
    timers?: LifeTimers;
    onError?: (error: unknown) => void;
}): {
    has(key: string): boolean;
    size(): number;
    add(key: string, item: T): void;
    clear: () => void;
    stop(): void;
};
