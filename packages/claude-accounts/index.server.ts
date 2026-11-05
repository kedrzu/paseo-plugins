import { homedir } from 'node:os';
import { join } from 'node:path';

import type { PluginServerContext } from '@getpaseo/plugin/server';
import { execCommand } from '@getpaseo/plugin/server';

import { createAccounts } from './server/accounts';
import { countClaudeProcesses } from './server/claudeProcesses';
import { createKeychain } from './server/keychain';
import { createFetchTokenOwner } from './server/tokenOwner';
import { accountsSaveRpc, accountsStatusRpc, accountsSwitchRpc } from './shared/accounts';

/** Server entry: the only place the account logic meets the real Keychain, files and network. */
export default function contribute(server: PluginServerContext): () => void {
    const accounts = createAccounts({
        keychain: createKeychain(execCommand),
        claudeJsonPath: join(homedir(), '.claude.json'),
        storeDir: process.env.CLAUDE_ACCOUNTS_DIR ?? join(homedir(), '.claude-accounts'),
        fetchTokenOwner: createFetchTokenOwner({ fetch: globalThis.fetch, log: console.warn }),
        countClaudeProcesses: () => countClaudeProcesses(execCommand),
        log: console.warn,
    });

    server.handle(accountsStatusRpc, () => accounts.status());
    server.handle(accountsSaveRpc, () => accounts.save());
    server.handle(accountsSwitchRpc, input => accounts.switch(input));

    return () => {};
}
