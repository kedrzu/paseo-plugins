import type { PluginHostProps, PluginScreenProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { Icon, Loading, ScrollView, useToast } from '@getpaseo/plugin/client/ui';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { designsListRpc, designsOpenRpc } from '../shared/designs';

interface DesignListProps extends Pick<PluginHostProps, 'theme'> {
    directory: string;
    onOpened: () => void;
}

interface DesignRowProps extends Pick<PluginHostProps, 'theme'> {
    path: string;
    disabled: boolean;
    onPress: () => void;
}

type ListState = { step: 'loading' } | { step: 'failed'; message: string } | { step: 'ready'; files: string[] };

/** The designs of one workspace, by path relative to it; a press opens one in Pen. */
export function PickerScreen({ theme, layout, params, navigation }: PluginScreenProps) {
    // Params are absent at runtime when the screen is opened by a link without them.
    const directory: string | undefined = params.directory;
    const workspaceId: string | undefined = params.workspaceId;

    return (
        <View
            style={{
                flex: 1,
                gap: 16,
                padding: layout.compact ? 16 : 24,
                backgroundColor: theme.colors.surface0,
            }}
        >
            {directory === undefined ? (
                <Text style={{ color: theme.colors.foreground }}>No workspace selected.</Text>
            ) : (
                <DesignList
                    // Opening the screen for another workspace reuses the component: the key reloads.
                    key={directory}
                    theme={theme}
                    directory={directory}
                    onOpened={() => {
                        if (workspaceId !== undefined) {
                            navigation?.openWorkspace({ workspaceId });
                        }
                    }}
                />
            )}
        </View>
    );
}

function DesignList({ theme, directory, onOpened }: DesignListProps) {
    const listDesigns = useRpc(designsListRpc);
    const openDesign = useRpc(designsOpenRpc);
    const toast = useToast();
    const [state, setState] = useState<ListState>({ step: 'loading' });
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        let current = true;
        void load();
        return () => {
            current = false;
        };

        async function load(): Promise<void> {
            try {
                const { files } = await listDesigns({ directory });
                if (current) {
                    setState({ step: 'ready', files });
                }
            } catch (error) {
                if (current) {
                    setState({ step: 'failed', message: getErrorMessage(error) });
                }
            }
        }
    }, [directory]);

    if (state.step === 'loading') {
        return <Loading />;
    }
    if (state.step === 'failed') {
        return <Text style={{ color: theme.colors.statusDanger }}>{state.message}</Text>;
    }
    if (state.files.length === 0) {
        return <Text style={{ color: theme.colors.foreground }}>No .pen design files in this workspace.</Text>;
    }
    return (
        <ScrollView contentContainerStyle={{ gap: 4 }}>
            {state.files.map(path => (
                <DesignRow
                    key={path}
                    theme={theme}
                    path={path}
                    disabled={opening}
                    onPress={() => void open(path)}
                />
            ))}
        </ScrollView>
    );

    async function open(path: string): Promise<void> {
        setOpening(true);
        try {
            await openDesign({ directory, path });
            onOpened();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setOpening(false);
        }
    }
}

function DesignRow({ theme, path, disabled, onPress }: DesignRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: pressed ? theme.colors.border : theme.colors.surface2,
                opacity: disabled ? 0.5 : 1,
            })}
        >
            <Icon
                name="PenTool"
                size={16}
                color={theme.colors.foregroundMuted}
            />
            <Text style={{ color: theme.colors.foreground }}>{path}</Text>
        </Pressable>
    );
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
