import { expect, test } from 'bun:test';

import { filterDesigns } from './filterDesigns';

const FILES = ['ui/app/home.pen', 'ui/app/settings.pen', 'marketing/Landing.pen'];

test('an empty or blank query keeps every design', () => {
    expect(filterDesigns(FILES, '')).toEqual(FILES);
    expect(filterDesigns(FILES, '  ')).toEqual(FILES);
});

test('every word must match somewhere in the path, ignoring case', () => {
    expect(filterDesigns(FILES, 'app home')).toEqual(['ui/app/home.pen']);
    expect(filterDesigns(FILES, 'landing')).toEqual(['marketing/Landing.pen']);
    expect(filterDesigns(FILES, 'app landing')).toEqual([]);
});
