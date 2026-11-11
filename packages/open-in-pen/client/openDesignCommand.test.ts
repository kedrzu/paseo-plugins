import { expect, test } from 'bun:test';
import type { input as ZodInput, output as ZodOutput, ZodType } from 'zod';

import type { PluginRpcContract } from '@getpaseo/plugin';
import type { PluginOpenScreenInput, PluginWorkspaceCommandContext } from '@getpaseo/plugin/client';

import { OpenDesignCommand } from './openDesignCommand';

interface RpcCall {
    name: string;
    input: unknown;
}

interface Run {
    calls: RpcCall[];
    openedScreens: PluginOpenScreenInput[];
}

const DIRECTORY = '/repo';

test('one design opens straight away', async () => {
    const run = await select(['ui/app.pen']);

    expect(run.calls).toEqual([
        { name: 'designs.list', input: { directory: DIRECTORY } },
        { name: 'designs.open', input: { directory: DIRECTORY, path: 'ui/app.pen' } },
    ]);
    expect(run.openedScreens).toEqual([]);
});

test('several designs open the picker for the workspace', async () => {
    const run = await select(['a.pen', 'b/b.pen']);

    const expected: PluginOpenScreenInput[] = [
        { screenId: 'pick', params: { workspaceId: 'ws-1', directory: DIRECTORY } },
    ];
    expect(run.openedScreens).toEqual(expected);
    expect(run.calls.map(call => call.name)).toEqual(['designs.list']);
});

test('no design is an error the host shows', async () => {
    await expect(select([])).rejects.toThrow('No .pen design files');
});

async function select(files: string[]): Promise<Run> {
    const run: Run = { calls: [], openedScreens: [] };
    const workspace = { id: 'ws-1', directory: DIRECTORY } as PluginWorkspaceCommandContext['workspace'];
    await OpenDesignCommand.onSelect({
        rpc,
        workspace,
        openScreen: input => {
            run.openedScreens.push(input);
        },
    });
    return run;

    function rpc<Input extends ZodType, Output extends ZodType>(
        contract: PluginRpcContract<Input, Output>,
        input: ZodInput<Input>,
    ): Promise<ZodOutput<Output>> {
        run.calls.push({ name: contract.name, input });
        return Promise.resolve(contract.output.parse(contract.name === 'designs.list' ? { files } : {}));
    }
}
