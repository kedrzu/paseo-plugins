import type { PluginClientContext } from '@getpaseo/plugin/client';

import type { AccountCommandsClient } from './client/commands';
import { syncAccountCommands } from './client/commands';
import { createAccountsSidebarItem } from './client/sidebar';
import { createAccountsStore, SWITCH_SCREEN_ID } from './client/store';
import { createSwitchScreen } from './client/switchConfirm';

/** The part of the host's context this plugin uses. */
export type AccountsClient = Pick<PluginClientContext, 'rpc' | 'addScreen' | 'addSidebarFooterItem'> &
    AccountCommandsClient;

/** Client entry: the store is created here so that each host's installation has its own. */
export default function contribute(client: AccountsClient): () => void {
    const store = createAccountsStore(client);
    const removers = [
        client.addScreen({
            id: SWITCH_SCREEN_ID,
            title: 'Switch Claude account',
            Component: createSwitchScreen(store),
        }),
        client.addSidebarFooterItem({
            id: 'accounts',
            title: 'Claude accounts',
            Component: createAccountsSidebarItem(store),
        }),
        syncAccountCommands(client, store),
    ];

    void store.refresh();

    return () => {
        for (const remove of removers) {
            void remove();
        }
    };
}
