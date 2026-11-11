import type { PluginServerContext } from '@getpaseo/plugin/server';
import { execCommand } from '@getpaseo/plugin/server';

import { createDesigns } from './server/designs';
import { createRepo } from './server/repo';
import { designsListRpc, designsOpenRpc } from './shared/designs';
import { repoGithubUrlRpc, repoOpenInFinderRpc, repoOpenInForkRpc } from './shared/repo';

/**
 * Server entry: the daemon host owns the workspace files, its apps (Finder, Fork, Pen) and the git
 * and `gh` credentials.
 */
export default function contribute(server: PluginServerContext): () => void {
    const repo = createRepo({ exec: execCommand, platform: process.platform });
    const designs = createDesigns({ exec: execCommand, platform: process.platform });

    server.handle(repoOpenInFinderRpc, async ({ directory }) => {
        await repo.openInFinder(directory);
        return {};
    });
    server.handle(repoOpenInForkRpc, async ({ directory }) => {
        await repo.openInFork(directory);
        return {};
    });
    server.handle(repoGithubUrlRpc, async ({ directory }) => ({ url: await repo.githubUrl(directory) }));

    server.handle(designsListRpc, async ({ directory }) => ({ files: await designs.list(directory) }));
    server.handle(designsOpenRpc, async ({ directory, path }) => {
        await designs.open(directory, path);
        return {};
    });

    return () => {};
}
