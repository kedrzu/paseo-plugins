import type { PluginCommandCapabilities } from '@getpaseo/plugin/client';

import { keepAwakeExtendRpc, keepAwakeStatusRpc, keepAwakeStopRpc } from '../shared/keepAwake';

export interface KeepAwakeSnapshot {
    /** `undefined` until the first status arrives; `null` when nothing keeps the Mac awake. */
    endsAt: number | null | undefined;
    loadError: string | null;
}

/** The daemon's session as the client last saw it. Every action publishes the answer it got. */
export interface KeepAwakeStore {
    getSnapshot: () => KeepAwakeSnapshot;
    subscribe: (listener: () => void) => () => void;
    /** Never rejects: a failure lands in `loadError`. */
    refresh: () => Promise<void>;
    /** Rejects on failure, so the caller (Command Center, a button) can show it. */
    extend: (minutes: number) => Promise<void>;
    stop: () => Promise<void>;
}

/** Created per `contribute`, because each host's installation has its own daemon. */
export function createKeepAwakeStore(client: Pick<PluginCommandCapabilities, 'rpc'>): KeepAwakeStore {
    const listeners = new Set<() => void>();
    let snapshot: KeepAwakeSnapshot = { endsAt: undefined, loadError: null };
    let latestCall = 0;

    return {
        getSnapshot: () => snapshot,
        subscribe,
        refresh,
        extend: minutes => run(() => client.rpc(keepAwakeExtendRpc, { minutes })),
        stop: () => run(() => client.rpc(keepAwakeStopRpc, {})),
    };

    function subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    async function refresh(): Promise<void> {
        try {
            await run(() => client.rpc(keepAwakeStatusRpc, {}));
        } catch (error) {
            publish({ endsAt: snapshot.endsAt, loadError: getErrorMessage(error) });
        }
    }

    async function run(call: () => Promise<{ endsAt: number | null }>): Promise<void> {
        // Only the newest call may publish: an older answer describes the state before an action.
        latestCall += 1;
        const thisCall = latestCall;
        const { endsAt } = await call();
        if (thisCall === latestCall) {
            publish({ endsAt, loadError: null });
        }
    }

    function publish(next: KeepAwakeSnapshot): void {
        snapshot = next;
        for (const listener of listeners) {
            listener();
        }
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
