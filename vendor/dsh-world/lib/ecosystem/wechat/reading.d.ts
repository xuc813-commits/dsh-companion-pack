import type { SpeakerIdentity } from '../shared/identity.ts';
interface ReadRequest {
    id: string;
    accountId: string;
    chatId: string;
    limit: number;
    cursor?: string;
}
/** Reads use the existing adapter poll; cancellation drops only the request, never a receive cursor. */
export declare function createWechatReading(deps: {
    target(chatId: string): SpeakerIdentity;
}): {
    tool: import("@deepseek-ai/dsh-tools").ToolDefinition;
    poll(): ReadRequest | undefined;
    accept(value: unknown): void;
    stop(): void;
};
export {};
