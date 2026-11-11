import type { PluginServerContext } from '@getpaseo/plugin/server';
import { execCommand } from '@getpaseo/plugin/server';

import { createRepo } from './server/repo';
import { repoGithubUrlRpc, repoOpenInFinderRpc, repoOpenInForkRpc } from './shared/repo';

/** Server entry: the daemon host owns the workspace, its apps and the git and `gh` credentials. */
export default function contribute(server: PluginServerContext): () => void {
    const repo = createRepo({ exec: execCommand, platform: process.platform });

    server.handle(repoOpenInFinderRpc, async ({ directory }) => {
        await repo.openInFinder(directory);
        return {};
    });
    server.handle(repoOpenInForkRpc, async ({ directory }) => {
        await repo.openInFork(directory);
        return {};
    });
    server.handle(repoGithubUrlRpc, async ({ directory }) => ({ url: await repo.githubUrl(directory) }));

    return () => {};
}
