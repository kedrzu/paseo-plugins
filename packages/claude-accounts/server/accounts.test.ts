import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, expect, mock, test } from 'bun:test';
import { z } from 'zod';

import type { Accounts, AccountsStatus, AccountsSwitchResult, CreateAccountsOptions } from './accounts';
import { createAccounts } from './accounts';
import type { Keychain, KeychainReadResult } from './keychain';
import type { FetchTokenOwner, TokenOwnerResult } from './tokenOwner';

const MARKER = 'sk-ant-MARKER-TOKEN';
const A = 'a@example.com';
const B = 'b@example.com';
const C = 'c@example.com';

const roots: string[] = [];

afterEach(async () => {
    for (const root of roots.splice(0)) {
        await chmod(join(root, 'home'), 0o700);
        await rm(root, { recursive: true, force: true });
    }
});

test('save creates <email>/ with private modes and the unchanged documents', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A), other: 1 } });
    keychain.value = credentialsOf(A, 2);

    expect(await accounts.save()).toEqual({ email: A });

    const dir = join(storeDir, A);
    expect(await readFile(join(dir, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(JSON.parse(await readFile(join(dir, 'oauthAccount.json'), 'utf8'))).toEqual(oauthAccountOf(A));
    expect(await modeOf(storeDir)).toBe(0o700);
    expect(await modeOf(dir)).toBe(0o700);
    expect(await modeOf(join(dir, 'credentials.json'))).toBe(0o600);
    expect(await modeOf(join(dir, 'oauthAccount.json'))).toBe(0o600);
    expect((await readdir(dir)).toSorted()).toEqual(['credentials.json', 'oauthAccount.json']);
});

test('saving again replaces the files by rename, so no reader sees a partial token', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    keychain.value = credentialsOf(A, 1);
    await accounts.save();
    const path = join(storeDir, A, 'credentials.json');
    const inodeBefore = (await stat(path)).ino;

    keychain.value = credentialsOf(A, 2);
    await accounts.save();

    expect(await readFile(path, 'utf8')).toBe(credentialsOf(A, 2));
    expect((await stat(path)).ino).not.toBe(inodeBefore);
});

test('refreshing an account saved under another directory name creates no second directory', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    const dir = await addCopy(storeDir, A, { dirName: 'healed', credentials: credentialsOf(A, 1) });
    await chmod(dir, 0o755);
    await chmod(join(dir, 'credentials.json'), 0o644);
    keychain.value = credentialsOf(A, 2);

    await accounts.save();

    expect(await readdir(storeDir)).toEqual(['healed']);
    expect(await readFile(join(dir, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(await modeOf(dir)).toBe(0o700);
    expect(await modeOf(join(dir, 'credentials.json'))).toBe(0o600);
});

test('save finds the existing copy whatever the case of the email', async () => {
    const { accounts, storeDir, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf('A@Example.com') },
    });
    await addCopy(storeDir, A, { dirName: 'healed' });
    keychain.value = credentialsOf(A, 2);

    await accounts.save();

    expect(await readdir(storeDir)).toEqual(['healed']);
});

test('save repairs a damaged copy', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(storeDir, A, { credentials: 'not json' });
    keychain.value = credentialsOf(A, 2);

    await accounts.save();

    expect((await accounts.status()).accounts[0]?.damaged).toBe(false);
});

test('save refuses to overwrite a directory that holds another account', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, B, { dirName: A });
    context.keychain.value = credentialsOf(A, 2);

    await expectNoChange(context, () => context.accounts.save(), 'already holds another account');
});

const SAVE_REFUSALS: [string, Partial<SetupOptions>, KeychainReadResult | string, string][] = [
    ['nobody is logged in', { claudeJson: { other: 1 } }, credentialsOf(A), 'Not logged in'],
    ['~/.claude.json does not exist', { claudeJson: null }, credentialsOf(A), 'Not logged in'],
    ['~/.claude.json cannot be parsed', { claudeJsonRaw: '{ truncated' }, credentialsOf(A), 'cannot be parsed'],
    ['the Keychain has no entry', {}, { state: 'no-entry' }, 'no valid Claude tokens'],
    ['the Keychain value is invalid', {}, { state: 'invalid' }, 'no valid Claude tokens'],
];

for (const [name, options, keychainValue, message] of SAVE_REFUSALS) {
    test(`save refuses with no change when ${name}`, async () => {
        const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) }, ...options });
        context.keychain.set(keychainValue);

        await expectNoChange(context, () => context.accounts.save(), message);
    });
}

