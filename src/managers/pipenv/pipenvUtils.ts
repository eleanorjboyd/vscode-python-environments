import * as fs from 'fs-extra';
import * as path from 'path';
import which from 'which';
import { ENVS_EXTENSION_ID } from '../../common/constants';
import { traceError, traceInfo } from '../../common/logging';
import { getWorkspacePersistentState } from '../../common/persistentState';
import { getUserHomeDir, untildify } from '../../common/utils/pathUtils';
import { isWindows } from '../../common/utils/platformUtils';
import { isNativeEnvInfo, NativeEnvManagerInfo, NativePythonFinder } from '../common/nativePythonFinder';

export const PIPENV_PATH_KEY = `${ENVS_EXTENSION_ID}:pipenv:PIPENV_PATH`;

let pipenvPath: string | undefined;
export async function clearPipenvCache(): Promise<void> {
    pipenvPath = undefined;
}

async function setPipenv(pipenv: string): Promise<void> {
    pipenvPath = pipenv;
    const state = await getWorkspacePersistentState();
    await state.set(PIPENV_PATH_KEY, pipenv);
}

async function findPipenv(): Promise<string | undefined> {
    try {
        return await which(isWindows() ? 'pipenv.exe' : 'pipenv');
    } catch {
        return undefined;
    }
}

export async function getPipenv(native?: NativePythonFinder): Promise<string | undefined> {
    if (pipenvPath) {
        return pipenvPath;
    }

    const state = await getWorkspacePersistentState();
    pipenvPath = await state.get<string>(PIPENV_PATH_KEY);
    if (pipenvPath) {
        traceInfo(`Using pipenv from persistent state: ${pipenvPath}`);
        return untildify(pipenvPath);
    }

    // Check common user install locations
    const home = getUserHomeDir();
    if (home) {
        const candidate = path.join(
            home,
            isWindows() ? 'AppData\\Roaming\\Python\\Scripts\\pipenv.exe' : '.local/bin/pipenv',
        );
        if (await fs.exists(candidate)) {
            pipenvPath = candidate;
            await setPipenv(pipenvPath);
            return pipenvPath;
        }
    }

    // Check PATH
    const found = await findPipenv();
    if (found) {
        await setPipenv(found);
        return found;
    }

    // Ask native finder
    if (native) {
        try {
            const data = await native.refresh(false);
            const managers = data
                .filter((e) => !isNativeEnvInfo(e))
                .map((e) => e as NativeEnvManagerInfo)
                .filter((m) => m.tool && String(m.tool).toLowerCase() === 'pipenv');
            if (managers.length > 0) {
                const p = managers[0].executable;
                traceInfo(`Using pipenv from native finder: ${p}`);
                await setPipenv(p);
                return p;
            }
        } catch (e) {
            traceError(`Error checking native finder for pipenv: ${e}`);
        }
    }

    return undefined;
}
