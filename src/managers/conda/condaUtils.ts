import * as ch from 'child_process';
import {
    EnvironmentManager,
    Package,
    PackageInfo,
    PackageInstallOptions,
    PackageManager,
    PythonEnvironment,
    PythonEnvironmentApi,
    PythonProject,
} from '../../api';
import * as path from 'path';
import * as os from 'os';
import * as fsapi from 'fs-extra';
import { LogOutputChannel, ProgressLocation, Uri, window } from 'vscode';
import { ENVS_EXTENSION_ID } from '../../common/constants';
import { createDeferred } from '../../common/utils/deferred';
import {
    isNativeEnvInfo,
    NativeEnvInfo,
    NativeEnvManagerInfo,
    NativePythonEnvironmentKind,
    NativePythonFinder,
} from '../common/nativePythonFinder';
import { getConfiguration } from '../../common/workspace.apis';
import { getGlobalPersistentState, getWorkspacePersistentState } from '../../common/persistentState';
import which from 'which';
import { shortVersion, sortEnvironments } from '../common/utils';
import { pickProject } from '../../common/pickers/projects';

export const CONDA_PATH_KEY = `${ENVS_EXTENSION_ID}:conda:CONDA_PATH`;
export const CONDA_PREFIXES_KEY = `${ENVS_EXTENSION_ID}:conda:CONDA_PREFIXES`;
export const CONDA_WORKSPACE_KEY = `${ENVS_EXTENSION_ID}:conda:WORKSPACE_SELECTED`;
export const CONDA_GLOBAL_KEY = `${ENVS_EXTENSION_ID}:conda:GLOBAL_SELECTED`;

export async function clearCondaCache(): Promise<void> {
    const state = await getWorkspacePersistentState();
    await state.clear([CONDA_PATH_KEY, CONDA_WORKSPACE_KEY, CONDA_GLOBAL_KEY]);
    const global = await getGlobalPersistentState();
    await global.clear([CONDA_PREFIXES_KEY]);
}

let condaPath: string | undefined;
async function setConda(conda: string): Promise<void> {
    condaPath = conda;
    const state = await getWorkspacePersistentState();
    await state.set(CONDA_PATH_KEY, conda);
}

export function getCondaPathSetting(): string | undefined {
    const config = getConfiguration('python');
    return config.get<string>('condaPath');
}