test('save refuses tokens confirmed to belong to someone else, naming both accounts', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    context.keychain.value = credentialsOf(B);

    await expectNoChange(context, () => context.accounts.save(), `${B}, but Claude is logged in as ${A}: use /login`);
});

test('save with an unanswered owner check saves by oauthAccount and warns', async () => {
    const { accounts, storeDir, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        fetchTokenOwner: fetchNoOwner,
    });
    keychain.value = credentialsOf(B);

    const result = await accounts.save();

    expect(result.email).toBe(A);
    expect(result.warning).toContain(A);
    expect(await readFile(join(storeDir, A, 'credentials.json'), 'utf8')).toBe(credentialsOf(B));
});

test('a credentials document without an access token is unconfirmed, with no owner request', async () => {
    const fetchTokenOwner = mock<FetchTokenOwner>(fetchNoOwner);
    const { accounts, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) }, fetchTokenOwner });
    keychain.value = JSON.stringify({ claudeAiOauth: { refreshToken: `${MARKER}-refresh` } });

    const result = await accounts.save();

    expect(result.warning).toContain(A);
    expect(fetchTokenOwner).not.toHaveBeenCalled();
});

for (const email of [
    '../evil@example.com',
    'a/b@example.com',
    'a..b@example.com',
    '..',
    '.hidden@example.com',
    'a\\b@example.com',
]) {
    test(`save rejects the email ${email} before it becomes a path`, async () => {
        const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(email) } });
        context.keychain.value = credentialsOf(email);

        await expectNoChange(context, () => context.accounts.save(), 'cannot be used as a directory name');
        expect(context.keychain.reads).toBe(0);
    });
}

test('switching from A to B keeps A in its copy, loads B and preserves ~/.claude.json', async () => {
    const liveA = { ...oauthAccountOf(A), organizationName: 'Renamed' };
    const claudeJson = { numStartups: 7, oauthAccount: liveA, projects: { '/x': { allowedTools: ['Bash'] } } };
    const { accounts, storeDir, claudeJsonPath, keychain } = await setup({ claudeJson });
    const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
    await addCopy(storeDir, B, { credentials: credentialsOf(B, 1), extra: { accountUuid: 'uuid-b' } });
    keychain.value = credentialsOf(A, 2);
    await chmod(claudeJsonPath, 0o644);
    const rawBefore = await readFile(claudeJsonPath, 'utf8');
    const inodeBefore = (await stat(claudeJsonPath)).ino;

    const result = await accounts.switch({ email: B, confirmed: false });

    const expected: AccountsSwitchResult = { status: 'switched', email: B };
    expect(result).toEqual(expected);
    expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(JSON.parse(await readFile(join(dirA, 'oauthAccount.json'), 'utf8'))).toEqual(liveA);
    expect(keychain.value).toBe(credentialsOf(B, 1));

    const raw = await readFile(claudeJsonPath, 'utf8');
    expect(raw).toBe(
        JSON.stringify({ ...claudeJson, oauthAccount: { ...oauthAccountOf(B), accountUuid: 'uuid-b' } }, null, 2),
    );
    expect(await modeOf(claudeJsonPath)).toBe(0o600);
    expect((await stat(claudeJsonPath)).ino).not.toBe(inodeBefore);

    const backupPath = join(storeDir, '.claude.json.bak');
    expect(await readFile(backupPath, 'utf8')).toBe(rawBefore);
    expect(await modeOf(backupPath)).toBe(0o600);
});

test('a key another Claude process writes during the switch survives it', async () => {
    const { accounts, storeDir, claudeJsonPath, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
    });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A);
    keychain.onWrite = () =>
        writeFile(claudeJsonPath, JSON.stringify({ oauthAccount: oauthAccountOf(A), lateKey: 'kept' }));

    await accounts.switch({ email: B, confirmed: false });

    expect(JSON.parse(await readFile(claudeJsonPath, 'utf8'))).toEqual({
        oauthAccount: oauthAccountOf(B),
        lateKey: 'kept',
    });
});

test('running processes without confirmation ask for it, with no change, no network and no Keychain read', async () => {
    const fetchTokenOwner = mock<FetchTokenOwner>(fetchNoOwner);
    const context = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        fetchTokenOwner,
        countClaudeProcesses: () => Promise.resolve(18),
    });
    await addCopy(context.storeDir, A);
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf(A, 2);
    const before = await snapshot(context);

    const result = await context.accounts.switch({ email: B, confirmed: false });

    const expected: AccountsSwitchResult = { status: 'confirmation-required', runningClaudeProcesses: 18 };
    expect(result).toEqual(expected);
    expect(await snapshot(context)).toEqual(before);
    expect(context.keychain.reads).toBe(0);
    expect(fetchTokenOwner).not.toHaveBeenCalled();
});

