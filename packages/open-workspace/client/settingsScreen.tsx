import { useSettings } from '@getpaseo/plugin/client';
import { Loading, SettingsAction, SettingsInput, SettingsRow, SettingsSection } from '@getpaseo/plugin/client/ui';
import { useState } from 'react';

import { linearSettings } from '../shared/linear';

/** The plugin settings: the Linear organisation behind "Open in Linear". */
export function SettingsScreen() {
    const settings = useSettings(linearSettings);
    const [workspace, setWorkspace] = useState<string | null>(null);

    if (settings.status === 'loading') {
        return <Loading />;
    }
    if (settings.status !== 'ready') {
        return (
            <SettingsSection title="Linear">
                <SettingsRow
                    label="Settings could not be read"
                    error={settings.error}
                />
            </SettingsSection>
        );
    }

    const { revision, values } = settings;
    const draft = workspace ?? values.workspace;
    return (
        <SettingsSection title="Linear">
            <SettingsInput
                label="Workspace"
                hint="The slug in your Linear URLs: https://linear.app/<workspace>/…"
                placeholder="acme"
                initialValue={values.workspace}
                onChangeText={text => setWorkspace(text.trim().toLowerCase())}
                error={settings.saveError}
            />
            <SettingsAction
                label="Open in Linear uses this workspace"
                actionLabel="Save"
                disabled={settings.saving || draft === values.workspace}
                onPress={() => void settings.save({ workspace: draft }, revision)}
            />
        </SettingsSection>
    );
}
