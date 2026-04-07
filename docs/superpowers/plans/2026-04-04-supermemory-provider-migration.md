# Supermemory Provider Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config-switched memory engine so Corivo can use Supermemory as the primary save/search/recall backend without changing the existing CLI command surface.

**Architecture:** Keep the current command layer stable and introduce a provider boundary below application/bootstrap code. Add `local` and `supermemory` provider implementations, route `save`, `query`, and `query --prompt` through that boundary, and keep the existing local SQLite/markdown/raw recall path as explicit fallback when the Supermemory path is unavailable or misses.

**Tech Stack:** TypeScript, Commander, Vitest, existing Corivo config/runtime helpers, `supermemory` SDK

---

## File Map

### Existing files to modify

- `packages/cli/src/config.ts`
  Responsibility: extend persisted config shape with `memoryEngine` and supermemory settings.
- `packages/cli/src/application/bootstrap/create-cli-app.ts`
  Responsibility: wire provider-backed query capabilities into the CLI app.
- `packages/cli/src/application/bootstrap/query-execution.ts`
  Responsibility: move prompt recall and explicit search execution onto the provider interface with local fallback.
- `packages/cli/src/cli/commands/save.ts`
  Responsibility: stop writing directly to SQLite and delegate save to the configured provider.
- `packages/cli/src/cli/commands/status.ts`
  Responsibility: show Supermemory engine status/config health when configured.
- `packages/cli/src/cli/commands/init.ts`
  Responsibility: ensure freshly written config remains valid after adding `memoryEngine`.
- `packages/cli/src/cli/runtime.ts`
  Responsibility: expose config helpers needed by provider-backed command code.
- `packages/cli/src/application/bootstrap/types.ts`
  Responsibility: extend CLI bootstrap capability types if save/query wiring needs injected provider-aware capabilities.
- `packages/cli/__tests__/unit/config-settings.test.ts`
  Responsibility: config shape coverage for the new engine settings.
- `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`
  Responsibility: query prompt fallback and provider-path tests.
- `packages/cli/__tests__/unit/query-save-passwordless.test.ts`
  Responsibility: keep passwordless save/query behavior while moving to provider-backed execution.
- `packages/cli/__tests__/unit/status-command.test.ts`
  Responsibility: status output coverage for the new engine diagnostics.

### New files to create

- `packages/cli/src/domain/memory/providers/types.ts`
  Responsibility: define the provider contracts used by save/search/recall flows.
- `packages/cli/src/domain/memory/providers/local-memory-provider.ts`
  Responsibility: adapt current local SQLite/markdown/raw recall behavior behind the provider contract.
- `packages/cli/src/domain/memory/providers/supermemory-provider.ts`
  Responsibility: implement save/search/recall via the Supermemory SDK using `apiKey` and `containerTag`.
- `packages/cli/src/domain/memory/providers/resolve-memory-provider.ts`
  Responsibility: pick `local` or `supermemory` from config and build the provider instance.
- `packages/cli/src/application/memory/save-memory.ts`
  Responsibility: provider-backed save use-case with optional local compatibility write if enabled later.
- `packages/cli/src/application/query/provider-search.ts`
  Responsibility: normalize provider search results into existing query presenter expectations.
- `packages/cli/src/application/query/provider-recall.ts`
  Responsibility: run provider recall first, then explicit fallback to the existing local recall path.
- `packages/cli/src/cli/commands/supermemory.ts`
  Responsibility: add `set-key` and `status` configuration commands without changing business commands.
- `packages/cli/__tests__/unit/memory-provider-config.test.ts`
  Responsibility: engine resolution tests and invalid/missing config coverage.
- `packages/cli/__tests__/unit/supermemory-provider.test.ts`
  Responsibility: isolated SDK contract tests using mocked Supermemory client behavior.
- `packages/cli/__tests__/unit/save-memory.test.ts`
  Responsibility: provider-backed save use-case tests.

## Task 1: Extend Config for Memory Engine Selection

**Files:**
- Modify: `packages/cli/src/config.ts`
- Modify: `packages/cli/src/cli/commands/init.ts`
- Test: `packages/cli/__tests__/unit/config-settings.test.ts`
- Test: `packages/cli/__tests__/unit/memory-provider-config.test.ts`

- [ ] **Step 1: Write the failing config tests**

