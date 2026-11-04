import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RpcInput, RpcOutput } from '@getpaseo/plugin';
import { z } from 'zod';

import type { accountsSaveRpc, accountsStatusRpc, accountsSwitchRpc } from '../shared/accounts';

import type { Keychain } from './keychain';
import { parseCredentials } from './keychain';
import type { FetchTokenOwner, TokenOwnerResult } from './tokenOwner';

const CREDENTIALS_FILE = 'credentials.json';
const OAUTH_ACCOUNT_FILE = 'oauthAccount.json';
const CLAUDE_JSON_BACKUP_FILE = '.claude.json.bak';
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const UNSUPPORTED_PLATFORM_REASON = 'Claude accounts can only be switched on macOS';

const OauthAccountSchema = z.object({
    emailAddress: z.string().min(1),
    organizationName: z.string().nullish(),
});
const ClaudeJsonSchema = z.record(z.string(), z.unknown());

/** Result of `Accounts.status`. */
export type AccountsStatus = RpcOutput<typeof accountsStatusRpc>;
/** Result of `Accounts.save`. */
export type AccountsSaveResult = RpcOutput<typeof accountsSaveRpc>;
/** Input of `Accounts.switch`. */
export type AccountsSwitchInput = RpcInput<typeof accountsSwitchRpc>;
/** Result of `Accounts.switch`. */
export type AccountsSwitchResult = RpcOutput<typeof accountsSwitchRpc>;

/** Dependencies of `createAccounts`. */
export interface CreateAccountsOptions {
    keychain: Keychain;
    claudeJsonPath: string;
    storeDir: string;
    fetchTokenOwner: FetchTokenOwner;
    countClaudeProcesses: () => Promise<number>;
    /** Receives at most a directory name. */
    log: (message: string) => void;
    /** Defaults to the platform this process runs on. */
    platform?: NodeJS.Platform;
}

/** The account operations behind the RPCs. A refusal is a rejection whose message carries no secret. */
export interface Accounts {
    /** Never reads the Keychain, so opening the menu never touches secrets. */
    status(): Promise<AccountsStatus>;
    save(): Promise<AccountsSaveResult>;
    switch(input: AccountsSwitchInput): Promise<AccountsSwitchResult>;
}

interface OauthAccount {
    email: string;
    organization: string | null;
    /** The object as stored: Claude Code keeps fields here this plugin does not model. */
    document: unknown;
}

interface Account extends OauthAccount {
    dir: string;
    damaged: boolean;
}

interface ClaudeJson {
    /** Null when the file does not exist. */
    raw: string | null;
    document: Record<string, unknown>;
    /** Null when nobody is logged in. */
    account: OauthAccount | null;
}

interface RefreshCopiesParams {
    credentials: string;
    active: Account;
    accounts: Account[];
}

/**
 * The account store shared with `claude-account.sh`, plus switching between its accounts. `save` and
 * `switch` run one at a time, so several clients cannot interleave a token rotation.
 */
