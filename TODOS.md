# Corivo TODO

This file tracks pending work, bugs, and improvements for the Corivo project.

---

## Code Quality

### [REFACTOR] Consistent Exit Handling
**What**: `init.ts` defines `exit()` function but other commands use `process.exit(1)` directly.
**Why**: Inconsistent style, harder to mock for testing.
**Pros**: Testability, code consistency.
**Cons**: Minor refactor effort.
**Context**: Standardize on either custom exit function or direct process.exit.
**Depends on**: None
**Priority**: Low

### [REFACTOR] Reduce any Types
**What**: Replace `any` types with proper interfaces, e.g., in `database.ts:932`.
**Why**: Type safety, better IDE support.
**Pros**: Catch bugs at compile time.
**Cons**: Requires defining RowType interfaces.
**Context**: Start with `database.ts` rowToBlock conversions.
**Depends on**: None
**Priority**: Low

---

## Performance

### [PERF] Batch Update Access Counts
**What**: Implement `batchUpdateAccessCount()` similar to `batchUpdateVitality()`.
**Why**: Current N+1 update pattern in `push/context.ts:61-66` could become slow with many blocks.
**Pros**: Better scalability.
**Cons**: Minor optimization, not urgent for MVP.
**Context**: Add method to `database.ts`, update `push/context.ts` to use it.
**Depends on**: None
**Priority**: Low

---

## Documentation

### [DOCS] Add Architecture Diagram to README
**What**: Include the ASCII architecture diagram from this review in README.md.
**Why**: Helps new contributors understand system design.
**Pros**: Better onboarding.
**Cons**: None.
**Depends on**: None
**Priority**: Low

---

## Testing

### [TEST] Add Identity Module Tests
**What**: Write tests for fingerprint collection and matching logic.
**Why**: Although lower priority for MVP, needs eventual coverage.
**Pros**: Verify security properties of fingerprint hashing.
**Cons**: Can be deferred to v0.12.
**Context**: Test files: `__tests__/unit/identity-*.test.ts`
**Depends on**: None
**Priority**: Low

---

## Future Work (Out of Scope for v0.11)

- Windows/Linux daemon support
- Cloud sync functionality
- LLM integration for advanced features
- Performance optimization for >1000 blocks
- Web UI
- Team/Enterprise features

---

## Completed

### [BUG] Update Checker Breaking Update Logic Inverted ✅
**Completed:** v0.11.0 (2026-03-20)
Fix: Changed `config.auto !== false` to clear logic `shouldAutoUpdate = !isBreaking || config.auto !== false`

### [REFACTOR] Extract Config Reading Logic ✅
**Completed:** v0.11.0 (2026-03-20)
Created `src/config.ts` with `loadConfig()`, `saveConfig()`, `getDatabaseKey()`, `isInitialized()`

### [CI] Add version.json Generation to Release Workflow ✅
**Completed:** v0.11.0 (2026-03-20)
Added version.json generation step to `.github/workflows/release.yml`

### [TEST] Add Update Checker Unit Tests ✅
**Completed:** v0.11.0 (2026-03-20)
Created `__tests__/unit/update-checker.test.ts` with 12 tests covering version comparison, update logic, error handling

### [TEST] Add Daemon Manager Tests ✅
**Completed:** v0.11.0 (2026-03-20)
Created `__tests__/unit/daemon-macos.test.ts` with 9 tests covering plist generation, install/uninstall, status checks

### [TEST] Add Cold Scan Extractor Tests ✅
**Completed:** v0.11.0 (2026-03-20)
Created `__tests__/unit/cold-scan-extractors.test.ts` with 12 tests covering git-config, package-json extractors and security boundaries

---

*Last updated: 2026-03-20*
