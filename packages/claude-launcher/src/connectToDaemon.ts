import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createHostClient } from '@getpaseo/client/node';

// The client package exports `DaemonClient` only under `internal/`.
type DaemonClient = ReturnType<typeof createHostClient>;

const CONNECT_TIMEOUT_MS = 5000;

/**
 * Connects to the local Paseo daemon the way the `paseo` CLI does: the listen address from the
 * daemon's `paseo.pid` lock and the token from `local-credential`, both in the Paseo home.
 */
export async function connectToDaemon(paseoHome: string): Promise<DaemonClient> {
    const lock: unknown = JSON.parse(await readFile(join(paseoHome, 'paseo.pid'), 'utf8'));
    const listen = readListenAddress(lock);
    const token = (await readFile(join(paseoHome, 'local-credential'), 'utf8')).trim();

    const client = createHostClient(listen, {
        clientId: 'cid_wait_for_setup',
        clientType: 'cli',
        localCredential: () => token,
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        reconnect: { enabled: false },
    });

    try {
        await client.connect();
        return client;
    } catch (error) {
        await client.close();
        throw error;
    }
}

function readListenAddress(lock: unknown): string {
    if (typeof lock === 'object' && lock !== null && 'listen' in lock && typeof lock.listen === 'string') {
        return lock.listen;
    }
    throw new Error('the Paseo daemon is not listening (no `listen` in paseo.pid)');
}
