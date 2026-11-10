import type { WorkspaceSetupSnapshot } from '@getpaseo/protocol/messages';

/** A workspace's setup status as the daemon reports it; `null` when it holds no setup snapshot. */
export type SetupStatus = WorkspaceSetupSnapshot['status'] | null;

/** How the wait ended. Every outcome lets the agent start; only `timed-out` means it gave up early. */
export type WaitForSetupOutcome = 'no-setup' | 'completed' | 'failed' | 'blocked' | 'timed-out';

/** Inputs for {@link waitForSetup}; the clock and sleep are injectable for tests. */
export interface WaitForSetupOptions {
    readStatus: () => Promise<SetupStatus>;
    /**
     * Whether setup may not have started yet. Paseo starts it on the next tick after creating the
     * worktree, so a fresh agent in a linked worktree that sees no snapshot waits a short grace
     * period before concluding there is none.
     */
    mayBeStarting: boolean;
    log: (message: string) => void;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;
const START_GRACE_MS = 6000;
// A setup that runs longer than this is stuck; the agent starts rather than hanging forever.
const TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Polls the workspace's setup status until setup is no longer running.
 * `blocked` (setup awaiting the user's approval for an untrusted source) does not wait: nothing
 * runs until a human allows it.
 */
export async function waitForSetup(options: WaitForSetupOptions): Promise<WaitForSetupOutcome> {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? Bun.sleep;
    const startedAt = now();
    let announced = false;

    while (true) {
        const status = await options.readStatus();
        const elapsed = now() - startedAt;

        switch (status) {
            case null:
                if (!options.mayBeStarting || elapsed >= START_GRACE_MS) {
                    return 'no-setup';
                }
                break;
            case 'running':
                if (elapsed >= TIMEOUT_MS) {
                    return 'timed-out';
                }
                if (!announced) {
                    options.log('workspace setup is running, waiting for it to finish');
                    announced = true;
                }
                break;
            case 'completed':
            case 'failed':
            case 'blocked':
                return status;
        }

        await sleep(POLL_INTERVAL_MS);
    }
}
