import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import '@deepseek-ai/dsh-agent-preset';
export declare const name = "dsh-companion-coordinator";
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    timeZone: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    timeZone: z<string, string, "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config: {
    timeZone: string;
}): Promise<void>;
