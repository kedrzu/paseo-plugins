import { afterEach, expect, jest, test } from 'bun:test';

import type { CreateFetchTokenOwnerOptions, TokenOwnerResult } from './tokenOwner';
import { createFetchTokenOwner } from './tokenOwner';

const TOKEN = 'sk-ant-MARKER-TOKEN';
const EMAIL = 'owner@example.com';
const UNCONFIRMED: TokenOwnerResult = { state: 'unconfirmed' };

afterEach(() => {
    jest.useRealTimers();
});

test('a valid profile confirms the email, sending the token to the profile endpoint only', async () => {
    const calls: [string, RequestInit][] = [];
    const fetchTokenOwner = createFetchTokenOwner({
        fetch: (url, init) => {
            calls.push([url, init]);
            return Promise.resolve(Response.json({ account: { email: EMAIL } }));
        },
        log: () => {},
    });

    const expected: TokenOwnerResult = { state: 'confirmed', email: EMAIL };
    expect(await fetchTokenOwner(TOKEN)).toEqual(expected);

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe('https://api.anthropic.com/api/oauth/profile');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        'anthropic-beta': 'oauth-2025-04-20',
    });
    // Following a redirect would carry the headers to another host.
    expect(init.redirect).toBe('error');
});

const UNCONFIRMED_RESPONSES: [string, CreateFetchTokenOwnerOptions['fetch']][] = [
    ['a network failure quoting the token', () => Promise.reject(new Error(`failed for ${TOKEN}`))],
    [
        'a synchronous fetch throw',
        () => {
            throw new TypeError(`bad header ${TOKEN}`);
        },
    ],
    ['a 401', () => Promise.resolve(Response.json({ error: TOKEN }, { status: 401 }))],
    [
        'a 500 with a well-formed body',
        () => Promise.resolve(Response.json({ account: { email: EMAIL } }, { status: 500 })),
    ],
    ['another shape', () => Promise.resolve(Response.json({ email: EMAIL, token: TOKEN }))],
    ['a non-email', () => Promise.resolve(Response.json({ account: { email: TOKEN } }))],
    ['a body that is not JSON', () => Promise.resolve(new Response(`<html>${TOKEN}</html>`))],
];

for (const [name, fetch] of UNCONFIRMED_RESPONSES) {
    test(`${name} is unconfirmed and logs neither token nor body`, async () => {
        const logs: string[] = [];
        const fetchTokenOwner = createFetchTokenOwner({ fetch, log: message => logs.push(message) });

        expect(await fetchTokenOwner(TOKEN)).toEqual(UNCONFIRMED);

        expect(logs).toHaveLength(1);
        expect(logs[0]).not.toContain(TOKEN);
        expect(logs[0]).not.toContain(EMAIL);
    });
}

test('a rejected status reaches the log', async () => {
    const logs: string[] = [];
    const fetchTokenOwner = createFetchTokenOwner({
        fetch: () => Promise.resolve(new Response(null, { status: 401 })),
        log: message => logs.push(message),
    });

    await fetchTokenOwner(TOKEN);

    expect(logs[0]).toContain('401');
});

test('a request that stalls is unconfirmed after 5 s', async () => {
    jest.useFakeTimers();
    const fetchTokenOwner = createFetchTokenOwner({
        fetch: (_url, init) =>
            new Promise((_resolve, reject) => {
                rejectOnAbort(init, reject);
            }),
        log: () => {},
    });

    const result = fetchTokenOwner(TOKEN);
    jest.advanceTimersByTime(5000);

    expect(await result).toEqual(UNCONFIRMED);
});

test('a body that stalls is unconfirmed after 5 s', async () => {
    jest.useFakeTimers();
    const fetchTokenOwner = createFetchTokenOwner({
        fetch: (_url, init) => {
            const body = new ReadableStream({
                start(controller) {
                    rejectOnAbort(init, reason => {
                        controller.error(reason);
                    });
                },
            });
            return Promise.resolve(new Response(body));
        },
        log: () => {},
    });

    const result = fetchTokenOwner(TOKEN);
    // Let the fetch resolve first: the timer must still be armed while the body is read.
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(5000);

    expect(await result).toEqual(UNCONFIRMED);
});

/** What real `fetch` does with its signal. */
function rejectOnAbort(init: RequestInit, reject: (reason: Error) => void): void {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
}
