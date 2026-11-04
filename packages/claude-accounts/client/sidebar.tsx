import type { PluginPopoverProps, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { Icon, SidebarRow } from '@getpaseo/plugin/client/ui';
import type { ComponentType } from 'react';
import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AccountsStatus, AccountsStore } from './store';
import { getSidebarLabel } from './store';
import { ActionButton, SwitchConfirm, useAccountActions } from './switchConfirm';

interface AccountRowProps extends Pick<PluginPopoverProps, 'theme'> {
    account: AccountsStatus['accounts'][number];
    disabled: boolean;
    onPress: () => void;
}

/** The footer row and its popover; created per store, which the host's props cannot carry. */
export function createAccountsSidebarItem(store: AccountsStore): ComponentType<PluginSidebarItemProps> {
    return AccountsSidebarItem;

    function AccountsSidebarItem(props: PluginSidebarItemProps) {
        const { status } = useSyncExternalStore(store.subscribe, store.getSnapshot);
        return (
            <SidebarRow
                icon="User"
                label={getSidebarLabel(status)}
                onPress={() => {
                    props.openPopover(AccountsPopover);
                    void store.refresh();
                }}
            />
        );
    }

    function AccountsPopover({ theme }: PluginPopoverProps) {
        const { status, loadError } = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const { actions, state } = useAccountActions(store);
        const pending = state.step === 'pending';

        return <View style={{ gap: 12, padding: 12, minWidth: 260 }}>{renderContent()}</View>;

        function renderContent() {
            if (status === null) {
                return <Text style={{ color: theme.colors.foregroundMuted }}>{loadError ?? 'Loading accounts…'}</Text>;
            }
            if (status.state === 'unavailable') {
                return (
                    <Text style={{ color: theme.colors.foreground }}>
                        {status.reason ?? 'Claude accounts are unavailable'}
                    </Text>
                );
            }
            if (state.step === 'confirming') {
                return (
                    <SwitchConfirm
                        theme={theme}
                        actions={actions}
                        email={state.email}
                        runningClaudeProcesses={state.runningClaudeProcesses}
                        disabled={false}
                        onCancel={actions.cancel}
                    />
                );
            }

            const { current, accounts } = status;
            const unsaved = current !== null && !current.saved;
            return (
                <>
                    {unsaved && (
                        <Text style={{ color: theme.colors.statusWarning }}>
                            {current.email} is not saved. Switching is refused until it is saved.
                        </Text>
                    )}
                    {accounts.length === 0 && (
                        <Text style={{ color: theme.colors.foregroundMuted }}>No saved accounts.</Text>
                    )}
                    {accounts.map(account => (
                        <AccountRow
                            key={account.email}
                            theme={theme}
                            account={account}
                            disabled={pending}
                            onPress={() => void actions.requestSwitch(account.email)}
                        />
                    ))}
                    {current !== null && (
                        <ActionButton
                            theme={theme}
                            label={unsaved ? `Save ${current.email}` : 'Save current account'}
                            primary={unsaved}
                            disabled={pending}
                            onPress={() => void actions.save()}
                        />
                    )}
                </>
            );
        }
    }
}

function AccountRow({ theme, account, disabled, onPress }: AccountRowProps) {
    const pressable = !account.active && !account.damaged;
    return (
        <Pressable
            accessibilityRole={pressable ? 'button' : undefined}
            accessibilityState={{ disabled: !pressable || disabled, selected: account.active }}
            disabled={!pressable || disabled}
            onPress={onPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.foreground }}>{account.email}</Text>
                {account.organization !== null && (
                    <Text style={{ color: theme.colors.foregroundMuted }}>{account.organization}</Text>
                )}
            </View>
            {account.active && (
                <Icon
                    name="Check"
                    size={16}
                    color={theme.colors.statusSuccess}
                />
            )}
            {account.damaged && <Text style={{ color: theme.colors.statusDanger }}>Damaged</Text>}
        </Pressable>
    );
}
