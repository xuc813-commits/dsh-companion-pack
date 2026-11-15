import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConsoleDoors } from './panel.ts';
/**
 * The QQ module's few doors, on the same webServer as the console. The `/dsh-world/qq` prefix is never eaten
 * by the console's `/dsh-world` prefix (the host matches the longer one first).
 *
 * Read:  GET  /dsh-world/qq/native    her own OneBot channel: is it connected, what has it seen, is it replying
 *        GET  /dsh-world/qq/console   SnowLuma's console address, with a session token already traded for the
 *                                     panel password
 * Write: POST /dsh-world/qq/native    { autoReply?, bridge?: { port? } } the channel's switches; a new bridge
 *                                     port restarts the balcony on the spot
 *        POST /dsh-world/qq/panel-password  { username, password } remembers SnowLuma's panel password and
 *                                     trades it for a session token right away
 *
 * Writes require the `x-dsh-world` header: a cross-site page cannot add it (that would trigger a preflight,
 * and no preflight is answered here).
 *
 * There used to be a second half here — start/stop/halt/bind/unbind for the standalone `qq-bridge` process.
 * That process is gone (the channel now lives inside this plugin), so those doors went with it. The route is
 * registered whether or not the channel is switched on: `/native` answers `null` when it is off, and the
 * console door has nothing to do with it — which is why removing the bridge's config did not have to take
 * this endpoint down with it.
 */
export declare const QQ_PREFIX = "/dsh-world/qq";
export declare const WRITE_HEADER = "x-dsh-world";
/** What the panel may change about her own channel: replying, and the balcony's port. */
export interface NativePatch {
    autoReply?: boolean;
    bridge?: {
        port?: number;
    };
}
type SetNative = (patch: NativePatch) => unknown;
export declare function qqRoute(allowedHosts?: readonly string[], doors?: ConsoleDoors, native?: () => unknown, setNative?: SetNative): {
    kind: "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};
export {};
