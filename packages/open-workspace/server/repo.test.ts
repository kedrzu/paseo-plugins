import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execCommand } from '@getpaseo/plugin/server';
import { afterEach, expect, test } from 'bun:test';

import type { Repo } from './repo';
import { createRepo } from './repo';
import { repoGithubUrlRpc, repoOpenInFinderRpc, repoOpenInForkRpc, repoOpenInVscodeRpc } from '../shared/repo';

/** What the fake `gh pr view` does: print a pull request, or fail as it does with none. */
type GhResult = { url: string; state: string } | 'fail';

const directories: string[] = [];

afterEach(async () => {
    for (const directory of directories.splice(0)) {
        await rm(directory, { recursive: true, force: true });
    }
});

test('the RPC contracts load: defineRpc rejects a name the daemon would refuse', () => {
    expect([repoOpenInFinderRpc.name, repoOpenInForkRpc.name, repoOpenInVscodeRpc.name, repoGithubUrlRpc.name]).toEqual(
        ['repo.open-in-finder', 'repo.open-in-fork', 'repo.open-in-vscode', 'repo.github-url'],
    );
});

test('an open pull request wins over the branch', async () => {
    const directory = await createRepository({ branch: 'feat/x', remoteUrl: 'git@github.com:acme/app.git' });
    const repo = createTestRepo({ url: 'https://github.com/acme/app/pull/7', state: 'OPEN' });

    expect(await repo.githubUrl(directory)).toBe('https://github.com/acme/app/pull/7');
});

test('a merged pull request falls back to the code on the upstream branch', async () => {
    const directory = await createRepository({
        branch: 'feat/x',
        remoteUrl: 'https://github.com/acme/app.git',
        remote: 'upstream',
        upstreamBranch: 'feat/#1-x',
    });
    const repo = createTestRepo({ url: 'https://github.com/acme/app/pull/7', state: 'MERGED' });

    expect(await repo.githubUrl(directory)).toBe('https://github.com/acme/app/tree/feat/%231-x');
});

test('without gh, a branch with no upstream uses its own name on origin', async () => {
    const directory = await createRepository({ branch: 'main', remoteUrl: 'ssh://git@github.com/acme/app' });
    await git(directory, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const repo = createTestRepo('fail');

    expect(await repo.githubUrl(directory)).toBe('https://github.com/acme/app/tree/main');
});

test('a branch that is not pushed is an error', async () => {
    const directory = await createRepository({ branch: 'local', remoteUrl: 'git@github.com:acme/app.git' });
    const repo = createTestRepo('fail');

    await expect(repo.githubUrl(directory)).rejects.toThrow('Branch local is not on origin yet');
});

test('a detached HEAD opens the commit', async () => {
    const directory = await createRepository({ branch: 'main', remoteUrl: 'git@github.com:acme/app.git' });
    await git(directory, 'checkout', '-q', '--detach');
    const sha = (await git(directory, 'rev-parse', 'HEAD')).trim();
    const repo = createTestRepo('fail');

    expect(await repo.githubUrl(directory)).toBe(`https://github.com/acme/app/tree/${sha}`);
});

test('a remote outside GitHub is an error', async () => {
    const directory = await createRepository({ branch: 'main', remoteUrl: 'git@gitlab.com:acme/app.git' });
    await git(directory, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const repo = createTestRepo('fail');

    await expect(repo.githubUrl(directory)).rejects.toThrow('The origin remote is not on GitHub');
});

test('a directory outside git is an error', async () => {
    const directory = await createDirectory();
    const repo = createTestRepo('fail');

    await expect(repo.githubUrl(directory)).rejects.toThrow('not a git repository');
});

test('opens the directory in Finder, Fork and VS Code', async () => {
    const directory = await createDirectory();
    const opened: string[][] = [];
    const repo = createRepo({
        platform: 'darwin',
        exec: (command, args, options) => {
            if (command === 'open') {
                opened.push(args);
                return Promise.resolve({ stdout: '', stderr: '' });
            }
            return execCommand(command, args, options);
        },
    });

    await repo.openInFinder(directory);
    await repo.openInFork(directory);
    await repo.openInVscode(directory);

    expect(opened).toEqual([
        ['-a', 'Finder', directory],
        ['-b', 'com.DanPristupov.Fork', directory],
        ['-b', 'com.microsoft.VSCode', directory],
    ]);
});

test('refuses a path that is not a directory, and other platforms', async () => {
    const directory = await createDirectory();

    await expect(createTestRepo('fail').openInFinder(join(directory, 'missing'))).rejects.toThrow('is not a directory');
    await expect(createRepo({ exec: execCommand, platform: 'linux' }).openInFork(directory)).rejects.toThrow(
        'macOS only',
    );
});

interface CreateRepositoryParams {
    branch: string;
    remoteUrl: string;
    /** Set with `upstreamBranch` to give the branch an upstream that already has it. */
    remote?: string;
    upstreamBranch?: string;
}

async function createRepository({
    branch,
    remoteUrl,
    remote,
    upstreamBranch,
}: CreateRepositoryParams): Promise<string> {
    const directory = await createDirectory();
    await git(directory, 'init', '-q', '-b', branch);
    await git(directory, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    await git(directory, 'remote', 'add', remote ?? 'origin', remoteUrl);
    if (remote !== undefined && upstreamBranch !== undefined) {
        await git(directory, 'update-ref', `refs/remotes/${remote}/${upstreamBranch}`, 'HEAD');
        await git(directory, 'config', `branch.${branch}.remote`, remote);
        await git(directory, 'config', `branch.${branch}.merge`, `refs/heads/${upstreamBranch}`);
    }
    return directory;
}

async function createDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'open-workspace-'));
    directories.push(directory);
    return directory;
}

/** Real git, a fake `gh`. */
function createTestRepo(gh: GhResult): Repo {
    return createRepo({
        platform: 'darwin',
        exec: (command, args, options) => {
            if (command !== 'gh') {
                return execCommand(command, args, options);
            }
            if (gh === 'fail') {
                return Promise.reject(new Error('no pull requests found'));
            }
            return Promise.resolve({ stdout: JSON.stringify(gh), stderr: '' });
        },
    });
}

async function git(directory: string, ...args: string[]): Promise<string> {
    const { stdout } = await execCommand('git', args, { cwd: directory });
    return stdout;
}
