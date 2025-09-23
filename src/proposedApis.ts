import {
    Disposable,
    Event,
    FileChangeType,
    MarkdownString,
    TaskExecution,
    Terminal,
    TerminalOptions,
    Uri,
} from 'vscode';
import { PythonEnvironment } from './api';

/**
 * Interface representing a Python project.
 */
export interface PythonProject {
    /**
     * The name of the Python project.
     */
    readonly name: string;

    /**
     * The URI of the Python project.
     */
    readonly uri: Uri;

    /**
     * The description of the Python project.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python project, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;
}

/**
 * Options for creating a Python project.
 */
export interface PythonProjectCreatorOptions {
    /**
     * The name of the Python project.
     */
    name: string;

    /**
     * Path provided as the root for the project.
     */
    rootUri: Uri;

    /**
     * Boolean indicating whether the project should be created without any user input.
     */
    quickCreate?: boolean;
}

/**
 * Interface representing a creator for Python projects.
 */
export interface PythonProjectCreator {
    /**
     * The name of the Python project creator.
     */
    readonly name: string;

    /**
     * The display name of the Python project creator.
     */
    readonly displayName?: string;

    /**
     * The description of the Python project creator.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python project creator, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * Creates a new Python project(s) or, if files are not a project, returns Uri(s) to the created files.
     * Anything that needs its own python environment constitutes a project.
     * @param options Optional parameters for creating the Python project.
     * @returns A promise that resolves to one of the following:
     *   - PythonProject or PythonProject[]: when a single or multiple projects are created.
     *   - Uri or Uri[]: when files are created that do not constitute a project.
     *   - undefined: if project creation fails.
     */
    create(options?: PythonProjectCreatorOptions): Promise<PythonProject | PythonProject[] | Uri | Uri[] | undefined>;

    /**
     * A flag indicating whether the project creator supports quick create where no user input is required.
     */
    readonly supportsQuickCreate?: boolean;
}

/**
 * Event arguments for when Python projects change.
 */
export interface DidChangePythonProjectsEventArgs {
    /**
     * The list of Python projects that were added.
     */
    added: PythonProject[];

    /**
     * The list of Python projects that were removed.
     */
    removed: PythonProject[];
}

export interface PythonProjectCreationApi {
    /**
     * Register a Python project creator.
     *
     * @param creator The project creator to register.
     * @returns A disposable that can be used to unregister the project creator.
     * @see {@link PythonProjectCreator}
     */
    registerPythonProjectCreator(creator: PythonProjectCreator): Disposable;
}
export interface PythonProjectGetterApi {
    /**
     * Get all python projects.
     */
    getPythonProjects(): readonly PythonProject[];

    /**
     * Get the python project for a given URI.
     *
     * @param uri The URI of the project
     * @returns The project or `undefined` if not found.
     */
    getPythonProject(uri: Uri): PythonProject | undefined;
}

export interface PythonProjectModifyApi {
    /**
     * Add a python project or projects to the list of projects.
     *
     * @param projects The project or projects to add.
     */
    addPythonProject(projects: PythonProject | PythonProject[]): void;

    /**
     * Remove a python project from the list of projects.
     *
     * @param project The project to remove.
     */
    removePythonProject(project: PythonProject): void;

    /**
     * Event raised when python projects are added or removed.
     * @see {@link DidChangePythonProjectsEventArgs}
     */
    onDidChangePythonProjects: Event<DidChangePythonProjectsEventArgs>;
}

export interface PythonProjectApi extends PythonProjectCreationApi, PythonProjectGetterApi, PythonProjectModifyApi {}

/**
 * Object representing the process started using run in background API.
 */
export interface PythonProcess {
    /**
     * The process ID of the Python process.
     */
    readonly pid?: number;

    /**
     * The standard input of the Python process.
     */
    readonly stdin: NodeJS.WritableStream;

    /**
     * The standard output of the Python process.
     */
    readonly stdout: NodeJS.ReadableStream;

    /**
     * The standard error of the Python process.
     */
    readonly stderr: NodeJS.ReadableStream;

    /**
     * Kills the Python process.
     */
    kill(): void;

    /**
     * Event that is fired when the Python process exits.
     */
    onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
}

/**
 * The API for interacting with Python projects. A project in python is any folder or file that is a contained
 * in some manner. For example, a PEP-723 compliant file can be treated as a project. A folder with a `pyproject.toml`,
 * or just python files can be treated as a project. All this allows you to do is set a python environment for that project.
 *
 * By default all `vscode.workspace.workspaceFolders` are treated as projects.
 */

export interface PythonTerminalCreateOptions extends TerminalOptions {
    /**
     * Whether to disable activation on create.
     */
    disableActivation?: boolean;
}

export interface PythonTerminalCreateApi {
    /**
     * Creates a terminal and activates any (activatable) environment for the terminal.
     *
     * @param environment The Python environment to activate.
     * @param options Options for creating the terminal.
     *
     * Note: Non-activatable environments have no effect on the terminal.
     */
    createTerminal(environment: PythonEnvironment, options: PythonTerminalCreateOptions): Promise<Terminal>;
}

/**
 * Options for running a Python script or module in a terminal.
 *
 * Example:
 *  * Running Script: `python myscript.py --arg1`
 *  ```typescript
 *    {
 *       args: ["myscript.py", "--arg1"]
 *    }
 *  ```
 *  * Running a module: `python -m my_module --arg1`
 *  ```typescript
 *    {
 *       args: ["-m", "my_module", "--arg1"]
 *    }
 *  ```
 */
export interface PythonTerminalExecutionOptions {
    /**
     * Current working directory for the terminal. This in only used to create the terminal.
     */
    cwd: string | Uri;