export async function getCondaForWorkspace(fsPath: string): Promise<string | undefined> {
    const state = await getWorkspacePersistentState();
    const data: { [key: string]: string } | undefined = await state.get(CONDA_WORKSPACE_KEY);
    if (data) {
        try {
            return data[fsPath];
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export async function setCondaForWorkspace(fsPath: string, condaEnvPath: string | undefined): Promise<void> {
    const state = await getWorkspacePersistentState();
    const data: { [key: string]: string } = (await state.get(CONDA_WORKSPACE_KEY)) ?? {};
    if (condaEnvPath) {
        data[fsPath] = condaEnvPath;
    } else {
        delete data[fsPath];
    }
    await state.set(CONDA_WORKSPACE_KEY, data);
}

export async function getCondaForGlobal(): Promise<string | undefined> {
    const state = await getWorkspacePersistentState();
    return await state.get(CONDA_GLOBAL_KEY);
}

export async function setCondaForGlobal(condaEnvPath: string | undefined): Promise<void> {
    const state = await getWorkspacePersistentState();
    await state.set(CONDA_GLOBAL_KEY, condaEnvPath);
}

async function findConda(): Promise<readonly string[] | undefined> {
    try {
        return await which('conda', { all: true });
    } catch {
        return undefined;
    }
}

export async function getConda(): Promise<string> {
    const config = getConfiguration('python');
    const conda = config.get<string>('condaPath');
    if (conda) {
        return conda;
    }

    if (condaPath) {
        return condaPath;
    }

    const state = await getWorkspacePersistentState();
    condaPath = await state.get<string>(CONDA_PATH_KEY);
    if (condaPath) {
        return condaPath;
    }

    const paths = await findConda();
    if (paths && paths.length > 0) {
        condaPath = paths[0];
        await state.set(CONDA_PATH_KEY, condaPath);
        return condaPath;
    }

    throw new Error('Conda not found');
}

async function runConda(args: string[]): Promise<string> {
    const conda = await getConda();

    const deferred = createDeferred<string>();
    const proc = ch.spawn(conda, args, { shell: true });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data) => {
        stdout += data.toString('utf-8');
    });
    proc.stderr?.on('data', (data) => {
        stderr += data.toString('utf-8');
    });
    proc.on('close', () => {
        deferred.resolve(stdout);
    });
    proc.on('exit', (code) => {
        if (code !== 0) {
            deferred.reject(new Error(`Failed to run "conda ${args.join(' ')}":\n ${stderr}`));
        }
    });

    return deferred.promise;
}

async function getCondaInfo(): Promise<any> {
    const raw = await runConda(['info', '--envs', '--json']);
    return JSON.parse(raw);
}

let prefixes: string[] | undefined;
async function getPrefixes(): Promise<string[]> {
    if (prefixes) {
        return prefixes;
    }

    const state = await getGlobalPersistentState();
    prefixes = await state.get<string[]>(CONDA_PREFIXES_KEY);
    if (prefixes) {
        return prefixes;
    }

    const data = await getCondaInfo();
    prefixes = data['envs_dirs'] as string[];
    await state.set(CONDA_PREFIXES_KEY, prefixes);
    return prefixes;
}

async function getVersion(root: string): Promise<string> {
    const files = await fsapi.readdir(path.join(root, 'conda-meta'));
    for (let file of files) {
        if (file.startsWith('python-3') && file.endsWith('.json')) {
            const content = fsapi.readJsonSync(path.join(root, 'conda-meta', file));
            return content['version'] as string;
        }
    }

    throw new Error('Python version not found');
}

function isPrefixOf(roots: string[], e: string): boolean {
    const t = path.normalize(e);
    for (let r of roots.map((r) => path.normalize(r))) {
        if (t.startsWith(r)) {
            return true;
        }
    }
    return false;
}

function nativeToPythonEnv(
    e: NativeEnvInfo,
    api: PythonEnvironmentApi,
    manager: EnvironmentManager,
    log: LogOutputChannel,
    conda: string,
    condaPrefixes: string[],
): PythonEnvironment | undefined {
    if (!(e.prefix && e.executable && e.version)) {
        log.warn(`Invalid conda environment: ${JSON.stringify(e)}`);
        return;
    }
    const sv = shortVersion(e.version);
    if (e.name === 'base') {
        const environment = api.createPythonEnvironmentItem(
            {
                name: 'base',
                environmentPath: Uri.file(e.prefix),
                displayName: `base (${sv})`,
                shortDisplayName: `base:${sv}`,
                displayPath: e.name,
                description: e.prefix,
                version: e.version,
                sysPrefix: e.prefix,
                execInfo: {
                    run: { executable: path.join(e.executable) },
                    activatedRun: { executable: conda, args: ['run', '--live-stream', '--name', 'base', 'python'] },
                    activation: [{ executable: conda, args: ['activate', 'base'] }],
                    deactivation: [{ executable: conda, args: ['deactivate'] }],
                },
            },
            manager,
        );
        log.info(`Found base environment: ${e.prefix}`);
        return environment;
    } else if (!isPrefixOf(condaPrefixes, e.prefix)) {
        const basename = path.basename(e.prefix);
        const environment = api.createPythonEnvironmentItem(
            {
                name: basename,
                environmentPath: Uri.file(e.prefix),
                displayName: `${basename} (${sv})`,
                shortDisplayName: `${basename}:${sv}`,
                displayPath: e.prefix,
                description: e.prefix,
                version: e.version,
                sysPrefix: e.prefix,
                execInfo: {
                    run: { executable: path.join(e.executable) },
                    activatedRun: {
                        executable: conda,
                        args: ['run', '--live-stream', '--prefix', e.prefix, 'python'],
                    },
                    activation: [{ executable: conda, args: ['activate', e.prefix] }],
                    deactivation: [{ executable: conda, args: ['deactivate'] }],
                },
            },
            manager,
        );
        log.info(`Found prefix environment: ${e.prefix}`);
        return environment;
    } else {
        const basename = path.basename(e.prefix);
        const name = e.name ?? basename;
        const environment = api.createPythonEnvironmentItem(
            {
                name: name,
                environmentPath: Uri.file(e.prefix),
                displayName: `${name} (${sv})`,
                shortDisplayName: `${name}:${sv}`,
                displayPath: e.prefix,
                description: e.prefix,
                version: e.version,
                sysPrefix: e.prefix,
                execInfo: {
                    run: { executable: path.join(e.executable) },
                    activatedRun: {
                        executable: conda,
                        args: ['run', '--live-stream', '--name', name, 'python'],
                    },
                    activation: [{ executable: conda, args: ['activate', name] }],
                    deactivation: [{ executable: conda, args: ['deactivate'] }],
                },
            },
            manager,
        );
        log.info(`Found named environment: ${e.prefix}`);
        return environment;
    }
}

export async function resolveCondaPath(
    fsPath: string,
    nativeFinder: NativePythonFinder,
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
): Promise<PythonEnvironment | undefined> {
    try {
        const e = await nativeFinder.resolve(fsPath);
        if (e.kind !== NativePythonEnvironmentKind.conda) {
            return undefined;
        }
        const conda = await getConda();
        const condaPrefixes = await getPrefixes();
        return nativeToPythonEnv(e, api, manager, log, conda, condaPrefixes);
    } catch {
        return undefined;
    }
}

export async function refreshCondaEnvs(
    hardRefresh: boolean,
    nativeFinder: NativePythonFinder,
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
): Promise<PythonEnvironment[]> {
    log.info('Refreshing conda environments');
    const data = await nativeFinder.refresh(hardRefresh);

    let conda: string | undefined = undefined;
    try {
        conda = await getConda();
    } catch {
        conda = undefined;
    }
    if (conda === undefined) {
        const managers = data
            .filter((e) => !isNativeEnvInfo(e))
            .map((e) => e as NativeEnvManagerInfo)
            .filter((e) => e.tool.toLowerCase() === 'conda');
        conda = managers[0].executable;
        await setConda(conda);
    }

    const condaPath = conda;

    if (condaPath) {
        const condaPrefixes = await getPrefixes();
        const envs = data
            .filter((e) => isNativeEnvInfo(e))
            .map((e) => e as NativeEnvInfo)
            .filter((e) => e.kind === NativePythonEnvironmentKind.conda);
        const collection: PythonEnvironment[] = [];

        envs.forEach((e) => {
            const environment = nativeToPythonEnv(e, api, manager, log, condaPath, condaPrefixes);
            if (environment) {
                collection.push(environment);
            }
        });

        return sortEnvironments(collection);
    }

    log.error('Conda not found');
    return [];
}

function getName(api: PythonEnvironmentApi, uris?: Uri | Uri[]): string | undefined {
    if (!uris) {
        return undefined;
    }
    if (Array.isArray(uris) && uris.length !== 1) {
        return undefined;
    }
    return api.getPythonProject(Array.isArray(uris) ? uris[0] : uris)?.name;
}

async function getLocation(api: PythonEnvironmentApi, uris: Uri | Uri[]): Promise<string | undefined> {
    if (!uris || (Array.isArray(uris) && (uris.length === 0 || uris.length > 1))) {
        const projects: PythonProject[] = [];
        if (Array.isArray(uris)) {
            for (let uri of uris) {
                const project = api.getPythonProject(uri);
                if (project && !projects.includes(project)) {
                    projects.push(project);
                }
            }
        } else {
            api.getPythonProjects().forEach((p) => projects.push(p));
        }
        const project = await pickProject(projects);
        return project?.uri.fsPath;
    }
    return api.getPythonProject(Array.isArray(uris) ? uris[0] : uris)?.uri.fsPath;
}

export async function createCondaEnvironment(
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
    uris?: Uri | Uri[],
): Promise<PythonEnvironment | undefined> {
    // step1 ask user for named or prefix environment
    const envType =
        Array.isArray(uris) && uris.length > 1
            ? 'Named'
            : (
                  await window.showQuickPick(
                      [
                          { label: 'Named', description: 'Create a named conda environment' },
                          { label: 'Prefix', description: 'Create environment in your workspace' },
                      ],
                      {
                          placeHolder: 'Select the type of conda environment to create',
                          ignoreFocusOut: true,
                      },
                  )
              )?.label;

    if (envType) {
        return envType === 'Named'
            ? await createNamedCondaEnvironment(api, log, manager, getName(api, uris ?? []))
            : await createPrefixCondaEnvironment(api, log, manager, await getLocation(api, uris ?? []));
    }
    return undefined;
}

async function createNamedCondaEnvironment(
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
    name?: string,
): Promise<PythonEnvironment | undefined> {
    name = await window.showInputBox({
        prompt: 'Enter the name of the conda environment to create',
        value: name,
        ignoreFocusOut: true,
    });
    if (!name) {
        return;
    }

    const envName: string = name;

    return await window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: `Creating conda environment: ${envName}`,
        },
        async () => {
            try {
                const bin = os.platform() === 'win32' ? 'python.exe' : 'python';
                const output = await runConda(['create', '--yes', '--name', envName, 'python']);
                log.info(output);

                const prefixes = await getPrefixes();
                let envPath = '';
                for (let prefix of prefixes) {
                    if (await fsapi.pathExists(path.join(prefix, envName))) {
                        envPath = path.join(prefix, envName);
                        break;
                    }
                }
                const version = await getVersion(envPath);

                const environment = api.createPythonEnvironmentItem(
                    {
                        name: envName,
                        environmentPath: Uri.file(envPath),
                        displayName: `${version} (${envName})`,
                        displayPath: envPath,
                        description: envPath,
                        version,
                        execInfo: {
                            activatedRun: {
                                executable: 'conda',
                                args: ['run', '--live-stream', '-n', envName, 'python'],
                            },
                            activation: [{ executable: 'conda', args: ['activate', envName] }],
                            deactivation: [{ executable: 'conda', args: ['deactivate'] }],
                            run: { executable: path.join(envPath, bin) },
                        },
                        sysPrefix: envPath,
                    },
                    manager,
                );
                return environment;
            } catch (e) {
                window.showErrorMessage('Failed to create conda environment');
                log.error('Failed to create conda environment', e);
            }
        },
    );
}

