import type { execCommand } from '@getpaseo/plugin/server';

/** `feature/lin-123-short-title`, `lin-123`, `fix/LIN-123_x`: the issue ID heads the last path segment. */
const BRANCH_ISSUE = /(?:^|\/)([a-z][a-z0-9]*-\d+)(?![0-9])[^/]*$/i;
/** `[LIN-123] Short title`. */
const NAME_ISSUE = /^\s*\[([a-z][a-z0-9]*-\d+)\]/i;

export interface CreateLinearParams {
    exec: typeof execCommand;
    /** The configured organisation slug, empty when not set. */
    readWorkspace: () => Promise<string>;
}

export interface IssueUrlParams {
    directory: string;
    names: readonly string[];
}

export interface Linear {
    /** The issue named by the checked-out branch, else by the workspace name. */
    issueUrl: (params: IssueUrlParams) => Promise<string>;
}

/** Finding the Linear issue a workspace works on. */
export function createLinear({ exec, readWorkspace }: CreateLinearParams): Linear {
    return { issueUrl };

    async function issueUrl({ directory, names }: IssueUrlParams): Promise<string> {
        const issueId = findIssueId(await readBranch(directory), names);
        if (issueId === null) {
            throw new Error(
                'No Linear issue found: the branch should look like feature/lin-123-… or the workspace name start with [LIN-123].',
            );
        }
        const workspace = await readWorkspace();
        if (workspace === '') {
            throw new Error('Set your Linear workspace in the Open Workspace plugin settings first.');
        }
        return `https://linear.app/${workspace}/issue/${issueId}`;
    }

    /** Null on a detached HEAD or outside git: the workspace name may still name the issue. */
    async function readBranch(directory: string): Promise<string | null> {
        try {
            const { stdout } = await exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: directory });
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }
}

/**
 * The upper-cased Linear issue ID from a branch name, else from the first workspace name that starts
 * with one.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function findIssueId(branch: string | null, names: readonly string[]): string | null {
    const fromBranch = branch === null ? null : BRANCH_ISSUE.exec(branch);
    if (fromBranch !== null) {
        return fromBranch[1].toUpperCase();
    }
    for (const name of names) {
        const fromName = NAME_ISSUE.exec(name);
        if (fromName !== null) {
            return fromName[1].toUpperCase();
        }
    }
    return null;
}
