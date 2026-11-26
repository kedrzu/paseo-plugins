import type { PluginClientContext } from '@getpaseo/plugin/client';

import { OpenDesignCommand, PICKER_SCREEN_ID } from './client/openDesignCommand';
import { PickerScreen } from './client/pickerScreen';
import { RepoCommands } from './client/repoCommands';
import { SettingsScreen } from './client/settingsScreen';

/** Client entry: the workspace Command Center items, the design picker for several designs and the settings. */
export default function contribute(
    client: Pick<PluginClientContext, 'addScreen' | 'addCommandCenterItem' | 'addSettingsScreen'>,
): () => void {
    const removers = [
        ...RepoCommands.map(command => client.addCommandCenterItem(command)),
        client.addScreen({ id: PICKER_SCREEN_ID, title: 'Open Design in Pen', Component: PickerScreen }),
        client.addCommandCenterItem(OpenDesignCommand),
        client.addSettingsScreen({
            id: 'settings',
            title: 'Open Workspace',
            icon: 'Settings',
            Component: SettingsScreen,
        }),
    ];
    return () => {
        for (const remove of removers) {
            void remove();
        }
    };
}
