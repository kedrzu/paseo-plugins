import { expect, test } from 'bun:test';

import type { AwakeProcess } from './keepAwake';
import { createKeepAwake } from './keepAwake';

const MINUTE = 60_000;

test('starts caffeinate for the requested time, tied to the host process', () => {
    const { keepAwake, spawned } = setup();

    expect(keepAwake.extend(30)).toBe(30 * MINUTE);

    expect(spawned.map(process => process.args)).toEqual([['-i', '-t', '1800', '-w', '4242']]);
    expect(keepAwake.getEndsAt()).toBe(30 * MINUTE);
});

test('extending adds to the remaining time and replaces the running caffeinate', () => {
    const { keepAwake, spawned, clock } = setup();
    keepAwake.extend(60);
    clock.now = 20 * MINUTE;

    expect(keepAwake.extend(30)).toBe(90 * MINUTE);

    expect(spawned[0]?.killed).toBe(true);
    expect(spawned[1]?.args).toEqual(['-i', '-t', String(70 * 60), '-w', '4242']);
});

test('the replaced process exiting late does not end the new session', () => {
    const { keepAwake, spawned } = setup();
    keepAwake.extend(60);
    keepAwake.extend(60);

    spawned[0]?.exit();

    expect(keepAwake.getEndsAt()).toBe(120 * MINUTE);
});

test('a session whose caffeinate exits on its own is over', () => {
    const { keepAwake, spawned } = setup();
    keepAwake.extend(60);

    spawned[0]?.exit();

    expect(keepAwake.getEndsAt()).toBeNull();
});

test('after the end time, extending starts from now, not from the old end', () => {
    const { keepAwake, clock } = setup();
    keepAwake.extend(30);
    clock.now = 45 * MINUTE;

    expect(keepAwake.getEndsAt()).toBeNull();
    expect(keepAwake.extend(30)).toBe(75 * MINUTE);
});

test('stop kills caffeinate', () => {
    const { keepAwake, spawned } = setup();
    keepAwake.extend(30);

    keepAwake.stop();

    expect(spawned[0]?.killed).toBe(true);
    expect(keepAwake.getEndsAt()).toBeNull();
});

interface FakeProcess extends AwakeProcess {
    args: string[];
    killed: boolean;
    exit(): void;
}

function setup() {
    const clock = { now: 0 };
    const spawned: FakeProcess[] = [];
    const keepAwake = createKeepAwake({
        spawn: args => {
            const listeners: (() => void)[] = [];
            const process: FakeProcess = {
                args,
                killed: false,
                kill: () => {
                    process.killed = true;
                },
                once: (_event, listener) => listeners.push(listener),
                exit: () => {
                    for (const listener of listeners) {
                        listener();
                    }
                },
            };
            spawned.push(process);
            return process;
        },
        now: () => clock.now,
        hostPid: 4242,
    });
    return { keepAwake, spawned, clock };
}
