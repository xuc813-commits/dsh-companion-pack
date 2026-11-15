import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import { Store } from './store.ts';
export declare function totalUsage(u: TokenUsage): number;
type Projection = Partial<Pick<Context['llm'], 'imageRequestPricing' | 'fileRequestText'>>;
export declare function reservationFor(request: GenerateOptions, capacity: number, defaultMax?: number, projection?: Projection): number;
/** A provider context bound covers text, images, cached input, tools and maximum output together.
 * Refuse metadata-free routes rather than silently treating a heuristic as a hard cap. */
export declare function metered(store: Store, ctx: Pick<Context, 'llm'>, request: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
export {};
