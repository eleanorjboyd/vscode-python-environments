# Test Plan: src/managers/conda/condaUtils.ts

Below are focused, high-value test bullets. Trivial items (constants, simple getters/setters, thin wrappers) are intentionally omitted.

## Conda Resolution & Execution
- getCondaExecutable(): resolves from cache → persistent state → PATH → native managers; caches successful path; throws when none found.
- getConda(): respects `python.condaPath` setting (untildify), otherwise delegates to `getCondaExecutable()`.
- _runConda(): spawns process, logs stdout/stderr, returns stdout on success; handles CancellationToken (kills process, rejects with cancellation); propagates non-zero exit as error.
- runCondaExecutable(): uses `getCondaExecutable()` regardless of setting; verify differing behavior from `runConda()` when `python.condaPath` is set to invalid path.

## Prefix Discovery & Defaults
- getCondaInfo(): runs `conda info --envs --json` and parses output; handles malformed JSON.
- getPrefixes(): uses cache when present; otherwise loads from `getCondaInfo()`; persists to state.
- getDefaultCondaPrefix(): returns first prefix if available; otherwise falls back to `~/.conda/envs`.

## Version Metadata
- getVersion(root): parses `conda-meta/python-3*.json` to extract Python version; throws when not found; handles multiple python files consistently.

## Shell Activation Maps
- buildShellActivationMapForConda():
  - No sourcing info → default `conda activate/deactivate` for all shells.
  - Local and global sourcing scripts present → prefers local; uses `source <path> <envIdentifier>` on Unix shells.
  - Windows path: uses `conda-hook.ps1` when available; cmd and bash paths normalized; falls back on errors.
- generateShellActivationMapFromConfig(): produces consistent maps for `GITBASH`, `CMD`, `BASH`, `SH`, `ZSH`, `PWSH` with provided templates.
- windowsExceptionGenerateConfig(): builds per-shell activation with ps1 hook; verifies logging and path normalization.

## Environment Info Builders & Mapping
- getNamedCondaPythonInfo(): builds `PythonEnvironmentInfo` for named envs; activation `conda activate <name>`; includes shell maps.
- getPrefixesCondaPythonInfo(): builds info for prefix envs; activation uses provided `conda` path with prefix; includes shell maps.
- nativeToPythonEnv():
  - Base env → named builder with `base`.
  - Prefix env outside known prefixes → prefix builder.
  - Named env within prefixes → named builder with `name` or basename.
  - No-python (missing executable/version) → `getCondaWithoutPython()` path.

## Path Resolution & Refresh
- resolveCondaPath(): returns mapped `PythonEnvironment` for conda-native; returns undefined for non-conda; handles resolver errors gracefully.
- refreshCondaEnvs():
  - Uses `getConda()`; if unavailable, discovers `conda` from native managers and calls `setConda()`.
  - Converts native conda envs to `PythonEnvironment[]` and sorts; logs error and returns [] when no `conda` found.

## Project Helpers & UX
- pickPythonVersion(): aggregates global env versions, trims via `trimVersionToMajorMinor`, sorts by major/minor; quick-pick selection yields version; handles no versions.
- getLocation(): returns fsPath for single URI; with none or multiple URIs shows picker and returns chosen path; handles cancel.

## Environment Creation & Deletion
- createNamedCondaEnvironment(): creates env with `conda create --name <name> [python=...]`; shows progress; environment appears via native refresh.
- createPrefixCondaEnvironment(): creates env at prefix path; optional python version; returns environment on success.
- generateName(fsPath): returns unique name within 5 attempts; respects existing folder check.
- quickCreateConda(): creates prefix env and installs additional packages when provided; progress + final environment verified.
- deleteCondaEnvironment(): removes env via `conda env remove --prefix`; native refresh no longer lists it.

## Package Management
- refreshPackages(): parses `conda list -p <prefix>` into `Package[]`; ignores commented lines; handles malformed lines gracefully.
- managePackages(): performs uninstall then install; calls `refreshPackages()`; handles empty sets; ensures idempotency.
- getCommonPackages(): loads common installables from file; handles missing file or invalid JSON.
- selectCommonPackagesOrSkip(): builds quick-pick items from common vs installed; supports multi-select and optional Skip; returns install/uninstall sets or undefined on cancel.
- getCommonCondaPackagesToInstall(): integrates common and installed; returns user-chosen sets.

## No-Python Handling
- installPython(): installs Python into “no-python” env via `conda install --prefix <sysPrefix> python`; refreshes native finder; returns updated environment.
- checkForNoPythonCondaEnvironment(): detects `version === 'no-python'`; offers path to `installPython()`; returns updated environment or original when already has Python.

## Cross-Cutting Behaviors
- Logging: ensure `traceInfo`/`traceVerbose` are invoked at key decision points (resolution, activation map generation, refresh).
- Cancellation: verify cancellation paths in `_runConda()` don’t leak processes and propagate `CancellationError`.
- Error Handling: confirm thrown errors include actionable messages and do not duplicate notifications.