    /**
     * Arguments to pass to the python executable.
     */
    args?: string[];

    /**
     * Set `true` to show the terminal.
     */
    show?: boolean;
}

export interface PythonTerminalRunApi {
    /**
     * Runs a Python script or module in a terminal. This API will create a terminal if one is not available to use.
     * If a terminal is available, it will be used to run the script or module.
     *
     * Note:
     *  - If you restart VS Code, this will create a new terminal, this is a limitation of VS Code.
     *  - If you close the terminal, this will create a new terminal.
     *  - In cases of multi-root/project scenario, it will create a separate terminal for each project.
     */
    runInTerminal(environment: PythonEnvironment, options: PythonTerminalExecutionOptions): Promise<Terminal>;

    /**
     * Runs a Python script or module in a dedicated terminal. This API will create a terminal if one is not available to use.
     * If a terminal is available, it will be used to run the script or module. This terminal will be dedicated to the script,
     * and selected based on the `terminalKey`.
     *
     * @param terminalKey A unique key to identify the terminal. For scripts you can use the Uri of the script file.
     */
    runInDedicatedTerminal(
        terminalKey: Uri | string,
        environment: PythonEnvironment,
        options: PythonTerminalExecutionOptions,
    ): Promise<Terminal>;
}

/**
 * Options for running a Python task.
 *
 * Example:
 *  * Running Script: `python myscript.py --arg1`
 *  ```typescript
 *    {
 *       args: ["myscript.py", "--arg1"]
 *    }
 *  ```
 *  * Running a module: `python -m my_module --arg1`
 *  ```typescript
 *    {
 *       args: ["-m", "my_module", "--arg1"]
 *    }
 *  ```
 */
export interface PythonTaskExecutionOptions {
    /**
     * Name of the task to run.
     */
    name: string;

    /**
     * Arguments to pass to the python executable.
     */
    args: string[];

    /**
     * The Python project to use for the task.
     */
    project?: PythonProject;

    /**
     * Current working directory for the task. Default is the project directory for the script being run.
     */
    cwd?: string;

    /**
     * Environment variables to set for the task.
     */
    env?: { [key: string]: string };
}

export interface PythonTaskRunApi {
    /**
     * Run a Python script or module as a task.
     *
     */
    runAsTask(environment: PythonEnvironment, options: PythonTaskExecutionOptions): Promise<TaskExecution>;
}
/**
 * Options for running a Python script or module in the background.
 */
export interface PythonBackgroundRunOptions {
    /**
     * The Python environment to use for running the script or module.
     */
    args: string[];

    /**
     * Current working directory for the script or module. Default is the project directory for the script being run.
     */
    cwd?: string;

    /**
     * Environment variables to set for the script or module.
     */
    env?: { [key: string]: string | undefined };
}
export interface PythonBackgroundRunApi {
    /**
     * Run a Python script or module in the background. This API will create a new process to run the script or module.
     */
    runInBackground(environment: PythonEnvironment, options: PythonBackgroundRunOptions): Promise<PythonProcess>;
}

export interface PythonExecutionApi
    extends PythonTerminalCreateApi,
        PythonTerminalRunApi,
        PythonTaskRunApi,
        PythonBackgroundRunApi {}

/**
 * Event arguments for when the monitored `.env` files or any other sources change.
 */
export interface DidChangeEnvironmentVariablesEventArgs {
    /**
     * The URI of the file that changed. No `Uri` means a non-file source of environment variables changed.
     */
    uri?: Uri;

    /**
     * The type of change that occurred.
     */
    changeType: FileChangeType;
}

export interface PythonEnvironmentVariablesApi {
    /**
     * Get environment variables for a workspace. This picks up `.env` file from the root of the
     * workspace.
     *
     * Order of overrides:
     * 1. `baseEnvVar` if given or `process.env`
     * 2. `.env` file from the "python.envFile" setting in the workspace.
     * 3. `.env` file at the root of the python project.
     * 4. `overrides` in the order provided.
     *
     * @param uri The URI of the project, workspace or a file in a for which environment variables are required.
     * @param overrides Additional environment variables to override the defaults.
     * @param baseEnvVar The base environment variables that should be used as a starting point.
     */
    getEnvironmentVariables(
        uri: Uri,
        overrides?: ({ [key: string]: string | undefined } | Uri)[],
        baseEnvVar?: { [key: string]: string | undefined },
    ): Promise<{ [key: string]: string | undefined }>;

    /**
     * Event raised when `.env` file changes or any other monitored source of env variable changes.
     */
    onDidChangeEnvironmentVariables: Event<DidChangeEnvironmentVariablesEventArgs>;
}
