import assert from 'node:assert';
import path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as platformUtils from '../../../common/utils/platformUtils';
import { PythonEnvironment } from '../../../api';

// Import functions under test
import {
    isNumber,
    shortVersion,
    isGreater,
    sortEnvironments,
    getLatest,
    mergePackages,
    pathForGitBash,
    compareVersions,
    getShellActivationCommands,
} from '../../../managers/common/utils';

suite('Utils - Pure Utility Functions', () => {
    suite('isNumber', () => {
        test('returns true for valid numbers', () => {
            assert.strictEqual(isNumber(42), true);
            assert.strictEqual(isNumber(0), true);
            assert.strictEqual(isNumber(-1), true);
            assert.strictEqual(isNumber(3.14), true);
        });

        test('returns false for NaN', () => {
            assert.strictEqual(isNumber(NaN), false);
        });

        test('returns false for non-number types', () => {
            assert.strictEqual(isNumber('42'), false);
            assert.strictEqual(isNumber(null), false);
            assert.strictEqual(isNumber(undefined), false);
            assert.strictEqual(isNumber({}), false);
            assert.strictEqual(isNumber([]), false);
        });
    });

    suite('shortVersion', () => {
        test('returns shortened version with patch number', () => {
            assert.strictEqual(shortVersion('3.11.5'), '3.11.5');
            assert.strictEqual(shortVersion('2.7.18'), '2.7.18');
        });

        test('returns shortened version without patch number', () => {
            assert.strictEqual(shortVersion('3.11'), '3.11.x');
            assert.strictEqual(shortVersion('2.7'), '2.7.x');
        });

        test('returns original string when no version pattern matches', () => {
            assert.strictEqual(shortVersion('invalid'), 'invalid');
            assert.strictEqual(shortVersion(''), '');
        });

        test('extracts version from strings with prefixes and suffixes', () => {
            // The regex matches version patterns even with prefixes/suffixes
            assert.strictEqual(shortVersion('v3.11.5-rc1'), '3.11.5');
            assert.strictEqual(shortVersion('python3.10'), '3.10.x');
        });
    });

    suite('compareVersions', () => {
        test('returns 1 when first version is greater', () => {
            assert.strictEqual(compareVersions('3.11.0', '3.10.0'), 1);
            assert.strictEqual(compareVersions('3.11.1', '3.11.0'), 1);
            assert.strictEqual(compareVersions('3.11.0.1', '3.11.0'), 1);
        });

        test('returns -1 when first version is lesser', () => {
            assert.strictEqual(compareVersions('3.10.0', '3.11.0'), -1);
            assert.strictEqual(compareVersions('3.11.0', '3.11.1'), -1);
            assert.strictEqual(compareVersions('3.11.0', '3.11.0.1'), -1);
        });

        test('returns 0 when versions are equal', () => {
            assert.strictEqual(compareVersions('3.11.0', '3.11.0'), 0);
            assert.strictEqual(compareVersions('2.7.18', '2.7.18'), 0);
        });

        test('handles different version part counts', () => {
            assert.strictEqual(compareVersions('3.11', '3.11.0'), 0);
            assert.strictEqual(compareVersions('3.11.0', '3.11'), 0);
        });
    });

    suite('isGreater', () => {
        test('returns true when first version is greater', () => {
            assert.strictEqual(isGreater('3.11.0', '3.10.0'), true);
            assert.strictEqual(isGreater('3.11.1', '3.11.0'), true);
            assert.strictEqual(isGreater('3.11.0.1', '3.11.0'), true);
        });

        test('returns false when first version is lesser or equal', () => {
            assert.strictEqual(isGreater('3.10.0', '3.11.0'), false);
            assert.strictEqual(isGreater('3.11.0', '3.11.0'), false);
            assert.strictEqual(isGreater('3.11.0', '3.11.1'), false);
        });

        test('handles undefined versions', () => {
            assert.strictEqual(isGreater(undefined, undefined), false);
            assert.strictEqual(isGreater(undefined, '3.11.0'), false);
            assert.strictEqual(isGreater('3.11.0', undefined), true);
        });

        test('returns false when version parsing fails', () => {
            // Invalid version strings that cause parseInt to fail
            const result = isGreater('invalid', 'also-invalid');
            assert.strictEqual(result, false);
        });
    });

    suite('pathForGitBash', () => {
        let isWindowsStub: sinon.SinonStub;

        setup(() => {
            isWindowsStub = sinon.stub(platformUtils, 'isWindows');
        });

        teardown(() => {
            sinon.restore();
        });

        test('converts Windows path to Git Bash format on Windows', () => {
            isWindowsStub.returns(true);
            const windowsPath = 'C:\\Users\\test\\venv\\Scripts\\python.exe';
            const result = pathForGitBash(windowsPath);
            assert.strictEqual(result, '/C/Users/test/venv/Scripts/python.exe');
        });

        test('handles drive letter conversion on Windows', () => {
            isWindowsStub.returns(true);
            assert.strictEqual(pathForGitBash('D:\\path'), '/D/path');
            assert.strictEqual(pathForGitBash('E:\\another\\path'), '/E/another/path');
        });

        test('returns path unchanged on non-Windows', () => {
            isWindowsStub.returns(false);
            const unixPath = '/home/user/venv/bin/python';
            const result = pathForGitBash(unixPath);
            assert.strictEqual(result, unixPath);
        });
    });
});

