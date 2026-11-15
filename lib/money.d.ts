import type { TokenUsage } from '@deepseek-ai/dsh-llm';
export interface Price {
    hit: [number, number];
    miss: [number, number];
    out: [number, number];
    source: string;
    model: string;
}
export declare function isPeak(at?: Date): boolean;
export declare function priceFor(provider: string, model: string): Price;
export declare function usageCost(u: TokenUsage, p: Price, at?: Date): number;
export declare function reserveCost(tokens: number, output: number | undefined, capacity: number, p: Price, media?: boolean): number;
