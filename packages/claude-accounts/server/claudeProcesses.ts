import type { execCommand } from '@getpaseo/plugin/server';

import { getExitCode } from './getExitCode';

const PGREP_EXIT_CODE_NO_MATCH = 1;

/** The number of running Claude Code processes, which can overwrite a switched token on refresh. */
export async function countClaudeProcesses(exec: typeof execCommand): Promise<number> {
    try {
        const { stdout } = await exec('pgrep', ['-x', 'claude']);
        return stdout.split('\n').filter(line => line.trim() !== '').length;
    } catch (error) {
        if (getExitCode(error) === PGREP_EXIT_CODE_NO_MATCH) {
            return 0;
        }
        throw error;
    }
}