suite('Utils - Data Manipulation Functions', () => {
    suite('mergePackages', () => {
        test('merges common packages with installed packages', () => {
            const common = [
                { name: 'numpy', displayName: 'NumPy' },
                { name: 'pandas', displayName: 'Pandas' },
            ];
            const installed = ['numpy', 'scipy', 'matplotlib'];

            const result = mergePackages(common, installed);

            // Verify all packages are present
            const names = result.map((p) => p.name);
            assert.deepStrictEqual(names.sort(), ['matplotlib', 'numpy', 'pandas', 'scipy']);
        });

        test('uses display names from common packages and package names for others', () => {
            const common = [{ name: 'numpy', displayName: 'NumPy' }];
            const installed = ['numpy', 'scipy'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result.find((p) => p.name === 'numpy')?.displayName, 'NumPy');
            assert.strictEqual(result.find((p) => p.name === 'scipy')?.displayName, 'scipy');
        });

        test('returns sorted list alphabetically by name', () => {
            const common = [{ name: 'zebra', displayName: 'Zebra' }];
            const installed = ['alpha', 'beta', 'zebra'];

            const result = mergePackages(common, installed);

            assert.deepStrictEqual(
                result.map((p) => p.name),
                ['alpha', 'beta', 'zebra'],
            );
        });

        test('handles empty common packages', () => {
            const result = mergePackages([], ['numpy', 'scipy']);
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'numpy');
        });

        test('handles empty installed packages', () => {
            const common = [{ name: 'numpy', displayName: 'NumPy' }];
            const result = mergePackages(common, []);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].displayName, 'NumPy');
        });
    });

    suite('sortEnvironments', () => {
        function createEnv(version: string, name: string, fsPath: string): PythonEnvironment {
            return {
                version,
                name,
                environmentPath: Uri.file(fsPath),
            } as PythonEnvironment;
        }

        test('sorts by version in descending order', () => {
            const envs = [
                createEnv('3.10.0', 'env1', '/path1'),
                createEnv('3.12.0', 'env2', '/path2'),
                createEnv('3.11.0', 'env3', '/path3'),
            ];

            const result = sortEnvironments(envs);

            assert.strictEqual(result[0].version, '3.12.0');
            assert.strictEqual(result[1].version, '3.11.0');
            assert.strictEqual(result[2].version, '3.10.0');
        });

        test('sorts by name when versions are equal', () => {
            const envs = [
                createEnv('3.11.0', 'charlie', '/path1'),
                createEnv('3.11.0', 'alpha', '/path2'),
                createEnv('3.11.0', 'beta', '/path3'),
            ];

            const result = sortEnvironments(envs);

            assert.strictEqual(result[0].name, 'alpha');
            assert.strictEqual(result[1].name, 'beta');
            assert.strictEqual(result[2].name, 'charlie');
        });

        test('sorts by path when version and name are equal', () => {
            const envs = [
                createEnv('3.11.0', 'env', '/path/z'),
                createEnv('3.11.0', 'env', '/path/a'),
                createEnv('3.11.0', 'env', '/path/m'),
            ];

            const result = sortEnvironments(envs);

            assert.strictEqual(result[0].environmentPath.fsPath, path.normalize('/path/a'));
            assert.strictEqual(result[1].environmentPath.fsPath, path.normalize('/path/m'));
            assert.strictEqual(result[2].environmentPath.fsPath, path.normalize('/path/z'));
        });
    });

    suite('getLatest', () => {
        function createEnv(version: string): PythonEnvironment {
            return {
                version,
                name: 'env',
                environmentPath: Uri.file('/path'),
            } as PythonEnvironment;
        }

        test('returns environment with highest version', () => {
            const envs = [createEnv('3.10.0'), createEnv('3.12.0'), createEnv('3.11.0')];

            const result = getLatest(envs);

            assert.strictEqual(result?.version, '3.12.0');
        });

        test('returns first environment when all versions are equal', () => {
            const envs = [
                { ...createEnv('3.11.0'), name: 'first' },
                { ...createEnv('3.11.0'), name: 'second' },
            ];

            const result = getLatest(envs);

            assert.strictEqual(result?.name, 'first');
        });

        test('returns undefined for empty collection', () => {
            const result = getLatest([]);
            assert.strictEqual(result, undefined);
        });

        test('returns single environment from single-item collection', () => {
            const envs = [createEnv('3.11.0')];
            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.11.0');
        });
    });
});

suite('Utils - Async Functions with Dependencies', () => {
    // Note: getShellActivationCommands uses fs.pathExists which cannot be easily stubbed in unit tests
    // These tests verify the shell command structure without mocking file system
    suite('getShellActivationCommands - structure tests', () => {
        test('returns Maps with shell activation and deactivation commands', async () => {
            const result = await getShellActivationCommands('/test/bin');

            // Verify return structure
            assert.ok(result.shellActivation instanceof Map);
            assert.ok(result.shellDeactivation instanceof Map);

            // Verify basic shells are configured
            assert.ok(result.shellActivation.size > 0);
            assert.ok(result.shellDeactivation.size > 0);
        });

        test('includes expected shell types', async () => {
            const result = await getShellActivationCommands('/test/bin');

            // Common shells should be present (exact list depends on file existence)
            const hasBasicShells =
                result.shellActivation.has('bash') ||
                result.shellActivation.has('sh') ||
                result.shellActivation.has('zsh');
            assert.ok(hasBasicShells, 'Should configure at least one basic shell');
        });
    });

    // Note: removeFirstDefaultEnvManagerSettingDetailed and notifyMissingManagerIfDefault
    // use VS Code APIs (workspace, window, commands) directly and are better suited for
    // extension tests (*.test.ts) that run in a full VS Code environment rather than unit tests.
    // These functions involve:
    // - workspace.getConfiguration() - requires VS Code workspace context
    // - window.showErrorMessage() - requires VS Code UI
    // - commands.executeCommand() - requires VS Code command registry
    // For comprehensive testing of these functions, create extension tests in a separate file.
});
