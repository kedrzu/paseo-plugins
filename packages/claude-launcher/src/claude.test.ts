import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WRAPPER = join(import.meta.dir, '../bin/claude');
const PASEO_ARGS = [
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--mcp-config',
    '{"mcpServers":{"paseo":{"type":"http","url":"http://127.0.0.1:6767/mcp"}}}',
    '--setting-sources=user,project,local',
    '--settings',
    '{"fastMode":false}',
];

let root: string;
let project: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claude-launcher-'));
    project = join(root, 'project');
    await mkdir(join(project, '.git'), { recursive: true });
    await mkdir(join(project, 'packages/app'), { recursive: true });
    await mkdir(join(root, 'stub'));
    // Prints what the real `claude` would receive.
    await writeFile(
        join(root, 'stub/claude'),
        '#!/bin/sh\nprintf \'%s\\n\' "$@"\nprintf \'ENV=%s\\n\' "${ENABLE_CLAUDEAI_MCP_SERVERS-unset}"\n',
    );
    await chmod(join(root, 'stub/claude'), 0o755);
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('bin/claude', () => {
    test('passes a session through unchanged without the marker', async () => {
        const run = await launch(project, PASEO_ARGS);
        expect(run.args).toEqual(PASEO_ARGS);
        expect(run.env).toBe('unset');
    });

    test('isolates a session from the user scope when the project has the marker', async () => {
        await markIsolated(project);
        const run = await launch(join(project, 'packages/app'), PASEO_ARGS);
        expect(run.args).toEqual([
            ...PASEO_ARGS.filter(arg => !arg.startsWith('--setting-sources')),
            '--setting-sources=project,local',
        ]);
        expect(run.env).toBe('false');
    });

    test('replaces a separate --setting-sources value', async () => {
        await markIsolated(project);
        const run = await launch(project, ['--input-format', 'stream-json', '--setting-sources', 'user']);
        expect(run.args).toEqual(['--input-format', 'stream-json', '--setting-sources=project,local']);
    });

    test('passes a non-session command through even with the marker', async () => {
        await markIsolated(project);
        const run = await launch(project, ['--version']);
        expect(run.args).toEqual(['--version']);
        expect(run.env).toBe('unset');
    });

    test('ignores a marker above the repository root', async () => {
        await markIsolated(root);
        const run = await launch(project, PASEO_ARGS);
        expect(run.args).toEqual(PASEO_ARGS);
    });
});

async function markIsolated(dir: string) {
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude/isolated'), '');
}

/** Runs the wrapper outside Paseo (no `PASEO_AGENT_ID`, so no setup wait) against the stub. */
async function launch(cwd: string, args: string[]) {
    const proc = Bun.spawn([WRAPPER, ...args], {
        cwd,
        env: { PATH: `${join(root, 'stub')}:/usr/bin:/bin`, HOME: root },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    const lines = output.trimEnd().split('\n');
    const env = lines.pop()?.replace(/^ENV=/, '');
    return { args: lines, env };
}
