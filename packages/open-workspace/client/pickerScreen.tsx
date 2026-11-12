import type { PluginHostProps, PluginScreenProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { FlatList, Icon, Loading, TextInput, useToast } from '@getpaseo/plugin/client/ui';
import { useEffect, useRef, useState } from 'react';
import type { FlatList as NativeFlatList, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { designsListRpc, designsOpenRpc } from '../shared/designs';
import { filterDesigns } from './filterDesigns';

interface DesignListProps extends Pick<PluginHostProps, 'theme'> {
    directory: string;
    onClose: () => void;
}

interface DesignPickerProps extends DesignListProps {
    files: string[];
}

interface DesignRowProps extends Pick<PluginHostProps, 'theme'> {
    path: string;
    selected: boolean;
    disabled: boolean;
    onPress: () => void;
}

type ListState = { step: 'loading' } | { step: 'failed'; message: string } | { step: 'ready'; files: string[] };

/**
 * The designs of one workspace, by path relative to it. Driven from the keyboard like the Command
 * Center it is opened from: typing filters, ↑/↓ select, Enter opens in Pen, Escape goes back.
 */
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
                    onClose={() => {
                        if (workspaceId !== undefined) {
                            navigation?.openWorkspace({ workspaceId });
                        }
                    }}
                />
            )}
        </View>
    );
}

function DesignList({ theme, directory, onClose }: DesignListProps) {
    const listDesigns = useRpc(designsListRpc);
    const [state, setState] = useState<ListState>({ step: 'loading' });

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
        <DesignPicker
            theme={theme}
            directory={directory}
            files={state.files}
            onClose={onClose}
        />
    );
}

function DesignPicker({ theme, directory, files, onClose }: DesignPickerProps) {
    const openDesign = useRpc(designsOpenRpc);
    const toast = useToast();
    const list = useRef<NativeFlatList<string>>(null);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [opening, setOpening] = useState(false);
    const visible = filterDesigns(files, query);

    useEffect(() => {
        if (selectedIndex < visible.length) {
            list.current?.scrollToIndex({ index: selectedIndex, viewPosition: 0.5, animated: false });
        }
    }, [selectedIndex]);

    return (
        <View style={{ flex: 1, gap: 12 }}>
            <TextInput
                autoFocus
                value={query}
                placeholder="Filter designs"
                placeholderTextColor={theme.colors.foregroundMuted}
                onChangeText={text => {
                    setQuery(text);
                    setSelectedIndex(0);
                }}
                onKeyPress={handleKeyPress}
                style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface1,
                    color: theme.colors.foreground,
                }}
            />
            {visible.length === 0 ? (
                <Text style={{ color: theme.colors.foregroundMuted }}>No design matches “{query}”.</Text>
            ) : (
                <FlatList
                    ref={list}
                    data={visible}
                    keyExtractor={path => path}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 4 }}
                    // The rows are measured lazily, so a jump past the rendered ones is skipped.
                    onScrollToIndexFailed={() => undefined}
                    renderItem={({ item, index }) => (
                        <DesignRow
                            theme={theme}
                            path={item}
                            selected={index === selectedIndex}
                            disabled={opening}
                            onPress={() => void open(item)}
                        />
                    )}
                />
            )}
        </View>
    );

    function handleKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>): void {
        switch (event.nativeEvent.key) {
            case 'ArrowDown':
                event.preventDefault();
                moveSelection(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveSelection(-1);
                break;
            case 'Enter': {
                // Prevented so the input neither submits nor blurs.
                event.preventDefault();
                const path = visible[selectedIndex];
                if (path !== undefined && !opening) {
                    void open(path);
                }
                break;
            }
            case 'Escape':
                event.preventDefault();
                onClose();
                break;
        }
    }

    function moveSelection(step: number): void {
        if (visible.length > 0) {
            setSelectedIndex((selectedIndex + step + visible.length) % visible.length);
        }
    }

    async function open(path: string): Promise<void> {
        setOpening(true);
        try {
            await openDesign({ directory, path });
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setOpening(false);
        }
    }
}

function DesignRow({ theme, path, selected, disabled, onPress }: DesignRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: selected ? theme.colors.accent : pressed ? theme.colors.border : theme.colors.surface2,
                opacity: disabled ? 0.5 : 1,
            })}
        >
            <Icon
                name="PenTool"
                size={16}
                color={selected ? theme.colors.accentForeground : theme.colors.foregroundMuted}
            />
            <Text style={{ color: selected ? theme.colors.accentForeground : theme.colors.foreground }}>{path}</Text>
        </Pressable>
    );
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
