/**
 * Blocks until the Paseo workspace setup of the calling agent finishes. Run by `bin/claude` before
 * it execs the real Claude Code. Always exits 0: any failure to check means "start now", so the
 * wrapper can never keep an agent from starting.
 */
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { connectToDaemon } from './connectToDaemon.js';
import { waitForSetup } from './waitForSetup.js';

// Paseo starts setup right after creating the worktree; an agent older than this is a resume.
const FRESH_AGENT_MS = 60 * 1000;

await main();
process.exit(0);

async function main() {
    const agentId = process.env.PASEO_AGENT_ID;
    if (!agentId) {
        return;
    }

    try {
        const client = await connectToDaemon(process.env.PASEO_HOME ?? join(homedir(), '.paseo'));
        try {
            const fetched = await client.fetchAgent(agentId);
            const workspaceId = fetched?.agent.workspaceId;
            if (!fetched || !workspaceId) {
                return;
            }

            const startedAt = Date.now();
            const outcome = await waitForSetup({
                readStatus: async () => (await client.fetchWorkspaceSetupStatus(workspaceId)).snapshot?.status ?? null,
                mayBeStarting:
                    startedAt - Date.parse(fetched.agent.createdAt) < FRESH_AGENT_MS &&
                    (await isLinkedWorktree(fetched.agent.cwd)),
                log,
            });
            const seconds = Math.round((Date.now() - startedAt) / 1000);

            switch (outcome) {
                case 'no-setup':
                case 'blocked':
                    break;
                case 'completed':
                    log(`workspace setup completed after ${seconds}s, starting`);
                    break;
                case 'failed':
                    log(`workspace setup FAILED after ${seconds}s, starting anyway`);
                    break;
                case 'timed-out':
                    log(`workspace setup still running after ${seconds}s, starting anyway`);
                    break;
            }
        } finally {
            await client.close();
        }
    } catch (error) {
        log(`could not check workspace setup, starting now: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** A linked git worktree has a `.git` file pointing at the main repository, not a `.git` directory. */
async function isLinkedWorktree(cwd: string) {
    for (let dir = cwd; ; dir = dirname(dir)) {
        const git = await stat(join(dir, '.git')).catch(() => null);
        if (git) {
            return git.isFile();
        }
        if (dirname(dir) === dir) {
            return false;
        }
    }
}

function log(message: string) {
    process.stderr.write(`[wait-for-setup] ${message}\n`);
}
