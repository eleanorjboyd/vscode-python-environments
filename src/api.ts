// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable, Event, LogOutputChannel, MarkdownString, ThemeIcon, Uri } from 'vscode';
import { PythonEnvironmentVariablesApi, PythonExecutionApi, PythonProjectApi } from './proposedApis';

/**
 * The path to an icon, or a theme-specific configuration of icons.
 */
export type IconPath =
    | Uri
    | {
          /**
           * The icon path for the light theme.
           */
          light: Uri;
          /**
           * The icon path for the dark theme.
           */
          dark: Uri;
      }
    | ThemeIcon;

/**
 * Options for executing a Python executable.
 */
export interface PythonCommandRunConfiguration {
    /**
     * Path to the binary like `python.exe` or `python3` to execute. This should be an absolute path
     * to an executable that can be spawned.
     */
    executable: string;

    /**
     * Arguments to pass to the python executable. These arguments will be passed on all execute calls.
     * This is intended for cases where you might want to do interpreter specific flags.
     */
    args?: string[];
}

/**
 * Contains details on how to use a particular python environment
 *
 * Running In Terminal:
 * 1. If {@link PythonEnvironmentExecutionInfo.activatedRun} is provided, then that will be used.
 * 2. If {@link PythonEnvironmentExecutionInfo.activatedRun} is not provided, then:
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is known, then that will be used.
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is not known, then:
 *     - 'unknown' will be used if provided.
 *     - {@link PythonEnvironmentExecutionInfo.activation} will be used otherwise.
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is not provided, then {@link PythonEnvironmentExecutionInfo.activation} will be used.
 *   - If {@link PythonEnvironmentExecutionInfo.activation} is not provided, then {@link PythonEnvironmentExecutionInfo.run} will be used.
 *
 * Creating a Terminal:
 * 1. If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is known, then that will be used.
 * 2. If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is not known, then {@link PythonEnvironmentExecutionInfo.activation} will be used.
 * 3. If {@link PythonEnvironmentExecutionInfo.shellActivation} is not provided, then:
 *     - 'unknown' will be used if provided.
 *     - {@link PythonEnvironmentExecutionInfo.activation} will be used otherwise.
 * 4. If {@link PythonEnvironmentExecutionInfo.activation} is not provided, then {@link PythonEnvironmentExecutionInfo.run} will be used.
 *
 */
export interface PythonEnvironmentExecutionInfo {
    /**
     * Details on how to run the python executable.
     */
    run: PythonCommandRunConfiguration;

    /**
     * Details on how to run the python executable after activating the environment.
     * If set this will overrides the {@link PythonEnvironmentExecutionInfo.run} command.
     */
    activatedRun?: PythonCommandRunConfiguration;

    /**
     * Details on how to activate an environment.
     */
    activation?: PythonCommandRunConfiguration[];

    /**
     * Details on how to activate an environment using a shell specific command.
     * If set this will override the {@link PythonEnvironmentExecutionInfo.activation}.
     * 'unknown' is used if shell type is not known.
     * If 'unknown' is not provided and shell type is not known then
     * {@link PythonEnvironmentExecutionInfo.activation} if set.
     */
    shellActivation?: Map<string, PythonCommandRunConfiguration[]>;

    /**
     * Details on how to deactivate an environment.
     */
    deactivation?: PythonCommandRunConfiguration[];

    /**
     * Details on how to deactivate an environment using a shell specific command.
     * If set this will override the {@link PythonEnvironmentExecutionInfo.deactivation} property.
     * 'unknown' is used if shell type is not known.
     * If 'unknown' is not provided and shell type is not known then
     * {@link PythonEnvironmentExecutionInfo.deactivation} if set.
     */
    shellDeactivation?: Map<string, PythonCommandRunConfiguration[]>;
}

/**
 * Interface representing the ID of a Python environment.
 */
export interface PythonEnvironmentId {
    /**
     * The unique identifier of the Python environment.
     */
    id: string;

    /**
     * The ID of the manager responsible for the Python environment.
     */
    managerId: string;
}

/**
 * Display information for an environment group.
 */
export interface EnvironmentGroupInfo {
    /**
     * The name of the environment group. This is used as an identifier for the group.
     *
     * Note: The first instance of the group with the given name will be used in the UI.
     */
    readonly name: string;

    /**
     * The description of the environment group.
     */
    readonly description?: string;

    /**
     * The tooltip for the environment group, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * The icon path for the environment group, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;
}

/**
 * Interface representing information about a Python environment.
 */
export interface PythonEnvironmentInfo {
    /**
     * The name of the Python environment.
     */
    readonly name: string;

