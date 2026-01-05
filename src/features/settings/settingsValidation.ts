// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { commands, ConfigurationTarget, l10n, Uri, workspace } from 'vscode';
import { traceError, traceWarn } from '../../common/logging';
import { getGlobalPersistentState } from '../../common/persistentState';
import { showWarningMessage } from '../../common/window.apis';
import { getConfiguration, getWorkspaceFolders } from '../../common/workspace.apis';
import { PythonProjectSettings } from '../../internal.api';

const DONT_SHOW_INVALID_SETTINGS_KEY = 'dontShowInvalidPythonProjectSettings';

interface InvalidProjectEntry {
    entry: PythonProjectSettings;
    workspaceUri: Uri;
    reason: string;
}

/**
 * Validates a single PythonProjectSettings entry
 * @param entry The settings entry to validate
 * @returns An error message if invalid, undefined if valid
 */
function validateProjectEntry(entry: PythonProjectSettings): string | undefined {
    // Check if entry is a valid object (not a string, array, null, or other primitive)
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return l10n.t('Invalid entry format: expected object');
    }

    // Check if required fields exist
    if (!entry.path) {
        return l10n.t('Missing required field: path');
    }

    if (!entry.envManager) {
        return l10n.t('Missing required field: envManager');
    }

    if (!entry.packageManager) {
        return l10n.t('Missing required field: packageManager');
    }

    return undefined;
}

/**
 * Validates all pythonProjects settings across all workspaces
 * @returns Array of invalid entries with their details
 */
export function validatePythonProjectsSettings(): InvalidProjectEntry[] {
    const invalidEntries: InvalidProjectEntry[] = [];
    const workspaces = getWorkspaceFolders() ?? [];

    for (const workspace of workspaces) {
        const config = getConfiguration('python-envs', workspace.uri);
        const projectSettings = config.get<PythonProjectSettings[]>('pythonProjects', []);

        // Check if the setting is valid (should be an array)
        if (!Array.isArray(projectSettings)) {
            traceError(
                `Invalid pythonProjects setting in workspace ${workspace.name}: expected array, got ${typeof projectSettings}`,
            );
            invalidEntries.push({
                entry: projectSettings as unknown as PythonProjectSettings,
                workspaceUri: workspace.uri,
                reason: l10n.t('Invalid format: pythonProjects must be an array'),
            });
            continue;
        }

        // Validate each entry
        for (const entry of projectSettings) {
            const error = validateProjectEntry(entry);
            if (error) {
                traceWarn(`Invalid pythonProjects entry in workspace ${workspace.name}:`, entry, error);
                invalidEntries.push({
                    entry,
                    workspaceUri: workspace.uri,
                    reason: error,
                });
            }
        }
    }

    return invalidEntries;
}

/**
 * Shows a warning notification about invalid pythonProjects settings
 * Provides options to remove the invalid entry, open settings, or don't show again
 * @param invalidEntries Array of invalid entries found
 */
export async function notifyInvalidPythonProjectsSettings(invalidEntries: InvalidProjectEntry[]): Promise<void> {
    if (invalidEntries.length === 0) {
        return;
    }

    // Check if user has chosen to not show this warning again
    const persistentState = await getGlobalPersistentState();
    const dontShowAgain = await persistentState.get<boolean>(DONT_SHOW_INVALID_SETTINGS_KEY, false);

    if (dontShowAgain) {
        traceWarn('Not showing invalid pythonProjects settings warning due to user preference');
        return;
    }

    // Create a descriptive message
    const count = invalidEntries.length;
    const message =
        count === 1
            ? l10n.t(
                  'Found an invalid entry in python-envs.pythonProjects settings. This may cause issues with project detection.',
              )
            : l10n.t(
                  'Found {0} invalid entries in python-envs.pythonProjects settings. This may cause issues with project detection.',
                  count,
              );

    // Show warning with options
    const removeOption = l10n.t('Remove Invalid Entry');
    const openSettingsOption = l10n.t('Open Settings');
    const dontShowOption = l10n.t("Don't Show Again");

    const choice = await showWarningMessage(message, removeOption, openSettingsOption, dontShowOption);

    if (choice === removeOption) {
        // Remove the first invalid entry (or all if multiple)
        try {
            // Group by workspace to batch updates
            const byWorkspace = new Map<string, InvalidProjectEntry[]>();
            for (const invalid of invalidEntries) {
                const key = invalid.workspaceUri.toString();
                if (!byWorkspace.has(key)) {
                    byWorkspace.set(key, []);
                }
                byWorkspace.get(key)!.push(invalid);
            }

            // Remove invalid entries from each workspace
            for (const [workspaceKey, entries] of byWorkspace) {
                const workspaceUri = Uri.parse(workspaceKey);
                const config = getConfiguration('python-envs', workspaceUri);
                let projectSettings = config.get<PythonProjectSettings[]>('pythonProjects', []);

                if (!Array.isArray(projectSettings)) {
                    await config.update('pythonProjects', [], ConfigurationTarget.Workspace);
                    continue;
                }

                // Filter out all invalid entries
                const invalidJsonStrings = new Set(entries.map((e) => JSON.stringify(e.entry)));
                projectSettings = projectSettings.filter((e) => !invalidJsonStrings.has(JSON.stringify(e)));

                await config.update('pythonProjects', projectSettings, ConfigurationTarget.Workspace);
            }

            traceWarn(`Removed ${invalidEntries.length} invalid pythonProjects entries`);
        } catch (error) {
            traceError('Failed to remove invalid entries:', error);
            await showWarningMessage(l10n.t('Failed to remove invalid entries. Please check the logs for details.'));
        }
    } else if (choice === openSettingsOption) {
        // Open settings UI to the pythonProjects setting
        await commands.executeCommand('workbench.action.openSettings', '@ext:ms-python.vscode-python-envs pythonProjects');
    } else if (choice === dontShowOption) {
        // Save preference to not show again
        await persistentState.set(DONT_SHOW_INVALID_SETTINGS_KEY, true);
        traceWarn('User chose to not show invalid pythonProjects settings warning again');
    }
}

/**
 * Validates pythonProjects settings and shows a notification if invalid entries are found
 * Should be called when the extension initializes or when settings change
 */
export async function validateAndNotifyPythonProjectsSettings(): Promise<void> {
    try {
        const invalidEntries = validatePythonProjectsSettings();
        if (invalidEntries.length > 0) {
            await notifyInvalidPythonProjectsSettings(invalidEntries);
        }
    } catch (error) {
        traceError('Error validating pythonProjects settings:', error);
    }
}
