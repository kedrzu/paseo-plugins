import type { PluginWorkspaceCommandContext } from '@getpaseo/plugin/client';

import { designsListRpc, designsOpenRpc } from '../shared/designs';

/** The screen that lists the designs when a workspace has more than one. */
export const PICKER_SCREEN_ID = 'pick';

/** The params the picker screen is opened with. */
export interface PickerScreenParams extends Record<string, string> {
    workspaceId: string;
    directory: string;
}

/** The part of a Command Center item this plugin uses; assignable to the host's contribution. */
export interface OpenDesignCommandItem {
    id: string;
    title: string;
    icon: string;
    keywords: readonly string[];
    context: 'workspace';
    onSelect(context: Pick<PluginWorkspaceCommandContext, 'rpc' | 'openScreen' | 'workspace'>): Promise<void>;
}

/**
 * "Open Design in Pen": one design opens straight away, several open the picker screen, which stands
 * in for a submenu the Command Center does not have.
 */
export const OpenDesignCommand: OpenDesignCommandItem = {
    id: 'open-design',
    title: 'Open Design in Pen',
    icon: 'PenTool',
    keywords: ['pen', 'pencil', 'design'],
    context: 'workspace',
    async onSelect({ rpc, openScreen, workspace }) {
        const { directory } = workspace;
        const { files } = await rpc(designsListRpc, { directory });
        const [first] = files;
        if (first === undefined) {
            // Thrown on purpose: the host shows the message.
            throw new Error('No .pen design files in this workspace.');
        }
        if (files.length === 1) {
            await rpc(designsOpenRpc, { directory, path: first });
            return;
        }
        const params: PickerScreenParams = { workspaceId: workspace.id, directory };
        openScreen({ screenId: PICKER_SCREEN_ID, params });
    },
};