    /**
     * The display name of the Python environment.
     */
    readonly displayName: string;

    /**
     * The short display name of the Python environment.
     */
    readonly shortDisplayName?: string;

    /**
     * The display path of the Python environment.
     */
    readonly displayPath: string;

    /**
     * The version of the Python environment.
     */
    readonly version: string;

    /**
     * Path to the python binary or environment folder.
     */
    readonly environmentPath: Uri;

    /**
     * The description of the Python environment.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python environment, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * The icon path for the Python environment, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * Information on how to execute the Python environment. This is required for executing Python code in the environment.
     */
    readonly execInfo: PythonEnvironmentExecutionInfo;

    /**
     * `sys.prefix` is the path to the base directory of the Python installation. Typically obtained by executing `sys.prefix` in the Python interpreter.
     * This is required by extension like Jupyter, Pylance, and other extensions to provide better experience with python.
     */
    readonly sysPrefix: string;

    /**
     * Optional `group` for this environment. This is used to group environments in the Environment Manager UI.
     */
    readonly group?: string | EnvironmentGroupInfo;
}

/**
 * Interface representing a Python environment.
 */
export interface PythonEnvironment extends PythonEnvironmentInfo {
    /**
     * The ID of the Python environment.
     */
    readonly envId: PythonEnvironmentId;
}

/**
 * Type representing the scope for setting a Python environment.
 * Can be undefined or a URI.
 */
export type SetEnvironmentScope = undefined | Uri | Uri[];

/**
 * Type representing the scope for getting a Python environment.
 * Can be undefined or a URI.
 */
export type GetEnvironmentScope = undefined | Uri;

/**
 * Type representing the scope for creating a Python environment.
 * Can be a Python project or 'global'.
 */
export type CreateEnvironmentScope = Uri | Uri[] | 'global';
/**
 * The scope for which environments are to be refreshed.
 * - `undefined`: Search for environments globally and workspaces.
 * - {@link Uri}: Environments in the workspace/folder or associated with the Uri.
 */
export type RefreshEnvironmentsScope = Uri | undefined;

/**
 * The scope for which environments are required.
 * - `"all"`: All environments.
 * - `"global"`: Python installations that are usually a base for creating virtual environments.
 * - {@link Uri}: Environments for the workspace/folder/file pointed to by the Uri.
 */
export type GetEnvironmentsScope = Uri | 'all' | 'global';

/**
 * Event arguments for when the current Python environment changes.
 */
export type DidChangeEnvironmentEventArgs = {
    /**
     * The URI of the environment that changed.
     */
    readonly uri: Uri | undefined;

    /**
     * The old Python environment before the change.
     */
    readonly old: PythonEnvironment | undefined;

    /**
     * The new Python environment after the change.
     */
    readonly new: PythonEnvironment | undefined;
};

/**
 * Enum representing the kinds of environment changes.
 */
export enum EnvironmentChangeKind {
    /**
     * Indicates that an environment was added.
     */
    add = 'add',

    /**
     * Indicates that an environment was removed.
     */
    remove = 'remove',
}

/**
 * Event arguments for when the list of Python environments changes.
 */
export type DidChangeEnvironmentsEventArgs = {
    /**
     * The kind of change that occurred (add or remove).
     */
    kind: EnvironmentChangeKind;

    /**
     * The Python environment that was added or removed.
     */
    environment: PythonEnvironment;
}[];

/**
 * Type representing the context for resolving a Python environment.
 */
export type ResolveEnvironmentContext = Uri;

export interface QuickCreateConfig {
    /**
     * The description of the quick create step.
     */
    readonly description: string;

    /**
     * The detail of the quick create step.
     */
    readonly detail?: string;
}

/**
 * Interface representing an environment manager.
 */
export interface EnvironmentManager {
    /**
     * The name of the environment manager. Allowed characters (a-z, A-Z, 0-9, -, _).
     */
    readonly name: string;

    /**
     * The display name of the environment manager.
     */
    readonly displayName?: string;

    /**
     * The preferred package manager ID for the environment manager. This is a combination
     * of publisher id, extension id, and {@link EnvironmentManager.name package manager name}.
     * `<publisher-id>.<extension-id>:<package-manager-name>`
     *
     * @example
     * 'ms-python.python:pip'
     */
    readonly preferredPackageManagerId: string;

    /**
     * The description of the environment manager.
     */
    readonly description?: string;

    /**
     * The tooltip for the environment manager, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the environment manager, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * The log output channel for the environment manager.
     */
    readonly log?: LogOutputChannel;

