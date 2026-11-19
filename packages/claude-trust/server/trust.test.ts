import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { Trust } from './trust';
import { createTrust } from './trust';

const roots: string[] = [];

afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test('trust marks a new folder and keeps the rest of the config', async () => {
    const { trust, readConfig } = await setup({ projects: { '/a': { allowedTools: ['Bash'] } }, theme: 'dark' });

    expect(await trust.trust(['/a', '/b'])).toEqual(['/a', '/b']);

    expect(await readConfig()).toEqual({
        theme: 'dark',
        projects: {
            '/a': { allowedTools: ['Bash'], hasTrustDialogAccepted: true },
            '/b': { hasTrustDialogAccepted: true },
        },
    });
});

test('trust leaves the file untouched when every folder is trusted', async () => {
    const { trust, claudeJsonPath } = await setup({ projects: { '/a': { hasTrustDialogAccepted: true } } });
    const before = await stat(claudeJsonPath);

    expect(await trust.trust(['/a'])).toEqual([]);

    expect((await stat(claudeJsonPath)).mtimeMs).toBe(before.mtimeMs);
});

test('trust keeps the file mode and leaves no temp file', async () => {
    const { trust, claudeJsonPath, root } = await setup({});
    await chmod(claudeJsonPath, 0o600);

    await trust.trust(['/a']);

    expect((await stat(claudeJsonPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(root)).toEqual(['.claude.json']);
});

test('trust does nothing when Claude Code has no config yet', async () => {
    const { trust, claudeJsonPath, logs } = await setup({});
    await rm(claudeJsonPath);

    expect(await trust.trust(['/a'])).toEqual([]);
    expect(logs).toHaveLength(1);
});

test('trustExistingWorktrees trusts only directories that are git worktrees', async () => {
    const { trust, worktreesDir, readConfig } = await setup({});
    await addWorktree(worktreesDir, 'p1', 'one');
    await addWorktree(worktreesDir, 'p2', 'two');
    await mkdir(join(worktreesDir, 'p2', 'not-a-worktree'), { recursive: true });

    const added = await trust.trustExistingWorktrees();

    const expected = [join(worktreesDir, 'p1', 'one'), join(worktreesDir, 'p2', 'two')];
    expect(added.toSorted()).toEqual(expected);
    expect(Object.keys((await readConfig()).projects as object).toSorted()).toEqual(expected);
});

test('trustExistingWorktrees copes with no worktrees directory', async () => {
    const { trust, worktreesDir } = await setup({});
    await rm(worktreesDir, { recursive: true });

    expect(await trust.trustExistingWorktrees()).toEqual([]);
});

interface Setup {
    trust: Trust;
    root: string;
    claudeJsonPath: string;
    worktreesDir: string;
    logs: string[];
    readConfig: () => Promise<Record<string, unknown>>;
}

async function setup(config: Record<string, unknown>): Promise<Setup> {
    const base = await mkdtemp(join(tmpdir(), 'claude-trust-'));
    roots.push(base);
    const root = join(base, 'home');
    const worktreesDir = join(base, 'worktrees');
    await mkdir(root);
    await mkdir(worktreesDir);
    const claudeJsonPath = join(root, '.claude.json');
    await writeFile(claudeJsonPath, JSON.stringify(config));

    const logs: string[] = [];
    const trust = createTrust({ claudeJsonPath, worktreesDir, log: message => logs.push(message) });

    return {
        trust,
        root,
        claudeJsonPath,
        worktreesDir,
        logs,
        readConfig: async () => JSON.parse(await readFile(claudeJsonPath, 'utf8')) as Record<string, unknown>,
    };
}

async function addWorktree(worktreesDir: string, project: string, slug: string): Promise<void> {
    const path = join(worktreesDir, project, slug);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, '.git'), 'gitdir: /somewhere\n');
}
