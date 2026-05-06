import assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { CancellationToken, Progress, ProgressOptions, Uri } from 'vscode';
import { PythonEnvironmentApi, PythonProject } from '../../../api';
import * as winapi from '../../../common/window.apis';
import * as wapi from '../../../common/workspace.apis';
import { getProjectInstallable } from '../../../managers/builtin/pipUtils';

suite('Pip Utils - getProjectInstallable', () => {
    let findFilesStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    // Minimal mock that only implements the methods we need for this test
    // Using type assertion to satisfy TypeScript since we only need getPythonProject
    let mockApi: { getPythonProject: (uri: Uri) => PythonProject | undefined };

    setup(() => {
        findFilesStub = sinon.stub(wapi, 'findFiles');
        // Stub withProgress to immediately execute the callback
        withProgressStub = sinon.stub(winapi, 'withProgress');
        withProgressStub.callsFake(
            async (
                _options: ProgressOptions,
                callback: (
                    progress: Progress<{ message?: string; increment?: number }>,
                    token: CancellationToken,
                ) => Thenable<unknown>,
            ) => {
                return await callback(
                    {} as Progress<{ message?: string; increment?: number }>,
                    { isCancellationRequested: false } as CancellationToken,
                );
            },
        );

        const workspacePath = Uri.file('/test/path/root').fsPath;
        mockApi = {
            getPythonProject: (uri: Uri) => {
                // Return a project for any URI in workspace
                if (uri.fsPath.startsWith(workspacePath)) {
                    return { name: 'workspace', uri: Uri.file(workspacePath) };
                }
                return undefined;
            },
        };
    });

    teardown(() => {
        sinon.restore();
    });

    test('should find dev-requirements.txt at workspace root', async () => {
        // Arrange: Mock findFiles to return both requirements.txt and dev-requirements.txt
        findFilesStub.callsFake((pattern: string) => {
            if (pattern === '**/*requirements*.txt') {
                // This pattern might not match root-level files in VS Code
                return Promise.resolve([]);
            } else if (pattern === '*requirements*.txt') {
                // This pattern should match root-level files
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([
                    Uri.file(path.join(workspacePath, 'requirements.txt')),
                    Uri.file(path.join(workspacePath, 'dev-requirements.txt')),
                    Uri.file(path.join(workspacePath, 'test-requirements.txt')),
                ]);
            } else if (pattern === '**/requirements/*.txt') {
                return Promise.resolve([]);
            } else if (pattern === '**/pyproject.toml') {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });

        // Act: Call getProjectInstallable
        const workspacePath = Uri.file('/test/path/root').fsPath;
        const projects = [{ name: 'workspace', uri: Uri.file(workspacePath) }];
        const result = (await getProjectInstallable(mockApi as PythonEnvironmentApi, projects)).installables;

        // Assert: Should find all three requirements files
        assert.strictEqual(result.length, 3, 'Should find three requirements files');

        const names = result.map((r) => r.name).sort();
        assert.deepStrictEqual(
            names,
            ['dev-requirements.txt', 'requirements.txt', 'test-requirements.txt'],
            'Should find requirements.txt, dev-requirements.txt, and test-requirements.txt',
        );

        // Verify each file has correct properties
        result.forEach((item) => {
            assert.strictEqual(item.group, 'Requirements', 'Should be in Requirements group');
            assert.ok(item.args, 'Should have args');
            assert.strictEqual(item.args?.length, 2, 'Should have 2 args');
            assert.strictEqual(item.args?.[0], '-r', 'First arg should be -r');
            assert.ok(item.uri, 'Should have a URI');
        });
    });

    test('should deduplicate files found by multiple patterns', async () => {
        // Arrange: Mock both patterns to return the same file
        findFilesStub.callsFake((pattern: string) => {
            if (pattern === '**/*requirements*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([Uri.file(path.join(workspacePath, 'dev-requirements.txt'))]);
            } else if (pattern === '*requirements*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([
                    Uri.file(path.join(workspacePath, 'dev-requirements.txt')),
                    Uri.file(path.join(workspacePath, 'requirements.txt')),
                ]);
            } else if (pattern === '**/requirements/*.txt') {
                return Promise.resolve([]);
            } else if (pattern === '**/pyproject.toml') {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });

        // Act: Call getProjectInstallable
        const workspacePath = Uri.file('/test/path/root').fsPath;
        const projects = [{ name: 'workspace', uri: Uri.file(workspacePath) }];
        const result = (await getProjectInstallable(mockApi as PythonEnvironmentApi, projects)).installables;

        // Assert: Should deduplicate and only have 2 unique files
        assert.strictEqual(result.length, 2, 'Should deduplicate and have 2 unique files');

        const names = result.map((r) => r.name).sort();
        assert.deepStrictEqual(names, ['dev-requirements.txt', 'requirements.txt'], 'Should have deduplicated results');
    });

    test('should find requirements files in subdirectories', async () => {
        // Arrange: Mock findFiles to return files in subdirectories
        findFilesStub.callsFake((pattern: string) => {
            if (pattern === '**/*requirements*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([Uri.file(path.join(workspacePath, 'subdir', 'dev-requirements.txt'))]);
            } else if (pattern === '*requirements*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([Uri.file(path.join(workspacePath, 'requirements.txt'))]);
            } else if (pattern === '**/requirements/*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                return Promise.resolve([Uri.file(path.join(workspacePath, 'requirements', 'test.txt'))]);
            } else if (pattern === '**/pyproject.toml') {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });

        // Act: Call getProjectInstallable
        const workspacePath = Uri.file('/test/path/root').fsPath;
        const projects = [{ name: 'workspace', uri: Uri.file(workspacePath) }];
        const result = (await getProjectInstallable(mockApi as PythonEnvironmentApi, projects)).installables;

        // Assert: Should find all files
        assert.strictEqual(result.length, 3, 'Should find three files');

        const names = result.map((r) => r.name).sort();
        assert.deepStrictEqual(
            names,
            ['dev-requirements.txt', 'requirements.txt', 'test.txt'],
            'Should find files at different levels',
        );
    });

    test('should return empty array when no projects provided', async () => {
        // Act: Call with no projects
        const result = (await getProjectInstallable(mockApi as PythonEnvironmentApi, undefined)).installables;

        // Assert: Should return empty array
        assert.strictEqual(result.length, 0, 'Should return empty array');
        assert.ok(!findFilesStub.called, 'Should not call findFiles when no projects');
    });

    test('should filter out files not in project directories', async () => {
        // Arrange: Mock findFiles to return files from multiple directories
        findFilesStub.callsFake((pattern: string) => {
            if (pattern === '*requirements*.txt') {
                const workspacePath = Uri.file('/test/path/root').fsPath;
                const otherPath = Uri.file('/other-dir').fsPath;
                return Promise.resolve([
                    Uri.file(path.join(workspacePath, 'requirements.txt')),
                    Uri.file(path.join(otherPath, 'requirements.txt')), // Should be filtered out
                ]);
            } else {
                return Promise.resolve([]);
            }
        });

        // Act: Call with only workspace project
        const workspacePath = Uri.file('/test/path/root').fsPath;
        const projects = [{ name: 'workspace', uri: Uri.file(workspacePath) }];
        const result = (await getProjectInstallable(mockApi as PythonEnvironmentApi, projects)).installables;

        // Assert: Should only include files from workspace
        assert.strictEqual(result.length, 1, 'Should only include files from project directory');
        const firstResult = result[0];
        assert.ok(firstResult, 'Should have at least one result');
        assert.strictEqual(firstResult.name, 'requirements.txt');
        assert.ok(firstResult.uri, 'Should have a URI');
        assert.ok(firstResult.uri.fsPath.startsWith(workspacePath), 'Should be in workspace directory');
    });
});

suite('Pip Utils - getProjectInstallable (pyproject.toml parsing)', () => {
    let findFilesStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    let mockApi: { getPythonProject: (uri: Uri) => PythonProject | undefined };
    let tmpDir: string;

    setup(async () => {
        // Create a temporary directory with a fake workspace and pyproject.toml
        tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'pyproject-toml-test-'));

        findFilesStub = sinon.stub(wapi, 'findFiles');
        withProgressStub = sinon.stub(winapi, 'withProgress');
        withProgressStub.callsFake(
            async (
                _options: ProgressOptions,
                callback: (
                    progress: Progress<{ message?: string; increment?: number }>,
                    token: CancellationToken,
                ) => Thenable<unknown>,
            ) => {
                return await callback(
                    {} as Progress<{ message?: string; increment?: number }>,
                    { isCancellationRequested: false } as CancellationToken,
                );
            },
        );

        mockApi = {
            getPythonProject: (uri: Uri) => {
                if (uri.fsPath.startsWith(tmpDir)) {
                    return { name: 'workspace', uri: Uri.file(tmpDir) };
                }
                return undefined;
            },
        };
    });

    teardown(async () => {
        sinon.restore();
        await fse.remove(tmpDir);
    });

    /**
     * Writes a pyproject.toml with the given content to the temp dir,
     * stubs findFiles so only that file is returned, and calls getProjectInstallable.
     */
    async function runWithTomlContent(
        content: string,
    ): Promise<Awaited<ReturnType<typeof getProjectInstallable>>> {
        const tomlPath = path.join(tmpDir, 'pyproject.toml');
        await fse.writeFile(tomlPath, content, 'utf-8');

        findFilesStub.callsFake((pattern: string) => {
            if (pattern === '**/pyproject.toml') {
                return Promise.resolve([Uri.file(tomlPath)]);
            }
            return Promise.resolve([]);
        });

        const projects = [{ name: 'workspace', uri: Uri.file(tmpDir) }];
        return getProjectInstallable(mockApi as PythonEnvironmentApi, projects);
    }

    test('should parse a valid pyproject.toml with LF line endings', async () => {
        const content =
            '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "mypackage"\nversion = "1.0.0"\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 1, 'Should find one TOML installable');
        assert.strictEqual(result.installables[0].group, 'TOML', 'Should be in TOML group');
        assert.strictEqual(result.validationError, undefined, 'Should not have validation error');
    });

    test('should parse a valid pyproject.toml with CRLF line endings (Windows-style)', async () => {
        // This is the core regression test for issue #25809.
        // The @iarna/toml parser rejects \r as a control character in comments,
        // so we must normalize CRLF → LF before parsing.
        const content =
            '[build-system]\r\nrequires = ["setuptools"]\r\nbuild-backend = "setuptools.build_meta"\r\n\r\n[project]\r\nname = "mypackage"\r\nversion = "1.0.0"\r\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 1, 'Should find one TOML installable with CRLF');
        assert.strictEqual(result.installables[0].group, 'TOML', 'Should be in TOML group');
        assert.strictEqual(result.validationError, undefined, 'Should not have validation error');
    });

    test('should parse a pyproject.toml with CRLF line endings and comments', async () => {
        // Comments with \r caused "Control characters not allowed" errors in the TOML parser
        const content =
            '# This is a comment\r\n[build-system]\r\n# Another comment\r\nrequires = ["hatchling"]\r\nbuild-backend = "hatchling.build"\r\n\r\n# Project metadata\r\n[project]\r\nname = "my-package"\r\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 1, 'Should parse CRLF+comments successfully');
        assert.strictEqual(result.validationError, undefined, 'Should not have validation error');
    });

    test('should return validation error for invalid package name in pyproject.toml', async () => {
        // Spaces are not allowed in package names per PEP 508
        const content =
            '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "my package"\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 1, 'Installable is still added even with validation error');
        assert.ok(result.validationError, 'Should have validation error for invalid name');
        assert.ok(result.validationError.message.includes('"my package"'), 'Error should mention the invalid name');
    });

    test('should not add installable when pyproject.toml has no [build-system] section', async () => {
        // Without [build-system], the package cannot be pip-installed in editable mode
        const content = '[project]\nname = "mypackage"\nversion = "1.0.0"\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 0, 'No installable without [build-system]');
        assert.strictEqual(result.validationError, undefined, 'Should not have validation error');
    });

    test('should not add installable when pyproject.toml has no [project] section', async () => {
        // Without [project], the package is not a PEP 621 project
        const content = '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 0, 'No installable without [project]');
        assert.strictEqual(result.validationError, undefined, 'Should not have validation error');
    });

    test('should add optional-dependency extras as separate installables', async () => {
        const content =
            '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "mypackage"\n\n[project.optional-dependencies]\ndev = ["pytest", "black"]\ndocs = ["sphinx"]\n';

        const result = await runWithTomlContent(content);

        // Expect: base installable + 2 extras (dev, docs)
        assert.strictEqual(result.installables.length, 3, 'Should have base + 2 optional dependency groups');
        const names = result.installables.map((i) => i.name).sort();
        assert.ok(names.includes('dev'), 'Should include dev extras');
        assert.ok(names.includes('docs'), 'Should include docs extras');
        assert.ok(
            result.installables.every((i) => i.group === 'TOML'),
            'All installables should be in TOML group',
        );
    });

    test('should handle unparseable pyproject.toml gracefully (no crash)', async () => {
        // Completely invalid TOML content should be silently ignored
        const content = 'this is not valid toml @@@ ###';

        const result = await runWithTomlContent(content);

        assert.strictEqual(result.installables.length, 0, 'Should return empty on parse failure');
        assert.strictEqual(result.validationError, undefined, 'Should not report validation error on parse failure');
    });

    test('should return validation error for missing build-system requires field', async () => {
        // PEP 518 requires the 'requires' key in [build-system]
        const content =
            '[build-system]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "mypackage"\n';

        const result = await runWithTomlContent(content);

        assert.ok(result.validationError, 'Should have validation error for missing requires');
        assert.ok(result.validationError.message.includes('"requires"'), 'Error should mention the requires field');
    });

    test('should use editable install args (-e) for TOML installable', async () => {
        const content =
            '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "mypackage"\n';

        const result = await runWithTomlContent(content);

        const installable = result.installables[0];
        assert.ok(installable, 'Should have an installable');
        assert.ok(installable.args, 'Should have args');
        assert.strictEqual(installable.args?.[0], '-e', 'First arg should be -e for editable install');
        assert.strictEqual(installable.args?.[1], tmpDir, 'Second arg should be the project directory');
    });
});
