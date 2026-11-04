import type { PluginGlobalCommandContext } from '@getpaseo/plugin/client';

import type { AccountsStatus, AccountsStore } from './store';
import { SWITCH_SCREEN_ID } from './store';

/** The part of a Command Center item this plugin uses; assignable to the host's contribution. */
export interface AccountCommandItem {
    id: string;
    title: string;
    icon: string;
    context: 'global';
    onSelect(context: Pick<PluginGlobalCommandContext, 'openScreen'>): void | Promise<void>;
}

export interface AccountCommandsClient {
    addCommandCenterItem(contribution: AccountCommandItem): () => void | Promise<void>;
}

type CommandEntry = { kind: 'save' } | { kind: 'switch'; email: string };

/**
 * Keeps the Command Center in step with the store until the returned cleanup runs. The host rejects
 * duplicate IDs, so old items go before new ones.
 */
export function syncAccountCommands(client: AccountCommandsClient, store: AccountsStore): () => void {
    let registeredKey = '[]';
    let removers: (() => void | Promise<void>)[] = [];

    sync();
    const unsubscribe = store.subscribe(sync);

    return () => {
        unsubscribe();
        removeRegistered();
    };

    function sync(): void {
        const entries = getCommandEntries(store.getSnapshot().status);
        const key = JSON.stringify(entries);
        if (key === registeredKey) {
            return;
        }
        removeRegistered();
        registeredKey = key;
        removers = entries.map((entry, index) => client.addCommandCenterItem(createItem(entry, index)));
    }

    function removeRegistered(): void {
        for (const remove of removers) {
            void remove();
        }
        removers = [];
    }

    function createItem(entry: CommandEntry, index: number): AccountCommandItem {
        if (entry.kind === 'save') {
            return {
                id: 'save-account',
                title: 'Save current Claude account',
                icon: 'Save',
                context: 'global',
                async onSelect({ openScreen }) {
                    // A refusal is thrown on purpose: the host shows it. Success shows in the sidebar
                    // row and this list, but the row can be hidden, so a warning needs the screen.
                    const { email, warning } = await store.save();
                    if (warning !== undefined) {
                        openScreen({ screenId: SWITCH_SCREEN_ID, params: { email, warning } });
                    }
                },
            };
        }
        return {
            // By index, because an email fails the host's ID validation.
            id: `switch-account-${index}`,
            title: `Switch Claude account: ${entry.email}`,
            icon: 'Repeat',
            context: 'global',
            onSelect({ openScreen }) {
                openScreen({ screenId: SWITCH_SCREEN_ID, params: { email: entry.email } });
            },
        };
    }
}

function getCommandEntries(status: AccountsStatus | null): CommandEntry[] {
    if (status?.state !== 'ready') {
        return [];
    }
    const entries: CommandEntry[] = [];
    for (const account of status.accounts) {
        if (!account.active && !account.damaged) {
            entries.push({ kind: 'switch', email: account.email });
        }
    }
    if (status.current !== null) {
        entries.push({ kind: 'save' });
    }
    return entries;
}
