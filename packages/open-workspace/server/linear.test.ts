import type { execCommand } from '@getpaseo/plugin/server';
import { expect, test } from 'bun:test';

import { createLinear, findIssueId } from './linear';
import { linearIssueUrlRpc, linearSettings } from '../shared/linear';

test('the RPC contract and settings load: their definitions reject names the daemon would refuse', () => {
    expect([linearIssueUrlRpc.name, linearSettings.id]).toEqual(['linear.issue-url', 'linear']);
});

test.each([
    ['feature/lin-123-open-in-linear', 'LIN-123'],
    ['feature/LIN-7', 'LIN-7'],
    ['lin-42-no-prefix', 'LIN-42'],
    ['users/me/eng2-9_x', 'ENG2-9'],
])('branch %s names %s', (branch, issueId) => {
    expect(findIssueId(branch, [])).toBe(issueId);
});

test.each(['main', 'feat/open-in-linear-action', 'feature/lin-abc'])('branch %s names no issue', branch => {
    expect(findIssueId(branch, [])).toBeNull();
});

test('the branch wins over the workspace name', () => {
    expect(findIssueId('feature/lin-1-x', ['[LIN-2] Other'])).toBe('LIN-1');
});

test('without an issue branch, the first workspace name starting with [LIN-123] names it', () => {
    expect(findIssueId('main', ['Plain title', '[lin-5] Fix it', '[LIN-6] Later'])).toBe('LIN-5');
    expect(findIssueId(null, ['Fix [LIN-5] later'])).toBeNull();
});

test('the URL uses the configured workspace and the branch read from git', async () => {
    const linear = createLinear({ exec: fakeGit('feature/lin-123-x\n'), readWorkspace: () => Promise.resolve('acme') });

    expect(await linear.issueUrl({ directory: '/repo', names: [] })).toBe('https://linear.app/acme/issue/LIN-123');
});

test('outside git the workspace name still finds the issue', async () => {
    const linear = createLinear({ exec: fakeGit(null), readWorkspace: () => Promise.resolve('acme') });

    expect(await linear.issueUrl({ directory: '/tmp', names: ['[LIN-9] Title'] })).toBe(
        'https://linear.app/acme/issue/LIN-9',
    );
});

test('no issue, or no configured workspace, is an error that says what to fix', async () => {
    const noIssue = createLinear({ exec: fakeGit('main\n'), readWorkspace: () => Promise.resolve('acme') });
    const noWorkspace = createLinear({ exec: fakeGit('feature/lin-1-x\n'), readWorkspace: () => Promise.resolve('') });

    await expect(noIssue.issueUrl({ directory: '/repo', names: ['Title'] })).rejects.toThrow('No Linear issue found');
    await expect(noWorkspace.issueUrl({ directory: '/repo', names: [] })).rejects.toThrow('Set your Linear workspace');
});

/** `git symbolic-ref` printing a branch, or failing as it does on a detached HEAD or outside git. */
function fakeGit(stdout: string | null): typeof execCommand {
    return () =>
        stdout === null
            ? Promise.reject(new Error('fatal: not a git repository'))
            : Promise.resolve({ stdout, stderr: '' });
}
