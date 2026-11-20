import { expect, test } from 'bun:test';

import { formatKeepAwake } from './formatKeepAwake';

const now = new Date(2026, 10, 20, 13, 5).getTime();
const MINUTE = 60_000;

test('off when there is no session or it has ended', () => {
    expect(formatKeepAwake(null, now)).toBe('Keep awake: off');
    expect(formatKeepAwake(now - MINUTE, now)).toBe('Keep awake: off');
});

test('shows the local end time and the remaining time, rounded up to a minute', () => {
    expect(formatKeepAwake(now + 30 * MINUTE - 1000, now)).toBe('Awake until 13:34 (30 min)');
    expect(formatKeepAwake(now + 60 * MINUTE, now)).toBe('Awake until 14:05 (1 h)');
    expect(formatKeepAwake(now + 125 * MINUTE, now)).toBe('Awake until 15:10 (2 h 5 min)');
});
