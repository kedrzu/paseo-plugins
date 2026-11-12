import { stat } from 'node:fs/promises';

import type { execCommand } from '@getpaseo/plugin/server';
import { z } from 'zod';

/** Fork's bundle ID: `open -b` finds the app wherever it is installed. */
const FORK_BUNDLE_ID = 'com.DanPristupov.Fork';
/** VS Code's bundle ID. */
const VSCODE_BUNDLE_ID = 'com.microsoft.VSCode';
const DEFAULT_REMOTE = 'origin';

/** `git@github.com:o/r.git`, `ssh://git@github.com/o/r.git`, `https://[user@]github.com/o/r[.git]`. */
const GITHUB_REMOTE = /^(?:(?:https?|ssh):\/\/)?(?:[^@/]+@)?github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

const pullRequestSchema = z.object({ url: z.string(), state: z.string() });

export interface CreateRepoParams {
    exec: typeof execCommand;
    platform: NodeJS.Platform;
}

export interface Repo {
    openInFinder: (directory: string) => Promise<void>;
    openInFork: (directory: string) => Promise<void>;
    openInVscode: (directory: string) => Promise<void>;
    /** The open pull request for the checked-out branch, else the branch's code on GitHub. */
    githubUrl: (directory: string) => Promise<string>;
}

/** Opening a workspace repository in the apps of the daemon host, and finding it on GitHub. */
export function createRepo({ exec, platform }: CreateRepoParams): Repo {
    return { openInFinder, openInFork, openInVscode, githubUrl };

    async function openInFinder(directory: string): Promise<void> {
        await assertDirectory(directory, 'Finder');
        // `-a Finder`: a bare `open` would launch an `.app` directory instead of showing it.
        await exec('open', ['-a', 'Finder', directory]);
    }

    async function openInFork(directory: string): Promise<void> {
        await openInApp(directory, 'Fork', FORK_BUNDLE_ID);
    }

    async function openInVscode(directory: string): Promise<void> {
        await openInApp(directory, 'VS Code', VSCODE_BUNDLE_ID);
    }

    async function githubUrl(directory: string): Promise<string> {
        if ((await tryGit(directory, ['rev-parse', '--is-inside-work-tree'])) === null) {
            throw new Error('This workspace is not a git repository.');
        }
        return (await findOpenPullRequestUrl(directory)) ?? (await findBranchUrl(directory));
    }

    async function openInApp(directory: string, app: string, bundleId: string): Promise<void> {
        await assertDirectory(directory, app);
        try {
            await exec('open', ['-b', bundleId, directory]);
        } catch (error) {
            throw new Error(`Could not open the repository in ${app}. Is ${app} installed?`, { cause: error });
        }
    }

    async function assertDirectory(directory: string, app: string): Promise<void> {
        if (platform !== 'darwin') {
            throw new Error(`Opening the repository in ${app} works on macOS only.`);
        }
        const isDirectory = await stat(directory).then(
            stats => stats.isDirectory(),
            () => false,
        );
        if (!isDirectory) {
            throw new Error(`${directory} is not a directory.`);
        }
    }

    /** Null when there is none, or when `gh` is missing or not logged in: the branch page still works. */
    async function findOpenPullRequestUrl(directory: string): Promise<string | null> {
        let stdout: string;
        try {
            ({ stdout } = await exec('gh', ['pr', 'view', '--json', 'url,state'], { cwd: directory }));
        } catch {
            return null;
        }
        let json: unknown;
        try {
            json = JSON.parse(stdout);
        } catch {
            return null;
        }
        const pullRequest = pullRequestSchema.safeParse(json);
        // `gh pr view` also finds the branch's merged or closed pull request.
        return pullRequest.success && pullRequest.data.state === 'OPEN' ? pullRequest.data.url : null;
    }

    async function findBranchUrl(directory: string): Promise<string> {
        const branch = await tryGit(directory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
        let remote = DEFAULT_REMOTE;
        let ref: string;
        if (branch === null) {
            // Detached HEAD: the commit, which GitHub shows if it was pushed anywhere.
            ref = await git(directory, ['rev-parse', 'HEAD']);
        } else {
            const upstreamRemote = await tryGit(directory, ['config', '--get', `branch.${branch}.remote`]);
            // `.` is the local repository, for a branch tracking another local branch.
            if (upstreamRemote !== null && upstreamRemote !== '.') {
                remote = upstreamRemote;
            }
            const merge = await tryGit(directory, ['config', '--get', `branch.${branch}.merge`]);
            ref = merge?.replace(/^refs\/heads\//, '') ?? branch;
            const pushed = await tryGit(directory, [
                'rev-parse',
                '--verify',
                '--quiet',
                `refs/remotes/${remote}/${ref}`,
            ]);
            if (pushed === null) {
                throw new Error(`Branch ${branch} is not on ${remote} yet. Push it first.`);
            }
        }

        const remoteUrl = await tryGit(directory, ['remote', 'get-url', remote]);
        if (remoteUrl === null) {
            throw new Error(`This repository has no ${remote} remote.`);
        }
        const match = GITHUB_REMOTE.exec(remoteUrl);
        if (match === null) {
            throw new Error(`The ${remote} remote is not on GitHub: ${remoteUrl}`);
        }
        const [, owner, name] = match;
        const path = ref.split('/').map(encodeURIComponent).join('/');
        return `https://github.com/${owner}/${name}/tree/${path}`;
    }

    async function git(directory: string, args: string[]): Promise<string> {
        const { stdout } = await exec('git', args, { cwd: directory });
        return stdout.trim();
    }

    /** Null when git fails, which for these queries means "not set" or "not found". */
    async function tryGit(directory: string, args: string[]): Promise<string | null> {
        try {
            return await git(directory, args);
        } catch {
            return null;
        }
    }
}
