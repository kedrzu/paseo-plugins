import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';

const PACKAGES = path.join(import.meta.dir, '../packages');

/** Where each plugin keeps its copy of the shared footer tray. */
const TRAY_DIR = 'client/footerTray';

// A plugin cannot import another package, so each one carries a copy. Plugins share the tray's
// state at runtime, and copies that differ would disagree on what that state means.
test('every copy of the footer tray is identical', () => {
    const copies = readdirSync(PACKAGES)
        .map(name => path.join(PACKAGES, name, TRAY_DIR))
        .filter(dir => existsSync(dir))
        .map(readCopy);
    expect(copies.length).toBeGreaterThan(1);

    for (const copy of copies.slice(1)) {
        expect({ dir: copy.dir, files: copy.files }).toEqual({ dir: copy.dir, files: copies[0]!.files });
    }
});

function readCopy(dir: string) {
    const files: Record<string, string> = {};
    for (const file of readdirSync(dir).toSorted()) {
        files[file] = readFileSync(path.join(dir, file), 'utf8');
    }
    return { dir, files };
}