Add tests that assert:
- `CorivoConfig` accepts:
  - `memoryEngine.provider = 'local'`
  - `memoryEngine.provider = 'supermemory'`
  - `memoryEngine.supermemory.apiKey`
  - `memoryEngine.supermemory.containerTag`
- loading config with a missing `identity_id` still returns `null`
- loading config with a valid `memoryEngine` returns the parsed config unchanged

Suggested test cases:

```ts
it('accepts supermemory engine settings in config', () => {
  const config: CorivoConfig = {
    version: '1',
    created_at: '2026-01-01',
    identity_id: 'test-id',
    memoryEngine: {
      provider: 'supermemory',
      supermemory: {
        apiKey: 'sm_test',
        containerTag: 'project:test',
      },
    },
  };

  expect(config.memoryEngine?.provider).toBe('supermemory');
  expect(config.memoryEngine?.supermemory?.containerTag).toBe('project:test');
});
```

- [ ] **Step 2: Run the targeted config tests to verify failure**

Run: `cd packages/cli && npm run test -- __tests__/unit/config-settings.test.ts __tests__/unit/memory-provider-config.test.ts`

Expected: FAIL because `CorivoConfig` does not yet include `memoryEngine` and the new test file does not exist.

- [ ] **Step 3: Implement the config shape**

Add the smallest config additions needed:
- `MemoryEngineProvider = 'local' | 'supermemory'`
- `SupermemoryConfig`
- `MemoryEngineConfig`
- `memoryEngine?: MemoryEngineConfig` on `CorivoConfig`

Do not add unrelated config migration logic yet. Keep load/save behavior backward-compatible for configs that omit `memoryEngine`.

- [ ] **Step 4: Update init defaults minimally**

Ensure `corivo init` writes a config shape that remains valid with the new interface. Do not force Supermemory during init yet. Default provider should remain absent or explicit `local` based on the least invasive change.

- [ ] **Step 5: Re-run the targeted config tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/config-settings.test.ts __tests__/unit/memory-provider-config.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/cli/commands/init.ts packages/cli/__tests__/unit/config-settings.test.ts packages/cli/__tests__/unit/memory-provider-config.test.ts
git commit -m "feat: add memory engine config"
```

## Task 2: Introduce the Memory Provider Boundary

**Files:**
- Create: `packages/cli/src/domain/memory/providers/types.ts`
- Create: `packages/cli/src/domain/memory/providers/local-memory-provider.ts`
- Create: `packages/cli/src/domain/memory/providers/resolve-memory-provider.ts`
- Modify: `packages/cli/src/application/bootstrap/query-execution.ts`
- Test: `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`
- Test: `packages/cli/__tests__/unit/memory-provider-config.test.ts`

- [ ] **Step 1: Write the failing provider-resolution tests**

Add tests that assert:
- `provider=local` resolves the local provider
- `provider=supermemory` with missing API key or container tag throws a clear config error
- prompt query still falls back to the local recall chain when the provider misses

Suggested expectations:

```ts
await expect(resolveMemoryProvider({
  version: '1',
  created_at: '2026-01-01',
  identity_id: 'test-id',
  memoryEngine: { provider: 'supermemory', supermemory: { apiKey: '', containerTag: '' } },
})).rejects.toThrow('Supermemory is configured incorrectly');
```

- [ ] **Step 2: Run the targeted provider tests to verify failure**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-provider-config.test.ts __tests__/unit/cli-runtime-commands.test.ts`

Expected: FAIL because the provider boundary and resolver do not exist.

- [ ] **Step 3: Add the provider contract**

Define minimal interfaces:
- `save`
- `search`
- `recall`
- `healthcheck`

Keep return types aligned with existing presenter needs so command output does not need a full rewrite.

- [ ] **Step 4: Implement the local provider adapter**

Wrap existing local behavior:
- `recall` should reuse current markdown/raw/block recall logic
- `search` should reuse `searchBlocks`
- `healthcheck` should report `ok` when local config/DB is available

Do not move all local logic yet. Reuse existing helper functions where possible.

- [ ] **Step 5: Implement provider resolution**

Resolve provider from config:
- missing `memoryEngine` -> local
- `provider=local` -> local
- `provider=supermemory` -> Supermemory provider placeholder or config validation error until Task 3 fills the implementation

- [ ] **Step 6: Route prompt query/search execution through the provider boundary**

Update `query-execution.ts` so:
- `runPromptQueryCommand` asks the resolved provider for recall first
- `runSearchQueryCommand` asks the resolved provider for search first
- when the configured provider is unavailable or returns no result, the local provider path remains available as fallback

