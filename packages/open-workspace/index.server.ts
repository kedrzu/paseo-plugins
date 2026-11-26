import type { PluginServerContext } from '@getpaseo/plugin/server';
import { execCommand } from '@getpaseo/plugin/server';

import { createDesigns } from './server/designs';
import { createLinear } from './server/linear';
import { createRepo } from './server/repo';
import { designsListRpc, designsOpenRpc } from './shared/designs';
import { linearIssueUrlRpc, linearSettings } from './shared/linear';
import {
    repoGithubUrlRpc,
    repoOpenInFinderRpc,
    repoOpenInForkRpc,
    repoOpenInVscodeRpc,
    repoOpenInZedRpc,
    repoReviewUrlRpc,
} from './shared/repo';

/**
 * Server entry: the daemon host owns the workspace files, its apps (Finder, Fork, VS Code, Zed, Pen) and the git
 * and `gh` credentials.
 */
export default function contribute(server: PluginServerContext): () => void {
    const repo = createRepo({ exec: execCommand, platform: process.platform });
    const designs = createDesigns({ exec: execCommand, platform: process.platform });
    const settings = server.registerSettings(linearSettings);
    const linear = createLinear({
        exec: execCommand,
        async readWorkspace() {
            const state = await settings.read();
            if (state.status === 'invalid') {
                throw new Error(`The Open Workspace settings are invalid: ${state.error}`);
            }
            return state.values.workspace;
        },
    });

    server.handle(repoOpenInFinderRpc, async ({ directory }) => {
        await repo.openInFinder(directory);
        return {};
    });
    server.handle(repoOpenInForkRpc, async ({ directory }) => {
        await repo.openInFork(directory);
        return {};
    });
    server.handle(repoOpenInVscodeRpc, async ({ directory }) => {
        await repo.openInVscode(directory);
        return {};
    });
    server.handle(repoOpenInZedRpc, async ({ directory }) => {
        await repo.openInZed(directory);
        return {};
    });
    server.handle(repoGithubUrlRpc, async ({ directory }) => ({ url: await repo.githubUrl(directory) }));
    server.handle(repoReviewUrlRpc, async ({ directory }) => ({ url: await repo.reviewUrl(directory) }));

    server.handle(linearIssueUrlRpc, async input => ({ url: await linear.issueUrl(input) }));

    server.handle(designsListRpc, async ({ directory }) => ({ files: await designs.list(directory) }));
    server.handle(designsOpenRpc, async ({ directory, path }) => {
        await designs.open(directory, path);
        return {};
    });

    return () => {};
}
