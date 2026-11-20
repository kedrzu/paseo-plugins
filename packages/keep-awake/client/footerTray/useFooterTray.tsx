import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginOpenScreenInput, PluginPopoverProps, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/ui';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { FooterTrayButton, FooterTraySlot } from './footerTrayRegistry';
import { getFooterTraySlots, removeFooterTraySlot, setFooterTraySlot, subscribeFooterTray } from './footerTrayRegistry';

interface FooterTrayRowProps {
    /** The props of the item that renders the row. */
    item: PluginSidebarItemProps;
    slots: readonly FooterTraySlot[];
}

interface FooterTrayItemButtonProps {
    theme: PluginTheme;
    button: FooterTrayButton;
    onPress: () => void;
}

const ICON_SIZE = 16;

/**
 * Puts this sidebar footer item's button into one row shared with the other plugins that use the
 * tray. Paseo gives each footer item a full-width row of its own and no icon slot, so the first
 * mounted item renders the row for all of them and the others render nothing. Settings still list
 * every item, and hiding one there unmounts it and so drops its button.
 *
 * Copied verbatim into every plugin that uses it, because a plugin cannot import another package;
 * `scripts/footerTray.test.ts` keeps the copies identical.
 *
 * @returns The row when this item renders it, else null.
 */
export function useFooterTray(props: PluginSidebarItemProps, button: FooterTrayButton): ReactElement | null {
    // Random, not a counter: each plugin bundle would have its own counter.
    const [key] = useState(() => ({ id: Math.random().toString(36).slice(2) }));
    const slots = useSyncExternalStore(subscribeFooterTray, getFooterTraySlots);
    const { icon, label, text, Popover } = button;
    // The slot's `openScreen` must keep its identity, or every render would republish the slot.
    const propsRef = useRef(props);
    const [openScreen] = useState(() => (input: PluginOpenScreenInput) => propsRef.current.openScreen(input));

    useEffect(() => {
        propsRef.current = props;
    });
    useEffect(() => {
        setFooterTraySlot({ key, button: { icon, label, text, Popover }, openScreen });
    }, [key, icon, label, text, Popover, openScreen]);
    useEffect(() => () => removeFooterTraySlot(key), [key]);

    if (slots[0]?.key !== key) {
        return null;
    }
    return (
        <FooterTrayRow
            item={props}
            slots={slots}
        />
    );
}

function FooterTrayRow({ item, slots }: FooterTrayRowProps) {
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {slots.map(slot => (
                <FooterTrayItemButton
                    key={slot.key.id}
                    theme={item.theme}
                    button={slot.button}
                    onPress={() => item.openPopover(createSlotPopover(slot))}
                />
            ))}
        </View>
    );
}

function FooterTrayItemButton({ theme, button, onPress }: FooterTrayItemButtonProps) {
    const [hovered, setHovered] = useState(false);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={button.label}
            onPress={onPress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: hovered ? theme.colors.surface2 : 'transparent',
            }}
        >
            <Icon
                icon={button.icon}
                size={ICON_SIZE}
                color={theme.colors.foregroundMuted}
            />
            {button.text !== undefined && (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{button.text}</Text>
            )}
        </Pressable>
    );
}

/** The popover opens through the row owner's item, but must open screens of the slot's own plugin. */
function createSlotPopover(slot: FooterTraySlot) {
    const { Popover } = slot.button;
    return function FooterTraySlotPopover(props: PluginPopoverProps) {
        return (
            <Popover
                {...props}
                openScreen={slot.openScreen}
            />
        );
    };
}
