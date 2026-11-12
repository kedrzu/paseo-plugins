import type { PluginCommandCenterItemContribution } from '@getpaseo/plugin/client';
import { openExternalUrl } from '@getpaseo/plugin/client';

import { repoGithubUrlRpc, repoOpenInFinderRpc, repoOpenInForkRpc, repoOpenInVscodeRpc } from '../shared/repo';

/**
 * The workspace Command Center items. A failing `onSelect` throws on purpose: the host shows the
 * message.
 */
export const RepoCommands: PluginCommandCenterItemContribution[] = [
    {
        id: 'open-in-finder',
        title: 'Open in Finder',
        icon: 'FolderOpen',
        keywords: ['finder', 'folder', 'reveal', 'directory'],
        context: 'workspace',
        async onSelect(context) {
            await context.rpc(repoOpenInFinderRpc, { directory: context.workspace.directory });
        },
    },
    {
        id: 'open-in-fork',
        title: 'Open in Fork',
        icon: 'GitFork',
        keywords: ['fork', 'git', 'client'],
        context: 'workspace',
        async onSelect(context) {
            await context.rpc(repoOpenInForkRpc, { directory: context.workspace.directory });
        },
    },
    {
        id: 'open-in-vscode',
        title: 'Open in VS Code',
        icon: 'Code',
        keywords: ['vscode', 'vs code', 'visual studio code', 'editor', 'code'],
        context: 'workspace',
        async onSelect(context) {
            await context.rpc(repoOpenInVscodeRpc, { directory: context.workspace.directory });
        },
    },
    {
        id: 'open-on-github',
        title: 'Open on GitHub',
        icon: 'GitPullRequest',
        keywords: ['github', 'pull request', 'pr', 'branch', 'browser'],
        context: 'workspace',
        async onSelect(context) {
            // The daemon host resolves the URL; the device the user is on opens it.
            const { url } = await context.rpc(repoGithubUrlRpc, { directory: context.workspace.directory });
            await openExternalUrl(url);
        },
    },
];
