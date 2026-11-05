import type { RpcOutput } from '@getpaseo/plugin';
import type { PluginCommandCapabilities } from '@getpaseo/plugin/client';
import type { ToastApi } from '@getpaseo/plugin/client/ui';

import { accountsSaveRpc, accountsStatusRpc, accountsSwitchRpc } from '../shared/accounts';

/** The screen that confirms a switch; Command Center and the save warning both open it. */
export const SWITCH_SCREEN_ID = 'switch';

export type AccountsStatus = RpcOutput<typeof accountsStatusRpc>;
export type AccountsSaveResult = RpcOutput<typeof accountsSaveRpc>;
export type AccountsSwitchResult = RpcOutput<typeof accountsSwitchRpc>;

export interface AccountsSnapshot {
    /** `null` until the first status arrives. A failed refresh keeps the last known status. */
    status: AccountsStatus | null;
    loadError: string | null;
}

/** Status from the daemon, plus the actions that change it. Each action refreshes the status. */
export interface AccountsStore {
    getSnapshot: () => AccountsSnapshot;
    subscribe: (listener: () => void) => () => void;
    /** Never rejects: a failure lands in `loadError`. */
    refresh: () => Promise<void>;
    save: () => Promise<AccountsSaveResult>;
    /** Asks without consent, so the server answers `confirmation-required` while sessions run. */
    requestSwitch: (email: string) => Promise<AccountsSwitchResult>;
    /** Sends the user's consent: call it only from a press on the confirmation's button. */
    confirmSwitch: (email: string) => Promise<AccountsSwitchResult>;
}

export type AccountActionsState =
    | { step: 'idle' }
    | { step: 'pending' }
    | { step: 'confirming'; email: string; runningClaudeProcesses: number }
    | { step: 'finished'; message: string; warning?: string };

/** What the popover and the screen do on a press, without React so that a test can hold it. */
export interface AccountActions {
    getState: () => AccountActionsState;
    subscribe: (listener: () => void) => () => void;
    /** A press on an account. A `confirmation-required` answer only moves to `confirming`. */
    requestSwitch: (email: string) => Promise<void>;
    /** A press on the confirmation's Switch button. */
    confirmSwitch: (email: string) => Promise<void>;
    cancel: () => void;
    save: () => Promise<void>;
}

export interface CreateAccountActionsParams {
    store: AccountsStore;
    toast: ToastApi;
}

export type SwitchTarget =
    | { kind: 'notice'; message: string }
    | { kind: 'ready'; email: string; runningClaudeProcesses: number };

const WARNING_TOAST_MS = 6000;

/** Created per `contribute`, because each host's installation has its own daemon and accounts. */
export function createAccountsStore(client: Pick<PluginCommandCapabilities, 'rpc'>): AccountsStore {
    const listeners = new Set<() => void>();
    let snapshot: AccountsSnapshot = { status: null, loadError: null };
    let latestRefresh = 0;

    return {
        getSnapshot,
        subscribe,
        refresh,
        save,
        requestSwitch: email => runSwitch(email, false),
        confirmSwitch: email => runSwitch(email, true),
    };

    function getSnapshot(): AccountsSnapshot {
        return snapshot;
    }

    function subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    async function refresh(): Promise<void> {
        // Only the newest call may publish: an older answer describes the state before an action.
        latestRefresh += 1;
        const thisRefresh = latestRefresh;
        let next: AccountsSnapshot;
        try {
            next = { status: await client.rpc(accountsStatusRpc, {}), loadError: null };
        } catch (error) {
            next = { status: snapshot.status, loadError: getErrorMessage(error) };
        }
        if (thisRefresh === latestRefresh) {
            snapshot = next;
            for (const listener of listeners) {
                listener();
            }
        }
    }

    async function save(): Promise<AccountsSaveResult> {
        try {
            return await client.rpc(accountsSaveRpc, {});
        } finally {
            await refresh();
        }
    }

    async function runSwitch(email: string, confirmed: boolean): Promise<AccountsSwitchResult> {
        try {
            return await client.rpc(accountsSwitchRpc, { email, confirmed });
        } finally {
            await refresh();
        }
    }
}

