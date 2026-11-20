import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginPopoverProps, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { SidebarRow } from '@getpaseo/plugin/client/ui';
import type { ComponentType } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EXTEND_OPTIONS } from './commands';
import { formatKeepAwake } from './formatKeepAwake';
import type { KeepAwakeStore } from './store';

interface ActionButtonProps {
    theme: PluginTheme;
    label: string;
    disabled: boolean;
    onPress: () => void;
}

/** The label ticks this often, so the remaining time stays current without asking the daemon. */
const TICK_MS = 30_000;

/** The footer row and its popover; created per store, which the host's props cannot carry. */
export function createKeepAwakeSidebarItem(store: KeepAwakeStore): ComponentType<PluginSidebarItemProps> {
    return KeepAwakeSidebarItem;

    function KeepAwakeSidebarItem(props: PluginSidebarItemProps) {
        const { endsAt } = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const now = useNow();
        const active = endsAt != null && endsAt > now;
        return (
            <SidebarRow
                icon={active ? 'Coffee' : 'Moon'}
                label={endsAt === undefined ? 'Keep awake' : formatKeepAwake(endsAt, now)}
                onPress={() => {
                    props.openPopover(KeepAwakePopover);
                    void store.refresh();
                }}
            />
        );
    }

    function KeepAwakePopover({ theme }: PluginPopoverProps) {
        const { endsAt, loadError } = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const now = useNow();
        const [pending, setPending] = useState(false);
        const [actionError, setActionError] = useState<string | null>(null);
        const active = endsAt != null && endsAt > now;
        const error = actionError ?? loadError;

        // The host pads the popover already.
        return (
            <View style={{ gap: 8, minWidth: 260 }}>
                <Text style={{ color: theme.colors.foreground }}>
                    {endsAt === undefined ? 'Loading…' : formatKeepAwake(endsAt, now)}
                </Text>
                {error !== null && <Text style={{ color: theme.colors.statusDanger }}>{error}</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {EXTEND_OPTIONS.map(({ minutes, label }) => (
                        <ActionButton
                            key={minutes}
                            theme={theme}
                            label={label}
                            disabled={pending}
                            onPress={() => void runAction(() => store.extend(minutes))}
                        />
                    ))}
                    {active && (
                        <ActionButton
                            theme={theme}
                            label="Stop"
                            disabled={pending}
                            onPress={() => void runAction(() => store.stop())}
                        />
                    )}
                </View>
            </View>
        );

        async function runAction(action: () => Promise<void>): Promise<void> {
            setPending(true);
            setActionError(null);
            try {
                await action();
            } catch (caught) {
                setActionError(caught instanceof Error ? caught.message : String(caught));
            } finally {
                setPending(false);
            }
        }
    }
}

function ActionButton({ theme, label, disabled, onPress }: ActionButtonProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: theme.colors.surface2,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <Text style={{ color: theme.colors.foreground }}>{label}</Text>
        </Pressable>
    );
}

function useNow(): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, []);
    return now;
}