    /**
     * The quick create details for the environment manager. Having this method also enables the quick create feature
     * for the environment manager. Should Implement {@link EnvironmentManager.create} to support quick create.
     */
    quickCreateConfig?(): QuickCreateConfig | undefined;

    /**
     * Creates a new Python environment within the specified scope. Create should support adding a .gitignore file if it creates a folder within the workspace. If a manager does not support environment creation, do not implement this method; the UI disables "create" options when `this.manager.create === undefined`.
     * @param scope - The scope within which to create the environment.
     * @param options - Optional parameters for creating the Python environment.
     * @returns A promise that resolves to the created Python environment, or undefined if creation failed.
     */
    create?(scope: CreateEnvironmentScope, options?: CreateEnvironmentOptions): Promise<PythonEnvironment | undefined>;

    /**
     * Removes the specified Python environment.
     * @param environment - The Python environment to remove.
     * @returns A promise that resolves when the environment is removed.
     */
    remove?(environment: PythonEnvironment): Promise<void>;

    /**
     * Refreshes the list of Python environments within the specified scope.
     * @param scope - The scope within which to refresh environments.
     * @returns A promise that resolves when the refresh is complete.
     */
    refresh(scope: RefreshEnvironmentsScope): Promise<void>;

    /**
     * Retrieves a list of Python environments within the specified scope.
     * @param scope - The scope within which to retrieve environments.
     * @returns A promise that resolves to an array of Python environments.
     */
    getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]>;

    /**
     * Event that is fired when the list of Python environments changes.
     */
    onDidChangeEnvironments?: Event<DidChangeEnvironmentsEventArgs>;

    /**
     * Sets the current Python environment within the specified scope.
     * @param scope - The scope within which to set the environment.
     * @param environment - The Python environment to set. If undefined, the environment is unset.
     * @returns A promise that resolves when the environment is set.
     */
    set(scope: SetEnvironmentScope, environment?: PythonEnvironment): Promise<void>;

    /**
     * Retrieves the current Python environment within the specified scope.
     * @param scope - The scope within which to retrieve the environment.
     * @returns A promise that resolves to the current Python environment, or undefined if none is set.
     */
    get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Event that is fired when the current Python environment changes.
     */
    onDidChangeEnvironment?: Event<DidChangeEnvironmentEventArgs>;

    /**
     * Resolves the specified Python environment. The environment can be either a {@link PythonEnvironment} or a {@link Uri} context.
     *
     * This method is used to obtain a fully detailed {@link PythonEnvironment} object. The input can be:
     * - A {@link PythonEnvironment} object, which might be missing key details such as {@link PythonEnvironment.execInfo}.
     * - A {@link Uri} object, which typically represents either:
     *   - A folder that contains the Python environment.
     *   - The path to a Python executable.
     *
     * @param context - The context for resolving the environment, which can be a {@link PythonEnvironment} or a {@link Uri}.
     * @returns A promise that resolves to the fully detailed {@link PythonEnvironment}, or `undefined` if the environment cannot be resolved.
     */
    resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined>;

    /**
     * Clears the environment manager's cache.
     *
     * @returns A promise that resolves when the cache is cleared.
     */
    clearCache?(): Promise<void>;
}

/**
 * Interface representing a package ID.
 */
export interface PackageId {
    /**
     * The ID of the package.
     */
    id: string;

    /**
     * The ID of the package manager.
     */
    managerId: string;

    /**
     * The ID of the environment in which the package is installed.
     */
    environmentId: string;
}

/**
 * Interface representing package information.
 */
export interface PackageInfo {
    /**
     * The name of the package.
     */
    readonly name: string;

    /**
     * The display name of the package.
     */
    readonly displayName: string;

    /**
     * The version of the package.
     */
    readonly version?: string;

    /**
     * The description of the package.
     */
    readonly description?: string;

    /**
     * The tooltip for the package, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the package, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * The URIs associated with the package.
     */
    readonly uris?: readonly Uri[];
}

/**
 * Interface representing a package.
 */
export interface Package extends PackageInfo {
    /**
     * The ID of the package.
     */
    readonly pkgId: PackageId;
}

/**
 * Enum representing the kinds of package changes.
 */
export enum PackageChangeKind {
    /**
     * Indicates that a package was added.
     */
    add = 'add',

    /**
     * Indicates that a package was removed.
     */
    remove = 'remove',
}

/**
 * Event arguments for when packages change.
 */
export interface DidChangePackagesEventArgs {
    /**
     * The Python environment in which the packages changed.
     */
    environment: PythonEnvironment;

