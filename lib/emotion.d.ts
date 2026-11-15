import { Store } from './store.ts';
export declare class Emotion {
    store: Store;
    program: string;
    data: string;
    python: string;
    private tails;
    constructor(store: Store, program: string, data: string, python?: string);
    request(id: string, operation: Record<string, unknown>): Promise<any>;
    call(id: string, name: string, args?: Record<string, unknown>): Promise<any>;
    enable(id: string, freeze: boolean): Promise<void>;
    summary(id: string): Promise<any>;
    submit(id: string, source: string, at: string, text: string, pad: {
        pleasure: number;
        arousal: number;
        dominance: number;
    }, subject: string, eventType: string, trustEvidence?: unknown): Promise<any>;
}
