import * as path from 'path';
import { Disposable, EventEmitter, MarkdownString, ProgressLocation, Uri } from 'vscode';
import {
    DidChangeEnvironmentEventArgs,
    DidChangeEnvironmentsEventArgs,
    EnvironmentChangeKind,
    EnvironmentManager,
    GetEnvironmentScope,
    GetEnvironmentsScope,
    IconPath,
    PythonEnvironment,
    PythonEnvironmentApi,
    RefreshEnvironmentsScope,
    ResolveEnvironmentContext,
    SetEnvironmentScope,
} from '../../api';
import { traceError, traceInfo } from '../../common/logging';
import { createDeferred, Deferred } from '../../common/utils/deferred';
import { withProgress } from '../../common/window.apis';
import {
    isNativeEnvInfo,
    NativeEnvInfo,
    NativePythonEnvironmentKind,
    NativePythonFinder,
} from '../common/nativePythonFinder';
import { getLatest, getShellActivationCommands, sortEnvironments } from '../common/utils';
import {
    clearPipenvCache,
    getPipenvForGlobal,
    getPipenvForWorkspace,
    setPipenvForGlobal,
    setPipenvForWorkspace,
    setPipenvForWorkspaces,
    getPipenvVenv,
} from './pipenvUtils';

export class PipenvManager implements EnvironmentManager, Disposable {
    private collection: PythonEnvironment[] = [];
    private fsPathToEnv: Map<string, PythonEnvironment> = new Map();
    private globalEnv: PythonEnvironment | undefined;

    private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>();
    public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

    private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>();
    public readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event;

    constructor(private readonly nativeFinder: NativePythonFinder, private readonly api: PythonEnvironmentApi) {
        this.name = 'pipenv';
        this.displayName = 'Pipenv';
        this.preferredPackageManagerId = 'ms-python.python:pipenv';
        this.tooltip = new MarkdownString('Pipenv environment manager', true);
    }

    name: string;
    displayName: string;
    preferredPackageManagerId: string;
    description?: string;
    tooltip: string | MarkdownString;
    iconPath?: IconPath;

    public dispose() {
        this.collection = [];
        this.fsPathToEnv.clear();
    }

