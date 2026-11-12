import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

const directoryInput = z.object({ directory: z.string() });

/** Shows the workspace directory in Finder on the daemon host. */
export const repoOpenInFinderRpc = defineRpc({
    name: 'repo.open-in-finder',
    input: directoryInput,
    output: z.object({}),
});

/** Opens the workspace repository in the Fork git client on the daemon host. */
export const repoOpenInForkRpc = defineRpc({
    name: 'repo.open-in-fork',
    input: directoryInput,
    output: z.object({}),
});

/** Opens the workspace directory in VS Code on the daemon host. */
export const repoOpenInVscodeRpc = defineRpc({
    name: 'repo.open-in-vscode',
    input: directoryInput,
    output: z.object({}),
});

/**
 * The GitHub page for the workspace: its open pull request, else the code on its branch. The client
 * opens it, so it lands in the browser of the device the user is on.
 */
export const repoGithubUrlRpc = defineRpc({
    name: 'repo.github-url',
    input: directoryInput,
    output: z.object({ url: z.string() }),
});
