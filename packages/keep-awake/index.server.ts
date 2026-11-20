import type { PluginServerContext } from '@getpaseo/plugin/server';
import { spawnProcess } from '@getpaseo/plugin/server';

import { createKeepAwake } from './server/keepAwake';
import { keepAwakeExtendRpc, keepAwakeStatusRpc, keepAwakeStopRpc } from './shared/keepAwake';

/** Server entry: the session runs on the daemon host, the Mac to keep awake. */
export default function contribute(server: PluginServerContext): () => void {
    const keepAwake = createKeepAwake({
        spawn: args => spawnProcess('/usr/bin/caffeinate', args, { stdio: 'ignore' }),
        now: Date.now,
        hostPid: process.pid,
    });

    server.handle(keepAwakeStatusRpc, () => ({ endsAt: keepAwake.getEndsAt() }));
    server.handle(keepAwakeExtendRpc, ({ minutes }) => ({ endsAt: keepAwake.extend(minutes) }));
    server.handle(keepAwakeStopRpc, () => {
        keepAwake.stop();
        return { endsAt: null };
    });

    return () => keepAwake.stop();
}