    private _initialized: Deferred<void> | undefined;
    async initialize(): Promise<void> {
        if (this._initialized) {
            return this._initialized.promise;
        }

        this._initialized = createDeferred();

        await withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Discovering Pipenv environments',
            },
            async () => {
                this.collection = await this.refreshPipenv(false);
                await this.loadEnvMap();

                this._onDidChangeEnvironments.fire(
                    this.collection.map((e) => ({ environment: e, kind: EnvironmentChangeKind.add })),
                );
            },
        );

        this._initialized.resolve();
    }

    async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
        await this.initialize();

        if (scope === 'all') {
            return Array.from(this.collection);
        }

        if (scope === 'global') {
            return this.collection.filter((env) => env.group === 'Global');
        }

        if (scope instanceof Uri) {
            const env = this.fromEnvMap(scope);
            if (env) {
                return [env];
            }
        }

        return [];
    }

    async refresh(context: RefreshEnvironmentsScope): Promise<void> {
        if (context === undefined) {
            await withProgress(
                {
                    location: ProgressLocation.Window,
                    title: 'Refreshing Pipenv environments',
                },
                async () => {
                    traceInfo('Refreshing Pipenv Environments');
                    const discard = this.collection.map((c) => c);
                    this.collection = await this.refreshPipenv(true);

                    await this.loadEnvMap();

                    const args = [
                        ...discard.map((env) => ({ kind: EnvironmentChangeKind.remove, environment: env })),
                        ...this.collection.map((env) => ({ kind: EnvironmentChangeKind.add, environment: env })),
                    ];

                    this._onDidChangeEnvironments.fire(args);
                },
            );
        }
    }

    async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
        await this.initialize();
        if (scope instanceof Uri) {
            let env = this.fsPathToEnv.get(scope.fsPath);
            if (env) {
                return env;
            }
            const project = this.api.getPythonProject(scope);
            if (project) {
                env = this.fsPathToEnv.get(project.uri.fsPath);
                if (env) {
                    return env;
                }
            }
        }

        return this.globalEnv;
    }

    async set(scope: SetEnvironmentScope, environment?: PythonEnvironment | undefined): Promise<void> {
        if (scope === undefined) {
            // set global
            await setPipenvForGlobal(environment?.environmentPath?.fsPath);
            if (environment) {
                this.globalEnv = environment;
            } else {
                this.globalEnv = undefined;
            }
        } else if (scope instanceof Uri) {
            const fsPath = scope.fsPath;
            await setPipenvForWorkspace(fsPath, environment?.environmentPath?.fsPath);
            if (environment) {
                this.fsPathToEnv.set(fsPath, environment);
            } else {
                this.fsPathToEnv.delete(fsPath);
            }
        } else if (Array.isArray(scope) && scope.every((u) => u instanceof Uri)) {
            const fsPaths = scope.map((s) => s.fsPath);
            await setPipenvForWorkspaces(fsPaths, environment?.environmentPath?.fsPath);
            scope.forEach((s) => {
                if (environment) {
                    this.fsPathToEnv.set(s.fsPath, environment);
                } else {
                    this.fsPathToEnv.delete(s.fsPath);
                }
            });
        }
    }

    async resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
        await this.initialize();

        if (context instanceof Uri) {
            const env = await this.resolvePipenvPath(context.fsPath);
            if (env) {
                const _collectionEnv = this.findEnvironmentByPath(env.environmentPath.fsPath);
                if (_collectionEnv) {
                    return _collectionEnv;
                }

                this.collection.push(env);
                this._onDidChangeEnvironments.fire([{ kind: EnvironmentChangeKind.add, environment: env }]);

                return env;
            }

            return undefined;
        }
    }

    async clearCache(): Promise<void> {
        await clearPipenvCache();
    }

    private async loadEnvMap() {
        this.globalEnv = undefined;
        this.fsPathToEnv.clear();

        // Try to find a global environment
        const fsPath = await getPipenvForGlobal();

        if (fsPath) {
            this.globalEnv = this.findEnvironmentByPath(fsPath);

            // If the environment is not found, try to resolve by path using native finder
            if (!this.globalEnv) {
                try {
                    const resolved = await this.nativeFinder.resolve(fsPath);
                    if (isNativeEnvInfo(resolved)) {
                        const info = resolved as NativeEnvInfo;
                        if (info.kind === NativePythonEnvironmentKind.pipenv) {
                            if (!(info.prefix && info.executable && info.version)) {
                                traceError(`Incomplete pipenv resolve info: ${JSON.stringify(info)}`);
                            } else {
                                const prefix = info.prefix as string;
                                const executable = info.executable as string;
                                const version = info.version as string;
                                const name = info.name || path.basename(prefix);
                                const displayName = info.displayName || `pipenv (${version})`;

                                const env = await this.api.createPythonEnvironmentItem(
                                    {
                                        name,
                                        displayName,
                                        shortDisplayName: displayName,
                                        displayPath: prefix,
                                        version,
                                        environmentPath: Uri.file(prefix),
                                        description: undefined,
                                        tooltip: prefix,
                                        execInfo: { run: { executable } },
                                        sysPrefix: prefix,
                                    },
                                    this,
                                );
                                if (env) {
                                    this.globalEnv = env;
                                    this.collection.push(env);
                                }
                            }
                        }
                    }
                } catch (e) {
                    traceError(`Failed to resolve pipenv global environment: ${e}`);
                }
            }
        }

        if (!this.globalEnv) {
            this.globalEnv = getLatest(this.collection);
        }

        const pathSorted = this.collection
            .filter((e) => this.api.getPythonProject(e.environmentPath))
            .sort((a, b) => {
                if (a.environmentPath.fsPath !== b.environmentPath.fsPath) {
                    return a.environmentPath.fsPath.length - b.environmentPath.fsPath.length;
                }
                return a.environmentPath.fsPath.localeCompare(b.environmentPath.fsPath);
            });

        const paths = this.api.getPythonProjects().map((p) => p.uri.fsPath);
        // Try to find any pipenv environment explicitly associated with workspaces
        for (const p of paths) {
            const envPath = await getPipenvForWorkspace(p);
            if (envPath) {
                const found = this.findEnvironmentByPath(envPath);
                if (found) {
                    this.fsPathToEnv.set(p, found);
                    continue;
                }

                try {
                    let resolvedEnvPath = envPath;

                    // If envPath isn't a valid discovered env, try invoking pipenv --venv in the workspace
                    if (!this.findEnvironmentByPath(envPath)) {
                        const venv = await getPipenvVenv(p);
                        if (venv) {
                            resolvedEnvPath = venv;
                        }
                    }

                    const resolved = await this.nativeFinder.resolve(resolvedEnvPath);
                    if (isNativeEnvInfo(resolved)) {
                        const info = resolved as NativeEnvInfo;
                        if (info.kind === NativePythonEnvironmentKind.pipenv) {
                            if (!(info.prefix && info.executable && info.version)) {
                                traceError(`Incomplete pipenv resolve info: ${JSON.stringify(info)}`);
                            } else {
                                const prefix = info.prefix as string;
                                const executable = info.executable as string;
                                const version = info.version as string;
                                const name = info.name || path.basename(prefix);
                                const displayName = info.displayName || `pipenv (${version})`;
                                const binDir = path.dirname(executable);
                                const { shellActivation, shellDeactivation } = await getShellActivationCommands(binDir);
                                const env = await this.api.createPythonEnvironmentItem(
                                    {
                                        name,
                                        displayName,
                                        shortDisplayName: displayName,
                                        displayPath: prefix,
                                        version,
                                        environmentPath: Uri.file(prefix),
                                        description: undefined,
                                        tooltip: prefix,
                                        execInfo: { run: { executable }, shellActivation, shellDeactivation },
                                        sysPrefix: prefix,
                                    },
                                    this,
                                );
                                if (env) {
                                    this.fsPathToEnv.set(p, env);
                                    this.collection.push(env);
                                }
                            }
                        }
                    }
                } catch (e) {
                    traceError(`Failed to resolve pipenv workspace environment: ${e}`);
                }
            } else {
                // If there is not an environment already assigned by user to this project
                // then see if there is one in the collection
                if (pathSorted.length === 1) {
                    this.fsPathToEnv.set(p, pathSorted[0]);
                } else {
                    // If there is more than one environment then we need to check if the project
                    // is a subfolder of one of the environments
                    const found = pathSorted.find((e) => {
                        const t = this.api.getPythonProject(e.environmentPath)?.uri.fsPath;
                        return t && path.normalize(t) === p;
                    });
                    if (found) {
                        this.fsPathToEnv.set(p, found);
                    }
                }
            }
        }
    }

    private fromEnvMap(uri: Uri): PythonEnvironment | undefined {
        const env = this.fsPathToEnv.get(uri.fsPath);
        if (env) {
            return env;
        }

        const project = this.api.getPythonProject(uri);
        if (project) {
            return this.fsPathToEnv.get(project.uri.fsPath);
        }

        return undefined;
    }

    private findEnvironmentByPath(fsPath: string): PythonEnvironment | undefined {
        const normalized = path.normalize(fsPath);
        return this.collection.find((e) => {
            const n = path.normalize(e.environmentPath.fsPath);
            return n === normalized || path.dirname(n) === normalized || path.dirname(path.dirname(n)) === normalized;
        });
    }

    private async refreshPipenv(hard: boolean): Promise<PythonEnvironment[]> {
        const items = await this.nativeFinder.refresh(hard);
        const envs: PythonEnvironment[] = [];

        for (const it of items) {
            if (!isNativeEnvInfo(it)) {
                continue;
            }

            // Cast to NativeEnvInfo after runtime check
            const info = it as NativeEnvInfo;

            if (info.kind !== NativePythonEnvironmentKind.pipenv) {
                continue;
            }

            if (!(info.prefix && info.executable && info.version)) {
                traceError(`Incomplete pipenv info from native finder: ${JSON.stringify(info)}`);
                continue;
            }

            const prefix = info.prefix as string;
            const executable = info.executable as string;
            const version = info.version as string;
            const name = info.name || path.basename(prefix);
            const displayName = info.displayName || `pipenv (${version})`;
            const binDir = path.dirname(executable);
            const { shellActivation, shellDeactivation } = await getShellActivationCommands(binDir);

            const env = await this.api.createPythonEnvironmentItem(
                {
                    name,
                    displayName,
                    shortDisplayName: displayName,
                    displayPath: prefix,
                    version,
                    environmentPath: Uri.file(prefix),
                    description: undefined,
                    tooltip: prefix,
                    execInfo: { run: { executable }, shellActivation, shellDeactivation },
                    sysPrefix: prefix,
                },
                this,
            );

            if (env) {
                envs.push(env);
            }
        }

        return sortEnvironments(envs);
    }

    private async resolvePipenvPath(fsPath: string): Promise<PythonEnvironment | undefined> {
        try {
            const resolved = await this.nativeFinder.resolve(fsPath);
            if (!isNativeEnvInfo(resolved)) {
                return undefined;
            }

            const info = resolved as NativeEnvInfo;
            if (info.kind !== NativePythonEnvironmentKind.pipenv) {
                return undefined;
            }

            if (!(info.prefix && info.executable && info.version)) {
                traceError(`Incomplete pipenv resolve info: ${JSON.stringify(info)}`);
                return undefined;
            }

            const prefix = info.prefix as string;
            const executable = info.executable as string;
            const version = info.version as string;
            const name = info.name || path.basename(prefix);
            const displayName = info.displayName || `pipenv (${version})`;
            const binDir = path.dirname(executable);
            const { shellActivation, shellDeactivation } = await getShellActivationCommands(binDir);

            const env = await this.api.createPythonEnvironmentItem(
                {
                    name,
                    displayName,
                    shortDisplayName: displayName,
                    displayPath: prefix,
                    version,
                    environmentPath: Uri.file(prefix),
                    description: undefined,
                    tooltip: prefix,
                    execInfo: { run: { executable }, shellActivation, shellDeactivation },
                    sysPrefix: prefix,
                },
                this,
            );

            return env;
        } catch (e) {
            traceError(`Failed to resolve pipenv path: ${e}`);
            return undefined;
        }
    }
}