test('running processes with confirmation switch', async () => {
    const { accounts, storeDir, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        countClaudeProcesses: () => Promise.resolve(18),
    });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A);

    const result = await accounts.switch({ email: B, confirmed: true });

    expect(result).toEqual({ status: 'switched', email: B });
    expect(keychain.value).toBe(credentialsOf(B));
});

test('tokens owned by another saved account go to its credentials only', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(B) } });
    const rawOauthAccountA = `{ "emailAddress":   "${A}",\n"organizationName": "Org" }\n`;
    const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1), rawOauthAccount: rawOauthAccountA });
    const dirB = await addCopy(storeDir, B, { credentials: credentialsOf(B, 1) });
    const rawOauthAccountB = await readFile(join(dirB, 'oauthAccount.json'), 'utf8');
    await addCopy(storeDir, C, { credentials: credentialsOf(C, 1) });
    keychain.value = credentialsOf(A, 2);

    const result = await accounts.switch({ email: C, confirmed: false });

    expect(result).toEqual({ status: 'switched', email: C });
    expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(await readFile(join(dirA, 'oauthAccount.json'), 'utf8')).toBe(rawOauthAccountA);
    expect(await readFile(join(dirB, 'credentials.json'), 'utf8')).toBe(credentialsOf(B, 1));
    expect(await readFile(join(dirB, 'oauthAccount.json'), 'utf8')).toBe(rawOauthAccountB);
    expect(keychain.value).toBe(credentialsOf(C, 1));
});

test('tokens owned by an account with no copy refuse the switch with no change', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, A);
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf('stranger@example.com');

    await expectNoChange(
        context,
        () => context.accounts.switch({ email: B, confirmed: false }),
        'stranger@example.com, which is not saved',
    );
});

test('an unanswered owner check refreshes the active copy and warns', async () => {
    const { accounts, storeDir, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        fetchTokenOwner: fetchNoOwner,
    });
    const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A, 2);

    const result = await accounts.switch({ email: B, confirmed: false });

    expect(result.status === 'switched' && result.email).toBe(B);
    expect(result.status === 'switched' ? result.warning : undefined).toContain(A);
    expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(keychain.value).toBe(credentialsOf(B));
});

test('target tokens are read after the refresh: Keychain tokens of the target beat its older copy', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
    const dirB = await addCopy(storeDir, B, { credentials: credentialsOf(B, 1) });
    keychain.value = credentialsOf(B, 2);

    await accounts.switch({ email: B, confirmed: false });

    expect(keychain.value).toBe(credentialsOf(B, 2));
    expect(await readFile(join(dirB, 'credentials.json'), 'utf8')).toBe(credentialsOf(B, 2));
    expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 1));
});

const UNUSABLE_KEYCHAIN: [string, KeychainReadResult][] = [
    ['no entry', { state: 'no-entry' }],
    ['an invalid value', { state: 'invalid' }],
];

for (const [name, keychainValue] of UNUSABLE_KEYCHAIN) {
    test(`a Keychain with ${name} keeps the old copy, warns and switches`, async () => {
        const { accounts, storeDir, claudeJsonPath, keychain } = await setup({
            claudeJson: { oauthAccount: oauthAccountOf(A) },
        });
        const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
        await addCopy(storeDir, B);
        keychain.set(keychainValue);

        const result = await accounts.switch({ email: B, confirmed: false });

        expect(result.status === 'switched' && result.email).toBe(B);
        expect(result.status === 'switched' ? result.warning : undefined).toContain(A);
        expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 1));
        expect(keychain.value).toBe(credentialsOf(B));
        expect(await readLiveOauthAccount(claudeJsonPath)).toEqual(oauthAccountOf(B));
    });
}

test('a Keychain read that fails stops the switch with no change', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, A);
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf(A);
    context.keychain.failReads = true;

    await expectNoChange(context, () => context.accounts.switch({ email: B, confirmed: false }), 'fake read failure');
});

const LOGGED_OUT_FILES: [string, Partial<SetupOptions>][] = [
    ['no oauthAccount', { claudeJson: { other: 1 } }],
    ['no ~/.claude.json', { claudeJson: null }],
];

