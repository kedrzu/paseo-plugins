import { describe, expect, test } from 'bun:test';

import type { SetupStatus, WaitForSetupOptions } from './waitForSetup.js';
import { waitForSetup } from './waitForSetup.js';

describe('waitForSetup', () => {
    test('returns at once when there is no setup', async () => {
        const run = simulate([null]);
        expect(await waitForSetup(run.options({ mayBeStarting: false }))).toBe('no-setup');
        expect(run.reads).toBe(1);
    });

    test('waits while setup runs, then returns its final status', async () => {
        const run = simulate(['running', 'running', 'completed']);
        expect(await waitForSetup(run.options({ mayBeStarting: false }))).toBe('completed');
        expect(run.reads).toBe(3);
        expect(run.logs).toHaveLength(1);
    });

    test('does not hold a failed setup', async () => {
        const run = simulate(['running', 'failed']);
        expect(await waitForSetup(run.options({ mayBeStarting: false }))).toBe('failed');
    });

    test("does not wait for a setup blocked on the user's approval", async () => {
        const run = simulate(['blocked']);
        expect(await waitForSetup(run.options({ mayBeStarting: false }))).toBe('blocked');
    });

    test('gives a fresh worktree agent a grace period for setup to start', async () => {
        const run = simulate([null, 'running', 'completed']);
        expect(await waitForSetup(run.options({ mayBeStarting: true }))).toBe('completed');
    });

    test('ends the grace period when setup never starts', async () => {
        const run = simulate([null]);
        expect(await waitForSetup(run.options({ mayBeStarting: true }))).toBe('no-setup');
        expect(run.reads).toBeGreaterThan(1);
    });

    test('gives up on a setup that never finishes', async () => {
        const run = simulate(['running']);
        expect(await waitForSetup(run.options({ mayBeStarting: false }))).toBe('timed-out');
    });
});

/** Replays `statuses` (the last one repeats) on a fake clock that each sleep advances. */
function simulate(statuses: SetupStatus[]) {
    let clock = 0;
    const run = {
        reads: 0,
        logs: [] as string[],
        options(overrides: Pick<WaitForSetupOptions, 'mayBeStarting'>): WaitForSetupOptions {
            return {
                ...overrides,
                readStatus: () => {
                    const status = statuses[Math.min(run.reads, statuses.length - 1)] ?? null;
                    run.reads++;
                    return Promise.resolve(status);
                },
                log: message => run.logs.push(message),
                now: () => clock,
                sleep: ms => {
                    clock += ms;
                    return Promise.resolve();
                },
            };
        },
    };
    return run;
}
