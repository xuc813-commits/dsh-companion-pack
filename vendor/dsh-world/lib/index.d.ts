import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { WorldConfig } from './types.ts';
export { createWorldRuntime } from './runtime.ts';
export type { WorldConfig, ConversationRecord, ConversationTurn, ArchiveCursor } from './types.ts';
export declare const name = "dsh-world";
export declare const inject: string[];
/** What `apply` receives: the schema below fills these defaults. */
export type Config = WorldConfig & Required<Pick<WorldConfig, 'life' | 'fallbackWakeTime' | 'outlets' | 'bridge' | 'toast' | 'allowedHosts'>>;
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    worldId: z<string, string, "defined">;
    agentPreset: z<string, string, "defined">;
    timeZone: z<string, string, "defined">;
    companionName: z<string, string, "plain">;
    partnerName: z<string, string, "plain">;
    archiveScope: z<"home" | "workspace" | "world", "home" | "workspace", "defined">;
    life: z<boolean, boolean, "defined">;
    diaryDir: z<string, string, "plain">;
    fallbackWakeTime: z<string, string, "defined">;
    selfFile: z<string, string, "plain">;
    worldPromptFile: z<string, string, "plain">;
    alarmTemplateFile: z<string, string, "plain">;
    personaFile: z<string, string, "plain">;
    outlets: z<({
        name?: string | null | undefined;
        url?: string | null | undefined;
        urlFile?: string | null | undefined;
        path?: string | null | undefined;
        kinds?: ("reply" | "busy" | "reach")[] | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: z<string, string, "defined">;
        url: z<string, string, "plain">;
        urlFile: z<string, string, "plain">;
        path: z<string, string, "plain">;
        kinds: z<("reply" | "busy" | "reach")[], ("reply" | "busy" | "reach")[], "plain">;
    }>>[], "defined">;
    bridge: z<boolean, boolean, "defined">;
    qqNative: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        wsUrl: z<string, string, "defined">;
        accessToken: z<string, string, "defined">;
        allowPrivate: z<string[], string[], "defined">;
        allowGroups: z<string[], string[], "defined">;
        autoReply: z<boolean, boolean, "defined">;
        contextMessages: z<number, number, "defined">;
        groupTrigger: z<"all" | "mention", "all" | "mention", "defined">;
        groupKeywords: z<string[], string[], "defined">;
        snowlumaHome: z<string, string, "defined">;
        bindHomeSession: z<"" | "owner" | "all" | "none", "" | "owner" | "all" | "none", "defined">;
        bridge: z<Schemastery.ObjectS<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        wsUrl: z<string, string, "defined">;
        accessToken: z<string, string, "defined">;
        allowPrivate: z<string[], string[], "defined">;
        allowGroups: z<string[], string[], "defined">;
        autoReply: z<boolean, boolean, "defined">;
        contextMessages: z<number, number, "defined">;
        groupTrigger: z<"all" | "mention", "all" | "mention", "defined">;
        groupKeywords: z<string[], string[], "defined">;
        snowlumaHome: z<string, string, "defined">;
        bindHomeSession: z<"" | "owner" | "all" | "none", "" | "owner" | "all" | "none", "defined">;
        bridge: z<Schemastery.ObjectS<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, "defined">;
    }>>, "plain">;
    wechat: z<boolean, boolean, "defined">;
    wechatAdapter: z<Schemastery.ObjectS<NoInfer<{
        python: z<string, string, "plain">;
        config: z<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        python: z<string, string, "plain">;
        config: z<string, string, "plain">;
    }>>, "plain">;
    toast: z<boolean, boolean, "defined">;
    allowedHosts: z<string[], string[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    worldId: z<string, string, "defined">;
    agentPreset: z<string, string, "defined">;
    timeZone: z<string, string, "defined">;
    companionName: z<string, string, "plain">;
    partnerName: z<string, string, "plain">;
    archiveScope: z<"home" | "workspace" | "world", "home" | "workspace", "defined">;
    life: z<boolean, boolean, "defined">;
    diaryDir: z<string, string, "plain">;
    fallbackWakeTime: z<string, string, "defined">;
    selfFile: z<string, string, "plain">;
    worldPromptFile: z<string, string, "plain">;
    alarmTemplateFile: z<string, string, "plain">;
    personaFile: z<string, string, "plain">;
    outlets: z<({
        name?: string | null | undefined;
        url?: string | null | undefined;
        urlFile?: string | null | undefined;
        path?: string | null | undefined;
        kinds?: ("reply" | "busy" | "reach")[] | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: z<string, string, "defined">;
        url: z<string, string, "plain">;
        urlFile: z<string, string, "plain">;
        path: z<string, string, "plain">;
        kinds: z<("reply" | "busy" | "reach")[], ("reply" | "busy" | "reach")[], "plain">;
    }>>[], "defined">;
    bridge: z<boolean, boolean, "defined">;
    qqNative: z<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        wsUrl: z<string, string, "defined">;
        accessToken: z<string, string, "defined">;
        allowPrivate: z<string[], string[], "defined">;
        allowGroups: z<string[], string[], "defined">;
        autoReply: z<boolean, boolean, "defined">;
        contextMessages: z<number, number, "defined">;
        groupTrigger: z<"all" | "mention", "all" | "mention", "defined">;
        groupKeywords: z<string[], string[], "defined">;
        snowlumaHome: z<string, string, "defined">;
        bindHomeSession: z<"" | "owner" | "all" | "none", "" | "owner" | "all" | "none", "defined">;
        bridge: z<Schemastery.ObjectS<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        wsUrl: z<string, string, "defined">;
        accessToken: z<string, string, "defined">;
        allowPrivate: z<string[], string[], "defined">;
        allowGroups: z<string[], string[], "defined">;
        autoReply: z<boolean, boolean, "defined">;
        contextMessages: z<number, number, "defined">;
        groupTrigger: z<"all" | "mention", "all" | "mention", "defined">;
        groupKeywords: z<string[], string[], "defined">;
        snowlumaHome: z<string, string, "defined">;
        bindHomeSession: z<"" | "owner" | "all" | "none", "" | "owner" | "all" | "none", "defined">;
        bridge: z<Schemastery.ObjectS<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            port: z<number, number, "defined">;
            token: z<string, string, "defined">;
            title: z<string, string, "defined">;
            contextMessages: z<number, number, "defined">;
        }>>, "defined">;
    }>>, "plain">;
    wechat: z<boolean, boolean, "defined">;
    wechatAdapter: z<Schemastery.ObjectS<NoInfer<{
        python: z<string, string, "plain">;
        config: z<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        python: z<string, string, "plain">;
        config: z<string, string, "plain">;
    }>>, "plain">;
    toast: z<boolean, boolean, "defined">;
    allowedHosts: z<string[], string[], "defined">;
}>>, "plain">;
/**
 * Her world runs only after her partner presses start in the world console, and stops when they press stop:
 * memory block, persona, world prompt, archive and life line come and go together. The switch is kept in
 * `<world>/world.json`, so it outlasts a restart.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
