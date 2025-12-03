# Test Scenarios for utils.ts

## 1. asPackageQuickPickItem

### Complex Path
- **Input**: `name: "numpy", version: undefined`
- **Expected**: QuickPickItem with label="numpy", description=undefined

### Edge Cases
1. **Empty string name**: `name: "", version: "1.0.0"` - Should create item with empty label
2. **Very long version string**: `name: "pkg", version: "1.2.3.4.5.6.7.8.9.10+build.metadata"` - Should handle extended version formats
3. **Special characters in name**: `name: "pkg-name_test.123", version: "1.0"` - Should preserve special characters

---

## 2. pickPackages

### Happy Path
- **Input**: `uninstall: false, packages: ["requests", "numpy", "pandas"]`
- **User Selection**: Selects "requests" and "numpy"
- **Expected**: `["requests", "numpy"]`

### Complex Path
- **Input**: `uninstall: true, packages: [{name: "flask", version: "2.0.0"}, {name: "django", version: "4.0.0"}]`
- **User Selection**: Selects all packages
- **Expected**: `["flask", "django"]`

### Edge Cases
1. **User cancels selection**: Returns empty array `[]`
2. **Empty packages array**: `packages: []` - Should show empty picker
3. **Mixed string and Package objects**: `packages: ["requests", {name: "numpy", version: "1.23"}]`
4. **Single package**: `packages: ["pytest"]` - Should still allow multi-select

---

## 4. getPythonInfo

### Happy Path
- **Input**: Valid NativeEnvInfo with `executable: "/usr/bin/python3", version: "3.11.0", prefix: "/usr", kind: NativePythonEnvironmentKind.homebrew`
- **Expected**: PythonEnvironmentInfo with name="Python 3.11 (homebrew)", proper URI, execInfo configured

### Complex Path
- **Input**: NativeEnvInfo with custom `name` and `displayName` fields already set
- **Expected**: Should use provided name/displayName instead of generated ones

### Edge Cases
1. **Missing executable**: Should throw error with JSON stringified env
2. **Missing version**: Should throw error
3. **Missing prefix**: Should throw error
4. **Kind is undefined**: Should generate name without kind suffix (e.g., "Python 3.11")
5. **Very long version**: `version: "3.11.0rc2+build123"` - Should handle via shortVersion
6. **Kind that returns undefined from getKindName**: Should generate name without kind
---

## 5. refreshPythons

### Happy Path
- **Input**: `hardRefresh: false, nativeFinder returns 3 valid Python environments`
- **Expected**: Array of 3 PythonEnvironment objects, sorted

### Complex Path
- **Input**: `hardRefresh: true, uris: [Uri1, Uri2], nativeFinder returns mix of valid and invalid environments`
- **Expected**: Only valid environments converted, invalid ones logged as errors

### Edge Cases
1. **Empty result from nativeFinder**: Returns empty array
2. **All environments fail isNativeEnvInfo check**: Returns empty array
3. **Environment missing required fields**: getPythonInfo throws, error logged, environment skipped
4. **Mix of supported and unsupported kinds**: Only supported kinds included
5. **No uris provided**: Should work with undefined uris

### Additional Logic to Test
- Verify hardRefresh parameter passed to nativeFinder.refresh
---

## 6. refreshPipPackagesRaw

### Happy Path
- **Input**: Valid PythonEnvironment, shouldUseUv returns false
- **Expected**: Runs `python -m pip list`, returns output string

### Complex Path
- **Input**: Valid PythonEnvironment, shouldUseUv returns true
- **Expected**: Runs `uv pip list --python <executable>`, returns output string

### Edge Cases
1. **runPython throws error**: Should log error with details, log info about uv alternative, then re-throw
2. **runUV throws error**: Should propagate error (no catch block for UV)

---

## 7. refreshPipPackages

### Happy Path
- **Input**: `environment, log, options: {showProgress: false}`
- **Expected**: Returns array of PipPackage objects parsed from pip list output

### Complex Path
- **Input**: `environment, log, options: {showProgress: true}`
- **Expected**: Shows progress notification, returns parsed packages

### Edge Cases
1. **refreshPipPackagesRaw throws error**: Logs error, shows error message to user, returns undefined
2. **parsePipList returns empty array**: Returns empty array

---

## 8. refreshPackages

### Happy Path
- **Input**: Valid environment, api, manager with packages
- **Expected**: Returns array of Package objects created via api.createPackageItem

### Complex Path
- **Input**: Environment with many packages (100+)
- **Expected**: All packages mapped to Package objects

### Edge Cases
1. **refreshPipPackages returns undefined**: Empty array mapped, returns empty Package array
2. **refreshPipPackages returns empty array**: Returns empty Package array
3. **api.createPackageItem throws for some packages**: Error should propagate (no error handling)

---

## 9. managePackages

### Happy Path
- **Input**: `environment (Python 3.11), options: {install: ["requests", "numpy"]}, useUv: false`
- **Expected**: Runs pip install, returns updated package list

### Complex Path
- **Input**: `environment, options: {uninstall: ["old-pkg"], install: ["new-pkg"], upgrade: true}, useUv: true`
- **Expected**: Runs uv uninstall, then uv install with --upgrade, returns packages

### Edge Cases
1. **Python 2.x environment**: Throws error "Python 2.* is not supported (deprecated)"
2. **Empty install and uninstall arrays**: No operations performed, only refreshes packages
3. **Only uninstall specified**: Runs only uninstall, no install
4. **Only install specified**: Runs only install, no uninstall
5. **Cancellation token triggered**: Should pass token to runUV/runPython for cancellation
6. **useUv=true for uninstall**: Should NOT add --yes flag
7. **useUv=false for uninstall**: Should add --yes flag


---

## 11. resolveSystemPythonEnvironmentPath

### Happy Path
- **Input**: `fsPath: "/usr/bin/python3", nativeFinder.resolve returns complete NativeEnvInfo`
- **Expected**: Returns PythonEnvironment object