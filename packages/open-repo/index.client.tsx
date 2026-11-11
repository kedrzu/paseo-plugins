import type { PluginClientContext } from '@getpaseo/plugin/client';

import { RepoCommands } from './client/commands';

/** Client entry: the workspace Command Center items. */
export default function contribute(client: Pick<PluginClientContext, 'addCommandCenterItem'>): () => void {
    const removers = RepoCommands.map(command => client.addCommandCenterItem(command));
    return () => {
        for (const remove of removers) {
            void remove();
        }
    };
}