for (const [name, options] of LOGGED_OUT_FILES) {
    test(`with ${name} the switch refreshes nothing and asks nobody`, async () => {
        const fetchTokenOwner = mock<FetchTokenOwner>(fetchNoOwner);
        const { accounts, storeDir, claudeJsonPath, keychain } = await setup({ ...options, fetchTokenOwner });
        const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
        await addCopy(storeDir, B);
        keychain.value = credentialsOf(A, 2);

        const result = await accounts.switch({ email: B, confirmed: false });

        expect(result).toEqual({ status: 'switched', email: B });
        expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 1));
        expect(keychain.value).toBe(credentialsOf(B));
        expect(fetchTokenOwner).not.toHaveBeenCalled();
        expect(await readLiveOauthAccount(claudeJsonPath)).toEqual(oauthAccountOf(B));
        expect(await modeOf(claudeJsonPath)).toBe(0o600);
    });
}

test('switching to the active account changes nothing, whatever the case of the email', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, A);
    context.keychain.value = credentialsOf(A, 2);
    const before = await snapshot(context);

    const result = await context.accounts.switch({ email: A.toUpperCase(), confirmed: false });

    const expected: AccountsSwitchResult = { status: 'already-active' };
    expect(result).toEqual(expected);
    expect(await snapshot(context)).toEqual(before);
});

test('switching to an account saved under another directory name works', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(storeDir, A, { dirName: 'sigma' });
    await addCopy(storeDir, B, { dirName: 'healed', credentials: credentialsOf(B, 5) });
    keychain.value = credentialsOf(A);

    const result = await accounts.switch({ email: B.toUpperCase(), confirmed: false });

    expect(result).toEqual({ status: 'switched', email: B });
    expect(keychain.value).toBe(credentialsOf(B, 5));
    expect((await readdir(storeDir)).toSorted()).toEqual(['.claude.json.bak', 'healed', 'sigma']);
});

test('switch refuses a target that is not on the list, even when the input names a real directory', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, A);
    await addCopy(join(context.storeDir, '..'), B, { dirName: 'outside' });
    await addCopy(context.storeDir, B, { dirName: '.old' });
    context.keychain.value = credentialsOf(A);

    for (const email of [B, '../outside', '.old', A.replace('a@', 'z@')]) {
        await expectNoChange(context, () => context.accounts.switch({ email, confirmed: true }), 'No saved account');
    }
});

const DAMAGED_COPIES: [string, string | null][] = [
    ['missing', null],
    ['truncated', `{"claudeAiOauth":{"refreshToken":"${MARKER}`],
    ['without a refresh token', JSON.stringify({ claudeAiOauth: { accessToken: MARKER } })],
];

for (const [name, credentials] of DAMAGED_COPIES) {
    test(`switch refuses a target whose credentials are ${name}, with no change`, async () => {
        const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
        await addCopy(context.storeDir, A);
        await addCopy(context.storeDir, B, { credentials });
        context.keychain.value = credentialsOf(A, 2);

        await expectNoChange(context, () => context.accounts.switch({ email: B, confirmed: true }), 'is damaged');
    });
}

test('switch refuses when the active account is not saved, with no change', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf(A);

    await expectNoChange(context, () => context.accounts.switch({ email: B, confirmed: true }), `${A} is not saved`);
});

const UNUSABLE_CLAUDE_JSON: [string, string][] = [
    ['not JSON', '{ "oauthAccount": { "emailAddress": "a@'],
    ['an empty file', ''],
    ['not an object', '[]'],
    ['a malformed oauthAccount', '{ "oauthAccount": { "organizationName": "Org" } }'],
];

for (const [name, claudeJsonRaw] of UNUSABLE_CLAUDE_JSON) {
    test(`switch refuses when ~/.claude.json is ${name}, and never overwrites it`, async () => {
        const context = await setup({ claudeJsonRaw });
        await addCopy(context.storeDir, A);
        await addCopy(context.storeDir, B);
        context.keychain.value = credentialsOf(A);

        await expectNoChange(context, () => context.accounts.switch({ email: B, confirmed: true }), 'cannot be parsed');
    });
}

test('a target copy damaged while the owner check runs is refused and the Keychain stays', async () => {
    const context = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        fetchTokenOwner: async () => {
            await writeFile(join(context.storeDir, B, 'credentials.json'), 'gone bad');
            return { state: 'confirmed', email: A };
        },
    });
    await addCopy(context.storeDir, A);
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf(A, 2);

    await expect(context.accounts.switch({ email: B, confirmed: false })).rejects.toThrow('is damaged');

    expect(context.keychain.value).toBe(credentialsOf(A, 2));
    expect(context.keychain.writes).toEqual([]);
});

