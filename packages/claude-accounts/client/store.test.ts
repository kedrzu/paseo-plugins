import { expect, mock, test } from 'bun:test';
import type { input as ZodInput, output as ZodOutput, ZodType } from 'zod';

import type { PluginRpcContract } from '@getpaseo/plugin';
import type { PluginCommandCapabilities } from '@getpaseo/plugin/client';

import type { AccountActionsState, AccountsSnapshot, AccountsStatus, AccountsSwitchResult } from './store';
import { createAccountActions, createAccountsStore, getSidebarLabel, getSwitchTarget } from './store';

const A = 'a@example.com';
const B = 'b@example.com';

interface FakeRpc extends Pick<PluginCommandCapabilities, 'rpc'> {
    statuses: AccountsStatus[];
    statusGate: Promise<void> | null;
    statusError: Error | null;
    switchResults: AccountsSwitchResult[];
    switchError: Error | null;
    switchCalls: unknown[];
}

const READY: AccountsStatus = {
    state: 'ready',
    current: { email: A, organization: null, saved: true },
    accounts: [
        { email: A, organization: null, active: true, damaged: false },
        { email: B, organization: 'Org', active: false, damaged: false },
    ],
    runningClaudeProcesses: 0,
};

test('a switch answered with confirmation-required changes nothing until the user confirms', async () => {
    const fake = createFakeRpc();
    fake.switchResults.push(
        { status: 'confirmation-required', runningClaudeProcesses: 3 },
        { status: 'switched', email: B },
    );
    const { actions, toast } = createActions(fake);

    await actions.requestSwitch(B);

    const confirming: AccountActionsState = { step: 'confirming', email: B, runningClaudeProcesses: 3 };
    expect(actions.getState()).toEqual(confirming);
    expect(fake.switchCalls).toEqual([{ email: B, confirmed: false }]);
    expect(toast.show).not.toHaveBeenCalled();

    await actions.confirmSwitch(B);

    expect(fake.switchCalls).toEqual([
        { email: B, confirmed: false },
        { email: B, confirmed: true },
    ]);
    expect(actions.getState()).toMatchObject({ step: 'finished' });
});

test('cancelling a confirmation sends nothing', async () => {
    const fake = createFakeRpc();
    fake.switchResults.push({ status: 'confirmation-required', runningClaudeProcesses: 1 });
    const { actions } = createActions(fake);

    await actions.requestSwitch(B);
    actions.cancel();

    expect(actions.getState()).toEqual({ step: 'idle' });
    expect(fake.switchCalls).toEqual([{ email: B, confirmed: false }]);
});

test('a press while an action runs does not send a second switch', async () => {
    const fake = createFakeRpc();
    fake.switchResults.push({ status: 'switched', email: B });
    const { actions } = createActions(fake);

    const first = actions.confirmSwitch(B);
    await actions.confirmSwitch(B);
    await first;

    expect(fake.switchCalls).toEqual([{ email: B, confirmed: true }]);
});

test('a switch with a warning uses the warning toast and keeps the warning as the outcome', async () => {
    const fake = createFakeRpc();
    fake.switchResults.push({ status: 'switched', email: B, warning: 'kept the previous copy' });
    const { actions, toast } = createActions(fake);

    await actions.requestSwitch(B);

    expect(toast.show).toHaveBeenCalledWith(
        expect.stringContaining('kept the previous copy'),
        expect.objectContaining({ variant: 'warning' }),
    );
    expect(actions.getState()).toMatchObject({ step: 'finished', warning: 'kept the previous copy' });
});

test('a refused switch shows the server message and returns to idle', async () => {
    const fake = createFakeRpc();
    fake.switchError = new Error('The active account is not saved');
    const { actions, toast } = createActions(fake);

    await actions.requestSwitch(B);

    expect(toast.error).toHaveBeenCalledWith('The active account is not saved');
    expect(actions.getState()).toEqual({ step: 'idle' });
});

test('the status is refreshed after a switch, also after a refused one', async () => {
    const fake = createFakeRpc();
    fake.switchError = new Error('refused');
    const { store, actions } = createActions(fake);
    const switched: AccountsStatus = { ...READY, runningClaudeProcesses: 7 };
    fake.statuses.push(switched);

    await actions.requestSwitch(B);

    expect(store.getSnapshot().status).toEqual(switched);
});

