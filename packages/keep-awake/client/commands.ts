import type { PluginCommandCenterItemContribution } from '@getpaseo/plugin/client';

import type { KeepAwakeStore } from './store';

/** The extensions the popover and Command Center offer, in minutes. */
export const EXTEND_OPTIONS = [
    { minutes: 30, label: '+30 min' },
    { minutes: 60, label: '+1 h' },
    { minutes: 120, label: '+2 h' },
    { minutes: 240, label: '+4 h' },
] as const;

/** Global Command Center items. A failing `onSelect` throws on purpose: the host shows the message. */
export function createKeepAwakeCommands(store: KeepAwakeStore): PluginCommandCenterItemContribution[] {
    return [
        ...EXTEND_OPTIONS.map(({ minutes, label }): PluginCommandCenterItemContribution => ({
            id: `extend-${minutes}`,
            title: `Keep Mac awake ${label}`,
            icon: 'Coffee',
            keywords: ['caffeinate', 'awake', 'sleep', 'extend', 'vorssaint'],
            context: 'global',
            onSelect: () => store.extend(minutes),
        })),
        {
            id: 'stop',
            title: 'Let Mac sleep',
            icon: 'Moon',
            keywords: ['caffeinate', 'awake', 'sleep', 'stop'],
            context: 'global',
            onSelect: () => store.stop(),
        },
    ];
}
