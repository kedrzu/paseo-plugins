import type { PluginHostProps, PluginScreenProps } from '@getpaseo/plugin/client';
import { useToast } from '@getpaseo/plugin/client/ui';
import type { ComponentType } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AccountActions, AccountActionsState, AccountsStore } from './store';
import { createAccountActions, getSwitchTarget } from './store';
import { useHover } from './useHover';

export interface ActionButtonProps extends Pick<PluginHostProps, 'theme'> {
    label: string;
    primary?: boolean;
    disabled?: boolean;
    onPress: () => void;
}

export interface SwitchConfirmProps extends Pick<PluginHostProps, 'theme'> {
    actions: AccountActions;
    email: string;
    runningClaudeProcesses: number;
    disabled: boolean;
    onCancel: () => void;
}

interface SwitchScreenBodyProps extends Pick<PluginHostProps, 'theme'> {
    email: string | undefined;
}

export interface UseAccountActionsResult {
    actions: AccountActions;
    state: AccountActionsState;
}

/** The actions of one popover or screen, wired to the host's toasts. */
export function useAccountActions(store: AccountsStore): UseAccountActionsResult {
    const toast = useToast();
    const [actions] = useState(() => createAccountActions({ store, toast }));
    const state = useSyncExternalStore(actions.subscribe, actions.getState);
    return { actions, state };
}

/** The one place that sends consent to a switch, used by both the popover and the screen. */
export function SwitchConfirm({
    theme,
    actions,
    email,
    runningClaudeProcesses,
    disabled,
    onCancel,
}: SwitchConfirmProps) {
    return (
        <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.foreground }}>Switch to {email}?</Text>
            <Text style={{ color: theme.colors.statusWarning }}>{getProcessesText(runningClaudeProcesses)}</Text>
            <Text style={{ color: theme.colors.foregroundMuted }}>
                The switch applies to new sessions. A running session that refreshes its token may overwrite it with its
                own account.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <ActionButton
                    theme={theme}
                    label="Switch"
                    primary
                    disabled={disabled}
                    onPress={() => void actions.confirmSwitch(email)}
                />
                <ActionButton
                    theme={theme}
                    label="Cancel"
                    disabled={disabled}
                    onPress={onCancel}
                />
            </View>
        </View>
    );
}

/** A themed text button; React Native has no styled one. */
export function ActionButton({ theme, label, primary = false, disabled = false, onPress }: ActionButtonProps) {
    const { hovered, hoverProps } = useHover();
    const active = hovered && !disabled;
    const restingBackground = primary ? theme.colors.accent : theme.colors.surface2;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            {...hoverProps}
            style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                // The theme has no hover token: a primary dims, the others rise one step to the border colour.
                backgroundColor: active && !primary ? theme.colors.border : restingBackground,
                opacity: disabled ? 0.5 : active && primary ? 0.85 : 1,
            }}
        >
            <Text style={{ color: primary ? theme.colors.accentForeground : theme.colors.foreground }}>{label}</Text>
        </Pressable>
    );
}

/** The screen Command Center opens; created per store, which `addScreen`'s props cannot carry. */
export function createSwitchScreen(store: AccountsStore): ComponentType<PluginScreenProps> {
    return SwitchScreen;

    function SwitchScreen({ theme, layout, params }: PluginScreenProps) {
        // A param is absent at runtime when the screen is opened by a link without it.
        const email: string | undefined = params.email;
        const warning: string | undefined = params.warning;

        useEffect(() => {
            void store.refresh();
        }, []);

        return (
            <View
                style={{
                    flex: 1,
                    gap: 16,
                    padding: layout.compact ? 16 : 24,
                    backgroundColor: theme.colors.surface0,
                }}
            >
                {warning !== undefined && <Text style={{ color: theme.colors.statusWarning }}>{warning}</Text>}
                {/* Opening this screen for another account reuses the component: the key resets the outcome. */}
                <SwitchScreenBody
                    key={email}
                    theme={theme}
                    email={email}
                />
            </View>
        );
    }

    function SwitchScreenBody({ theme, email }: SwitchScreenBodyProps) {
        const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const { actions, state } = useAccountActions(store);
        const [cancelled, setCancelled] = useState(false);

        if (cancelled) {
            return <Text style={{ color: theme.colors.foreground }}>Switch cancelled. Nothing changed.</Text>;
        }
        // Before the target: a finished switch makes the account active, which is not what to report.
        if (state.step === 'finished') {
            return (
                <View style={{ gap: 8 }}>
                    <Text style={{ color: theme.colors.statusSuccess }}>{state.message}</Text>
                    {state.warning !== undefined && (
                        <Text style={{ color: theme.colors.statusWarning }}>{state.warning}</Text>
                    )}
                </View>
            );
        }

        const target = getSwitchTarget(snapshot, email);
        if (target.kind === 'notice') {
            return <Text style={{ color: theme.colors.foreground }}>{target.message}</Text>;
        }
        return (
            <SwitchConfirm
                theme={theme}
                actions={actions}
                email={target.email}
                runningClaudeProcesses={
                    state.step === 'confirming' ? state.runningClaudeProcesses : target.runningClaudeProcesses
                }
                disabled={state.step === 'pending'}
                onCancel={() => setCancelled(true)}
            />
        );
    }
}

function getProcessesText(count: number): string {
    switch (count) {
        case 0:
            return 'No running Claude processes are known.';
        case 1:
            return '1 Claude process is running.';
        default:
            return `${count} Claude processes are running.`;
    }
}
