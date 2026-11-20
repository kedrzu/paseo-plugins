import { afterEach, expect, test } from 'bun:test';

import type { FooterTraySlot } from './footerTrayRegistry';
import { getFooterTraySlots, removeFooterTraySlot, setFooterTraySlot, subscribeFooterTray } from './footerTrayRegistry';

afterEach(() => {
    globalThis.__paseoPluginsFooterTrayV1 = undefined;
});

test('keeps slots in mount order and replaces a republished slot in place', () => {
    const first = createSlot('first');
    const second = createSlot('second');
    setFooterTraySlot(first);
    setFooterTraySlot(second);
    setFooterTraySlot({ ...first, button: { ...first.button, text: '1 h' } });

    expect(getFooterTraySlots().map(slot => [slot.key.id, slot.button.text])).toEqual([
        ['first', '1 h'],
        ['second', undefined],
    ]);
});

test('hands the row to the next slot when the first unmounts', () => {
    const first = createSlot('first');
    setFooterTraySlot(first);
    setFooterTraySlot(createSlot('second'));
    removeFooterTraySlot(first.key);

    expect(getFooterTraySlots().map(slot => slot.key.id)).toEqual(['second']);
});

// Every item republishes on each notification, so notifying on an equal slot would never settle.
test('notifies only when a slot really changes', () => {
    const slot = createSlot('first');
    let notifications = 0;
    const unsubscribe = subscribeFooterTray(() => notifications++);

    setFooterTraySlot(slot);
    setFooterTraySlot({ ...slot, button: { ...slot.button } });
    removeFooterTraySlot({ id: 'unknown' });
    removeFooterTraySlot(slot.key);
    unsubscribe();
    setFooterTraySlot(slot);

    expect(notifications).toBe(2);
});

test('shares the slots through globalThis, which every plugin bundle sees', () => {
    setFooterTraySlot(createSlot('first'));

    expect(globalThis.__paseoPluginsFooterTrayV1?.slots.map(slot => slot.key.id)).toEqual(['first']);
});

function createSlot(id: string): FooterTraySlot {
    return {
        key: { id },
        button: { icon: 'Coffee', label: id, Popover: () => null },
        openScreen: () => undefined,
    };
}
