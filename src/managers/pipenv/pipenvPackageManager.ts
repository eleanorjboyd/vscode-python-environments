import {
    CancellationError,
    CancellationToken,
    Event,
    EventEmitter,
    LogOutputChannel,
    MarkdownString,
    ProgressLocation,
    ThemeIcon,
    window,
} from 'vscode';
import { Disposable } from 'vscode-jsonrpc';
import {
    DidChangePackagesEventArgs,
    IconPath,
    Package,
    PackageChangeKind,
    PackageManagementOptions,
    PackageManager,
    PythonEnvironment,
    PythonEnvironmentApi,
} from '../../api';
import { traceInfo } from '../../common/logging';
import { getPipenv, parsePipenvList, runPipenv } from './pipenvUtils';

function getChanges(before: Package[], after: Package[]): { kind: PackageChangeKind; pkg: Package }[] {
    const changes: { kind: PackageChangeKind; pkg: Package }[] = [];
    before.forEach((pkg) => {
        changes.push({ kind: PackageChangeKind.remove, pkg });
    });
    after.forEach((pkg) => {
        changes.push({ kind: PackageChangeKind.add, pkg });
    });
    return changes;
}

export class PipenvPackageManager implements PackageManager, Disposable {
    public readonly name: string;
    public readonly displayName?: string;
    public readonly description?: string;
    public readonly tooltip?: string | MarkdownString;
    public readonly iconPath?: IconPath;

    private readonly _onDidChangePackages = new EventEmitter<DidChangePackagesEventArgs>();
    public readonly onDidChangePackages: Event<DidChangePackagesEventArgs> = this._onDidChangePackages.event;

    private packages: Map<string, Package[]> = new Map();

    constructor(public readonly api: PythonEnvironmentApi, public readonly log?: LogOutputChannel) {
        this.name = 'pipenv';
        this.displayName = 'Pipenv';
        this.description = 'Manages packages using Pipenv';
        this.tooltip = new MarkdownString('Install and manage packages using Pipenv package manager');
        this.iconPath = new ThemeIcon('package');
    }

    async manage(environment: PythonEnvironment, options: PackageManagementOptions): Promise<void> {
        const pipenvPath = await getPipenv();
        if (!pipenvPath) {
            throw new Error('Pipenv not found');
        }

        let toInstall: string[] = [...(options.install ?? [])];
        let toUninstall: string[] = [...(options.uninstall ?? [])];

        if (toInstall.length === 0 && toUninstall.length === 0) {
            traceInfo('No packages specified for installation or uninstallation');
            return;
        }

        const manageOptions = {
            ...options,
            install: toInstall,
            uninstall: toUninstall,
        };

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Managing packages with Pipenv',
                cancellable: true,
            },
            async (_progress, token) => {
                try {
                    const before = this.packages.get(environment.envId.id) ?? [];
                    const after = await this.managePipenvPackages(environment, manageOptions, pipenvPath, token);
                    const changes = getChanges(before, after);
                    this.packages.set(environment.envId.id, after);
                    this._onDidChangePackages.fire({ environment, manager: this, changes });
                } catch (e) {
                    if (e instanceof CancellationError) {
                        throw e;
                    }
                    this.log?.error('Error managing packages', e);
                    setImmediate(async () => {
                        const result = await window.showErrorMessage(
                            'Error managing packages with Pipenv',
                            'View Output',
                        );
                        if (result === 'View Output') {
                            this.log?.show();
                        }
                    });
                    throw e;
                }
            },
        );
    }

    private async managePipenvPackages(
        environment: PythonEnvironment,
        options: PackageManagementOptions,
        pipenvPath: string,
        token?: CancellationToken,
    ): Promise<Package[]> {
        // Get the project directory from the environment's sysPrefix or a parent directory
        const projectDir = environment.sysPrefix;

        // Uninstall packages first
        if (options.uninstall && options.uninstall.length > 0) {
            const uninstallArgs = ['uninstall', ...options.uninstall, '--yes']; // Skip confirmation
            await runPipenv(pipenvPath, uninstallArgs, projectDir, this.log, token);
        }

        // Install packages
        if (options.install && options.install.length > 0) {
            const installArgs = ['install', ...options.install];
            if (options.upgrade) {
                installArgs.push('--upgrade');
            }
            await runPipenv(pipenvPath, installArgs, projectDir, this.log, token);
        }

        return await this.refreshPipenvPackages(environment, pipenvPath);
    }

    async refresh(environment: PythonEnvironment): Promise<void> {
        await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Refreshing packages',
            },
            async () => {
                const pipenvPath = await getPipenv();
                if (!pipenvPath) {
                    throw new Error('Pipenv not found');
                }

                const before = this.packages.get(environment.envId.id) ?? [];
                const after = await this.refreshPipenvPackages(environment, pipenvPath);
                const changes = getChanges(before, after);
                this.packages.set(environment.envId.id, after);
                if (changes.length > 0) {
                    this._onDidChangePackages.fire({ environment, manager: this, changes });
                }
            },
        );
    }

    private async refreshPipenvPackages(environment: PythonEnvironment, pipenvPath: string): Promise<Package[]> {
        try {
            // Use pipenv run pip list to get packages in the virtual environment
            const projectDir = environment.sysPrefix;
            const data = await runPipenv(pipenvPath, ['run', 'pip', 'list'], projectDir, this.log);
            const pipenvPackages = parsePipenvList(data);

            return pipenvPackages.map((pkg) => this.api.createPackageItem(pkg, environment, this));
        } catch (error) {
            this.log?.error('Error refreshing pipenv packages', error);
            return [];
        }
    }

    async getPackages(environment: PythonEnvironment): Promise<Package[] | undefined> {
        if (!this.packages.has(environment.envId.id)) {
            await this.refresh(environment);
        }
        return this.packages.get(environment.envId.id);
    }

    public dispose() {
        this._onDidChangePackages.dispose();
        this.packages.clear();
    }
}
