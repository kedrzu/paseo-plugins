import type { PluginServerContext } from '@getpaseo/plugin/server';
import { execCommand } from '@getpaseo/plugin/server';

import { createDesigns } from './server/designs';
import { designsListRpc, designsOpenRpc } from './shared/designs';

/** Server entry: the daemon host owns the workspace files and the Pen app. */
export default function contribute(server: PluginServerContext): () => void {
    const designs = createDesigns({ exec: execCommand, platform: process.platform });

    server.handle(designsListRpc, async ({ directory }) => ({ files: await designs.list(directory) }));
    server.handle(designsOpenRpc, async ({ directory, path }) => {
        await designs.open(directory, path);
        return {};
    });

    return () => {};
}
