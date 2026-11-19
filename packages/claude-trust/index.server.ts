import { homedir } from 'node:os';
import { join } from 'node:path';

import type { PluginServerContext } from '@getpaseo/plugin/server';

import { createTrust } from './server/trust';

/** Server entry: trusts each new worktree as Paseo cuts it, and on load every one cut before. */
export default function contribute(server: PluginServerContext): () => void {
    const trust = createTrust({
        claudeJsonPath: join(homedir(), '.claude.json'),
        worktreesDir: join(process.env.PASEO_HOME ?? join(homedir(), '.paseo'), 'worktrees'),
        log: console.warn,
    });

    void trustExistingWorktrees();

    return server.addHook('worktree.create.after', async ({ worktree }) => {
        try {
            await trust.trust([worktree.path]);
        } catch (error) {
            // A failure here must not fail the worktree: Claude Code would only ask once more.
            console.warn(`Could not trust ${worktree.path}:`, error);
        }
    });

    async function trustExistingWorktrees(): Promise<void> {
        try {
            const added = await trust.trustExistingWorktrees();
            if (added.length > 0) {
                console.warn(`Trusted ${added.length} existing worktree(s) in Claude Code`);
            }
        } catch (error) {
            console.warn('Could not trust the existing worktrees:', error);
        }
    }
}