export function createAccounts(options: CreateAccountsOptions): Accounts {
    const { keychain, claudeJsonPath, storeDir, fetchTokenOwner, countClaudeProcesses, log } = options;
    const platform = options.platform ?? process.platform;

    let queue: Promise<unknown> = Promise.resolve();

    return { status, save, switch: switchAccount };

    async function status(): Promise<AccountsStatus> {
        if (platform !== 'darwin') {
            return unavailableStatus(UNSUPPORTED_PLATFORM_REASON);
        }

        const claudeJson = await readClaudeJson(claudeJsonPath);
        if (claudeJson === null) {
            return unavailableStatus(unreadableClaudeJsonMessage());
        }

        const accounts = await listAccounts();
        const current = claudeJson.account;

        return {
            state: 'ready',
            current: current && {
                email: current.email,
                organization: current.organization,
                saved: findAccount(accounts, current.email) !== undefined,
            },
            accounts: accounts.map(account => ({
                email: account.email,
                organization: account.organization,
                active: current !== null && isSameEmail(account.email, current.email),
                damaged: account.damaged,
            })),
            runningClaudeProcesses: await countClaudeProcesses(),
        };
    }

    async function save(): Promise<AccountsSaveResult> {
        assertSupportedPlatform();
        return enqueue(performSave);
    }

    async function switchAccount(input: AccountsSwitchInput): Promise<AccountsSwitchResult> {
        assertSupportedPlatform();
        return enqueue(() => performSwitch(input));
    }

    function assertSupportedPlatform(): void {
        if (platform !== 'darwin') {
            throw new Error(UNSUPPORTED_PLATFORM_REASON);
        }
    }

    /** Runs after the previous operation settles, whichever way: a failure must not block the next. */
    function enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const run = queue.then(operation, operation);
        queue = run;
        return run;
    }

    async function performSave(): Promise<AccountsSaveResult> {
        const { account } = await requireClaudeJson();
        if (account === null) {
            throw new Error('Not logged in to Claude: use /login first');
        }
        assertSafePathSegment(account.email);

        const keychainResult = await keychain.read();
        if (keychainResult.state !== 'found') {
            throw new Error('The Keychain holds no valid Claude tokens: use /login first');
        }

        const { credentials } = keychainResult;
        const owner = await resolveTokenOwner(credentials);
        if (owner.state === 'confirmed' && !isSameEmail(owner.email, account.email)) {
            throw new Error(
                `The Keychain tokens belong to ${owner.email}, but Claude is logged in as ${account.email}: use /login to fix this before saving`,
            );
        }

        const dir = findAccount(await listAccounts(), account.email)?.dir ?? (await claimNewAccountDir(account.email));
        await writeAccountCopy(dir, credentials, account.document);

        return owner.state === 'confirmed'
            ? { email: account.email }
            : { email: account.email, warning: unconfirmedOwnerWarning(account.email) };
    }

    /**
     * The order is deliberate. Tokens rotate, so the outgoing tokens reach their copy before the
     * Keychain is overwritten, and the target's tokens are read only after that: when the Keychain
     * held the target's own tokens, the refresh has just made its copy newer.
     */
    async function performSwitch(input: AccountsSwitchInput): Promise<AccountsSwitchResult> {
        const { account: current } = await requireClaudeJson();
        const accounts = await listAccounts();

        const target = findAccount(accounts, input.email);
        if (target === undefined) {
            throw new Error(`No saved account for ${input.email}`);
        }
        if (target.damaged) {
            throw new Error(damagedCopyMessage(target.email));
        }
        if (current !== null && isSameEmail(target.email, current.email)) {
            return { status: 'already-active' };
        }

        const activeCopy = current === null ? undefined : findAccount(accounts, current.email);
        if (current !== null && activeCopy === undefined) {
            throw new Error(`The active account ${current.email} is not saved: save it first, or its login is lost`);
        }

        if (!input.confirmed) {
            const runningClaudeProcesses = await countClaudeProcesses();
            if (runningClaudeProcesses > 0) {
                return { status: 'confirmation-required', runningClaudeProcesses };
            }
        }

        const keychainResult = await keychain.read();
        const previousCredentials = keychainResult.state === 'found' ? keychainResult.credentials : null;

        let warning: string | undefined;
        if (current !== null && activeCopy !== undefined) {
            const active: Account = { ...activeCopy, ...current };
            warning =
                previousCredentials === null
                    ? `The Keychain holds no valid tokens: kept the previous copy of ${active.email}`
                    : await refreshCopies({ credentials: previousCredentials, active, accounts });
        }

        const targetCredentials = await readOptionalFile(join(target.dir, CREDENTIALS_FILE));
        if (targetCredentials === null || parseCredentials(targetCredentials) === null) {
            throw new Error(damagedCopyMessage(target.email));
        }

        try {
            await keychain.write(targetCredentials);
        } catch (error) {
            throw new Error(
                `Could not write the Keychain (${describeError(error)}). ${await restoreKeychain(previousCredentials)}`,
                { cause: error },
            );
        }

        try {
            await writeClaudeJsonAccount(target.document);
        } catch (error) {
            throw new Error(
                `Could not update ${claudeJsonPath} (${describeError(error)}). ${await restoreKeychain(previousCredentials)}`,
                { cause: error },
            );
        }

        return warning === undefined
            ? { status: 'switched', email: target.email }
            : { status: 'switched', email: target.email, warning };
    }

    /** Returns the warning the switch should carry, if any. */
    async function refreshCopies({ credentials, active, accounts }: RefreshCopiesParams): Promise<string | undefined> {
        const owner = await resolveTokenOwner(credentials);

        if (owner.state === 'confirmed' && !isSameEmail(owner.email, active.email)) {
            const ownerCopy = findAccount(accounts, owner.email);
            if (ownerCopy === undefined) {
                throw new Error(
                    `The Keychain tokens belong to ${owner.email}, which is not saved: log in to that account and save it first`,
                );
            }
            // Its `oauthAccount.json` stays: `~/.claude.json` describes another account.
            await writeCredentialsCopy(ownerCopy.dir, credentials);
            return undefined;
        }

        await writeAccountCopy(active.dir, credentials, active.document);
        return owner.state === 'confirmed' ? undefined : unconfirmedOwnerWarning(active.email);
    }

    async function resolveTokenOwner(credentials: string): Promise<TokenOwnerResult> {
        const accessToken = parseCredentials(credentials)?.claudeAiOauth.accessToken;
        return accessToken === undefined ? { state: 'unconfirmed' } : fetchTokenOwner(accessToken);
    }

    /** Never rejects: the caller is already reporting the failure this recovers from. */
    async function restoreKeychain(previousCredentials: string | null): Promise<string> {
        if (previousCredentials === null) {
            return 'The Keychain held no valid tokens before the switch, so there is nothing to restore';
        }

        try {
            await keychain.write(previousCredentials);
            return 'The previous Keychain tokens were restored';
        } catch (error) {
            return `The previous Keychain tokens could not be restored (${describeError(error)}): use /login`;
        }
    }

    async function writeClaudeJsonAccount(oauthAccount: unknown): Promise<void> {
        // Read here, not at the start of the switch: running Claude sessions keep writing this file.
        const { raw, document } = await requireClaudeJson();
        if (raw !== null) {
            await writeFileAtomic(join(storeDir, CLAUDE_JSON_BACKUP_FILE), raw);
        }

        await writeFileAtomic(claudeJsonPath, JSON.stringify({ ...document, oauthAccount }, null, 2));
    }

    async function requireClaudeJson(): Promise<ClaudeJson> {
        const claudeJson = await readClaudeJson(claudeJsonPath);
        if (claudeJson === null) {
            throw new Error(unreadableClaudeJsonMessage());
        }
        return claudeJson;
    }

    function unreadableClaudeJsonMessage(): string {
        return `${claudeJsonPath} cannot be parsed, so it was left alone`;
    }

    async function listAccounts(): Promise<Account[]> {
        const accounts: Account[] = [];

        for (const name of await listAccountDirectories(storeDir)) {
            const dir = join(storeDir, name);
            const rawOauthAccount = await readOptionalFile(join(dir, OAUTH_ACCOUNT_FILE));
            if (rawOauthAccount === null) {
                continue;
            }

            const oauthAccount = parseOauthAccount(parseJson(rawOauthAccount));
            if (oauthAccount === null) {
                log(`Skipping account directory ${name}: invalid ${OAUTH_ACCOUNT_FILE}`);
                continue;
            }
            if (findAccount(accounts, oauthAccount.email) !== undefined) {
                continue;
            }

            const credentials = await readOptionalFile(join(dir, CREDENTIALS_FILE));
            accounts.push({
                ...oauthAccount,
                dir,
                damaged: credentials === null || parseCredentials(credentials) === null,
            });
        }

        return accounts;
    }

    /**
     * Only for an email no listed account has. A directory of that name holding an
     * `oauthAccount.json` therefore belongs to someone else (the script names directories freely) or
     * cannot be read, and either way its tokens must not be overwritten.
     */
    async function claimNewAccountDir(email: string): Promise<string> {
        const dir = join(storeDir, email);
        if ((await readOptionalFile(join(dir, OAUTH_ACCOUNT_FILE))) !== null) {
            throw new Error(`The directory ${email} in the account store already holds another account`);
        }
        return dir;
    }

    async function writeAccountCopy(dir: string, credentials: string, oauthAccount: unknown): Promise<void> {
        await writeCredentialsCopy(dir, credentials);
        await writeFileAtomic(join(dir, OAUTH_ACCOUNT_FILE), JSON.stringify(oauthAccount, null, 2));
    }

    async function writeCredentialsCopy(dir: string, credentials: string): Promise<void> {
        await ensurePrivateDirectory(storeDir);
        await ensurePrivateDirectory(dir);
        await writeFileAtomic(join(dir, CREDENTIALS_FILE), credentials);
    }
}