- [ ] **Step 7: Re-run the targeted provider tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-provider-config.test.ts __tests__/unit/cli-runtime-commands.test.ts`

Expected: PASS for local provider and fallback behavior; Supermemory-specific behavior can remain pending until the next task.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/domain/memory/providers/types.ts packages/cli/src/domain/memory/providers/local-memory-provider.ts packages/cli/src/domain/memory/providers/resolve-memory-provider.ts packages/cli/src/application/bootstrap/query-execution.ts packages/cli/__tests__/unit/memory-provider-config.test.ts packages/cli/__tests__/unit/cli-runtime-commands.test.ts
git commit -m "feat: add memory provider boundary"
```

## Task 3: Implement the Supermemory Provider

**Files:**
- Create: `packages/cli/src/domain/memory/providers/supermemory-provider.ts`
- Create: `packages/cli/src/application/query/provider-search.ts`
- Create: `packages/cli/src/application/query/provider-recall.ts`
- Modify: `packages/cli/src/domain/memory/providers/resolve-memory-provider.ts`
- Test: `packages/cli/__tests__/unit/supermemory-provider.test.ts`
- Test: `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`

- [ ] **Step 1: Write the failing Supermemory provider tests**

Cover:
- save/search/recall calls include `containerTag`
- the provider builds the client with the configured API key
- empty Supermemory recall/search results return `null` or `[]` without throwing
- SDK/network failures surface as provider errors that upper layers can fallback from

Suggested mocked assertion:

```ts
expect(searchMemories).toHaveBeenCalledWith(
  expect.objectContaining({
    containerTag: 'project:test',
  }),
);
```

- [ ] **Step 2: Run the targeted Supermemory tests to verify failure**

Run: `cd packages/cli && npm run test -- __tests__/unit/supermemory-provider.test.ts`

Expected: FAIL because the provider implementation does not exist.

- [ ] **Step 3: Implement the minimal Supermemory client wrapper**

Create the provider implementation using the installed `supermemory` SDK:
- initialize the client with `apiKey`
- map Corivo save payloads to Supermemory memory/document writes
- map prompt recall to a search request and normalize the top hit into `CorivoSurfaceItem`
- map explicit search into a list shaped like existing search output expectations

Keep mapping intentionally small:
- main text
- `containerTag`
- metadata for `annotation`, `source`, `host`, `cwd`, `sessionId`, `memoryType`, `createdAt`

- [ ] **Step 4: Finish provider resolution for `provider=supermemory`**

Update the resolver so valid Supermemory config returns the real provider implementation.

- [ ] **Step 5: Wire Supermemory-first, local-fallback behavior**

Ensure prompt recall and explicit search:
- use Supermemory first when configured
- fallback to the local provider on provider error
- fallback to the local provider on empty result if the command semantics allow it

- [ ] **Step 6: Re-run the targeted Supermemory and query tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/supermemory-provider.test.ts __tests__/unit/cli-runtime-commands.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/domain/memory/providers/supermemory-provider.ts packages/cli/src/application/query/provider-search.ts packages/cli/src/application/query/provider-recall.ts packages/cli/src/domain/memory/providers/resolve-memory-provider.ts packages/cli/__tests__/unit/supermemory-provider.test.ts packages/cli/__tests__/unit/cli-runtime-commands.test.ts
git commit -m "feat: add supermemory search and recall provider"
```

## Task 4: Move Save onto the Provider Interface

**Files:**
- Create: `packages/cli/src/application/memory/save-memory.ts`
- Modify: `packages/cli/src/cli/commands/save.ts`
- Modify: `packages/cli/src/application/bootstrap/create-cli-app.ts`
- Test: `packages/cli/__tests__/unit/save-memory.test.ts`
- Test: `packages/cli/__tests__/unit/query-save-passwordless.test.ts`

- [ ] **Step 1: Write the failing save use-case tests**

Cover:
- `save-memory` sends content/annotation/source to the resolved provider
- invalid annotation still fails before provider write
- passwordless flow still does not request a password
- when provider is `supermemory`, the save command no longer requires direct DB writes in the happy path

- [ ] **Step 2: Run the targeted save tests to verify failure**

Run: `cd packages/cli && npm run test -- __tests__/unit/save-memory.test.ts __tests__/unit/query-save-passwordless.test.ts`

Expected: FAIL because the save use-case and provider-backed save path do not exist.

- [ ] **Step 3: Implement the save use-case**

Create `save-memory.ts` to:
- load config
- resolve the provider
- validate annotation
- save through the provider
- return a normalized save result the CLI can present

Do not duplicate direct config parsing in the CLI command.

- [ ] **Step 4: Refactor `save.ts` to use the use-case**

Keep current CLI behavior where practical:
- same flags
- same validation
- similar success output

If Supermemory is configured, the success output may omit local-only fields that are no longer authoritative. Do not fake vitality or local block IDs unless they are genuinely available from the chosen provider path.

- [ ] **Step 5: Re-run the targeted save tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/save-memory.test.ts __tests__/unit/query-save-passwordless.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/application/memory/save-memory.ts packages/cli/src/cli/commands/save.ts packages/cli/src/application/bootstrap/create-cli-app.ts packages/cli/__tests__/unit/save-memory.test.ts packages/cli/__tests__/unit/query-save-passwordless.test.ts
git commit -m "feat: route save through memory providers"
```

