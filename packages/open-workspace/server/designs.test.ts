import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { execCommand } from '@getpaseo/plugin/server';
import { afterEach, expect, test } from 'bun:test';

import { createDesigns } from './designs';

const directories: string[] = [];

afterEach(async () => {
    for (const directory of directories.splice(0)) {
        await rm(directory, { recursive: true, force: true });
    }
});

test('in a git repository, lists tracked and untracked designs but not ignored or deleted ones', async () => {
    const directory = await createDirectory({
        '.gitignore': 'ignored/\n',
        'app.pen': '',
        'docs/old.pen': '',
        'docs/deleted.pen': '',
        'notes.txt': '',
    });
    await git(directory, 'init', '-q');
    await git(directory, 'add', '.');
    await git(directory, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    await rm(join(directory, 'docs/deleted.pen'));
    await writeFiles(directory, { 'new/untracked.pen': '', 'ignored/skip.pen': '' });

    const designs = createDesigns({ exec: execCommand, platform: 'darwin' });

    expect(await designs.list(directory)).toEqual(['app.pen', 'docs/old.pen', 'new/untracked.pen']);
});

test('outside git, walks the directory without node_modules and hidden directories', async () => {
    const directory = await createDirectory({
        'b.pen': '',
        'a/nested/a.pen': '',
        'node_modules/pkg/vendored.pen': '',
        '.cache/hidden.pen': '',
        'readme.md': '',
    });
    const designs = createDesigns({ exec: execCommand, platform: 'darwin' });

    expect(await designs.list(directory)).toEqual(['a/nested/a.pen', 'b.pen']);
});

test('opens a listed design in Pen by its absolute path', async () => {
    const directory = await createDirectory({ 'ui/app.pen': '' });
    const opened: string[][] = [];
    const designs = createDesigns({
        exec: async (command, args, options) => {
            if (command === 'open') {
                opened.push(args);
                return { stdout: '', stderr: '' };
            }
            return execCommand(command, args, options);
        },
        platform: 'darwin',
    });

    await designs.open(directory, 'ui/app.pen');

    expect(opened).toEqual([['-b', 'dev.pencil.desktop', join(directory, 'ui/app.pen')]]);
});

test('refuses a path that is not a listed design, and other platforms', async () => {
    const directory = await createDirectory({ 'app.pen': '', 'secret.txt': '' });
    const opened: string[][] = [];
    const exec: typeof execCommand = async (command, args, options) => {
        if (command === 'open') {
            opened.push(args);
            return { stdout: '', stderr: '' };
        }
        return execCommand(command, args, options);
    };

    const designs = createDesigns({ exec, platform: 'darwin' });
    await expect(designs.open(directory, 'secret.txt')).rejects.toThrow('not a design');
    await expect(designs.open(directory, '../app.pen')).rejects.toThrow('not a design');

    const linux = createDesigns({ exec, platform: 'linux' });
    await expect(linux.open(directory, 'app.pen')).rejects.toThrow('macOS only');

    expect(opened).toEqual([]);
});

test('a failed open names the file and suggests installing Pen', async () => {
    const directory = await createDirectory({ 'app.pen': '' });
    const designs = createDesigns({
        exec: async (command, args, options) => {
            if (command === 'open') {
                throw new Error('Unable to find application');
            }
            return execCommand(command, args, options);
        },
        platform: 'darwin',
    });

    await expect(designs.open(directory, 'app.pen')).rejects.toThrow('Could not open app.pen in Pen');
});

async function createDirectory(files: Record<string, string>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'open-workspace-'));
    directories.push(directory);
    await writeFiles(directory, files);
    return directory;
}

async function writeFiles(directory: string, files: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), content);
    }
}

async function git(directory: string, ...args: string[]): Promise<void> {
    await execCommand('git', args, { cwd: directory });
}
