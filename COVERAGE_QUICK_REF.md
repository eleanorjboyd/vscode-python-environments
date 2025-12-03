# Terminal Coverage - Quick Reference

## Run Coverage Command

```bash
# Install c8 if not already installed
npm install --save-dev c8

# Compile tests first
npm run compile-tests

# Run coverage for terminal directory
npx c8 --all --reporter=text --reporter=html \
  --include='out/features/terminal/**/*.js' \
  --exclude='out/features/terminal/**/*.test.js' \
  --exclude='out/features/terminal/**/*.unit.test.js' \
  npm run unittest

# View HTML report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

## Current Coverage: 9.28%

## Files Needing Tests (Priority Order)

### HIGH Priority (Core Functionality)
1. ❌ `terminalManager.ts` (451 lines, 0% coverage)
2. ❌ `terminalActivationState.ts` (287 lines, 0% coverage)
3. ⚠️ `runInTerminal.ts` (53 lines, 17% coverage)
4. ⚠️ `terminalEnvVarInjector.ts` (~200 lines, 38% coverage)
5. ❌ `activateMenuButton.ts` (18 lines, 0% coverage)

### MEDIUM Priority (Supporting Functionality)
6. ❌ `shellStartupActivationVariablesManager.ts` (111 lines, 0%)
7. ❌ `shellStartupSetupHandlers.ts` (70 lines, 0%)
8. ⚠️ `shells/common/shellUtils.ts` (~160 lines, 21% coverage)
9. ❌ `shells/providers.ts` (45 lines, 0%)
10. ❌ `shells/startupProvider.ts` (30 lines, 0%)
11. Shell implementations (Bash, CMD, Fish, PowerShell - 8 files, all 0%)

### LOW Priority (Constants/Simple Utils)
12. Constants files (bashConstants.ts, cmdConstants.ts, etc.)
13. `shells/utils.ts` (18 lines, 0%)

### Already Well Tested ✅
- `shells/common/editUtils.ts` (97% coverage)

## Test File Locations

Place test files following this pattern:
```
src/test/features/terminal/[filename].unit.test.ts
```

Example:
- Source: `src/features/terminal/activateMenuButton.ts`
- Test: `src/test/features/terminal/activateMenuButton.unit.test.ts`

## See Also
- **Detailed Analysis**: `COVERAGE_ANALYSIS_TERMINAL.md` - Full coverage report with line numbers and recommendations
- **Existing Tests**: 
  - `src/test/features/terminal/utils.unit.test.ts`
  - `src/test/features/terminal/shells/common/editUtils.unit.test.ts`
  - `src/test/features/terminal/shells/common/shellUtils.unit.test.ts`

## Next Steps

1. Create test files for HIGH priority items (1-5)
2. Run coverage after each new test file
3. Aim for >80% coverage on each file
4. Use existing tests as templates for mock setup
