import { Disposable } from 'vscode';
import { PythonEnvironmentApi } from '../../api';
import { traceInfo } from '../../common/logging';
import { getPythonApi } from '../../features/pythonApi';
import { PythonProjectManager } from '../../internal.api';
import { NativePythonFinder } from '../common/nativePythonFinder';
import { notifyMissingManagerIfDefault } from '../common/utils';
import { PipenvManager } from './pipenvManager';
import { getPipenv } from './pipenvUtils';

export async function registerPipenvFeatures(
    nativeFinder: NativePythonFinder,
    disposables: Disposable[],
    projectManager: PythonProjectManager,
): Promise<void> {
    const api: PythonEnvironmentApi = await getPythonApi();

    try {
        const pipenvPath = await getPipenv(nativeFinder);
        if (pipenvPath) {
            traceInfo(`Pipenv found at ${pipenvPath}`);
            const envManager = new PipenvManager(nativeFinder, api);
            disposables.push(envManager, api.registerEnvironmentManager(envManager));
        } else {
            traceInfo('Pipenv not found, turning off pipenv features.');
            await notifyMissingManagerIfDefault('ms-python.python:pipenv', projectManager, api);
        }
    } catch (ex) {
        traceInfo('Pipenv not found, turning off pipenv features.', ex);
        await notifyMissingManagerIfDefault('ms-python.python:pipenv', projectManager, api);
    }
}
