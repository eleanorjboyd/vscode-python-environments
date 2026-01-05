import assert from 'node:assert';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as persistentState from '../../../common/persistentState';
import * as windowApis from '../../../common/window.apis';
import * as workspaceApis from '../../../common/workspace.apis';
import { PythonProjectSettings } from '../../../internal.api';

// Import the functions under test
import {
    validatePythonProjectsSettings,
    notifyInvalidPythonProjectsSettings,
    validateAndNotifyPythonProjectsSettings,
} from '../../../features/settings/settingsValidation';

interface MockWorkspaceConfig {
    get: sinon.SinonStub;
    inspect: sinon.SinonStub;
    update: sinon.SinonStub;
}

interface MockPersistentState {
    get: sinon.SinonStub;
    set: sinon.SinonStub;
    clear: sinon.SinonStub;
}

suite('Settings Validation Tests', () => {
    let mockGetConfiguration: sinon.SinonStub;
    let mockGetWorkspaceFolders: sinon.SinonStub;
    let mockShowWarningMessage: sinon.SinonStub;
    let mockGetGlobalPersistentState: sinon.SinonStub;
    let mockPersistentState: MockPersistentState;

    setup(() => {
        // Mock workspace APIs
        mockGetConfiguration = sinon.stub(workspaceApis, 'getConfiguration');
        mockGetWorkspaceFolders = sinon.stub(workspaceApis, 'getWorkspaceFolders');

        // Mock window APIs
        mockShowWarningMessage = sinon.stub(windowApis, 'showWarningMessage');

        // Mock persistent state
        mockPersistentState = {
            get: sinon.stub(),
            set: sinon.stub(),
            clear: sinon.stub(),
        };
        mockGetGlobalPersistentState = sinon.stub(persistentState, 'getGlobalPersistentState');
        mockGetGlobalPersistentState.resolves(mockPersistentState);

        // Default: no "don't show again" preference
        mockPersistentState.get.resolves(false);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('validatePythonProjectsSettings', () => {
        test('should return empty array when no workspaces exist', () => {
            // Mock → No workspaces
            mockGetWorkspaceFolders.returns([]);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 0, 'Should return empty array when no workspaces');
        });

        test('should return empty array when pythonProjects is empty array', () => {
            // Mock → Workspace with empty pythonProjects
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns([]);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 0, 'Should return empty array for valid empty settings');
        });

        test('should return empty array when all entries are valid', () => {
            // Mock → Valid pythonProjects entries
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const validSettings: PythonProjectSettings[] = [
                {
                    path: './project1',
                    envManager: 'ms-python.python:venv',
                    packageManager: 'ms-python.python:pip',
                },
                {
                    path: './project2',
                    envManager: 'ms-python.python:conda',
                    packageManager: 'ms-python.python:conda',
                },
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(validSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 0, 'Should return empty array when all entries are valid');
        });

        test('should detect missing path field', () => {
            // Mock → Entry missing path field
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = [
                {
                    envManager: 'ms-python.python:venv',
                    packageManager: 'ms-python.python:pip',
                } as unknown as PythonProjectSettings,
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 1, 'Should detect missing path field');
            assert.ok(result[0].reason.includes('path'), 'Error should mention missing path field');
        });

        test('should detect missing envManager field', () => {
            // Mock → Entry missing envManager field
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = [
                {
                    path: './project',
                    packageManager: 'ms-python.python:pip',
                } as unknown as PythonProjectSettings,
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 1, 'Should detect missing envManager field');
            assert.ok(result[0].reason.includes('envManager'), 'Error should mention missing envManager field');
        });

        test('should detect missing packageManager field', () => {
            // Mock → Entry missing packageManager field
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = [
                {
                    path: './project',
                    envManager: 'ms-python.python:venv',
                } as unknown as PythonProjectSettings,
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 1, 'Should detect missing packageManager field');
            assert.ok(
                result[0].reason.includes('packageManager'),
                'Error should mention missing packageManager field',
            );
        });

        test('should detect non-object entry', () => {
            // Mock → Non-object entry (string)
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = ['invalid-string' as unknown as PythonProjectSettings];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 1, 'Should detect non-object entry');
            // String entries get caught as "Invalid entry format: expected object" or "Missing required field"
            // Both are acceptable since the entry is invalid
            assert.ok(result[0].reason.length > 0, 'Error should have a reason');
        });

        test('should detect invalid array format (non-array)', () => {
            // Mock → pythonProjects is not an array
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns('invalid-string' as unknown);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 1, 'Should detect non-array format');
            assert.ok(result[0].reason.includes('array'), 'Error should mention array format');
        });

        test('should detect multiple invalid entries', () => {
            // Mock → Multiple invalid entries
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = [
                { path: './valid', envManager: 'ms-python.python:venv', packageManager: 'ms-python.python:pip' },
                { envManager: 'ms-python.python:venv', packageManager: 'ms-python.python:pip' } as unknown,
                { path: './invalid2', packageManager: 'ms-python.python:pip' } as unknown,
            ] as PythonProjectSettings[];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            // Run
            const result = validatePythonProjectsSettings();

            // Assert
            assert.strictEqual(result.length, 2, 'Should detect all invalid entries');
        });
    });

    suite('notifyInvalidPythonProjectsSettings', () => {
        test('should not show notification when no invalid entries', async () => {
            // Mock → No invalid entries
            const invalidEntries: never[] = [];

            // Run
            await notifyInvalidPythonProjectsSettings(invalidEntries);

            // Assert
            assert.strictEqual(
                mockShowWarningMessage.called,
                false,
                'Should not show notification for empty array',
            );
        });

        test('should not show notification when user chose "don\'t show again"', async () => {
            // Mock → User previously selected "don't show again"
            mockPersistentState.get.resolves(true);

            const invalidEntries = [
                {
                    entry: { path: './test' } as PythonProjectSettings,
                    workspaceUri: Uri.file('/workspace'),
                    reason: 'Missing required fields',
                },
            ];

            // Run
            await notifyInvalidPythonProjectsSettings(invalidEntries);

            // Assert
            assert.strictEqual(
                mockShowWarningMessage.called,
                false,
                'Should not show notification when user opted out',
            );
        });

        test('should show notification with correct message for single invalid entry', async () => {
            // Mock → One invalid entry
            const invalidEntries = [
                {
                    entry: { path: './test' } as PythonProjectSettings,
                    workspaceUri: Uri.file('/workspace'),
                    reason: 'Missing required fields',
                },
            ];

            mockShowWarningMessage.resolves(undefined);

            // Run
            await notifyInvalidPythonProjectsSettings(invalidEntries);

            // Assert
            assert.strictEqual(mockShowWarningMessage.callCount, 1, 'Should show warning message');
            const message = mockShowWarningMessage.firstCall.args[0];
            assert.ok(
                message.includes('invalid entry') && !message.includes('entries'),
                'Message should be singular for one entry',
            );
        });

        test('should show notification with correct message for multiple invalid entries', async () => {
            // Mock → Multiple invalid entries
            const invalidEntries = [
                {
                    entry: { path: './test1' } as PythonProjectSettings,
                    workspaceUri: Uri.file('/workspace'),
                    reason: 'Missing envManager',
                },
                {
                    entry: { path: './test2' } as PythonProjectSettings,
                    workspaceUri: Uri.file('/workspace'),
                    reason: 'Missing packageManager',
                },
            ];

            mockShowWarningMessage.resolves(undefined);

            // Run
            await notifyInvalidPythonProjectsSettings(invalidEntries);

            // Assert
            assert.strictEqual(mockShowWarningMessage.callCount, 1, 'Should show warning message');
            const message = mockShowWarningMessage.firstCall.args[0];
            assert.ok(message.includes('2'), 'Message should include count');
            assert.ok(message.includes('entries'), 'Message should be plural for multiple entries');
        });

        test('should save preference when user selects "don\'t show again"', async () => {
            // Mock → User selects "don't show again"
            const invalidEntries = [
                {
                    entry: { path: './test' } as PythonProjectSettings,
                    workspaceUri: Uri.file('/workspace'),
                    reason: 'Missing required fields',
                },
            ];

            mockShowWarningMessage.resolves("Don't Show Again");

            // Run
            await notifyInvalidPythonProjectsSettings(invalidEntries);

            // Assert
            assert.strictEqual(mockPersistentState.set.callCount, 1, 'Should save preference');
            assert.strictEqual(
                mockPersistentState.set.firstCall.args[0],
                'dontShowInvalidPythonProjectSettings',
                'Should use correct key',
            );
            assert.strictEqual(mockPersistentState.set.firstCall.args[1], true, 'Should save true value');
        });
    });

    suite('validateAndNotifyPythonProjectsSettings', () => {
        test('should validate and notify when invalid entries exist', async () => {
            // Mock → Invalid entry exists
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const invalidSettings = [
                {
                    envManager: 'ms-python.python:venv',
                    packageManager: 'ms-python.python:pip',
                } as unknown as PythonProjectSettings,
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(invalidSettings);
            mockGetConfiguration.returns(config);

            mockShowWarningMessage.resolves(undefined);

            // Run
            await validateAndNotifyPythonProjectsSettings();

            // Assert
            assert.strictEqual(mockShowWarningMessage.callCount, 1, 'Should show notification');
        });

        test('should not notify when all entries are valid', async () => {
            // Mock → All valid entries
            const workspaceUri = Uri.file('/workspace');
            mockGetWorkspaceFolders.returns([{ name: 'test-workspace', uri: workspaceUri, index: 0 }]);

            const validSettings: PythonProjectSettings[] = [
                {
                    path: './project',
                    envManager: 'ms-python.python:venv',
                    packageManager: 'ms-python.python:pip',
                },
            ];

            const config: MockWorkspaceConfig = {
                get: sinon.stub(),
                inspect: sinon.stub(),
                update: sinon.stub(),
            };
            config.get.withArgs('pythonProjects', []).returns(validSettings);
            mockGetConfiguration.returns(config);

            // Run
            await validateAndNotifyPythonProjectsSettings();

            // Assert
            assert.strictEqual(mockShowWarningMessage.called, false, 'Should not show notification for valid settings');
        });
    });
});