async function createPrefixCondaEnvironment(
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
    fsPath?: string,
): Promise<PythonEnvironment | undefined> {
    if (!fsPath) {
        return;
    }

    let name = `./.conda`;
    if (await fsapi.pathExists(path.join(fsPath, '.conda'))) {
        log.warn(`Environment "${path.join(fsPath, '.conda')}" already exists`);
        const newName = await window.showInputBox({
            prompt: `Environment "${name}" already exists. Enter a different name`,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (value === name) {
                    return 'Environment already exists';
                }
                return undefined;
            },
        });
        if (!newName) {
            return;
        }
        name = newName;
    }

    const prefix: string = path.isAbsolute(name) ? name : path.join(fsPath, name);

    return await window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: `Creating conda environment: ${name}`,
        },
        async () => {
            try {
                const bin = os.platform() === 'win32' ? 'python.exe' : 'python';
                const output = await runConda(['create', '--yes', '--prefix', prefix, 'python']);
                log.info(output);
                const version = await getVersion(prefix);

                const environment = api.createPythonEnvironmentItem(
                    {
                        name: path.basename(prefix),
                        environmentPath: Uri.file(prefix),
                        displayName: `${version} (${name})`,
                        displayPath: prefix,
                        description: prefix,
                        version,
                        execInfo: {
                            run: { executable: path.join(prefix, bin) },
                            activatedRun: {
                                executable: 'conda',
                                args: ['run', '--live-stream', '-p', prefix, 'python'],
                            },
                            activation: [{ executable: 'conda', args: ['activate', prefix] }],
                            deactivation: [{ executable: 'conda', args: ['deactivate'] }],
                        },
                        sysPrefix: prefix,
                    },
                    manager,
                );
                return environment;
            } catch (e) {
                window.showErrorMessage('Failed to create conda environment');
                log.error('Failed to create conda environment', e);
            }
        },
    );
}