test('a failed ~/.claude.json write restores the Keychain and leaves the file', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A), other: 1 } });
    const { accounts, storeDir, claudeJsonPath, keychain, homeDir } = context;
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A, 2);
    const rawBefore = await readFile(claudeJsonPath, 'utf8');
    // A file that is merely overwritten in place would still succeed here: only a rename fails.
    await chmod(homeDir, 0o500);

    await expect(accounts.switch({ email: B, confirmed: false })).rejects.toThrow(
        'previous Keychain tokens were restored',
    );

    expect(keychain.value).toBe(credentialsOf(A, 2));
    expect(keychain.writes).toEqual([credentialsOf(B), credentialsOf(A, 2)]);
    expect(await readFile(claudeJsonPath, 'utf8')).toBe(rawBefore);
});

test('a failed backup of ~/.claude.json restores the Keychain and leaves no temp file', async () => {
    const { accounts, storeDir, claudeJsonPath, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
    });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    await mkdir(join(storeDir, '.claude.json.bak'));
    keychain.value = credentialsOf(A, 2);

    await expect(accounts.switch({ email: B, confirmed: false })).rejects.toThrow(
        'previous Keychain tokens were restored',
    );

    expect(keychain.value).toBe(credentialsOf(A, 2));
    expect(await readLiveOauthAccount(claudeJsonPath)).toEqual(oauthAccountOf(A));
    expect((await readdir(storeDir)).toSorted()).toEqual(['.claude.json.bak', A, B]);
});

test('a failed ~/.claude.json write and a failed restore report both', async () => {
    const { accounts, storeDir, keychain, homeDir } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A, 2);
    keychain.onWrite = value => {
        if (value === credentialsOf(A, 2)) {
            throw new Error('fake restore failure');
        }
    };
    await chmod(homeDir, 0o500);

    const error = await accounts.switch({ email: B, confirmed: false }).catch((caught: unknown) => String(caught));

    expect(error).toContain('Could not update');
    expect(error).toContain('could not be restored (fake restore failure)');
});

test('a failed ~/.claude.json write with no previous Keychain value says there is nothing to restore', async () => {
    const { accounts, storeDir, keychain, homeDir } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.set({ state: 'no-entry' });
    await chmod(homeDir, 0o500);

    await expect(accounts.switch({ email: B, confirmed: false })).rejects.toThrow('nothing to restore');

    expect(keychain.writes).toEqual([credentialsOf(B)]);
});

test('a Keychain write that fails after changing the item is rolled back, and ~/.claude.json stays', async () => {
    const { accounts, storeDir, claudeJsonPath, keychain } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
    });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A, 2);
    keychain.onWrite = value => {
        if (value === credentialsOf(B)) {
            keychain.value = value;
            throw new Error('fake verification failure');
        }
    };
    const rawBefore = await readFile(claudeJsonPath, 'utf8');

    await expect(accounts.switch({ email: B, confirmed: false })).rejects.toThrow(
        'previous Keychain tokens were restored',
    );

    expect(keychain.value).toBe(credentialsOf(A, 2));
    expect(await readFile(claudeJsonPath, 'utf8')).toBe(rawBefore);
});

test('concurrent switches run one after the other', async () => {
    const started: string[] = [];
    let release = () => {};
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const { accounts, storeDir, keychain, claudeJsonPath } = await setup({
        claudeJson: { oauthAccount: oauthAccountOf(A) },
        fetchTokenOwner: async accessToken => {
            started.push(accessToken);
            await gate;
            return { state: 'unconfirmed' };
        },
    });
    const dirA = await addCopy(storeDir, A, { credentials: credentialsOf(A, 1) });
    const dirB = await addCopy(storeDir, B, { credentials: credentialsOf(B, 1) });
    await addCopy(storeDir, C, { credentials: credentialsOf(C, 1) });
    keychain.value = credentialsOf(A, 2);

    const first = accounts.switch({ email: B, confirmed: false });
    const second = accounts.switch({ email: C, confirmed: false });
    await waitUntil(() => started.length > 0);
    await Bun.sleep(20);
    expect(started).toEqual([accessTokenOf(A, 2)]);

    release();
    await Promise.all([first, second]);

    // The second switch saw the outcome of the first: B was active and got its Keychain tokens back.
    expect(started).toEqual([accessTokenOf(A, 2), accessTokenOf(B, 1)]);
    expect(await readFile(join(dirA, 'credentials.json'), 'utf8')).toBe(credentialsOf(A, 2));
    expect(await readFile(join(dirB, 'credentials.json'), 'utf8')).toBe(credentialsOf(B, 1));
    expect(keychain.value).toBe(credentialsOf(C, 1));
    expect(await readLiveOauthAccount(claudeJsonPath)).toEqual(oauthAccountOf(C));
});

