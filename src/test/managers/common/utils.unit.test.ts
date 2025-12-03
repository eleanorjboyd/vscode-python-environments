import assert from 'node:assert';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import { PythonEnvironment } from '../../../api';
import {
    isNumber,
    shortVersion,
    isGreater,
    compareVersions,
    sortEnvironments,
    getLatest,
    mergePackages,
    pathForGitBash,
} from '../../../managers/common/utils';
import { Installable } from '../../../managers/common/types';
import * as platformUtils from '../../../common/utils/platformUtils';

suite('Utility Functions - Complex Scenarios and Edge Cases', () => {
    let isWindowsStub: sinon.SinonStub;

    setup(() => {
        isWindowsStub = sinon.stub(platformUtils, 'isWindows');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('isNumber', () => {
        test('returns true for positive integers', () => {
            assert.strictEqual(isNumber(42), true);
            assert.strictEqual(isNumber(0), true);
            assert.strictEqual(isNumber(1), true);
        });

        test('returns true for negative integers', () => {
            assert.strictEqual(isNumber(-42), true);
            assert.strictEqual(isNumber(-1), true);
        });

        test('returns true for floating point numbers', () => {
            assert.strictEqual(isNumber(3.14), true);
            assert.strictEqual(isNumber(-3.14), true);
            assert.strictEqual(isNumber(0.0), true);
        });

        test('returns true for Infinity', () => {
            assert.strictEqual(isNumber(Infinity), true);
            assert.strictEqual(isNumber(-Infinity), true);
        });

        test('returns false for NaN', () => {
            assert.strictEqual(isNumber(NaN), false);
        });

        test('returns false for strings that look like numbers', () => {
            assert.strictEqual(isNumber('42'), false);
            assert.strictEqual(isNumber('3.14'), false);
        });

        test('returns false for boolean values', () => {
            assert.strictEqual(isNumber(true), false);
            assert.strictEqual(isNumber(false), false);
        });

        test('returns false for null and undefined', () => {
            assert.strictEqual(isNumber(null), false);
            assert.strictEqual(isNumber(undefined), false);
        });

        test('returns false for objects and arrays', () => {
            assert.strictEqual(isNumber({}), false);
            assert.strictEqual(isNumber([]), false);
            assert.strictEqual(isNumber([1, 2, 3]), false);
        });

        test('returns false for functions', () => {
            assert.strictEqual(isNumber(() => 42), false);
        });

        test('returns true for Number.MAX_VALUE and Number.MIN_VALUE', () => {
            assert.strictEqual(isNumber(Number.MAX_VALUE), true);
            assert.strictEqual(isNumber(Number.MIN_VALUE), true);
        });

        test('returns true for Number.EPSILON', () => {
            assert.strictEqual(isNumber(Number.EPSILON), true);
        });
    });

    suite('shortVersion', () => {
        test('formats standard three-part version', () => {
            assert.strictEqual(shortVersion('3.10.5'), '3.10.5');
        });

        test('formats two-part version with x suffix', () => {
            assert.strictEqual(shortVersion('3.10'), '3.10.x');
        });

        test('formats single digit major and minor versions', () => {
            assert.strictEqual(shortVersion('2.7.18'), '2.7.18');
        });

        test('formats version with double-digit minor version', () => {
            assert.strictEqual(shortVersion('3.11.0'), '3.11.0');
        });

        test('returns original string for non-version formats', () => {
            assert.strictEqual(shortVersion('not-a-version'), 'not-a-version');
            assert.strictEqual(shortVersion('abc'), 'abc');
        });

        test('handles version with leading text', () => {
            const result = shortVersion('Python 3.10.5');
            // The regex should match the version part
            assert.strictEqual(result, '3.10.5');
        });

        test('handles version with trailing text', () => {
            const result = shortVersion('3.10.5-beta');
            // The regex should match the version part
            assert.strictEqual(result, '3.10.5');
        });

        test('handles empty string', () => {
            assert.strictEqual(shortVersion(''), '');
        });

        test('handles version with leading zeros', () => {
            assert.strictEqual(shortVersion('3.09.05'), '3.09.05');
        });

        test('handles multi-digit patch version', () => {
            assert.strictEqual(shortVersion('3.10.125'), '3.10.125');
        });

        test('handles version in middle of text', () => {
            const result = shortVersion('version 3.11.2 final');
            assert.strictEqual(result, '3.11.2');
        });
    });

    suite('isGreater', () => {
        test('returns false when both versions are undefined', () => {
            assert.strictEqual(isGreater(undefined, undefined), false);
        });

        test('returns false when first version is undefined', () => {
            assert.strictEqual(isGreater(undefined, '3.10.0'), false);
        });

        test('returns true when second version is undefined', () => {
            assert.strictEqual(isGreater('3.10.0', undefined), true);
        });

        test('returns true when first version is greater', () => {
            assert.strictEqual(isGreater('3.11.0', '3.10.0'), true);
            assert.strictEqual(isGreater('3.10.5', '3.10.0'), true);
            assert.strictEqual(isGreater('4.0.0', '3.11.0'), true);
        });

        test('returns false when first version is less', () => {
            assert.strictEqual(isGreater('3.9.0', '3.10.0'), false);
            assert.strictEqual(isGreater('3.10.0', '3.10.5'), false);
            assert.strictEqual(isGreater('3.11.0', '4.0.0'), false);
        });

        test('returns false when versions are equal', () => {
            assert.strictEqual(isGreater('3.10.0', '3.10.0'), false);
            assert.strictEqual(isGreater('2.7.18', '2.7.18'), false);
        });

        test('handles different length versions - longer is greater', () => {
            assert.strictEqual(isGreater('3.10.5.1', '3.10.5'), true);
        });

        test('handles different length versions - shorter with higher value', () => {
            assert.strictEqual(isGreater('3.11', '3.10.5'), true);
        });

        test('handles malformed version strings gracefully', () => {
            // Should return false on exception
            assert.strictEqual(isGreater('not-a-version', '3.10.0'), false);
        });

        test('handles versions with leading zeros', () => {
            assert.strictEqual(isGreater('3.10.05', '3.10.03'), true);
        });

        test('handles versions with non-numeric parts', () => {
            // parseInt should handle partial parsing
            assert.strictEqual(isGreater('3.10a.0', '3.9.0'), true);
        });

        test('compares versions with many segments', () => {
            assert.strictEqual(isGreater('1.2.3.4.5.6', '1.2.3.4.5.5'), true);
        });

        test('handles single-segment versions', () => {
            assert.strictEqual(isGreater('4', '3'), true);
            assert.strictEqual(isGreater('3', '3'), false);
        });

        test('handles very long version numbers', () => {
            assert.strictEqual(isGreater('3.10.100', '3.10.99'), true);
        });
    });

    suite('compareVersions', () => {
        test('returns 0 for equal versions', () => {
            assert.strictEqual(compareVersions('3.10.0', '3.10.0'), 0);
            assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
        });

        test('returns 1 when first version is greater', () => {
            assert.strictEqual(compareVersions('3.11.0', '3.10.0'), 1);
            assert.strictEqual(compareVersions('3.10.5', '3.10.0'), 1);
            assert.strictEqual(compareVersions('4.0.0', '3.11.0'), 1);
        });

        test('returns -1 when first version is less', () => {
            assert.strictEqual(compareVersions('3.9.0', '3.10.0'), -1);
            assert.strictEqual(compareVersions('3.10.0', '3.10.5'), -1);
            assert.strictEqual(compareVersions('3.11.0', '4.0.0'), -1);
        });

        test('handles different length versions - missing parts treated as 0', () => {
            assert.strictEqual(compareVersions('3.10', '3.10.0'), 0);
            assert.strictEqual(compareVersions('3.10.1', '3.10'), 1);
            assert.strictEqual(compareVersions('3.10', '3.10.1'), -1);
        });

        test('handles major version differences', () => {
            assert.strictEqual(compareVersions('4.0.0', '3.99.99'), 1);
            assert.strictEqual(compareVersions('2.0.0', '3.0.0'), -1);
        });

        test('handles minor version differences', () => {
            assert.strictEqual(compareVersions('3.11.0', '3.10.99'), 1);
            assert.strictEqual(compareVersions('3.9.0', '3.10.0'), -1);
        });

        test('handles patch version differences', () => {
            assert.strictEqual(compareVersions('3.10.5', '3.10.4'), 1);
            assert.strictEqual(compareVersions('3.10.3', '3.10.4'), -1);
        });

        test('handles very long version strings', () => {
            assert.strictEqual(compareVersions('1.2.3.4.5.6.7.8', '1.2.3.4.5.6.7.9'), -1);
            assert.strictEqual(compareVersions('1.2.3.4.5.6.7.9', '1.2.3.4.5.6.7.8'), 1);
        });

        test('handles single-segment versions', () => {
            assert.strictEqual(compareVersions('4', '3'), 1);
            assert.strictEqual(compareVersions('3', '4'), -1);
            assert.strictEqual(compareVersions('3', '3'), 0);
        });

        test('handles versions with leading zeros', () => {
            // Leading zeros are parsed as numbers, so '03' becomes 3
            assert.strictEqual(compareVersions('3.10.05', '3.10.5'), 0);
        });

        test('handles double-digit version parts', () => {
            assert.strictEqual(compareVersions('3.12.10', '3.12.9'), 1);
            assert.strictEqual(compareVersions('11.0.0', '9.9.9'), 1);
        });

        test('handles triple-digit version parts', () => {
            assert.strictEqual(compareVersions('3.10.100', '3.10.99'), 1);
        });
    });

    suite('sortEnvironments', () => {
        function createEnv(name: string, version: string | undefined, path: string): PythonEnvironment {
            return {
                id: `${name}-${version ?? 'unknown'}`,
                envId: { id: `${name}-${version ?? 'unknown'}`, managerId: 'test' },
                name,
                displayName: name,
                displayPath: path,
                version: version ?? '',
                environmentPath: Uri.file(path),
                tools: [],
                execInfo: { run: { executable: 'python' } },
                sysPrefix: path,
            } as PythonEnvironment;
        }

        test('sorts environments by version in descending order', () => {
            const envs = [
                createEnv('python', '3.9.0', '/path/to/py39'),
                createEnv('python', '3.11.0', '/path/to/py311'),
                createEnv('python', '3.10.0', '/path/to/py310'),
            ];

            const sorted = sortEnvironments(envs);

            assert.strictEqual(sorted[0].version, '3.11.0');
            assert.strictEqual(sorted[1].version, '3.10.0');
            assert.strictEqual(sorted[2].version, '3.9.0');
        });

        test('sorts by name when versions are equal', () => {
            const envs = [
                createEnv('zeta', '3.10.0', '/path/to/zeta'),
                createEnv('alpha', '3.10.0', '/path/to/alpha'),
                createEnv('beta', '3.10.0', '/path/to/beta'),
            ];

            const sorted = sortEnvironments(envs);

            assert.strictEqual(sorted[0].name, 'alpha');
            assert.strictEqual(sorted[1].name, 'beta');
            assert.strictEqual(sorted[2].name, 'zeta');
        });

        test('sorts by path when version and name are equal', () => {
            const envs = [
                createEnv('python', '3.10.0', '/z/path'),
                createEnv('python', '3.10.0', '/a/path'),
                createEnv('python', '3.10.0', '/m/path'),
            ];

            const sorted = sortEnvironments(envs);

            assert.ok(sorted[0].environmentPath.fsPath.includes('/a/path'));
            assert.ok(sorted[1].environmentPath.fsPath.includes('/m/path'));
            assert.ok(sorted[2].environmentPath.fsPath.includes('/z/path'));
        });

        test('handles empty array', () => {
            const sorted = sortEnvironments([]);
            assert.strictEqual(sorted.length, 0);
        });

        test('handles single environment', () => {
            const envs = [createEnv('python', '3.10.0', '/path')];
            const sorted = sortEnvironments(envs);
            assert.strictEqual(sorted.length, 1);
            assert.strictEqual(sorted[0].version, '3.10.0');
        });

        test('handles undefined versions', () => {
            const envs = [
                createEnv('python', undefined, '/path1'),
                createEnv('python', '3.10.0', '/path2'),
                createEnv('python', undefined, '/path3'),
            ];

            const sorted = sortEnvironments(envs);

            // Environments with versions should come first (when using isGreater)
            // undefined is treated as less than any version
            assert.strictEqual(sorted[0].version, '3.10.0');
        });

        test('handles complex mixed scenarios', () => {
            const envs = [
                createEnv('venv', '3.9.0', '/z/venv'),
                createEnv('conda', '3.11.0', '/a/conda'),
                createEnv('venv', '3.11.0', '/a/venv'),
                createEnv('pyenv', '3.10.0', '/m/pyenv'),
                createEnv('conda', '3.11.0', '/z/conda'),
            ];

            const sorted = sortEnvironments(envs);

            // First: 3.11.0 conda environments (sorted by name, then path)
            assert.strictEqual(sorted[0].version, '3.11.0');
            assert.strictEqual(sorted[0].name, 'conda');
            assert.ok(sorted[0].environmentPath.fsPath.includes('/a/conda'));

            assert.strictEqual(sorted[1].version, '3.11.0');
            assert.strictEqual(sorted[1].name, 'conda');
            assert.ok(sorted[1].environmentPath.fsPath.includes('/z/conda'));

            // Next: 3.11.0 venv
            assert.strictEqual(sorted[2].version, '3.11.0');
            assert.strictEqual(sorted[2].name, 'venv');

            // Then: 3.10.0
            assert.strictEqual(sorted[3].version, '3.10.0');

            // Last: 3.9.0
            assert.strictEqual(sorted[4].version, '3.9.0');
        });

        test('maintains stability for equal elements', () => {
            const envs = [
                createEnv('python', '3.10.0', '/path1'),
                createEnv('python', '3.10.0', '/path1'),
            ];

            const sorted = sortEnvironments(envs);
            assert.strictEqual(sorted.length, 2);
        });

        test('handles version with different segment lengths', () => {
            const envs = [
                createEnv('python', '3.10', '/path1'),
                createEnv('python', '3.10.5', '/path2'),
                createEnv('python', '3.10.0', '/path3'),
            ];

            const sorted = sortEnvironments(envs);

            // 3.10.5 should be first (highest)
            assert.strictEqual(sorted[0].version, '3.10.5');
        });
    });

    suite('getLatest', () => {
        function createEnv(name: string, version: string | undefined, path: string): PythonEnvironment {
            return {
                id: `${name}-${version ?? 'unknown'}`,
                envId: { id: `${name}-${version ?? 'unknown'}`, managerId: 'test' },
                name,
                displayName: name,
                displayPath: path,
                version: version ?? '',
                environmentPath: Uri.file(path),
                tools: [],
                execInfo: { run: { executable: 'python' } },
                sysPrefix: path,
            } as PythonEnvironment;
        }

        test('returns undefined for empty array', () => {
            const result = getLatest([]);
            assert.strictEqual(result, undefined);
        });

        test('returns the only element for single-element array', () => {
            const envs = [createEnv('python', '3.10.0', '/path')];
            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.10.0');
        });

        test('returns environment with highest version', () => {
            const envs = [
                createEnv('python', '3.9.0', '/path/py39'),
                createEnv('python', '3.11.0', '/path/py311'),
                createEnv('python', '3.10.0', '/path/py310'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.11.0');
        });

        test('returns first environment when all have same version', () => {
            const envs = [
                createEnv('python1', '3.10.0', '/path1'),
                createEnv('python2', '3.10.0', '/path2'),
                createEnv('python3', '3.10.0', '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.name, 'python1');
        });

        test('handles undefined versions by treating them as lowest', () => {
            const envs = [
                createEnv('python1', undefined, '/path1'),
                createEnv('python2', '3.10.0', '/path2'),
                createEnv('python3', undefined, '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.10.0');
        });

        test('returns first undefined version when all are undefined', () => {
            const envs = [
                createEnv('python1', undefined, '/path1'),
                createEnv('python2', undefined, '/path2'),
                createEnv('python3', undefined, '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.name, 'python1');
        });

        test('handles mixed version formats', () => {
            const envs = [
                createEnv('python', '3.10', '/path1'),
                createEnv('python', '3.10.5', '/path2'),
                createEnv('python', '3.11.0', '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.11.0');
        });

        test('handles very close versions correctly', () => {
            const envs = [
                createEnv('python', '3.10.5', '/path1'),
                createEnv('python', '3.10.6', '/path2'),
                createEnv('python', '3.10.4', '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.10.6');
        });

        test('handles major version jumps', () => {
            const envs = [
                createEnv('python', '2.7.18', '/path1'),
                createEnv('python', '3.11.0', '/path2'),
                createEnv('python', '3.9.0', '/path3'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.11.0');
        });

        test('returns latest when first element is not the latest', () => {
            const envs = [
                createEnv('python', '3.8.0', '/path1'),
                createEnv('python', '3.9.0', '/path2'),
                createEnv('python', '3.11.0', '/path3'),
                createEnv('python', '3.10.0', '/path4'),
            ];

            const result = getLatest(envs);
            assert.strictEqual(result?.version, '3.11.0');
        });

        test('handles environments with identical versions and different names', () => {
            const envs = [
                createEnv('venv', '3.10.0', '/path1'),
                createEnv('conda', '3.10.0', '/path2'),
                createEnv('pyenv', '3.10.0', '/path3'),
            ];

            const result = getLatest(envs);
            // Should return the first one since all have same version
            assert.strictEqual(result?.name, 'venv');
        });
    });

    suite('mergePackages', () => {
        test('merges common and installed packages without duplicates', () => {
            const common = [
                { name: 'numpy', displayName: 'NumPy' },
                { name: 'pandas', displayName: 'Pandas' },
            ];
            const installed = ['numpy', 'scipy'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result.length, 3);
            assert.ok(result.some((p) => p.name === 'numpy' && p.displayName === 'NumPy'));
            assert.ok(result.some((p) => p.name === 'pandas'));
            assert.ok(result.some((p) => p.name === 'scipy'));
        });

        test('sorts merged packages alphabetically by name', () => {
            const common = [
                { name: 'zeta', displayName: 'Zeta Package' },
                { name: 'alpha', displayName: 'Alpha Package' },
            ];
            const installed = ['beta', 'gamma'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result[0].name, 'alpha');
            assert.strictEqual(result[1].name, 'beta');
            assert.strictEqual(result[2].name, 'gamma');
            assert.strictEqual(result[3].name, 'zeta');
        });

        test('handles empty common packages', () => {
            const common: Installable[] = [];
            const installed = ['numpy', 'scipy'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'numpy');
            assert.strictEqual(result[1].name, 'scipy');
        });

        test('handles empty installed packages', () => {
            const common = [
                { name: 'numpy', displayName: 'NumPy' },
                { name: 'pandas', displayName: 'Pandas' },
            ];
            const installed: string[] = [];

            const result = mergePackages(common, installed);

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'numpy');
            assert.strictEqual(result[1].name, 'pandas');
        });

        test('handles both arrays empty', () => {
            const result = mergePackages([], []);
            assert.strictEqual(result.length, 0);
        });

        test('preserves displayName from common packages', () => {
            const common = [{ name: 'numpy', displayName: 'NumPy Scientific Computing' }];
            const installed = ['numpy', 'scipy'];

            const result = mergePackages(common, installed);

            const numpyPkg = result.find((p) => p.name === 'numpy');
            assert.strictEqual(numpyPkg?.displayName, 'NumPy Scientific Computing');
        });

        test('creates displayName equal to name for new packages', () => {
            const common: Installable[] = [];
            const installed = ['new-package'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result[0].name, 'new-package');
            assert.strictEqual(result[0].displayName, 'new-package');
        });

        test('handles packages with same name in both lists', () => {
            const common = [{ name: 'numpy', displayName: 'NumPy' }];
            const installed = ['numpy'];

            const result = mergePackages(common, installed);

            // Should only have one numpy entry
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'numpy');
            assert.strictEqual(result[0].displayName, 'NumPy');
        });

        test('handles large number of packages', () => {
            const common = Array.from({ length: 50 }, (_, i) => ({
                name: `pkg-${String(i).padStart(3, '0')}`,
                displayName: `Package ${i}`,
            }));
            const installed = Array.from({ length: 100 }, (_, i) => `installed-${String(i).padStart(3, '0')}`);

            const result = mergePackages(common, installed);

            // Should have all packages without duplicates, sorted
            assert.ok(result.length >= 100);
            // Check that it's sorted
            for (let i = 1; i < result.length; i++) {
                assert.ok(result[i - 1].name <= result[i].name);
            }
        });

        test('handles packages with special characters in names', () => {
            const common = [{ name: 'package-name', displayName: 'Package Name' }];
            const installed = ['package_name', 'package.name'];

            const result = mergePackages(common, installed);

            assert.strictEqual(result.length, 3);
            assert.ok(result.some((p) => p.name === 'package-name'));
            assert.ok(result.some((p) => p.name === 'package_name'));
            assert.ok(result.some((p) => p.name === 'package.name'));
        });

        test('handles case-sensitive package names', () => {
            const common = [{ name: 'Package', displayName: 'Package' }];
            const installed = ['package', 'PACKAGE'];

            const result = mergePackages(common, installed);

            // All three should be treated as different packages
            assert.strictEqual(result.length, 3);
        });

        test('does not deduplicate packages appearing multiple times in installed', () => {
            const common = [{ name: 'numpy', displayName: 'NumPy' }];
            const installed = ['scipy', 'scipy', 'pandas'];

            const result = mergePackages(common, installed);

            // The function doesn't deduplicate within installed array
            const scipyCount = result.filter((p) => p.name === 'scipy').length;
            assert.strictEqual(scipyCount, 2);
        });

        test('preserves all properties of common packages', () => {
            const common: Installable[] = [
                {
                    name: 'numpy',
                    displayName: 'NumPy',
                    description: 'Scientific computing',
                    uri: Uri.parse('https://numpy.org'),
                },
            ];
            const installed: string[] = [];

            const result = mergePackages(common, installed);

            assert.strictEqual(result[0].name, 'numpy');
            assert.strictEqual(result[0].displayName, 'NumPy');
            assert.strictEqual(result[0].description, 'Scientific computing');
            assert.strictEqual(result[0].uri?.toString(), 'https://numpy.org/');
        });
    });

    suite('pathForGitBash', () => {
        test('converts Windows backslashes to forward slashes on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('C:\\Users\\name\\path');
            assert.strictEqual(result, '/C/Users/name/path');
        });

        test('converts Windows drive letter format on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('D:\\folder\\file.txt');
            assert.strictEqual(result, '/D/folder/file.txt');
        });

        test('handles lowercase drive letter on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('c:\\path\\to\\file');
            assert.strictEqual(result, '/c/path/to/file');
        });

        test('handles path without drive letter on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('\\path\\to\\file');
            assert.strictEqual(result, '/path/to/file');
        });

        test('returns Unix path unchanged on Unix', () => {
            isWindowsStub.returns(false);
            const result = pathForGitBash('/usr/local/bin/python');
            assert.strictEqual(result, '/usr/local/bin/python');
        });

        test('handles empty string', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('');
            assert.strictEqual(result, '');
        });

        test('handles Windows path with mixed slashes', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('C:\\path/to\\file');
            assert.strictEqual(result, '/C/path/to/file');
        });

        test('handles UNC paths on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('\\\\server\\share\\path');
            assert.strictEqual(result, '//server/share/path');
        });

        test('handles paths with spaces on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('C:\\Program Files\\Python\\python.exe');
            assert.strictEqual(result, '/C/Program Files/Python/python.exe');
        });

        test('handles paths with special characters on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('C:\\path\\with-dashes_and_underscores');
            assert.strictEqual(result, '/C/path/with-dashes_and_underscores');
        });

        test('handles very long paths on Windows', () => {
            isWindowsStub.returns(true);
            const longPath = 'C:\\' + 'very\\'.repeat(50) + 'long\\path';
            const result = pathForGitBash(longPath);
            assert.ok(result.startsWith('/C/'));
            assert.ok(!result.includes('\\'));
        });

        test('preserves trailing slash on Unix', () => {
            isWindowsStub.returns(false);
            const result = pathForGitBash('/path/to/directory/');
            assert.strictEqual(result, '/path/to/directory/');
        });

        test('preserves trailing backslash converted to slash on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('C:\\path\\to\\directory\\');
            assert.strictEqual(result, '/C/path/to/directory/');
        });

        test('handles relative paths on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('.\\relative\\path');
            assert.strictEqual(result, './relative/path');
        });

        test('handles parent directory references on Windows', () => {
            isWindowsStub.returns(true);
            const result = pathForGitBash('..\\..\\parent\\path');
            assert.strictEqual(result, '../../parent/path');
        });
    });

    // Note: getShellActivationCommands tests are omitted because they require
    // mocking fs.pathExists which is non-configurable in fs-extra.
    // This function performs file system checks and is better tested with integration tests.
});
