// 1. Imports - group logically
import assert from 'node:assert';
import * as sinon from 'sinon';
import { CancellationError, CancellationToken, LogOutputChannel, Progress } from 'vscode';
import { DidChangePackagesEventArgs, Package, PackageChangeKind, PythonEnvironment, PythonEnvironmentApi } from '../../../api';
import * as winapi from '../../../common/window.apis';
import * as condaUtils from '../../../managers/conda/condaUtils';

// 2. Function under test
import { CondaPackageManager } from '../../../managers/conda/condaPackageManager';

suite('CondaPackageManager Unit Tests', () => {
    let mockApi: PythonEnvironmentApi;
    let mockLog: LogOutputChannel;
    let packageManager: CondaPackageManager;
    let withProgressStub: sinon.SinonStub;
    let managePackagesStub: sinon.SinonStub;
    let refreshPackagesStub: sinon.SinonStub;
    let getCommonCondaPackagesToInstallStub: sinon.SinonStub;

    setup(() => {
        // Create minimal mocks
        mockApi = {} as PythonEnvironmentApi;
        mockLog = {
            error: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
        } as unknown as LogOutputChannel;

        // Stub external dependencies
        withProgressStub = sinon.stub(winapi, 'withProgress');
        managePackagesStub = sinon.stub(condaUtils, 'managePackages');
        refreshPackagesStub = sinon.stub(condaUtils, 'refreshPackages');
        getCommonCondaPackagesToInstallStub = sinon.stub(condaUtils, 'getCommonCondaPackagesToInstall');

        // Create package manager instance
        packageManager = new CondaPackageManager(mockApi, mockLog);
    });

    teardown(() => {
        sinon.restore();
        packageManager.dispose();
    });

    suite('getChanges function', () => {
        test('should detect package additions when refreshing empty environment', () => {
            // Mock - Set up environment and mock responses
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const after: Package[] = [
                { name: 'package1', version: '1.0.0' } as Package,
                { name: 'package2', version: '2.0.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(after);

            // Run - Execute refresh
            return packageManager.refresh(env).then(() => {
                // Assert - Verify changes detected correctly
                assert.ok(firedEvent, 'Event should be fired');
                assert.strictEqual(firedEvent!.changes.length, 2, 'Should detect 2 additions');
                assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.add);
                assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.add);
            });
        });

        test('should detect package removals when packages are uninstalled', () => {
            // Mock - Set up environment with existing packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const before: Package[] = [
                { name: 'package1', version: '1.0.0' } as Package,
                { name: 'package2', version: '2.0.0' } as Package,
            ];
            const after: Package[] = [];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(before);
            
            // Run - First refresh to set initial state
            return packageManager.refresh(env).then(() => {
                firedEvent = undefined;
                refreshPackagesStub.resolves(after);
                
                // Run - Second refresh with empty packages
                return packageManager.refresh(env).then(() => {
                    // Assert - Verify removals detected
                    assert.ok(firedEvent, 'Event should be fired');
                    assert.strictEqual(firedEvent!.changes.length, 2, 'Should detect 2 removals');
                    assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.remove);
                    assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.remove);
                });
            });
        });

        test('should detect both package additions and removals when packages change', () => {
            // Mock - Set up environment with one package
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const before: Package[] = [
                { name: 'old-package', version: '1.0.0' } as Package,
            ];
            const after: Package[] = [
                { name: 'new-package', version: '2.0.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(before);
            
            // Run - First refresh to set initial state
            return packageManager.refresh(env).then(() => {
                firedEvent = undefined;
                refreshPackagesStub.resolves(after);
                
                // Run - Second refresh with different packages
                return packageManager.refresh(env).then(() => {
                    // Assert - Verify both additions and removals
                    assert.ok(firedEvent, 'Event should be fired');
                    assert.strictEqual(firedEvent!.changes.length, 2, 'Should detect 1 removal and 1 addition');
                    
                    const removeChanges = firedEvent!.changes.filter(c => c.kind === PackageChangeKind.remove);
                    const addChanges = firedEvent!.changes.filter(c => c.kind === PackageChangeKind.add);
                    
                    assert.strictEqual(removeChanges.length, 1, 'Should have 1 removal');
                    assert.strictEqual(addChanges.length, 1, 'Should have 1 addition');
                    assert.strictEqual(removeChanges[0].pkg.name, 'old-package');
                    assert.strictEqual(addChanges[0].pkg.name, 'new-package');
                });
            });
        });
    });

    suite('CondaPackageManager.manage', () => {
        test('should install packages when install list provided', async () => {
            // Mock - Set up environment and install packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(packages);

            // Run - Execute manage with install option
            await packageManager.manage(env, { install: ['numpy'] });

            // Assert - Verify managePackages called correctly
            assert.ok(managePackagesStub.called, 'managePackages should be called');
            const args = managePackagesStub.firstCall.args;
            assert.strictEqual(args[0], env);
            assert.deepStrictEqual(args[1].install, ['numpy']);
        });

        test('should uninstall packages when uninstall list provided', async () => {
            // Mock - Set up environment and uninstall packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(packages);

            // Run - Execute manage with uninstall option
            await packageManager.manage(env, { uninstall: ['numpy'] });

            // Assert - Verify managePackages called correctly
            assert.ok(managePackagesStub.called, 'managePackages should be called');
            const args = managePackagesStub.firstCall.args;
            assert.strictEqual(args[0], env);
            assert.deepStrictEqual(args[1].uninstall, ['numpy']);
        });

        test('should prompt user for packages when none specified', async () => {
            // Mock - Set up environment without packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'pytest', version: '7.0.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            getCommonCondaPackagesToInstallStub.resolves({ install: ['pytest'], uninstall: [] });
            managePackagesStub.resolves(packages);

            // Run - Execute manage without packages (empty install array triggers prompt)
            await packageManager.manage(env, { install: [] });

            // Assert - Verify user was prompted
            assert.ok(getCommonCondaPackagesToInstallStub.called, 'Should prompt user for packages');
            assert.ok(managePackagesStub.called, 'managePackages should be called');
        });

        test('should not install when user cancels package selection', async () => {
            // Mock - Set up cancellation scenario
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            getCommonCondaPackagesToInstallStub.resolves(undefined);

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            // Run - Execute manage without packages (user cancels, empty install array triggers prompt)
            await packageManager.manage(env, { install: [] });

            // Assert - Verify operation was cancelled
            assert.ok(getCommonCondaPackagesToInstallStub.called, 'Should prompt user');
            assert.ok(!managePackagesStub.called, 'Should not call managePackages when user cancels');
        });

        test('should emit onDidChangePackages event after successful package management', async () => {
            // Mock - Set up environment and event listener
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const afterPackages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(afterPackages);

            // Run - Execute manage
            await packageManager.manage(env, { install: ['numpy'] });

            // Assert - Verify event was emitted
            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.environment, env);
            assert.strictEqual(firedEvent!.manager, packageManager);
        });

        test('should log errors when package management fails', async () => {
            // Mock - Set up error scenario
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const error = new Error('Installation failed');

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.rejects(error);

            // Run - Execute manage with error
            await packageManager.manage(env, { install: ['numpy'] });

            // Assert - Verify error was logged
            assert.ok((mockLog.error as sinon.SinonStub).called, 'Should log error');
        });

        test('should re-throw CancellationError without logging', async () => {
            // Mock - Set up cancellation scenario
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.rejects(new CancellationError());

            // Run & Assert - Verify CancellationError is propagated
            await assert.rejects(
                async () => packageManager.manage(env, { install: ['numpy'] }),
                CancellationError,
                'Should re-throw CancellationError'
            );
        });
    });

    suite('CondaPackageManager.refresh', () => {
        test('should fetch packages and update internal cache', async () => {
            // Mock - Set up environment with packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
                { name: 'pandas', version: '1.3.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Execute refresh
            await packageManager.refresh(env);

            // Assert - Verify packages fetched and cached
            assert.ok(refreshPackagesStub.called, 'refreshPackages should be called');
            
            const cached = await packageManager.getPackages(env);
            assert.strictEqual(cached?.length, 2);
        });

        test('should emit onDidChangePackages event when packages are modified', async () => {
            // Mock - Set up environment and event listener
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Execute refresh
            await packageManager.refresh(env);

            // Assert - Verify event was emitted
            assert.ok(firedEvent, 'Event should be fired when packages change');
        });

        test('should not emit event when package list remains unchanged', async () => {
            // Mock - Set up environment with no packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [];

            let eventCount = 0;
            packageManager.onDidChangePackages(() => {
                eventCount++;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Execute refresh twice with no changes
            await packageManager.refresh(env);
            await packageManager.refresh(env);

            // Assert - Verify event was not emitted
            assert.strictEqual(eventCount, 0, 'Should not emit event when no changes');
        });
    });

    suite('CondaPackageManager.getPackages', () => {
        test('should use cached packages when available', async () => {
            // Mock - Set up environment with cached packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);
            refreshPackagesStub.resetHistory();

            // Run - Get packages from cache
            const result = await packageManager.getPackages(env);

            // Assert - Verify cache was used
            assert.strictEqual(result?.length, 1);
            assert.ok(!refreshPackagesStub.called, 'Should not call refresh when packages are cached');
        });

        test('should trigger refresh when packages not in cache', async () => {
            // Mock - Set up environment without cached packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Get packages without cache
            const result = await packageManager.getPackages(env);

            // Assert - Verify refresh was triggered
            assert.ok(refreshPackagesStub.called, 'Should call refresh when packages not cached');
            assert.strictEqual(result?.length, 1);
        });

        test('should maintain separate package caches for different environments', async () => {
            // Mock - Set up two different environments
            const env1: PythonEnvironment = {
                envId: { id: 'env1' },
            } as PythonEnvironment;

            const env2: PythonEnvironment = {
                envId: { id: 'env2' },
            } as PythonEnvironment;

            const packages1: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            const packages2: Package[] = [
                { name: 'pandas', version: '1.3.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.onFirstCall().resolves(packages1);
            refreshPackagesStub.onSecondCall().resolves(packages2);

            // Run - Get packages for both environments
            const result1 = await packageManager.getPackages(env1);
            const result2 = await packageManager.getPackages(env2);

            // Assert - Verify each environment has its own cache
            assert.strictEqual(result1?.length, 1);
            assert.strictEqual(result1?.[0].name, 'numpy');
            assert.strictEqual(result2?.length, 1);
            assert.strictEqual(result2?.[0].name, 'pandas');
        });
    });

    suite('CondaPackageManager.dispose', () => {
        test('should clean up event emitter on disposal', () => {
            // Mock - Spy on dispose method
            const disposeStub = sinon.stub(packageManager['_onDidChangePackages'], 'dispose');

            // Run - Dispose package manager
            packageManager.dispose();

            // Assert - Verify cleanup occurred
            assert.ok(disposeStub.called, 'Should dispose event emitter');
        });

        test('should clear all cached packages on disposal', () => {
            // Mock - Set up environment with cached packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Cache packages then dispose
            return packageManager.refresh(env).then(() => {
                packageManager.dispose();

                // Assert - Verify cache was cleared
                assert.strictEqual(packageManager['packages'].size, 0, 'Should clear packages cache');
            });
        });
    });

    suite('Event emission', () => {
        test('should include environment, manager, and changes in emitted event', async () => {
            // Mock - Set up environment and event listener
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Trigger event
            await packageManager.refresh(env);

            // Assert - Verify event contains all required information
            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.environment, env, 'Event should include environment');
            assert.strictEqual(firedEvent!.manager, packageManager, 'Event should include manager');
            assert.ok(Array.isArray(firedEvent!.changes), 'Event should include changes array');
        });

        test('should notify all registered listeners when event fires', async () => {
            // Mock - Set up environment and multiple listeners
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            let listener1Called = false;
            let listener2Called = false;

            packageManager.onDidChangePackages(() => {
                listener1Called = true;
            });

            packageManager.onDidChangePackages(() => {
                listener2Called = true;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Trigger event
            await packageManager.refresh(env);

            // Assert - Verify all listeners were notified
            assert.ok(listener1Called, 'First listener should be called');
            assert.ok(listener2Called, 'Second listener should be called');
        });

        test('should provide detailed package change information in event', async () => {
            // Mock - Set up environment with multiple packages
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
                { name: 'pandas', version: '1.3.0' } as Package,
            ];

            let firedEvent: DidChangePackagesEventArgs | undefined;
            packageManager.onDidChangePackages((e) => {
                firedEvent = e;
            });

            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // Run - Trigger event with multiple packages
            await packageManager.refresh(env);

            // Assert - Verify event contains detailed change information
            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.changes.length, 2, 'Should include all package changes');
            assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.add);
            assert.strictEqual(firedEvent!.changes[0].pkg.name, 'numpy');
            assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.add);
            assert.strictEqual(firedEvent!.changes[1].pkg.name, 'pandas');
        });
    });
});