test('a failed operation does not block the next', async () => {
    const { accounts, storeDir, keychain } = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    await addCopy(storeDir, A);
    await addCopy(storeDir, B);
    keychain.value = credentialsOf(A);

    const failed = accounts.switch({ email: 'nobody@example.com', confirmed: false });
    const next = accounts.save();

    await expect(failed).rejects.toThrow('No saved account');
    expect(await next).toEqual({ email: A });
});

test('status lists non-hidden accounts in directory order, the first duplicate winning, and never reads the Keychain', async () => {
    const context = await setup({ claudeJson: { oauthAccount: { ...oauthAccountOf(B), organizationName: null } } });
    const { accounts, storeDir, keychain } = context;
    await addCopy(storeDir, 'zed@example.com', { dirName: 'a-dir' });
    await addCopy(storeDir, B, { dirName: 'b-dir', organization: null });
    await addCopy(storeDir, B.toUpperCase(), { dirName: 'c-dir', organization: 'Loser' });
    await addCopy(storeDir, A, { dirName: 'd-dir', credentials: null });
    await addCopy(storeDir, C, { dirName: 'e-dir', credentials: 'not json' });
    await addCopy(storeDir, 'hidden@example.com', { dirName: '.old' });
    await mkdir(join(storeDir, 'no-account-file'));
    await writeFile(join(storeDir, 'a-file'), '');

    const expected: AccountsStatus = {
        state: 'ready',
        current: { email: B, organization: null, saved: true },
        accounts: [
            { email: 'zed@example.com', organization: 'Org', active: false, damaged: false },
            { email: B, organization: null, active: true, damaged: false },
            { email: A, organization: 'Org', active: false, damaged: true },
            { email: C, organization: 'Org', active: false, damaged: true },
        ],
        runningClaudeProcesses: 3,
    };
    context.processCount = 3;
    expect(await accounts.status()).toEqual(expected);
    expect(keychain.reads).toBe(0);
});

test('status skips a directory with an invalid oauthAccount.json, logging only its name', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) } });
    const { accounts, storeDir, logs } = context;
    const invalid = JSON.stringify({ organizationName: `${MARKER}-secret-in-file` });
    await addCopy(storeDir, 'x@example.com', { dirName: 'broken', rawOauthAccount: invalid });

    const status = await accounts.status();

    expect(status.accounts).toEqual([]);
    expect(status.current).toEqual({ email: A, organization: 'Org', saved: false });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('broken');
    expect(logs[0]).not.toContain(MARKER);
});

test('status reports nobody logged in, with an empty list, when the store does not exist', async () => {
    const { accounts } = await setup({ claudeJson: null });

    const expected: AccountsStatus = { state: 'ready', current: null, accounts: [], runningClaudeProcesses: 0 };
    expect(await accounts.status()).toEqual(expected);
});

test('status is unavailable when ~/.claude.json cannot be parsed', async () => {
    const { accounts } = await setup({ claudeJsonRaw: `{ "secret": "${MARKER}` });

    const status = await accounts.status();

    expect(status.state).toBe('unavailable');
    expect(status.reason).toContain('cannot be parsed');
    expect(status.reason).not.toContain(MARKER);
});

test('off macOS status is unavailable and the actions refuse, touching nothing', async () => {
    const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) }, platform: 'linux' });
    await addCopy(context.storeDir, A);
    await addCopy(context.storeDir, B);
    context.keychain.value = credentialsOf(A);

    const status = await context.accounts.status();

    expect(status.state).toBe('unavailable');
    expect(status.reason).toContain('macOS');
    await expectNoChange(context, () => context.accounts.save(), 'macOS');
    await expectNoChange(context, () => context.accounts.switch({ email: B, confirmed: true }), 'macOS');
    expect(context.keychain.reads).toBe(0);
});