function damagedCopyMessage(email: string): string {
    return `The saved copy of ${email} is damaged: log in to that account and save it again`;
}

function unconfirmedOwnerWarning(email: string): string {
    return `Could not confirm who owns the Keychain tokens: saved them as ${email}`;
}

function unavailableStatus(reason: string): AccountsStatus {
    return { state: 'unavailable', reason, current: null, accounts: [], runningClaudeProcesses: 0 };
}

function findAccount(accounts: Account[], email: string): Account | undefined {
    return accounts.find(account => isSameEmail(account.email, email));
}

function isSameEmail(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

/** The email comes from a file other programs write, and becomes a directory name. */
function assertSafePathSegment(email: string): void {
    if (email.startsWith('.') || email.includes('..') || /[/\\\0]/.test(email)) {
        throw new Error('The account email in ~/.claude.json cannot be used as a directory name');
    }
}

/** A missing file means nobody is logged in; null means the file exists but cannot be used. */
async function readClaudeJson(path: string): Promise<ClaudeJson | null> {
    const raw = await readOptionalFile(path);
    if (raw === null) {
        return { raw: null, document: {}, account: null };
    }

    const document = ClaudeJsonSchema.safeParse(parseJson(raw));
    if (!document.success) {
        return null;
    }

    const oauthAccount = document.data.oauthAccount ?? null;
    if (oauthAccount === null) {
        return { raw, document: document.data, account: null };
    }

    // Malformed is not logged out: treating it so would drop the active tokens without a refresh.
    const account = parseOauthAccount(oauthAccount);
    return account && { raw, document: document.data, account };
}

function parseOauthAccount(document: unknown): OauthAccount | null {
    const result = OauthAccountSchema.safeParse(document);
    return result.success
        ? { email: result.data.emailAddress, organization: result.data.organizationName ?? null, document }
        : null;
}

/** Undefined when it is not JSON. Its error is dropped because a `JSON.parse` message quotes the input. */
function parseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/** Sorted, so "the first directory wins" means the same on every run. */
async function listAccountDirectories(storeDir: string): Promise<string[]> {
    try {
        const entries = await readdir(storeDir, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => entry.name)
            .toSorted();
    } catch (error) {
        if (isFileNotFound(error)) {
            return [];
        }
        throw error;
    }
}

async function readOptionalFile(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (isFileNotFound(error)) {
            return null;
        }
        throw error;
    }
}

function isFileNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function ensurePrivateDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    // `mkdir` leaves an existing directory as it is, and the script's may have other modes.
    await chmod(path, PRIVATE_DIRECTORY_MODE);
}

/** A temp file in the same directory, so the rename cannot cross a filesystem. */
async function writeFileAtomic(path: string, content: string): Promise<void> {
    const tempPath = `${path}.tmp-${randomUUID()}`;

    try {
        await writeFile(tempPath, content, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
        await rename(tempPath, path);
    } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
    }
}

/** Only for errors from the Keychain adapter, which builds them without secrets, and from `node:fs`; the same goes for a `cause`. */
function describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
}
