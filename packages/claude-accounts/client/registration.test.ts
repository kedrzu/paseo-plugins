import { expect, mock, test } from 'bun:test';
import type { input as ZodInput, output as ZodOutput, ZodType } from 'zod';

import type { PluginRpcContract } from '@getpaseo/plugin';
import type { PluginOpenScreenInput } from '@getpaseo/plugin/client';

import type { AccountsClient } from '../index.client';
import type { AccountCommandItem } from './commands';
import type { AccountsSaveResult, AccountsStatus } from './store';

// Neither module loads under bun: react-native fails to parse and the SDK's UI entry is an empty stub
// the host fills in. Nothing renders here, so the components only need to exist. No server test imports
// either module, which is what makes this process-wide mock safe under `bun run tests`.
await mock.module('react-native', () => ({ Pressable: () => null, Text: () => null, View: () => null }));
await mock.module('@getpaseo/plugin/client/ui', () => ({
    Icon: () => null,
    SidebarRow: () => null,
    useToast: () => null,
}));

const { default: contribute } = await import('../index.client');

type ScreenRegistration = Parameters<AccountsClient['addScreen']>[0];
type FooterRegistration = Parameters<AccountsClient['addSidebarFooterItem']>[0];

interface FakeHost {
    status: AccountsStatus;
    saveResult: AccountsSaveResult;
    saveError: Error | null;
    gate: Promise<void> | null;
    commands: AccountCommandItem[];
    commandsAdded: number;
    footerItems: FooterRegistration[];
    screens: ScreenRegistration[];
    openedScreens: PluginOpenScreenInput[];
    rpcCalls: string[];
    client: AccountsClient;
    commandTitles: () => string[];
    select: (title: string) => Promise<void>;
    settled: () => Promise<void>;
}

const A = 'a@example.com';
const B = 'b@example.com';
const C = 'c@example.com';

const HOST_ID = /^[a-z][a-z0-9-]*$/;

const STATUS: AccountsStatus = {
    state: 'ready',
    current: { email: A, organization: null, saved: true },
    accounts: [
        { email: A, organization: null, active: true, damaged: false },
        { email: B, organization: 'Org', active: false, damaged: false },
        { email: C, organization: null, active: false, damaged: true },
    ],
    runningClaudeProcesses: 0,
};

test('registers the sidebar footer item and the switch screen', async () => {
    const host = createFakeHost(STATUS);

    contribute(host.client);
    await host.settled();

    expect(host.footerItems.map(item => item.title)).toEqual(['Claude accounts']);
    expect(host.screens.map(screen => screen.id)).toEqual(['switch']);
});

test('lists a Command Center item per switchable account, plus save', async () => {
    const host = createFakeHost(STATUS);

    contribute(host.client);
    await host.settled();

    expect(host.commandTitles()).toEqual([`Switch Claude account: ${B}`, 'Save current Claude account']);
    for (const item of host.commands) {
        expect(item.id).toMatch(HOST_ID);
        expect(item.context).toBe('global');
    }
});

test('lists nothing when nobody is logged in and nothing is saved, or the plugin is unavailable', async () => {
    const empty = createFakeHost({ ...STATUS, current: null, accounts: [] });
    contribute(empty.client);
    await empty.settled();
    expect(empty.commandTitles()).toEqual([]);

    const unavailable = createFakeHost({ ...STATUS, state: 'unavailable', current: null, accounts: [] });
    contribute(unavailable.client);
    await unavailable.settled();
    expect(unavailable.commandTitles()).toEqual([]);
});

test('updates the list after a save, without a duplicate ID', async () => {
    const host = createFakeHost({ ...STATUS, current: { email: 'new@example.com', organization: null, saved: false } });
    contribute(host.client);
    await host.settled();
    expect(host.commandTitles()).toEqual([`Switch Claude account: ${B}`, 'Save current Claude account']);

    host.status = {
        ...STATUS,
        accounts: [...STATUS.accounts, { email: 'd@example.com', organization: null, active: false, damaged: false }],
    };
    await host.select('Save current Claude account');

    expect(host.commandTitles()).toEqual([
        `Switch Claude account: ${B}`,
        'Switch Claude account: d@example.com',
        'Save current Claude account',
    ]);
    expect(host.rpcCalls).toContain('accounts.save');
});

test('skips the churn when the items did not change', async () => {
    const host = createFakeHost(STATUS);
    contribute(host.client);
    await host.settled();
    const added = host.commandsAdded;

    host.status = { ...STATUS, runningClaudeProcesses: 5 };
    await host.select('Save current Claude account');

    expect(host.commandsAdded).toBe(added);
});