test('no result, error or log line carries a token', async () => {
    const outcomes: string[] = [];

    async function scenario(
        options: Partial<SetupOptions>,
        run: (context: TestContext) => Promise<unknown>,
    ): Promise<void> {
        const context = await setup({ claudeJson: { oauthAccount: oauthAccountOf(A) }, ...options });
        await addCopy(context.storeDir, A, { dirName: 'copy-a' });
        await addCopy(context.storeDir, B, { dirName: 'copy-b' });
        await addCopy(context.storeDir, C, {
            dirName: 'copy-damaged',
            credentials: `{"claudeAiOauth":{"refreshToken":"${MARKER}`,
        });
        await addCopy(context.storeDir, 'x@example.com', {
            dirName: 'copy-broken',
            rawOauthAccount: `{"oops":"${MARKER}"`,
        });
        context.keychain.value = credentialsOf(A, 2);

        try {
            outcomes.push(JSON.stringify(await run(context)));
        } catch (error) {
            outcomes.push(describeThrown(error));
        }
        outcomes.push(...context.logs);
    }

    await scenario({}, ({ accounts }) => accounts.status());
    await scenario({}, ({ accounts }) => accounts.save());
    await scenario({ fetchTokenOwner: fetchNoOwner }, ({ accounts }) => accounts.save());
    await scenario({}, ({ accounts }) => accounts.switch({ email: B, confirmed: false }));
    await scenario({ fetchTokenOwner: fetchNoOwner }, ({ accounts }) =>
        accounts.switch({ email: B, confirmed: false }),
    );
    await scenario({}, ({ accounts }) => accounts.switch({ email: C, confirmed: false }));
    await scenario({}, ({ accounts }) => accounts.switch({ email: 'nobody@example.com', confirmed: false }));
    await scenario({ countClaudeProcesses: () => Promise.resolve(2) }, ({ accounts }) =>
        accounts.switch({ email: B, confirmed: false }),
    );
    await scenario({ claudeJsonRaw: `{ "leak": "${MARKER}` }, ({ accounts }) => accounts.save());
    await scenario({ claudeJsonRaw: `{ "leak": "${MARKER}` }, ({ accounts }) => accounts.status());
    await scenario({}, async ({ accounts, keychain }) => {
        keychain.value = credentialsOf('stranger@example.com');
        return accounts.save();
    });
    await scenario({}, async ({ accounts, keychain }) => {
        keychain.value = credentialsOf('stranger@example.com');
        return accounts.switch({ email: B, confirmed: false });
    });
    await scenario({}, async ({ accounts, homeDir }) => {
        await chmod(homeDir, 0o500);
        return accounts.switch({ email: B, confirmed: false });
    });
    await scenario({}, async ({ accounts, keychain, homeDir }) => {
        keychain.onWrite = () => {
            throw new Error('fake write failure');
        };
        await chmod(homeDir, 0o500);
        return accounts.switch({ email: B, confirmed: false });
    });
    await scenario({}, async ({ accounts, storeDir }) => {
        await writeFile(join(storeDir, 'copy-b', 'credentials.json'), `{"truncated":"${MARKER}`);
        return accounts.switch({ email: B, confirmed: false });
    });

    expect(outcomes.join('\n')).not.toContain(MARKER);
    expect(outcomes.join('\n')).toContain('is damaged');
    expect(outcomes.join('\n')).toContain('could not be restored');
    expect(outcomes.join('\n')).toContain('"status":"switched"');
    expect(outcomes.join('\n')).toContain('copy-broken');
});

interface SetupOptions {
    /** Written as `~/.claude.json`; null leaves the file out. */
    claudeJson?: Record<string, unknown> | null;
    /** Wins over `claudeJson`. */
    claudeJsonRaw?: string;
    fetchTokenOwner?: FetchTokenOwner;
    countClaudeProcesses?: () => Promise<number>;
    platform?: NodeJS.Platform;
}

interface TestContext {
    accounts: Accounts;
    keychain: FakeKeychain;
    root: string;
    homeDir: string;
    storeDir: string;
    claudeJsonPath: string;
    logs: string[];
    processCount: number;
}

interface FakeKeychain extends Keychain {
    /** The stored item, null when `read` reports a non-found state. */
    value: string | null;
    reads: number;
    writes: string[];
    failReads: boolean;
    /** Runs on every write, before it lands. */
    onWrite?: (value: string) => Promise<unknown> | void;
    set(value: KeychainReadResult | string): void;
}

interface AddCopyOptions {
    dirName?: string;
    /** Null leaves `credentials.json` out. */
    credentials?: string | null;
    organization?: string | null;
    extra?: Record<string, unknown>;
    rawOauthAccount?: string;
}

/** Everything lives under a fresh temp directory: no test can reach the real home. */
async function setup(options: SetupOptions = {}): Promise<TestContext> {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'claude-accounts-')));
    roots.push(root);
    const homeDir = join(root, 'home');
    const storeDir = join(root, 'store');
    const claudeJsonPath = join(homeDir, '.claude.json');
    await mkdir(homeDir, { recursive: true });

    if (options.claudeJsonRaw !== undefined) {
        await writeFile(claudeJsonPath, options.claudeJsonRaw);
    } else if (options.claudeJson != null) {
        await writeFile(claudeJsonPath, JSON.stringify(options.claudeJson));
    }

    const keychain = createFakeKeychain();
    const logs: string[] = [];
    const context: TestContext = {
        keychain,
        root,
        homeDir,
        storeDir,
        claudeJsonPath,
        logs,
        processCount: 0,
        accounts: createAccounts(createOptions()),
    };
    return context;

    function createOptions(): CreateAccountsOptions {
        return {
            keychain,
            claudeJsonPath,
            storeDir,
            fetchTokenOwner: options.fetchTokenOwner ?? fetchOwnerFromToken,
            countClaudeProcesses: options.countClaudeProcesses ?? (() => Promise.resolve(context.processCount)),
            log: message => logs.push(message),
            platform: options.platform ?? 'darwin',
        };
    }
}