/** One per mounted popover or screen. */
export function createAccountActions({ store, toast }: CreateAccountActionsParams): AccountActions {
    const listeners = new Set<() => void>();
    let state: AccountActionsState = { step: 'idle' };

    return {
        getState: () => state,
        subscribe,
        requestSwitch: email => runSwitch(email, () => store.requestSwitch(email)),
        confirmSwitch: email => runSwitch(email, () => store.confirmSwitch(email)),
        cancel,
        save,
    };

    function subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function setState(next: AccountActionsState): void {
        state = next;
        for (const listener of listeners) {
            listener();
        }
    }

    async function runSwitch(email: string, call: () => Promise<AccountsSwitchResult>): Promise<void> {
        if (state.step === 'pending') {
            return;
        }
        setState({ step: 'pending' });
        try {
            applySwitchResult(email, await call());
        } catch (error) {
            fail(error);
        }
    }

    function applySwitchResult(email: string, result: AccountsSwitchResult): void {
        switch (result.status) {
            case 'switched':
                finish(`Switched to ${result.email}`, result.warning);
                break;
            case 'already-active':
                finish(`${email} is already the active account`);
                break;
            case 'confirmation-required':
                setState({ step: 'confirming', email, runningClaudeProcesses: result.runningClaudeProcesses });
                break;
        }
    }

    function cancel(): void {
        if (state.step === 'confirming') {
            setState({ step: 'idle' });
        }
    }

    async function save(): Promise<void> {
        if (state.step === 'pending') {
            return;
        }
        setState({ step: 'pending' });
        try {
            const result = await store.save();
            finish(`Saved ${result.email}`, result.warning);
        } catch (error) {
            fail(error);
        }
    }

    function finish(message: string, warning?: string): void {
        if (warning === undefined) {
            toast.show(message, { variant: 'success' });
        } else {
            toast.show(`${message}. ${warning}`, { variant: 'warning', durationMs: WARNING_TOAST_MS });
        }
        setState({ step: 'finished', message, warning });
    }

    function fail(error: unknown): void {
        toast.error(getErrorMessage(error));
        setState({ step: 'idle' });
    }
}

/** The sidebar row's label; `undefined` before the first load, so the row shows its registered title. */
export function getSidebarLabel(status: AccountsStatus | null): string | undefined {
    if (status === null) {
        return undefined;
    }
    if (status.state === 'unavailable') {
        return 'Claude accounts unavailable';
    }
    if (status.current === null) {
        return 'Not logged in';
    }
    return status.current.saved ? status.current.email : `${status.current.email} (unsaved)`;
}

/**
 * Whether the screen can offer the switch. Anything it already knows would be refused becomes a
 * notice instead of a button that fails; running processes do not, because the server decides those.
 */
export function getSwitchTarget({ status, loadError }: AccountsSnapshot, email: string | undefined): SwitchTarget {
    if (status === null) {
        return { kind: 'notice', message: loadError ?? 'Loading accounts…' };
    }
    if (status.state === 'unavailable') {
        return { kind: 'notice', message: status.reason ?? 'Claude accounts are unavailable' };
    }
    if (email === undefined) {
        return { kind: 'notice', message: 'No account was selected.' };
    }
    const account = status.accounts.find(candidate => candidate.email === email);
    if (account === undefined) {
        return { kind: 'notice', message: `${email} is not a saved account.` };
    }
    if (account.active) {
        return { kind: 'notice', message: `${email} is already the active account.` };
    }
    if (account.damaged) {
        return { kind: 'notice', message: `The saved copy of ${email} is damaged. Log in and save it again.` };
    }
    if (status.current !== null && !status.current.saved) {
        return {
            kind: 'notice',
            message: `The active account ${status.current.email} is not saved. Save it first, or its login is lost.`,
        };
    }
    return { kind: 'ready', email, runningClaudeProcesses: status.runningClaudeProcesses };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
