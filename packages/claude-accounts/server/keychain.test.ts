import { userInfo } from 'node:os';

import { execCommand } from '@getpaseo/plugin/server';
import { expect, test } from 'bun:test';

import type { KeychainReadResult } from './keychain';
import { createKeychain, parseCredentials } from './keychain';

const MARKER = 'sk-ant-MARKER-TOKEN';
const CREDENTIALS = JSON.stringify({
    claudeAiOauth: { accessToken: MARKER, refreshToken: `${MARKER}-refresh` },
    mcpOAuth: { server: { token: `${MARKER}-mcp` } },
});

test('read returns the whole document, without the newline security appends', async () => {
    const keychain = createKeychain(() => securityOutput(`${CREDENTIALS}\n`));

    const expected: KeychainReadResult = { state: 'found', credentials: CREDENTIALS };
    expect(await keychain.read()).toEqual(expected);
});

test('read decodes hex output', async () => {
    const hex = Buffer.from(CREDENTIALS, 'utf8').toString('hex');
    const keychain = createKeychain(() => securityOutput(`${hex}\n`));

    const expected: KeychainReadResult = { state: 'found', credentials: CREDENTIALS };
    expect(await keychain.read()).toEqual(expected);
});

const INVALID_OUTPUTS: [string, string][] = [
    ['truncated JSON quoting a token', `{"claudeAiOauth":{"refreshToken":"${MARKER}`],
    ['JSON without a refresh token', JSON.stringify({ claudeAiOauth: { accessToken: MARKER } })],
    ['an empty refresh token', JSON.stringify({ claudeAiOauth: { refreshToken: '' } })],
    ['hex of something else', Buffer.from(`not credentials ${MARKER}`, 'utf8').toString('hex')],
    ['odd-length hex', 'abc'],
    ['empty output', '\n'],
];

for (const [name, stdout] of INVALID_OUTPUTS) {
    test(`read reports ${name} as invalid, carrying no value`, async () => {
        const keychain = createKeychain(() => securityOutput(stdout));

        const expected: KeychainReadResult = { state: 'invalid' };
        expect(await keychain.read()).toEqual(expected);
    });
}

test('read tells a missing entry from a failure', async () => {
    const missing = createKeychain(() => Promise.reject(execError(44)));
    const locked = createKeychain(() => Promise.reject(execError(36)));

    const expected: KeychainReadResult = { state: 'no-entry' };
    expect(await missing.read()).toEqual(expected);
    await expect(locked.read()).rejects.toThrow('exit code 36');
});

test('a no-entry exit is recognized on a real execFile rejection', async () => {
    const keychain = createKeychain(() => execCommand('sh', ['-c', 'exit 44']));

    const expected: KeychainReadResult = { state: 'no-entry' };
    expect(await keychain.read()).toEqual(expected);
});

test('read failure does not leak the token', async () => {
    const keychain = createKeychain(() => Promise.reject(execError(36)));

    expectNoMarker(await captureRejection(keychain.read()));
});

test('write failure does not leak the token', async () => {
    const keychain = createKeychain(() => Promise.reject(execError(1)));

    expectNoMarker(await captureRejection(keychain.write(CREDENTIALS)));
});

test('write failure does not leak the token from a real execFile rejection', async () => {
    // `sh` stands in for `security`, so the rejection really has execFile's shape with the token in argv.
    let realError: unknown;
    const keychain = createKeychain(async (_command, args) => {
        try {
            return await execCommand('sh', ['-c', 'exit 3', '--', ...args]);
        } catch (error) {
            realError = error;
            throw error;
        }
    });

    const thrown = await captureRejection(keychain.write(CREDENTIALS));

    expect(dumpError(realError)).toContain(MARKER);
    expectNoMarker(thrown);
});

test('a failed read-back does not leak the token', async () => {
    const other = JSON.stringify({ claudeAiOauth: { refreshToken: `${MARKER}-other` } });
    const keychain = createKeychain((_command, args) =>
        securityOutput(args[0] === 'find-generic-password' ? other : ''),
    );

    expectNoMarker(await captureRejection(keychain.write(CREDENTIALS)));
});

test('write stores the value for the OS user and accepts a hex read-back', async () => {
    const calls: string[][] = [];
    const keychain = createKeychain((command, args) => {
        calls.push([command, ...args]);
        const stdout = args[0] === 'find-generic-password' ? Buffer.from(CREDENTIALS, 'utf8').toString('hex') : '';
        return securityOutput(stdout);
    });

    await keychain.write(CREDENTIALS);

    const account = userInfo().username;
    expect(calls[0]).toEqual([
        'security',
        'add-generic-password',
        '-U',
        '-a',
        account,
        '-s',
        'Claude Code-credentials',
        '-w',
        CREDENTIALS,
    ]);
    expect(calls).toHaveLength(2);
});

test('write rejects when the read-back differs', async () => {
    const other = JSON.stringify({ claudeAiOauth: { refreshToken: 'other' } });
    const keychain = createKeychain((_command, args) =>
        securityOutput(args[0] === 'find-generic-password' ? other : ''),
    );

    await expect(keychain.write(CREDENTIALS)).rejects.toThrow('read-back');
});

test('write of invalid credentials never touches the Keychain', async () => {
    const calls: string[][] = [];
    const keychain = createKeychain((_command, args) => {
        calls.push(args);
        return securityOutput('');
    });

    expectNoMarker(await captureRejection(keychain.write(`{"truncated":"${MARKER}`)));
    expect(calls).toEqual([]);
});

test('parseCredentials exposes the access token for the owner check', () => {
    expect(parseCredentials(CREDENTIALS)?.claudeAiOauth.accessToken).toBe(MARKER);
    expect(parseCredentials(`{"a":"${MARKER}`)).toBeNull();
});

function securityOutput(stdout: string): Promise<{ stdout: string; stderr: string }> {
    return Promise.resolve({ stdout, stderr: '' });
}

/** The shape of a rejected `execFile`: argv in `message` and `cmd`, output alongside. */
function execError(code: number): Error {
    const cmd = `security add-generic-password -w ${MARKER}`;
    return Object.assign(new Error(`Command failed: ${cmd}\n${MARKER}`), {
        code,
        cmd,
        stdout: MARKER,
        stderr: MARKER,
    });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('Expected a rejection');
}

function expectNoMarker(error: unknown): void {
    expect(error).toBeInstanceOf(Error);
    expect(dumpError(error)).not.toContain(MARKER);
}

/** Every place an error can carry text: message, stack, cause and all own properties, hidden too. */
function dumpError(error: unknown): string {
    if (typeof error !== 'object' || error === null) {
        return String(error);
    }

    const parts: string[] = [];
    for (const key of Object.getOwnPropertyNames(error)) {
        const value: unknown = Reflect.get(error, key);
        parts.push(`${key}=${value instanceof Error ? dumpError(value) : String(value)}`);
    }
    return parts.join('\n');
}