function createFakeKeychain(): FakeKeychain {
    let readResult: KeychainReadResult = { state: 'no-entry' };

    const keychain: FakeKeychain = {
        reads: 0,
        writes: [],
        failReads: false,
        get value() {
            return readResult.state === 'found' ? readResult.credentials : null;
        },
        set value(value: string | null) {
            readResult = value === null ? { state: 'no-entry' } : { state: 'found', credentials: value };
        },
        set(value) {
            readResult = typeof value === 'string' ? { state: 'found', credentials: value } : value;
        },
        read() {
            keychain.reads++;
            return keychain.failReads ? Promise.reject(new Error('fake read failure')) : Promise.resolve(readResult);
        },
        async write(value) {
            keychain.writes.push(value);
            await keychain.onWrite?.(value);
            readResult = { state: 'found', credentials: value };
        },
    };

    return keychain;
}

/** A fake profile endpoint: `credentialsOf` puts the owner into the token. */
const fetchOwnerFromToken: FetchTokenOwner = accessToken => {
    const email = /-access-(.+)-\d+$/.exec(accessToken)?.[1];
    return Promise.resolve(email === undefined ? { state: 'unconfirmed' } : { state: 'confirmed', email });
};

function fetchNoOwner(): Promise<TokenOwnerResult> {
    return Promise.resolve({ state: 'unconfirmed' });
}

function accessTokenOf(email: string, revision = 1): string {
    return `${MARKER}-access-${email}-${revision}`;
}

function credentialsOf(email: string, revision = 1): string {
    return JSON.stringify({
        claudeAiOauth: {
            accessToken: accessTokenOf(email, revision),
            refreshToken: `${MARKER}-refresh-${email}-${revision}`,
        },
        mcpOAuth: { server: { token: `${MARKER}-mcp` } },
    });
}

function oauthAccountOf(email: string): Record<string, unknown> {
    return { emailAddress: email, organizationName: 'Org' };
}

async function addCopy(storeDir: string, email: string, options: AddCopyOptions = {}): Promise<string> {
    const dir = join(storeDir, options.dirName ?? email);
    await mkdir(dir, { recursive: true });

    const credentials = options.credentials === undefined ? credentialsOf(email) : options.credentials;
    if (credentials !== null) {
        await writeFile(join(dir, 'credentials.json'), credentials);
    }

    const oauthAccount = {
        emailAddress: email,
        organizationName: options.organization === undefined ? 'Org' : options.organization,
        ...options.extra,
    };
    await writeFile(join(dir, 'oauthAccount.json'), options.rawOauthAccount ?? JSON.stringify(oauthAccount));
    return dir;
}

async function readLiveOauthAccount(claudeJsonPath: string): Promise<unknown> {
    const document: unknown = JSON.parse(await readFile(claudeJsonPath, 'utf8'));
    return z.object({ oauthAccount: z.unknown() }).parse(document).oauthAccount;
}

async function modeOf(path: string): Promise<number> {
    return (await stat(path)).mode & 0o777;
}

async function expectNoChange(context: TestContext, operation: () => Promise<unknown>, message: string): Promise<void> {
    const before = await snapshot(context);
    const writesBefore = context.keychain.writes.length;

    await expect(operation()).rejects.toThrow(message);

    expect(await snapshot(context)).toEqual(before);
    expect(context.keychain.writes).toHaveLength(writesBefore);
}

/** Every file and directory under the temp root with its mode and bytes, plus the Keychain value. */
async function snapshot(context: TestContext): Promise<Record<string, string>> {
    const entries: Record<string, string> = { keychain: String(context.keychain.value) };
    await walk(context.root);
    return entries;

    async function walk(dir: string): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            const mode = await modeOf(path);
            const key = relative(context.root, path);
            if (entry.isDirectory()) {
                entries[key] = `dir ${mode}`;
                await walk(path);
            } else {
                entries[key] = `file ${mode} ${await readFile(path, 'utf8')}`;
            }
        }
    }
}

async function waitUntil(condition: () => boolean): Promise<void> {
    while (!condition()) {
        await Bun.sleep(1);
    }
}

function describeThrown(error: unknown): string {
    return error instanceof Error ? `${error.message}\n${error.stack}\n${String(error.cause)}` : String(error);
}