    /**
     * The package manager responsible for the changes.
     */
    manager: PackageManager;

    /**
     * The list of changes, each containing the kind of change and the package affected.
     */
    changes: { kind: PackageChangeKind; pkg: Package }[];
}

/**
 * Interface representing a package manager.
 */
export interface PackageManager {
    /**
     * The name of the package manager. Allowed characters (a-z, A-Z, 0-9, -, _).
     */
    name: string;

    /**
     * The display name of the package manager.
     */
    displayName?: string;

    /**
     * The description of the package manager.
     */
    description?: string;

    /**
     * The tooltip for the package manager, which can be a string or a Markdown string.
     */
    tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the package manager, which can be a string, Uri, or an object with light and dark theme paths.
     */
    iconPath?: IconPath;

    /**
     * The log output channel for the package manager.
     */
    log?: LogOutputChannel;

    /**
     * Installs/Uninstall packages in the specified Python environment.
     * @param environment - The Python environment in which to install packages.
     * @param options - Options for managing packages.
     * @returns A promise that resolves when the installation is complete.
     */
    manage(environment: PythonEnvironment, options: PackageManagementOptions): Promise<void>;

    /**
     * Refreshes the package list for the specified Python environment.
     * @param environment - The Python environment for which to refresh the package list.
     * @returns A promise that resolves when the refresh is complete.
     */
    refresh(environment: PythonEnvironment): Promise<void>;

    /**
     * Retrieves the list of packages for the specified Python environment.
     * @param environment - The Python environment for which to retrieve packages.
     * @returns An array of packages, or undefined if the packages could not be retrieved.
     */
    getPackages(environment: PythonEnvironment): Promise<Package[] | undefined>;

    /**
     * Event that is fired when packages change.
     */
    onDidChangePackages?: Event<DidChangePackagesEventArgs>;

    /**
     * Clears the package manager's cache.
     * @returns A promise that resolves when the cache is cleared.
     */
    clearCache?(): Promise<void>;
}

export type PackageManagementOptions =
    | {
          /**
           * Upgrade the packages if they are already installed.
           */
          upgrade?: boolean;

          /**
           * Show option to skip package installation or uninstallation.
           */
          showSkipOption?: boolean;
          /**
           * The list of packages to install.
           */
          install: string[];

          /**
           * The list of packages to uninstall.
           */
          uninstall?: string[];
      }
    | {
          /**
           * Upgrade the packages if they are already installed.
           */
          upgrade?: boolean;

          /**
           * Show option to skip package installation or uninstallation.
           */
          showSkipOption?: boolean;
          /**
           * The list of packages to install.
           */
          install?: string[];

          /**
           * The list of packages to uninstall.
           */
          uninstall: string[];
      };

/**
 * Options for creating a Python environment.
 */
export interface CreateEnvironmentOptions {
    /**
     * Provides some context about quick create based on user input.
     *   - if true, the environment should be created without any user input or prompts.
     *   - if false, the environment creation can show user input or prompts.
     *     This also means user explicitly skipped the quick create option.
     *   - if undefined, the environment creation can show user input or prompts.
     *     You can show quick create option to the user if you support it.
     */
    quickCreate?: boolean;
    /**
     * Packages to install in addition to the automatically picked packages as a part of creating environment.
     */
    additionalPackages?: string[];
}

export interface PythonEnvironmentManagerRegistrationApi {
    /**
     * Register an environment manager implementation.
     *
     * @param manager Environment Manager implementation to register.
     * @returns A disposable that can be used to unregister the environment manager.
     * @see {@link EnvironmentManager}
     */
    registerEnvironmentManager(manager: EnvironmentManager): Disposable;
}

export interface PythonEnvironmentItemApi {
    /**
     * Create a Python environment item from the provided environment info. This item is used to interact
     * with the environment.
     *
     * @param info Some details about the environment like name, version, etc. needed to interact with the environment.
     * @param manager The environment manager to associate with the environment.
     * @returns The Python environment.
     */
    createPythonEnvironmentItem(info: PythonEnvironmentInfo, manager: EnvironmentManager): PythonEnvironment;
}

export interface PythonEnvironmentManagementApi {
    /**
     * Create a Python environment using environment manager associated with the scope.
     *
     * @param scope Where the environment is to be created.
     * @param options Optional parameters for creating the Python environment.
     * @returns The Python environment created. `undefined` if not created.
     */
    createEnvironment(
        scope: CreateEnvironmentScope,
        options?: CreateEnvironmentOptions,
    ): Promise<PythonEnvironment | undefined>;

