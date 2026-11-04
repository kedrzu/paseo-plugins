import { execCommand } from '@getpaseo/plugin/server';
import { expect, test } from 'bun:test';

import { countClaudeProcesses } from './claudeProcesses';

test('counts one process per pgrep line, looking for the exact name', async () => {
    const calls: [string, string[]][] = [];

    const count = await countClaudeProcesses((command, args) => {
        calls.push([command, args]);
        return Promise.resolve({ stdout: '101\n202\n303\n', stderr: '' });
    });

    expect(count).toBe(3);
    expect(calls).toEqual([['pgrep', ['-x', 'claude']]]);
});

test('pgrep exit code 1 means no processes, on a real execFile rejection', async () => {
    expect(await countClaudeProcesses(() => execCommand('sh', ['-c', 'exit 1']))).toBe(0);
});

test('any other pgrep failure is an error, not zero processes', async () => {
    await expect(countClaudeProcesses(() => execCommand('sh', ['-c', 'exit 3']))).rejects.toThrow();
});