test('selecting a switch item opens the screen and sends no switch', async () => {
    const host = createFakeHost(STATUS);
    contribute(host.client);
    await host.settled();

    await host.select(`Switch Claude account: ${B}`);

    const expected: PluginOpenScreenInput[] = [{ screenId: 'switch', params: { email: B } }];
    expect(host.openedScreens).toEqual(expected);
    expect(host.rpcCalls).not.toContain('accounts.switch');
});

test('a save with a warning opens the screen with it; a plain save opens nothing', async () => {
    const host = createFakeHost(STATUS);
    contribute(host.client);
    await host.settled();

    await host.select('Save current Claude account');
    expect(host.openedScreens).toEqual([]);

    host.saveResult = { email: A, warning: 'Could not confirm' };
    await host.select('Save current Claude account');

    const expected: PluginOpenScreenInput[] = [
        { screenId: 'switch', params: { email: A, warning: 'Could not confirm' } },
    ];
    expect(host.openedScreens).toEqual(expected);
});

test('a refused save reaches the host as a thrown error', async () => {
    const host = createFakeHost(STATUS);
    contribute(host.client);
    await host.settled();

    host.saveError = new Error('Not logged in to Claude');

    await expect(host.select('Save current Claude account')).rejects.toThrow('Not logged in to Claude');
    expect(host.openedScreens).toEqual([]);
});

test('cleanup removes every registration', async () => {
    const host = createFakeHost(STATUS);
    const cleanup = contribute(host.client);
    await host.settled();

    cleanup();

    expect(host.footerItems).toEqual([]);
    expect(host.screens).toEqual([]);
    expect(host.commands).toEqual([]);
});

test('a status answer arriving after cleanup registers nothing', async () => {
    const host = createFakeHost(STATUS);
    let release = () => {};
    host.gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const cleanup = contribute(host.client);

    cleanup();
    release();
    await host.settled();

    expect(host.commands).toEqual([]);
    expect(host.commandsAdded).toBe(0);
});

/** Behaves like the host's registration: duplicate IDs throw, removers take the item out. */
function createFakeHost(initialStatus: AccountsStatus): FakeHost {
    const host: FakeHost = {
        status: initialStatus,
        saveResult: { email: A },
        saveError: null,
        gate: null,
        commands: [],
        commandsAdded: 0,
        footerItems: [],
        screens: [],
        openedScreens: [],
        rpcCalls: [],
        client: { rpc, addScreen, addSidebarFooterItem, addCommandCenterItem },
        commandTitles,
        select,
        settled,
    };
    return host;

    function commandTitles(): string[] {
        return host.commands.map(item => item.title);
    }

    async function select(title: string): Promise<void> {
        const item = host.commands.find(candidate => candidate.title === title);
        await item!.onSelect({
            openScreen: input => {
                host.openedScreens.push(input);
            },
        });
    }

    /** A macrotask: every status answer not held by `gate` has been applied after it. */
    async function settled(): Promise<void> {
        await new Promise(resolve => {
            setTimeout(resolve);
        });
    }

    async function rpc<Input extends ZodType, Output extends ZodType>(
        contract: PluginRpcContract<Input, Output>,
        _input: ZodInput<Input>,
    ): Promise<ZodOutput<Output>> {
        host.rpcCalls.push(contract.name);
        return contract.output.parse(await answer(contract.name));
    }

    async function answer(name: string): Promise<unknown> {
        switch (name) {
            case 'accounts.status':
                await host.gate;
                return host.status;
            case 'accounts.save':
                if (host.saveError !== null) {
                    throw host.saveError;
                }
                return host.saveResult;
            default:
                throw new Error(`Unexpected RPC: ${name}`);
        }
    }

    function addScreen(contribution: ScreenRegistration): () => void {
        return track(host.screens, contribution);
    }

    function addSidebarFooterItem(contribution: FooterRegistration): () => void {
        return track(host.footerItems, contribution);
    }

    function addCommandCenterItem(contribution: AccountCommandItem): () => void {
        host.commandsAdded += 1;
        return track(host.commands, contribution);
    }

    function track<Item extends { id: string }>(items: Item[], item: Item): () => void {
        if (items.some(existing => existing.id === item.id)) {
            throw new Error(`Duplicate: ${item.id}`);
        }
        items.push(item);
        return () => {
            items.splice(items.indexOf(item), 1);
        };
    }
}
