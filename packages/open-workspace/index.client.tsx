import type { PluginClientContext } from '@getpaseo/plugin/client';

import { OpenDesignCommand, PICKER_SCREEN_ID } from './client/openDesignCommand';
import { PickerScreen } from './client/pickerScreen';
import { RepoCommands } from './client/repoCommands';

/** Client entry: the workspace Command Center items and the design picker for several designs. */
export default function contribute(
    client: Pick<PluginClientContext, 'addScreen' | 'addCommandCenterItem'>,
): () => void {
    const removers = [
        ...RepoCommands.map(command => client.addCommandCenterItem(command)),
        client.addScreen({ id: PICKER_SCREEN_ID, title: 'Open Design in Pen', Component: PickerScreen }),
        client.addCommandCenterItem(OpenDesignCommand),
    ];
    return () => {
        for (const remove of removers) {
            void remove();
        }
    };
}
