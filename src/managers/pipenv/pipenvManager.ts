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
import { getLatest, sortEnvironments } from '../common/utils';
import { clearPipenvCache, getPipenv } from './pipenvUtils';

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
        // For pipenv we don't persist environment selection yet.
        if (scope === undefined) {
            // noop for now
        } else if (scope instanceof Uri) {
            if (environment) {
                this.fsPathToEnv.set(scope.fsPath, environment);
            } else {
                this.fsPathToEnv.delete(scope.fsPath);
            }
        } else if (Array.isArray(scope) && scope.every((u) => u instanceof Uri)) {
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

        // pick latest as global if any
        if (this.collection.length > 0) {
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
        for (const p of paths) {
            const found = pathSorted.find((e) => {
                const t = this.api.getPythonProject(e.environmentPath)?.uri.fsPath;
                return t && path.normalize(t) === p;
            });
            if (found) {
                this.fsPathToEnv.set(p, found);
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

    // Helpers that interact with native finder
    private async refreshPipenv(hard: boolean): Promise<PythonEnvironment[]> {
        try {
            const data = await this.nativeFinder.refresh(hard);

            const pipenvExe = await getPipenv(this.nativeFinder);
            if (!pipenvExe) {
                traceInfo('Pipenv executable not found');
                return [];
            }

            const envs = data
                .filter((e) => isNativeEnvInfo(e))
                .map((e) => e as NativeEnvInfo)
                .filter((e) => e.kind === NativePythonEnvironmentKind.pipenv);

            const collection: PythonEnvironment[] = [];

            await Promise.all(
                envs.map(async (e) => {
                    if (!(e.prefix && e.executable && e.version)) {
                        traceError(`Incomplete pipenv environment info: ${JSON.stringify(e)}`);
                        return;
                    }

                    const name = e.name || e.displayName || path.basename(e.prefix);
                    const displayName = e.displayName || `pipenv (${e.version})`;

                    const environment = await this.api.createPythonEnvironmentItem(
                        {
                            name: name,
                            displayName: displayName,
                            shortDisplayName: displayName,
                            displayPath: e.prefix,
                            version: e.version,
                            environmentPath: Uri.file(e.prefix),
                            description: undefined,
                            tooltip: e.prefix,
                            execInfo: {
                                run: { executable: e.executable },
                            },
                            sysPrefix: e.prefix,
                        },
                        this,
                    );

                    if (environment) {
                        collection.push(environment);
                    }
                }),
            );

            return sortEnvironments(collection);
        } catch (err) {
            traceError('Error refreshing pipenv environments', err);
            return [];
        }
    }

    private async resolvePipenvPath(fsPath: string): Promise<PythonEnvironment | undefined> {
        try {
            const e = await this.nativeFinder.resolve(fsPath);
            if (!isNativeEnvInfo(e) || e.kind !== NativePythonEnvironmentKind.pipenv) {
                return undefined;
            }

            if (!(e.prefix && e.executable && e.version)) {
                traceError(`Incomplete pipenv environment info: ${JSON.stringify(e)}`);
                return undefined;
            }

            const name = e.name || e.displayName || path.basename(e.prefix);
            const displayName = e.displayName || `pipenv (${e.version})`;

            const environment = await this.api.createPythonEnvironmentItem(
                {
                    name: name,
                    displayName: displayName,
                    shortDisplayName: displayName,
                    displayPath: e.prefix,
                    version: e.version,
                    environmentPath: Uri.file(e.prefix),
                    description: undefined,
                    tooltip: e.prefix,
                    execInfo: {
                        run: { executable: e.executable },
                    },
                    sysPrefix: e.prefix,
                },
                this,
            );

            return environment;
        } catch (err) {
            traceError('Error resolving pipenv environment', err);
            return undefined;
        }
    }
}
