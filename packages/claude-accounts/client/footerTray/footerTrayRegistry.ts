import type { PluginIcon, PluginPopoverProps, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import type { ComponentType } from 'react';

/** One plugin item's button in the shared footer row. */
export interface FooterTrayButton {
    icon: PluginIcon;
    /** Accessibility label. */
    label: string;
    /** Short text beside the icon, such as the time left. */
    text?: string;
    /** The popover the button opens. Keep its identity stable: a new one republishes the button. */
    Popover: ComponentType<PluginPopoverProps>;
}

/** Compared by identity; `id` is unique across plugins, for React keys. */
export interface FooterTrayKey {
    readonly id: string;
}

/** A mounted sidebar item's entry in the tray. */
export interface FooterTraySlot {
    /** Identifies the mounted item; stable for its lifetime. */
    key: FooterTrayKey;
    button: FooterTrayButton;
    /** The publishing item's own `openScreen`, so its popover opens its own plugin's screens. */
    openScreen: PluginSidebarItemProps['openScreen'];
}

interface FooterTrayState {
    /** In mount order; the first slot's item renders the row. Replaced, never mutated. */
    slots: readonly FooterTraySlot[];
    listeners: Set<() => void>;
}

declare global {
    /**
     * Shared by every plugin bundled with this folder: Paseo evaluates plugin bundles in one realm,
     * which is the only channel between plugins. The suffix is the state's shape version; bump it on
     * any change to `FooterTrayState` or `FooterTraySlot`, so that plugins built from different
     * versions keep separate rows instead of misreading each other.
     */
    var __paseoPluginsFooterTrayV1: FooterTrayState | undefined;
}

/** For `useSyncExternalStore`. */
export function subscribeFooterTray(listener: () => void): () => void {
    const state = getState();
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

/**
 * The slots in mount order. Stable between changes, as `useSyncExternalStore` requires.
 * @__NO_SIDE_EFFECTS__
 */
export function getFooterTraySlots(): readonly FooterTraySlot[] {
    return getState().slots;
}

/**
 * Adds the slot, or replaces the one with its key in place. Notifies only on a real change: every
 * item re-renders on a notification and republishes, so notifying on an equal slot would loop.
 */
export function setFooterTraySlot(slot: FooterTraySlot): void {
    const state = getState();
    const index = state.slots.findIndex(existing => existing.key === slot.key);
    if (index === -1) {
        state.slots = [...state.slots, slot];
    } else {
        if (isSameSlot(state.slots[index], slot)) {
            return;
        }
        state.slots = state.slots.map(existing => (existing.key === slot.key ? slot : existing));
    }
    notify(state);
}

/** Removes the slot with this key, if any. */
export function removeFooterTraySlot(key: FooterTrayKey): void {
    const state = getState();
    const slots = state.slots.filter(slot => slot.key !== key);
    if (slots.length === state.slots.length) {
        return;
    }
    state.slots = slots;
    notify(state);
}

function getState(): FooterTrayState {
    globalThis.__paseoPluginsFooterTrayV1 ??= { slots: [], listeners: new Set() };
    return globalThis.__paseoPluginsFooterTrayV1;
}

function notify(state: FooterTrayState): void {
    for (const listener of state.listeners) {
        listener();
    }
}

function isSameSlot(a: FooterTraySlot | undefined, b: FooterTraySlot): boolean {
    return (
        a !== undefined &&
        a.openScreen === b.openScreen &&
        a.button.icon === b.button.icon &&
        a.button.label === b.button.label &&
        a.button.text === b.button.text &&
        a.button.Popover === b.button.Popover
    );
}
