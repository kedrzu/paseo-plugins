import { userInfo } from 'node:os';

import type { execCommand } from '@getpaseo/plugin/server';
import { z } from 'zod';

import { getExitCode } from './getExitCode';

const SERVICE = 'Claude Code-credentials';
/** `errSecItemNotFound` as `security` reports it. Every other failure is a real error. */
const EXIT_CODE_NO_ENTRY = 44;
const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;
/** An unanswered Keychain prompt must not block the account operation queue forever. */
const SECURITY_TIMEOUT_MS = 120_000;

const CredentialsSchema = z.object({
    claudeAiOauth: z.object({
        refreshToken: z.string().min(1),
        accessToken: z.string().min(1).optional(),
    }),
});

/** The token fields of a credentials document; everything else in it stays opaque. */
export type ClaudeCredentials = z.infer<typeof CredentialsSchema>;

/** `credentials` is the full raw document: it also holds tokens this plugin does not model. */
export type KeychainReadResult = { state: 'found'; credentials: string } | { state: 'no-entry' } | { state: 'invalid' };

type SecurityResult = { ok: true; stdout: string } | { ok: false; exitCode: number | undefined };

/** Access to the Keychain item Claude Code logs in with. */
export interface Keychain {
    read(): Promise<KeychainReadResult>;
    /** Overwrites the item and verifies by reading it back; rejects a value that is not valid credentials. */
    write(value: string): Promise<void>;
}

/**
 * The Keychain adapter. Errors it throws are built from scratch and never chain the original: a
 * rejected `execCommand` carries the whole argv (with the token on a write) and the stdout. This is
 * why they have no `cause`.
 */
export function createKeychain(exec: typeof execCommand): Keychain {
    const account = userInfo().username;

    return { read, write };

    async function read(): Promise<KeychainReadResult> {
        const result = await runSecurity(['find-generic-password', '-s', SERVICE, '-a', account, '-w']);
        if (!result.ok) {
            if (result.exitCode === EXIT_CODE_NO_ENTRY) {
                return { state: 'no-entry' };
            }
            throw new Error(`Keychain read failed (${describeExitCode(result.exitCode)})`);
        }

        const credentials = decodeSecurityOutput(result.stdout);
        return credentials === null ? { state: 'invalid' } : { state: 'found', credentials };
    }

    async function write(value: string): Promise<void> {
        if (parseCredentials(value) === null) {
            throw new Error('Refusing to write invalid credentials to the Keychain');
        }

        // Not `security -i`: interactive mode cuts lines at about 4 KB and tokens get longer.
        const result = await runSecurity(['add-generic-password', '-U', '-a', account, '-s', SERVICE, '-w', value]);
        if (!result.ok) {
            throw new Error(`Keychain write failed (${describeExitCode(result.exitCode)})`);
        }

        const readBack = await read();
        if (readBack.state !== 'found' || readBack.credentials !== value) {
            throw new Error('Keychain write failed (read-back differs from the written value)');
        }
    }

    /** The one place a rejected `exec` is seen: only its exit code leaves, so the argv cannot. */
    async function runSecurity(args: string[]): Promise<SecurityResult> {
        try {
            const { stdout } = await exec('security', args, { timeout: SECURITY_TIMEOUT_MS });
            return { ok: true, stdout };
        } catch (error) {
            return { ok: false, exitCode: getExitCode(error) };
        }
    }
}

/**
 * Parses a credentials document, null when it is not one. Never throws: a `JSON.parse` error quotes
 * its input.
 */
export function parseCredentials(raw: string): ClaudeCredentials | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    const result = CredentialsSchema.safeParse(parsed);
    return result.success ? result.data : null;
}

/** `security -w` prints the value as hex when it is not clean text. */
function decodeSecurityOutput(stdout: string): string | null {
    const raw = stdout.replace(/\n+$/, '');
    if (parseCredentials(raw) !== null) {
        return raw;
    }
    if (!HEX_PATTERN.test(raw)) {
        return null;
    }

    const decoded = Buffer.from(raw, 'hex').toString('utf8');
    return parseCredentials(decoded) === null ? null : decoded;
}

function describeExitCode(exitCode: number | undefined): string {
    return exitCode === undefined ? 'the process did not exit normally' : `exit code ${exitCode}`;
}