test('an older status answer does not overwrite a newer one', async () => {
    const fake = createFakeRpc();
    const store = createAccountsStore(fake);
    const stale: AccountsStatus = { ...READY, runningClaudeProcesses: 1 };
    const fresh: AccountsStatus = { ...READY, runningClaudeProcesses: 2 };
    let releaseStale = () => {};
    fake.statusGate = new Promise<void>(resolve => {
        releaseStale = resolve;
    });
    fake.statuses.push(stale, fresh);

    const older = store.refresh();
    fake.statusGate = null;
    await store.refresh();
    releaseStale();
    await older;

    expect(store.getSnapshot().status).toEqual(fresh);
});

test('a failed refresh keeps the last status and does not reject', async () => {
    const fake = createFakeRpc();
    const store = createAccountsStore(fake);
    fake.statuses.push(READY);
    await store.refresh();

    fake.statusError = new Error('daemon offline');
    await store.refresh();

    const expected: AccountsSnapshot = { status: READY, loadError: 'daemon offline' };
    expect(store.getSnapshot()).toEqual(expected);
});

test('the sidebar label follows the state', () => {
    expect(getSidebarLabel(null)).toBeUndefined();
    expect(getSidebarLabel(READY)).toBe(A);
    expect(getSidebarLabel({ ...READY, current: { email: A, organization: null, saved: false } })).toBe(
        `${A} (unsaved)`,
    );
    expect(getSidebarLabel({ ...READY, current: null })).toBe('Not logged in');
    expect(getSidebarLabel({ ...READY, state: 'unavailable', current: null })).toBe('Claude accounts unavailable');
});

test('the screen offers the switch only for an account the server would not refuse outright', () => {
    const snapshot: AccountsSnapshot = { status: { ...READY, runningClaudeProcesses: 0 }, loadError: null };

    expect(getSwitchTarget(snapshot, B)).toEqual({ kind: 'ready', email: B, runningClaudeProcesses: 0 });
    expect(getSwitchTarget(snapshot, A).kind).toBe('notice');
    expect(getSwitchTarget(snapshot, 'absent@example.com').kind).toBe('notice');
    expect(getSwitchTarget(snapshot, undefined).kind).toBe('notice');
    expect(getSwitchTarget({ status: null, loadError: null }, B).kind).toBe('notice');
    expect(
        getSwitchTarget(
            {
                status: {
                    ...READY,
                    accounts: [{ email: B, organization: null, active: false, damaged: true }],
                },
                loadError: null,
            },
            B,
        ).kind,
    ).toBe('notice');
    expect(
        getSwitchTarget(
            { status: { ...READY, current: { email: A, organization: null, saved: false } }, loadError: null },
            B,
        ).kind,
    ).toBe('notice');
});

function createActions(fake: FakeRpc) {
    const store = createAccountsStore(fake);
    const toast = { show: mock(() => {}), error: mock(() => {}) };
    return { store, toast, actions: createAccountActions({ store, toast }) };
}

/** Answers like the daemon: output goes through the contract's schema, so no cast is needed. */
function createFakeRpc(): FakeRpc {
    const fake: FakeRpc = {
        statuses: [],
        statusGate: null,
        statusError: null,
        switchResults: [],
        switchError: null,
        switchCalls: [],
        rpc,
    };
    return fake;

    async function rpc<Input extends ZodType, Output extends ZodType>(
        contract: PluginRpcContract<Input, Output>,
        input: ZodInput<Input>,
    ): Promise<ZodOutput<Output>> {
        return contract.output.parse(await answer(contract.name, input));
    }

    async function answer(name: string, input: unknown): Promise<unknown> {
        if (name === 'accounts.status') {
            const status = fake.statuses.shift() ?? READY;
            const gate = fake.statusGate;
            await gate;
            if (fake.statusError !== null) {
                throw fake.statusError;
            }
            return status;
        }
        fake.switchCalls.push(input);
        if (fake.switchError !== null) {
            throw fake.switchError;
        }
        return fake.switchResults.shift();
    }
}
