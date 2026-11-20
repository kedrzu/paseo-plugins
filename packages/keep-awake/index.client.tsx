import type { PluginClientContext } from '@getpaseo/plugin/client';

import { createKeepAwakeCommands } from './client/commands';
import { createKeepAwakeSidebarItem } from './client/sidebar';
import { createKeepAwakeStore } from './client/store';

/** Client entry: a sidebar footer row with its popover, and global Command Center items. */
export default function contribute(
    client: Pick<PluginClientContext, 'rpc' | 'addSidebarFooterItem' | 'addCommandCenterItem'>,
): () => void {
    const store = createKeepAwakeStore(client);
    const removers = [
        client.addSidebarFooterItem({
            id: 'keep-awake',
            title: 'Keep awake',
            Component: createKeepAwakeSidebarItem(store),
        }),
        ...createKeepAwakeCommands(store).map(command => client.addCommandCenterItem(command)),
    ];

    void store.refresh();

    return () => {
        for (const remove of removers) {
            void remove();
        }
    };
}
