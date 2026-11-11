import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { execCommand } from '@getpaseo/plugin/server';

/** Pen's bundle ID: `open -b` finds the app wherever it is installed. */
const PEN_BUNDLE_ID = 'dev.pencil.desktop';
const PEN_EXTENSION = '.pen';
/** Skipped by the walk outside git, where no `.gitignore` says what is vendored. */
const SKIPPED_DIRECTORY = 'node_modules';

export interface CreateDesignsParams {
    exec: typeof execCommand;
    platform: NodeJS.Platform;
}

export interface Designs {
    list: (directory: string) => Promise<string[]>;
    /** Opens only a path `list` returns, so a client cannot make the daemon open anything else. */
    open: (directory: string, path: string) => Promise<void>;
}

/** Finding `.pen` files in a workspace and handing one to Pen. */
export function createDesigns({ exec, platform }: CreateDesignsParams): Designs {
    return { list, open };

    async function list(directory: string): Promise<string[]> {
        const files = (await listWithGit(directory)) ?? (await listByWalking(directory));
        return files.toSorted((a, b) => a.localeCompare(b));
    }

    async function open(directory: string, path: string): Promise<void> {
        if (platform !== 'darwin') {
            throw new Error('Opening designs in Pen works on macOS only.');
        }
        const files = await list(directory);
        if (!files.includes(path)) {
            throw new Error(`${path} is not a design in this workspace.`);
        }
        try {
            await exec('open', ['-b', PEN_BUNDLE_ID, join(directory, path)]);
        } catch (error) {
            throw new Error(`Could not open ${path} in Pen. Is Pen installed?`, { cause: error });
        }
    }

    /**
     * Tracked and untracked files that `.gitignore` does not exclude. Null when git cannot answer,
     * which is mostly a directory outside a repository.
     */
    async function listWithGit(directory: string): Promise<string[] | null> {
        let stdout: string;
        try {
            ({ stdout } = await exec(
                'git',
                ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', `*${PEN_EXTENSION}`],
                { cwd: directory },
            ));
        } catch {
            return null;
        }
        const paths = stdout.split('\0').filter(path => path !== '');
        const files: string[] = [];
        // `--cached` still lists a tracked file deleted from the working tree.
        for (const path of paths) {
            if (await isFile(join(directory, path))) {
                files.push(path);
            }
        }
        return files;
    }
}

async function listByWalking(directory: string, prefix = ''): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(join(directory, prefix), { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === SKIPPED_DIRECTORY) {
            continue;
        }
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
            files.push(...(await listByWalking(directory, path)));
        } else if (entry.isFile() && entry.name.endsWith(PEN_EXTENSION)) {
            files.push(path);
        }
    }
    return files;
}

async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}
