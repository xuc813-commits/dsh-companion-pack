export declare const desktopIdentity: (accountId: string) => {
    channel: string;
    accountId: string;
    conversationType: "private";
    conversationId: string;
    speakerId: string;
    speakerName: string;
};
export declare const DESKTOP_POKE_TEXT = "\uFF08\u4F60\u62CD\u4E86\u62CD\u6211\uFF09\u770B\u4E00\u773C\u5C4F\u5E55\uFF0C\u770B\u5B8C\u5C31\u505C\u3002";
export declare function createDesktopChat(deps: {
    worldDir: string;
    enabled(): boolean;
    ask(text: string): Promise<{
        id: string;
        text: string;
    }>;
    log(error: unknown): void;
}): {
    poll: () => void;
    snapshot: () => {
        busy: boolean;
        offset: number;
        pending: boolean;
        phase: "idle" | "answering" | "replied" | "error";
        lastPokeAt?: string;
        lastReplyAt?: string;
        replyId?: string;
        error?: string;
    };
    start(): void;
    stop(): void;
};
