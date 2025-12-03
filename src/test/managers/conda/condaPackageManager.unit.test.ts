import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationError, CancellationToken, LogOutputChannel, Progress } from 'vscode';
import { DidChangePackagesEventArgs, Package, PackageChangeKind, PythonEnvironment, PythonEnvironmentApi } from '../../../api';
import * as winapi from '../../../common/window.apis';
import * as condaUtils from '../../../managers/conda/condaUtils';
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

    suite('Test 1: getChanges function', () => {
        test('should detect added packages', () => {
            // This tests the internal getChanges function indirectly through refresh
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(after);

            return packageManager.refresh(env).then(() => {
                assert.ok(firedEvent, 'Event should be fired');
                assert.strictEqual(firedEvent!.changes.length, 2, 'Should detect 2 additions');
                assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.add);
                assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.add);
            });
        });

        test('should detect removed packages', () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            // First refresh to set initial state
            refreshPackagesStub.resolves(before);
            return packageManager.refresh(env).then(() => {
                // Reset event
                firedEvent = undefined;

                // Second refresh with empty packages
                refreshPackagesStub.resolves(after);
                return packageManager.refresh(env).then(() => {
                    assert.ok(firedEvent, 'Event should be fired');
                    assert.strictEqual(firedEvent!.changes.length, 2, 'Should detect 2 removals');
                    assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.remove);
                    assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.remove);
                });
            });
        });

        test('should detect both additions and removals', () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            // First refresh to set initial state
            refreshPackagesStub.resolves(before);
            return packageManager.refresh(env).then(() => {
                // Reset event
                firedEvent = undefined;

                // Second refresh with different packages
                refreshPackagesStub.resolves(after);
                return packageManager.refresh(env).then(() => {
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

    suite('Test 2: CondaPackageManager.manage', () => {
        test('should install packages when provided', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(packages);

            await packageManager.manage(env, { install: ['numpy'] });

            assert.ok(managePackagesStub.called, 'managePackages should be called');
            const args = managePackagesStub.firstCall.args;
            assert.strictEqual(args[0], env);
            assert.deepStrictEqual(args[1].install, ['numpy']);
        });

        test('should uninstall packages when provided', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(packages);

            await packageManager.manage(env, { uninstall: ['numpy'] });

            assert.ok(managePackagesStub.called, 'managePackages should be called');
            const args = managePackagesStub.firstCall.args;
            assert.strictEqual(args[0], env);
            assert.deepStrictEqual(args[1].uninstall, ['numpy']);
        });

        test('should prompt user when no packages specified', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'pytest', version: '7.0.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            getCommonCondaPackagesToInstallStub.resolves({ install: ['pytest'], uninstall: [] });
            managePackagesStub.resolves(packages);

            await packageManager.manage(env, {} as any);

            assert.ok(getCommonCondaPackagesToInstallStub.called, 'Should prompt user for packages');
            assert.ok(managePackagesStub.called, 'managePackages should be called');
        });

        test('should handle cancellation gracefully', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            getCommonCondaPackagesToInstallStub.resolves(undefined);

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            await packageManager.manage(env, {} as any);

            assert.ok(getCommonCondaPackagesToInstallStub.called, 'Should prompt user');
            assert.ok(!managePackagesStub.called, 'Should not call managePackages when user cancels');
        });

        test('should emit event after managing packages', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.resolves(afterPackages);

            await packageManager.manage(env, { install: ['numpy'] });

            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.environment, env);
            assert.strictEqual(firedEvent!.manager, packageManager);
        });

        test('should handle errors and log them', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const error = new Error('Installation failed');

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.rejects(error);

            await packageManager.manage(env, { install: ['numpy'] });

            assert.ok((mockLog.error as sinon.SinonStub).called, 'Should log error');
        });

        test('should re-throw CancellationError', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            managePackagesStub.rejects(new CancellationError());

            await assert.rejects(
                async () => packageManager.manage(env, { install: ['numpy'] }),
                CancellationError,
                'Should re-throw CancellationError'
            );
        });
    });

    suite('Test 3: CondaPackageManager.refresh', () => {
        test('should refresh packages and update cache', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
                { name: 'pandas', version: '1.3.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);

            assert.ok(refreshPackagesStub.called, 'refreshPackages should be called');
            
            // Verify packages are cached
            const cached = await packageManager.getPackages(env);
            assert.strictEqual(cached?.length, 2);
        });

        test('should emit event when packages change', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);

            assert.ok(firedEvent, 'Event should be fired when packages change');
        });

        test('should not emit event when packages unchanged', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [];

            let eventCount = 0;
            packageManager.onDidChangePackages(() => {
                eventCount++;
            });

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);
            await packageManager.refresh(env);

            assert.strictEqual(eventCount, 0, 'Should not emit event when no changes');
        });
    });

    suite('Test 4: CondaPackageManager.getPackages', () => {
        test('should return cached packages if available', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            // First call should trigger refresh
            await packageManager.refresh(env);
            
            // Reset stub to verify it's not called again
            refreshPackagesStub.resetHistory();

            // Second call should use cache
            const result = await packageManager.getPackages(env);

            assert.strictEqual(result?.length, 1);
            assert.ok(!refreshPackagesStub.called, 'Should not call refresh when packages are cached');
        });

        test('should refresh if packages not cached', async () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            const result = await packageManager.getPackages(env);

            assert.ok(refreshPackagesStub.called, 'Should call refresh when packages not cached');
            assert.strictEqual(result?.length, 1);
        });

        test('should handle multiple environments separately', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.onFirstCall().resolves(packages1);
            refreshPackagesStub.onSecondCall().resolves(packages2);

            const result1 = await packageManager.getPackages(env1);
            const result2 = await packageManager.getPackages(env2);

            assert.strictEqual(result1?.length, 1);
            assert.strictEqual(result1?.[0].name, 'numpy');
            assert.strictEqual(result2?.length, 1);
            assert.strictEqual(result2?.[0].name, 'pandas');
        });
    });

    suite('Test 5: CondaPackageManager.dispose', () => {
        test('should dispose event emitter', () => {
            const disposeStub = sinon.stub(packageManager['_onDidChangePackages'], 'dispose');

            packageManager.dispose();

            assert.ok(disposeStub.called, 'Should dispose event emitter');
        });

        test('should clear packages cache', () => {
            const env: PythonEnvironment = {
                envId: { id: 'test-env' },
            } as PythonEnvironment;

            const packages: Package[] = [
                { name: 'numpy', version: '1.21.0' } as Package,
            ];

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            return packageManager.refresh(env).then(() => {
                packageManager.dispose();

                // Verify cache is cleared by checking the internal map
                assert.strictEqual(packageManager['packages'].size, 0, 'Should clear packages cache');
            });
        });
    });

    suite('Test 6: Event emission', () => {
        test('should fire onDidChangePackages event with correct arguments', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);

            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.environment, env, 'Event should include environment');
            assert.strictEqual(firedEvent!.manager, packageManager, 'Event should include manager');
            assert.ok(Array.isArray(firedEvent!.changes), 'Event should include changes array');
        });

        test('should support multiple event listeners', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);

            assert.ok(listener1Called, 'First listener should be called');
            assert.ok(listener2Called, 'Second listener should be called');
        });

        test('should include package changes in event', async () => {
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

            // Mock withProgress to execute callback immediately
            withProgressStub.callsFake(async (_options, callback) => {
                return await callback({} as Progress<{ message?: string }>, {} as CancellationToken);
            });

            refreshPackagesStub.resolves(packages);

            await packageManager.refresh(env);

            assert.ok(firedEvent, 'Event should be fired');
            assert.strictEqual(firedEvent!.changes.length, 2, 'Should include all package changes');
            assert.strictEqual(firedEvent!.changes[0].kind, PackageChangeKind.add);
            assert.strictEqual(firedEvent!.changes[0].pkg.name, 'numpy');
            assert.strictEqual(firedEvent!.changes[1].kind, PackageChangeKind.add);
            assert.strictEqual(firedEvent!.changes[1].pkg.name, 'pandas');
        });
    });
});