## Task 5: Add Supermemory CLI Configuration and Status Diagnostics

**Files:**
- Create: `packages/cli/src/cli/commands/supermemory.ts`
- Modify: `packages/cli/src/application/bootstrap/create-cli-app.ts`
- Modify: `packages/cli/src/cli/commands/status.ts`
- Test: `packages/cli/__tests__/unit/status-command.test.ts`
- Test: `packages/cli/__tests__/unit/memory-provider-config.test.ts`

- [ ] **Step 1: Write the failing CLI/config diagnostic tests**

Cover:
- `corivo supermemory set-key` persists the API key into config
- `corivo supermemory status` reports whether provider config is complete
- `status` shows the active memory engine and whether it is healthy

- [ ] **Step 2: Run the targeted status/config tests to verify failure**

Run: `cd packages/cli && npm run test -- __tests__/unit/status-command.test.ts __tests__/unit/memory-provider-config.test.ts`

Expected: FAIL because the new command and diagnostics do not exist.

- [ ] **Step 3: Implement the Supermemory config command**

Add a dedicated command tree for:
- `set-key`
- `status`

Persist the API key in `config.json`. Keep the implementation focused; do not add keychain support in this task.

- [ ] **Step 4: Surface engine diagnostics in status**

Update `status.ts` so users can tell:
- which memory engine is active
- whether Supermemory is configured
- whether the provider healthcheck passes

- [ ] **Step 5: Re-run the targeted status/config tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/status-command.test.ts __tests__/unit/memory-provider-config.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli/commands/supermemory.ts packages/cli/src/application/bootstrap/create-cli-app.ts packages/cli/src/cli/commands/status.ts packages/cli/__tests__/unit/status-command.test.ts packages/cli/__tests__/unit/memory-provider-config.test.ts
git commit -m "feat: add supermemory config and diagnostics"
```

## Task 6: Run End-to-End Verification and Update the Plan Outcome

**Files:**
- Modify: `docs/superpowers/plans/2026-04-04-supermemory-provider-migration.md`
- Test: `packages/cli/__tests__/unit/config-settings.test.ts`
- Test: `packages/cli/__tests__/unit/memory-provider-config.test.ts`
- Test: `packages/cli/__tests__/unit/supermemory-provider.test.ts`
- Test: `packages/cli/__tests__/unit/save-memory.test.ts`
- Test: `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`
- Test: `packages/cli/__tests__/unit/query-save-passwordless.test.ts`
- Test: `packages/cli/__tests__/unit/status-command.test.ts`

- [ ] **Step 1: Run the focused verification suite**

Run:

```bash
cd packages/cli && npm run test -- \
  __tests__/unit/config-settings.test.ts \
  __tests__/unit/memory-provider-config.test.ts \
  __tests__/unit/supermemory-provider.test.ts \
  __tests__/unit/save-memory.test.ts \
  __tests__/unit/cli-runtime-commands.test.ts \
  __tests__/unit/query-save-passwordless.test.ts \
  __tests__/unit/status-command.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck for the CLI package**

Run: `cd packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 3: Run one broader regression target**

Run: `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts`

Expected: PASS

- [ ] **Step 4: Mark any plan deviations**

If the implementation required a different file path or boundary, update this plan document to reflect the actual outcome before handoff.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-04-supermemory-provider-migration.md
git commit -m "docs: finalize supermemory provider migration plan"
```