    /**
     * Remove a Python environment.
     *
     * @param environment The Python environment to remove.
     * @returns A promise that resolves when the environment has been removed.
     */
    removeEnvironment(environment: PythonEnvironment): Promise<void>;
}

export interface PythonEnvironmentsApi {
    /**
     * Initiates a refresh of Python environments within the specified scope.
     * @param scope - The scope within which to search for environments.
     * @returns A promise that resolves when the search is complete.
     */
    refreshEnvironments(scope: RefreshEnvironmentsScope): Promise<void>;

    /**
     * Retrieves a list of Python environments within the specified scope.
     * @param scope - The scope within which to retrieve environments.
     * @returns A promise that resolves to an array of Python environments.
     */
    getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]>;

    /**
     * Event that is fired when the list of Python environments changes.
     * @see {@link DidChangeEnvironmentsEventArgs}
     */
    onDidChangeEnvironments: Event<DidChangeEnvironmentsEventArgs>;

    /**
     * This method is used to get the details missing from a PythonEnvironment. Like
     * {@link PythonEnvironment.execInfo} and other details.
     *
     * @param context : The PythonEnvironment or Uri for which details are required.
     */
    resolveEnvironment(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined>;
}

export interface PythonProjectEnvironmentApi {
    /**
     * Sets the current Python environment within the specified scope.
     * @param scope - The scope within which to set the environment.
     * @param environment - The Python environment to set. If undefined, the environment is unset.
     */
    setEnvironment(scope: SetEnvironmentScope, environment?: PythonEnvironment): Promise<void>;

    /**
     * Retrieves the current Python environment within the specified scope.
     * @param scope - The scope within which to retrieve the environment.
     * @returns A promise that resolves to the current Python environment, or undefined if none is set.
     */
    getEnvironment(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Event that is fired when the selected Python environment changes for Project, Folder or File.
     * @see {@link DidChangeEnvironmentEventArgs}
     */
    onDidChangeEnvironment: Event<DidChangeEnvironmentEventArgs>;
}

export interface PythonEnvironmentManagerApi
    extends PythonEnvironmentManagerRegistrationApi,
        PythonEnvironmentItemApi,
        PythonEnvironmentManagementApi,
        PythonEnvironmentsApi,
        PythonProjectEnvironmentApi {}

export interface PythonPackageManagerRegistrationApi {
    /**
     * Register a package manager implementation.
     *
     * @param manager Package Manager implementation to register.
     * @returns A disposable that can be used to unregister the package manager.
     * @see {@link PackageManager}
     */
    registerPackageManager(manager: PackageManager): Disposable;
}

export interface PythonPackageGetterApi {
    /**
     * Refresh the list of packages in a Python Environment.
     *
     * @param environment The Python Environment for which the list of packages is to be refreshed.
     * @returns A promise that resolves when the list of packages has been refreshed.
     */
    refreshPackages(environment: PythonEnvironment): Promise<void>;

    /**
     * Get the list of packages in a Python Environment.
     *
     * @param environment The Python Environment for which the list of packages is required.
     * @returns The list of packages in the Python Environment.
     */
    getPackages(environment: PythonEnvironment): Promise<Package[] | undefined>;

    /**
     * Event raised when the list of packages in a Python Environment changes.
     * @see {@link DidChangePackagesEventArgs}
     */
    onDidChangePackages: Event<DidChangePackagesEventArgs>;
}

export interface PythonPackageItemApi {
    /**
     * Create a package item from the provided package info.
     *
     * @param info The package info.
     * @param environment The Python Environment in which the package is installed.
     * @param manager The package manager that installed the package.
     * @returns The package item.
     */
    createPackageItem(info: PackageInfo, environment: PythonEnvironment, manager: PackageManager): Package;
}

export interface PythonPackageManagementApi {
    /**
     * Install/Uninstall packages into a Python Environment.
     *
     * @param environment The Python Environment into which packages are to be installed.
     * @param packages The packages to install.
     * @param options Options for installing packages.
     */
    managePackages(environment: PythonEnvironment, options: PackageManagementOptions): Promise<void>;
}

export interface PythonPackageManagerApi
    extends PythonPackageManagerRegistrationApi,
        PythonPackageGetterApi,
        PythonPackageManagementApi,
        PythonPackageItemApi {}

/**
 * The API for interacting with Python environments, package managers, and projects.
 */
export interface PythonEnvironmentApi
    extends PythonEnvironmentManagerApi,
        PythonPackageManagerApi,
        PythonProjectApi,
        PythonExecutionApi,
        PythonEnvironmentVariablesApi {}
