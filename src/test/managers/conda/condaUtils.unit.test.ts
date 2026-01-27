import assert from 'assert';
import * as os from 'os';
import * as sinon from 'sinon';
import {
    getCondaPathSetting,
    trimVersionToMajorMinor,
    generateName,
    getName,
} from '../../../managers/conda/condaUtils';
import * as workspaceApis from '../../../common/workspace.apis';
import { Uri } from 'vscode';
import { PythonEnvironmentApi } from '../../../api';

/**
 * Tests for condaUtils.ts
 * 
 * Note: This test suite focuses on pure functions that don't require mocking Node.js modules.
 * Functions that directly interact with file system (fse) or child processes (ch.spawn) 
 * are challenging to test in unit tests without wrapper abstractions.
 * 
 * Based on the test plan in docs/condaUtils-test-plan.md, we're testing:
 * - getCondaPathSetting: Configuration reading with tilde expansion
 * - trimVersionToMajorMinor: Version string parsing
 * - generateName: Unique name generation logic  
 * - getName: URI to name conversion
 */

suite('condaUtils - Configuration and Settings', () => {
    let getConfigurationStub: sinon.SinonStub;

    setup(() => {
        getConfigurationStub = sinon.stub(workspaceApis, 'getConfiguration');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('getCondaPathSetting', () => {
        test('should return conda path from python.condaPath setting', () => {
            const mockConfig = { get: sinon.stub().withArgs('condaPath').returns('/custom/conda') };
            getConfigurationStub.withArgs('python').returns(mockConfig);

            const result = getCondaPathSetting();

            assert.strictEqual(result, '/custom/conda');
        });

        test('should untildify conda path with tilde', () => {
            const mockConfig = { get: sinon.stub().withArgs('condaPath').returns('~/miniconda3/bin/conda') };
            getConfigurationStub.withArgs('python').returns(mockConfig);

            const result = getCondaPathSetting();

            assert.ok(result);
            assert.ok(!result.includes('~'), 'Should expand tilde');
            assert.ok(result.includes(os.homedir()), 'Should include home directory');
        });

        test('should return undefined when condaPath not set', () => {
            const mockConfig = { get: sinon.stub().withArgs('condaPath').returns(undefined) };
            getConfigurationStub.withArgs('python').returns(mockConfig);

            const result = getCondaPathSetting();

            assert.strictEqual(result, undefined);
        });

        test('should return value as-is when non-string value provided', () => {
            const mockConfig = { get: sinon.stub().withArgs('condaPath').returns(123) };
            getConfigurationStub.withArgs('python').returns(mockConfig);

            const result = getCondaPathSetting();

            assert.strictEqual(result, 123);
        });
    });
});

suite('condaUtils - Version Utilities', () => {
    suite('trimVersionToMajorMinor', () => {
        test('should trim version to major.minor.patch', () => {
            const result = trimVersionToMajorMinor('3.11.5');
            assert.strictEqual(result, '3.11.5');
        });

        test('should trim version with extra segments', () => {
            const result = trimVersionToMajorMinor('3.11.5.post1+abc123');
            assert.strictEqual(result, '3.11.5');
        });

        test('should handle two-part versions', () => {
            const result = trimVersionToMajorMinor('3.11');
            assert.strictEqual(result, '3.11');
        });

        test('should return original for single-part versions', () => {
            const result = trimVersionToMajorMinor('3');
            assert.strictEqual(result, '3');
        });

        test('should return original for non-standard versions', () => {
            const result = trimVersionToMajorMinor('latest');
            assert.strictEqual(result, 'latest');
        });

        test('should handle version with leading v', () => {
            const result = trimVersionToMajorMinor('v3.11.5');
            assert.strictEqual(result, 'v3.11.5');
        });
    });
});

suite('condaUtils - Name and Path Utilities', () => {
    suite('getName', () => {
        let mockApi: { getPythonProject: sinon.SinonStub };

        setup(() => {
            mockApi = {
                getPythonProject: sinon.stub(),
            };
        });

        test('should return undefined when no URIs provided', () => {
            const result = getName(mockApi as unknown as PythonEnvironmentApi, undefined);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined when empty array provided', () => {
            const result = getName(mockApi as unknown as PythonEnvironmentApi, []);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined when multiple URIs provided', () => {
            const uris = [Uri.file('/path1'), Uri.file('/path2')];
            const result = getName(mockApi as unknown as PythonEnvironmentApi, uris);
            assert.strictEqual(result, undefined);
        });

        test('should return project name for single URI', () => {
            const uri = Uri.file('/workspace/project');
            mockApi.getPythonProject.withArgs(uri).returns({ name: 'my-project', uri });

            const result = getName(mockApi as unknown as PythonEnvironmentApi, uri);

            assert.strictEqual(result, 'my-project');
        });

        test('should return project name for single-element array', () => {
            const uri = Uri.file('/workspace/project');
            mockApi.getPythonProject.withArgs(uri).returns({ name: 'my-project', uri });

            const result = getName(mockApi as unknown as PythonEnvironmentApi, [uri]);

            assert.strictEqual(result, 'my-project');
        });

        test('should return undefined when project not found', () => {
            const uri = Uri.file('/workspace/project');
            mockApi.getPythonProject.withArgs(uri).returns(undefined);

            const result = getName(mockApi as unknown as PythonEnvironmentApi, uri);

            assert.strictEqual(result, undefined);
        });
    });

    suite('generateName', () => {
        test('should generate unique name with env_ prefix', async () => {
            // This is an integration-style test since we can't easily mock fs.exists
            // We just verify the format and that it returns a string
            const result = await generateName('/some/path');

            assert.ok(result, 'Should return a name');
            assert.ok(result!.startsWith('env_'), 'Should start with env_ prefix');
            assert.ok(result!.length > 4, 'Should have random suffix');
        });
    });
});
