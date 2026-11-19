import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What {@link createTrust} reads and writes. */
export interface CreateTrustOptions {
    /** Claude Code's global config, `~/.claude.json`, where it records which folders are trusted. */
    claudeJsonPath: string;
    /** Where Paseo cuts its worktrees: `<worktreesDir>/<project>/<slug>`. */
    worktreesDir: string;
    log: (message: string) => void;
}

/** Records Paseo worktrees as trusted in Claude Code. */
export interface Trust {
    /** Trusts the given folders; returns the ones that were not trusted before. */
    trust(paths: readonly string[]): Promise<string[]>;
    /** Trusts every worktree already under the worktrees directory. */
    trustExistingWorktrees(): Promise<string[]>;
}

/**
 * Claude Code asks whether to trust each folder it starts in, and looks for an earlier answer only up
 * to the folder's git root. Every Paseo worktree is its own git root, so trusting
 * `~/.paseo/worktrees` covers none of them: each needs `projects[<path>].hasTrustDialogAccepted`.
 */
export function createTrust(options: CreateTrustOptions): Trust {
    const { claudeJsonPath, worktreesDir, log } = options;

    return { trust, trustExistingWorktrees };

    async function trust(paths: readonly string[]): Promise<string[]> {
        const config = await readConfig();
        if (config === null) {
            log(`${claudeJsonPath} not found: Claude Code has not run yet, nothing to trust`);
            return [];
        }

        const projects = readProjects(config);
        const added = paths.filter(path => !isTrusted(projects[path]));
        if (added.length === 0) {
            return [];
        }

        const nextProjects = { ...projects };
        for (const path of added) {
            nextProjects[path] = { ...asRecord(projects[path]), hasTrustDialogAccepted: true };
        }

        await writeConfig({ ...config, projects: nextProjects });
        return added;
    }

    async function trustExistingWorktrees(): Promise<string[]> {
        return trust(await listWorktrees());
    }

    async function listWorktrees(): Promise<string[]> {
        const worktrees: string[] = [];
        for (const project of await listDirectories(worktreesDir)) {
            for (const slug of await listDirectories(join(worktreesDir, project))) {
                const path = join(worktreesDir, project, slug);
                // A worktree has a `.git` file; anything else here is not one.
                if (await exists(join(path, '.git'))) {
                    worktrees.push(path);
                }
            }
        }
        return worktrees;
    }

    async function readConfig(): Promise<Record<string, unknown> | null> {
        let text: string;
        try {
            text = await readFile(claudeJsonPath, 'utf8');
        } catch (error) {
            if (isFileNotFound(error)) {
                return null;
            }
            throw error;
        }

        const config: unknown = JSON.parse(text);
        if (!isRecord(config)) {
            throw new Error(`${claudeJsonPath} is not a JSON object`);
        }
        return config;
    }

    /**
     * Claude Code rewrites this file whole on every change, so a temp file and a rename keep it from
     * ever reading half of ours. Its mode is kept: the file holds the OAuth account.
     */
    async function writeConfig(config: Record<string, unknown>): Promise<void> {
        const { mode } = await stat(claudeJsonPath);
        const tempPath = `${claudeJsonPath}.tmp-${randomUUID()}`;

        try {
            await writeFile(tempPath, JSON.stringify(config, null, 2), { mode, flag: 'wx' });
            await rename(tempPath, claudeJsonPath);
        } catch (error) {
            await rm(tempPath, { force: true });
            throw error;
        }
    }
}

async function listDirectories(path: string): Promise<string[]> {
    try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
        if (isFileNotFound(error)) {
            return [];
        }
        throw error;
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if (isFileNotFound(error)) {
            return false;
        }
        throw error;
    }
}

function readProjects(config: Record<string, unknown>): Record<string, unknown> {
    return asRecord(config.projects);
}

function isTrusted(project: unknown): boolean {
    return isRecord(project) && project.hasTrustDialogAccepted === true;
}

function asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