export async function deleteCondaEnvironment(environment: PythonEnvironment, log: LogOutputChannel): Promise<boolean> {
    let args = ['env', 'remove', '--yes', '--prefix', environment.environmentPath.fsPath];
    return await window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: `Deleting conda environment: ${environment.environmentPath.fsPath}`,
        },
        async () => {
            try {
                await runConda(args);
            } catch (e) {
                window.showErrorMessage('Failed to delete conda environment');
                log.error(`Failed to delete conda environment: ${e}`);
                return false;
            }
            return true;
        },
    );
}

export async function refreshPackages(
    environment: PythonEnvironment,
    api: PythonEnvironmentApi,
    manager: PackageManager,
): Promise<Package[]> {
    let args = ['list', '-p', environment.environmentPath.fsPath];
    const data = await runConda(args);
    const content = data.split(/\r?\n/).filter((l) => !l.startsWith('#'));
    const packages: Package[] = [];
    content.forEach((l) => {
        const parts = l.split(' ').filter((p) => p.length > 0);
        if (parts.length === 3) {
            const pkg = api.createPackageItem(
                {
                    name: parts[0],
                    displayName: parts[0],
                    version: parts[1],
                    description: parts[2],
                },
                environment,
                manager,
            );
            packages.push(pkg);
        }
    });
    return packages;
}

export async function installPackages(
    environment: PythonEnvironment,
    packages: string[],
    options: PackageInstallOptions,
    api: PythonEnvironmentApi,
    manager: PackageManager,
): Promise<Package[]> {
    if (!packages || packages.length === 0) {
        // TODO: Ask user to pick packages
        throw new Error('No packages to install');
    }

    const args = ['install', '--prefix', environment.environmentPath.fsPath, '--yes'];
    if (options.upgrade) {
        args.push('--update-all');
    }
    args.push(...packages);

    await runConda(args);
    return refreshPackages(environment, api, manager);
}

export async function uninstallPackages(
    environment: PythonEnvironment,
    packages: PackageInfo[] | string[],
    api: PythonEnvironmentApi,
    manager: PackageManager,
): Promise<Package[]> {
    const remove = [];
    for (let pkg of packages) {
        if (typeof pkg === 'string') {
            remove.push(pkg);
        } else {
            remove.push(pkg.name);
        }
    }
    if (remove.length === 0) {
        throw new Error('No packages to remove');
    }

    await runConda(['remove', '--prefix', environment.environmentPath.fsPath, '--yes', ...remove]);

    return refreshPackages(environment, api, manager);
}
