# CLI Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `packages/cli/src` into a stable second-generation architecture where CLI I/O, application orchestration, domain logic, runtime policies, and infrastructure adapters have explicit boundaries.

**Architecture:** Keep `src/cli/*` as the adapter shell, promote `src/application/*` to the only orchestration layer, introduce `src/domain/*` and `src/infrastructure/*` as durable homes for business concepts and external adapters, and shrink `src/runtime/*` to process/runtime-only concerns. Migrate incrementally with compatibility re-exports and no user-facing command changes until the final cleanup pass.

**Tech Stack:** TypeScript, Commander, Tiptap-free Node CLI runtime, better-sqlite3, Vitest, pnpm workspace

---

## Scope

This plan covers `packages/cli/src` only. It does not change plugin packages, wire protocol, solver APIs, or memory schema semantics unless a migration step explicitly says so.

## Current Structural Problems

- `src/runtime/*` mixes runtime support with product use-cases such as recall, review, carry-over, follow-up rendering, and query history.
- `src/engine/*` mixes pure memory rules with orchestration, background loops, and user-facing features.
- `src/service/*` mixes system service management and LLM extraction under one vague name.
- `src/hosts/*` contains both host-specific implementation and orchestration that now also exists in `src/application/hosts/*`.
- `src/storage/database.ts` is a growing facade that will become a high-risk bottleneck if left monolithic.
- `src/type/*` is a generic catch-all and should not survive the refactor.
- `src/cli/context/*` is the correct runtime bundle direction, but not yet the sole dependency gateway for command/application flows.

## Target Directory Structure

```text
packages/cli/src/
  cli/
    index.ts
    commands/
    context/
    presenters/
    utils/

  application/
    bootstrap/
    carry-over/
    hosts/
    memory/
    memory-ingest/
    query/
    review/
    sync/

  domain/
    host/
      contracts/
    identity/
      services/
    memory/
      models/
      rules/
      services/

  infrastructure/
    config/
    fs/
    hosts/
      adapters/
      importers/
      installers/
      registry/
    llm/
    output/
    platform/
    storage/
      lifecycle/
      repositories/
      search/
      schema/

  runtime/
    daemon/
    policies/
    scheduling/

  cold-scan/
  errors/
  memory-pipeline/
  raw-memory/
  tui/
  update/
  utils/
```

## Non-Negotiable Rules

- `src/cli/*` parses input and renders output only.
- `src/application/*` owns use-case orchestration and dependency composition for one user action.
- `src/domain/*` must not depend on Commander, stdout/stderr, chalk, or platform APIs.
- `src/infrastructure/*` owns SQLite, filesystem, OS services, host adapters, and LLM/provider integrations.
- `src/runtime/*` is only for process lifecycle, daemon scheduling, and runtime policies; it is not a home for product-facing use-cases.
- `CliContext` only contains horizontal runtime capabilities such as logger, config, paths, fs, clock, output, and db access. It must not become a business-action registry.

## File Mapping

### Keep In Place

- `packages/cli/src/cli/*`
- `packages/cli/src/application/bootstrap/*`
- `packages/cli/src/application/memory/*`
- `packages/cli/src/application/memory-ingest/*`
- `packages/cli/src/memory-pipeline/*`
- `packages/cli/src/raw-memory/*`
- `packages/cli/src/errors/index.ts`
- `packages/cli/src/update/*`
- `packages/cli/src/tui/*`
- `packages/cli/src/cold-scan/*`

### Move To `domain`

- `packages/cli/src/models/*` -> `packages/cli/src/domain/memory/models/*`
- `packages/cli/src/engine/rules.ts` -> `packages/cli/src/domain/memory/rules/rule-engine.ts`
- `packages/cli/src/engine/rules/*` -> `packages/cli/src/domain/memory/rules/*`
- `packages/cli/src/engine/associations.ts` -> `packages/cli/src/domain/memory/services/associations.ts`
- `packages/cli/src/engine/consolidation.ts` -> `packages/cli/src/domain/memory/services/consolidation.ts`
- `packages/cli/src/engine/conflict-detector.ts` -> `packages/cli/src/domain/memory/services/conflict-detector.ts`
- `packages/cli/src/engine/trigger-decision.ts` -> `packages/cli/src/domain/memory/services/trigger-decision.ts`
- `packages/cli/src/identity/*` -> `packages/cli/src/domain/identity/services/*`
- `packages/cli/src/hosts/types.ts` -> `packages/cli/src/domain/host/contracts/types.ts`

### Move To `infrastructure`

- `packages/cli/src/service/extraction/*` -> `packages/cli/src/infrastructure/llm/*`
- `packages/cli/src/service/index.ts` -> `packages/cli/src/infrastructure/platform/index.ts`
- `packages/cli/src/service/linux.ts` -> `packages/cli/src/infrastructure/platform/linux.ts`
- `packages/cli/src/service/macos.ts` -> `packages/cli/src/infrastructure/platform/macos.ts`
- `packages/cli/src/service/unsupported.ts` -> `packages/cli/src/infrastructure/platform/unsupported.ts`
- `packages/cli/src/service/types.ts` -> `packages/cli/src/infrastructure/platform/types.ts`
- `packages/cli/src/hosts/adapters/*` -> `packages/cli/src/infrastructure/hosts/adapters/*`
- `packages/cli/src/hosts/importers/*` -> `packages/cli/src/infrastructure/hosts/importers/*`
- `packages/cli/src/hosts/installers/*` -> `packages/cli/src/infrastructure/hosts/installers/*`
- `packages/cli/src/hosts/registry.ts` -> `packages/cli/src/infrastructure/hosts/registry/index.ts`
- `packages/cli/src/hosts/index.ts` -> `packages/cli/src/infrastructure/hosts/index.ts`
- `packages/cli/src/storage/database.ts` -> split across `packages/cli/src/infrastructure/storage/*`

### Move To `application`

- `packages/cli/src/runtime/recall.ts` -> `packages/cli/src/application/query/generate-recall.ts`
- `packages/cli/src/runtime/raw-recall.ts` -> `packages/cli/src/application/query/generate-raw-recall.ts`
- `packages/cli/src/runtime/retrieval.ts` -> `packages/cli/src/application/query/retrieval.ts`
- `packages/cli/src/runtime/query-pack.ts` -> `packages/cli/src/application/query/query-pack.ts`
- `packages/cli/src/runtime/render.ts` -> `packages/cli/src/cli/presenters/query-renderer.ts`
- `packages/cli/src/runtime/review.ts` -> `packages/cli/src/application/review/run-review.ts`
- `packages/cli/src/runtime/carry-over.ts` -> `packages/cli/src/application/carry-over/run-carry-over.ts`
- `packages/cli/src/runtime/follow-up-retrieval.ts` -> `packages/cli/src/application/review/follow-up-retrieval.ts`
- `packages/cli/src/runtime/follow-up-render.ts` -> `packages/cli/src/cli/presenters/follow-up-renderer.ts`
- `packages/cli/src/runtime/query-history.ts` -> split between `packages/cli/src/application/query/query-history.ts` and `packages/cli/src/runtime/policies/query-history-policy.ts`
- `packages/cli/src/runtime/heartbeat-first-run.ts` -> `packages/cli/src/application/review/heartbeat-first-run.ts`

### Keep In `runtime`, But Narrow It

- `packages/cli/src/runtime/runtime-support.ts` -> `packages/cli/src/runtime/policies/runtime-support.ts`
- `packages/cli/src/runtime/query-history-policy.ts` -> `packages/cli/src/runtime/policies/query-history-policy.ts`
- `packages/cli/src/runtime/host-bridge-policy.ts` -> `packages/cli/src/runtime/policies/host-bridge-policy.ts`
- `packages/cli/src/runtime/host-adapter.ts` -> `packages/cli/src/runtime/policies/host-adapter.ts`
- `packages/cli/src/runtime/process-state.ts` -> `packages/cli/src/runtime/daemon/process-state.ts`
- `packages/cli/src/runtime/sync-client.ts` -> `packages/cli/src/application/sync/sync-client.ts` or `packages/cli/src/infrastructure/output` is not appropriate; decide during Task 5 based on actual dependencies
- `packages/cli/src/engine/heartbeat.ts` -> `packages/cli/src/runtime/daemon/heartbeat.ts`
- `packages/cli/src/engine/auto-sync.ts` -> `packages/cli/src/runtime/scheduling/auto-sync.ts`

### Delete / Dissolve

- `packages/cli/src/type/index.ts` -> dissolve into specific modules

## Compatibility Strategy

- During migration, keep temporary barrel files or forwarding re-exports at old paths for one batch only.
- Remove one compatibility layer per completed batch; never carry two generations of alias layers at once.
- All public package exports from `packages/cli/src/index.ts` must remain stable until the final cleanup batch.

## Verification Baseline

Run these before any refactor batch and record the result:

- [ ] `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`
- [ ] `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- [ ] `cd /Users/airbo/Developer/corivo/Corivo && pnpm -r run build`

If any command is already failing on `main`, record that exact failure before starting the first migration commit.

### Task 1: Create The New Skeleton And Boundary Notes

**Files:**
- Create: `packages/cli/src/domain/.gitkeep`
- Create: `packages/cli/src/domain/memory/models/.gitkeep`
- Create: `packages/cli/src/domain/memory/rules/.gitkeep`
- Create: `packages/cli/src/domain/memory/services/.gitkeep`
- Create: `packages/cli/src/domain/host/contracts/.gitkeep`
- Create: `packages/cli/src/domain/identity/services/.gitkeep`
- Create: `packages/cli/src/infrastructure/config/.gitkeep`
- Create: `packages/cli/src/infrastructure/fs/.gitkeep`
- Create: `packages/cli/src/infrastructure/hosts/adapters/.gitkeep`
- Create: `packages/cli/src/infrastructure/hosts/importers/.gitkeep`
- Create: `packages/cli/src/infrastructure/hosts/installers/.gitkeep`
- Create: `packages/cli/src/infrastructure/hosts/registry/.gitkeep`
- Create: `packages/cli/src/infrastructure/llm/.gitkeep`
- Create: `packages/cli/src/infrastructure/output/.gitkeep`
- Create: `packages/cli/src/infrastructure/platform/.gitkeep`
- Create: `packages/cli/src/infrastructure/storage/lifecycle/.gitkeep`
- Create: `packages/cli/src/infrastructure/storage/repositories/.gitkeep`
- Create: `packages/cli/src/infrastructure/storage/search/.gitkeep`
- Create: `packages/cli/src/infrastructure/storage/schema/.gitkeep`
- Create: `packages/cli/src/runtime/daemon/.gitkeep`
- Create: `packages/cli/src/runtime/policies/.gitkeep`
- Create: `packages/cli/src/runtime/scheduling/.gitkeep`
- Modify: `packages/cli/README.md`

- [ ] **Step 1: Create the directory skeleton**

Use `mkdir -p` or `apply_patch` file additions for the directories above.

- [ ] **Step 2: Update the package architecture note**

Add a short section to `packages/cli/README.md` stating the target split:
- `cli` = adapters and presenters
- `application` = use-cases
- `domain` = core business logic
- `infrastructure` = SQLite, OS, host, LLM, fs
- `runtime` = daemon and policy glue

- [ ] **Step 3: Run typecheck to ensure the skeleton itself changes nothing**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/domain packages/cli/src/infrastructure packages/cli/src/runtime packages/cli/README.md
git commit -m "refactor: introduce cli architecture target skeleton"
```

### Task 2: Move Platform And LLM Service Adapters Into Infrastructure

**Files:**
- Create: `packages/cli/src/infrastructure/platform/index.ts`
- Create: `packages/cli/src/infrastructure/platform/linux.ts`
- Create: `packages/cli/src/infrastructure/platform/macos.ts`
- Create: `packages/cli/src/infrastructure/platform/unsupported.ts`
- Create: `packages/cli/src/infrastructure/platform/types.ts`
- Create: `packages/cli/src/infrastructure/llm/index.ts`
- Create: `packages/cli/src/infrastructure/llm/types.ts`
- Modify: `packages/cli/src/service/index.ts`
- Modify: `packages/cli/src/service/linux.ts`
- Modify: `packages/cli/src/service/macos.ts`
- Modify: `packages/cli/src/service/unsupported.ts`
- Modify: `packages/cli/src/service/types.ts`
- Modify: `packages/cli/src/service/extraction/index.ts`
- Modify: `packages/cli/src/service/extraction/types.ts`
- Modify: all imports that reference `src/service/*`

- [ ] **Step 1: Add new infrastructure files by moving exact implementations**

Do a pure file move first. Do not rename exported symbols in the same commit.

- [ ] **Step 2: Leave forwarding re-exports at old paths**

`src/service/*` should temporarily export from the new `src/infrastructure/*` paths to avoid a giant import rewrite in one step.

- [ ] **Step 3: Update imports in low-risk leaf modules**

Start with `packages/cli/src/index.ts`, `packages/cli/src/application/memory/run-memory-pipeline.ts`, and any direct imports in `packages/cli/src/cli/*`.

- [ ] **Step 4: Run targeted tests and typecheck**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/service packages/cli/src/infrastructure/platform packages/cli/src/infrastructure/llm packages/cli/src/index.ts packages/cli/src/application
git commit -m "refactor: move platform and llm adapters into infrastructure"
```

### Task 3: Move Host Implementations Out Of `hosts` And Keep Orchestration In `application`

**Files:**
- Create: `packages/cli/src/infrastructure/hosts/index.ts`
- Create: `packages/cli/src/infrastructure/hosts/registry/index.ts`
- Create: `packages/cli/src/domain/host/contracts/types.ts`
- Modify: `packages/cli/src/hosts/index.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Modify: `packages/cli/src/hosts/types.ts`
- Modify: `packages/cli/src/application/hosts/install-host.ts`
- Modify: `packages/cli/src/application/hosts/doctor-host.ts`
- Modify: `packages/cli/src/application/hosts/uninstall-host.ts`
- Modify: `packages/cli/src/application/hosts/import-host.ts`
- Modify: all imports from `packages/cli/src/hosts/*`

- [ ] **Step 1: Move host contracts first**

Move `types.ts` into `domain/host/contracts/types.ts`. Keep `src/hosts/types.ts` as a temporary re-export.

- [ ] **Step 2: Move adapters/importers/installers/registry into `infrastructure/hosts/*`**

This is a file move plus import rewrite. Do not mix behavior changes.

- [ ] **Step 3: Update application host use-cases to depend only on contracts and infrastructure registry**

`application/hosts/*` should remain the only orchestration layer for install/doctor/import/uninstall.

- [ ] **Step 4: Remove direct host implementation knowledge from commands**

`createCliApp` should still ask infrastructure for registered adapters, but no CLI code should know installer/importer file paths.

- [ ] **Step 5: Run targeted verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/integration/host*`

Expected: PASS or existing known failures only

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/hosts packages/cli/src/infrastructure/hosts packages/cli/src/domain/host packages/cli/src/application/hosts
git commit -m "refactor: separate host contracts from host infrastructure"
```

### Task 4: Make `application` The Only Home For Query, Review, And Carry-Over Orchestration

**Files:**
- Create: `packages/cli/src/application/query/generate-recall.ts`
- Create: `packages/cli/src/application/query/generate-raw-recall.ts`
- Create: `packages/cli/src/application/query/query-pack.ts`
- Create: `packages/cli/src/application/query/retrieval.ts`
- Create: `packages/cli/src/application/query/query-history.ts`
- Create: `packages/cli/src/application/review/run-review.ts`
- Create: `packages/cli/src/application/carry-over/run-carry-over.ts`
- Create: `packages/cli/src/cli/presenters/query-renderer.ts`
- Create: `packages/cli/src/cli/presenters/follow-up-renderer.ts`
- Modify: `packages/cli/src/runtime/recall.ts`
- Modify: `packages/cli/src/runtime/raw-recall.ts`
- Modify: `packages/cli/src/runtime/query-pack.ts`
- Modify: `packages/cli/src/runtime/retrieval.ts`
- Modify: `packages/cli/src/runtime/review.ts`
- Modify: `packages/cli/src/runtime/carry-over.ts`
- Modify: `packages/cli/src/runtime/render.ts`
- Modify: `packages/cli/src/application/bootstrap/query-execution.ts`
- Modify: `packages/cli/src/cli/commands/query.ts`
- Modify: `packages/cli/src/cli/commands/review.ts`
- Modify: `packages/cli/src/cli/commands/carry-over.ts`

- [ ] **Step 1: Extract use-case functions into `application/*`**

Copy behavior first, then redirect callers. Keep old runtime files as re-export shims until the batch is green.

- [ ] **Step 2: Move renderer logic into `cli/presenters/*`**

Anything that formats text/json/hook-text belongs to presenters, not runtime.

- [ ] **Step 3: Restrict `runtime/*` to policies and adapters**

Delete remaining orchestration from runtime once callers are updated.

- [ ] **Step 4: Verify query/review flows**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/integration/query*`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/integration/review*`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/application packages/cli/src/runtime packages/cli/src/cli
git commit -m "refactor: move query review and carry-over flows into application"
```

### Task 5: Split `engine` Into Domain Services And Runtime Daemon Logic

**Files:**
- Create: `packages/cli/src/domain/memory/services/associations.ts`
- Create: `packages/cli/src/domain/memory/services/consolidation.ts`
- Create: `packages/cli/src/domain/memory/services/conflict-detector.ts`
- Create: `packages/cli/src/domain/memory/services/trigger-decision.ts`
- Create: `packages/cli/src/domain/memory/services/reminders.ts`
- Create: `packages/cli/src/domain/memory/services/suggestion.ts`
- Create: `packages/cli/src/runtime/daemon/heartbeat.ts`
- Create: `packages/cli/src/runtime/scheduling/auto-sync.ts`
- Modify: `packages/cli/src/engine/*.ts`
- Modify: `packages/cli/src/application/bootstrap/create-cli-app.ts`
- Modify: any CLI/daemon entrypoints that import `engine/*`

- [ ] **Step 1: Move pure memory services out of `engine`**

Start with `associations`, `consolidation`, `conflict-detector`, `suggestion`, `trigger-decision`, and any pure rules.

- [ ] **Step 2: Move background loop code into `runtime/daemon` and `runtime/scheduling`**

`heartbeat.ts` and `auto-sync.ts` should not remain in a generic `engine` directory.

- [ ] **Step 3: Decide `reminders`, `query-history`, `push-queue`, and `follow-up` case-by-case**

Use this rule:
- if it expresses user-facing orchestration, move to `application`
- if it expresses durable business logic, move to `domain`
- if it manages process runtime, move to `runtime`

- [ ] **Step 4: Add one short architecture note to each surviving top-level directory**

Create `README.md` or module doc comments where ambiguity is likely.

- [ ] **Step 5: Verify daemon and command flows**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/engine packages/cli/src/domain packages/cli/src/runtime packages/cli/src/application
git commit -m "refactor: split engine into domain services and runtime loops"
```

### Task 6: Split The Database Facade And Delete The Catch-All Directories

**Files:**
- Create: `packages/cli/src/infrastructure/storage/lifecycle/open-database.ts`
- Create: `packages/cli/src/infrastructure/storage/lifecycle/database-paths.ts`
- Create: `packages/cli/src/infrastructure/storage/repositories/block-repository.ts`
- Create: `packages/cli/src/infrastructure/storage/repositories/raw-memory-repository.ts`
- Create: `packages/cli/src/infrastructure/storage/repositories/query-history-repository.ts`
- Create: `packages/cli/src/infrastructure/storage/search/block-search.ts`
- Create: `packages/cli/src/infrastructure/storage/schema/*.ts`
- Modify: `packages/cli/src/storage/database.ts`
- Modify: `packages/cli/src/raw-memory/repository.ts`
- Modify: `packages/cli/src/application/memory/run-memory-pipeline.ts`
- Modify: `packages/cli/src/cli/context/create-context.ts`
- Delete: `packages/cli/src/type/index.ts`

- [ ] **Step 1: Introduce storage submodules without changing the public facade**

`src/storage/database.ts` should delegate to the new modules before it is reduced or deleted.

- [ ] **Step 2: Move direct SQL and repository behavior into dedicated files**

Separate:
- lifecycle/opening
- schema/migrations
- repositories
- search helpers

- [ ] **Step 3: Remove `type/index.ts` and rehome every exported type**

No compatibility barrel here; this directory should disappear.

- [ ] **Step 4: Update `CliContext` to depend on the new storage facade**

Keep `CliContext` narrow: db accessor, logger, config, output, paths, fs, clock.

- [ ] **Step 5: Run full verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`
- `cd /Users/airbo/Developer/corivo/Corivo && pnpm -r run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/storage packages/cli/src/infrastructure/storage packages/cli/src/type packages/cli/src/cli/context packages/cli/src/raw-memory packages/cli/src/application
git commit -m "refactor: split storage facade and remove catch-all type module"
```

### Task 7: Remove Compatibility Re-Exports And Tighten Public API

**Files:**
- Modify: every temporary shim left in prior tasks
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/README.md`

- [ ] **Step 1: Remove one-batch-old compatibility shims**

No stale alias layers should remain after this task.

- [ ] **Step 2: Recheck public package exports**

Keep intended exports in `packages/cli/src/index.ts`. Do not leak internal restructuring accidentally.

- [ ] **Step 3: Refresh docs**

Update `packages/cli/README.md` to reflect the final structure and where new code should go.

- [ ] **Step 4: Run final verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`
- `cd /Users/airbo/Developer/corivo/Corivo && pnpm -r run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src packages/cli/README.md
git commit -m "refactor: finalize cli architecture boundary cleanup"
```

## Acceptance Criteria

- No top-level `src/type` directory remains.
- `src/service` no longer mixes OS service management and LLM extraction.
- `src/runtime` contains only daemon/runtime support and policy modules.
- `src/application` is the only orchestration layer for query/review/carry-over/host flows.
- `src/engine` is either deleted or reduced to clearly named legacy shims pending final removal.
- `src/storage/database.ts` is no longer the sole implementation home for lifecycle, repositories, and search.
- `CliContext` remains a runtime capability bundle, not a business-action container.
- Existing public CLI commands and outputs continue to work.

## Risks And Mitigations

- Import churn risk
  Mitigation: use one-batch forwarding re-exports only, then remove them.

- Hidden circular dependencies
  Mitigation: move contracts first, implementations second, orchestration third.

- Refactor mixes with behavior changes
  Mitigation: each batch is file-move first, behavior-preserving first, cleanup second.

- Database regression risk
  Mitigation: do not change schema semantics during storage decomposition; only extract modules.

- Team confusion during migration
  Mitigation: update `packages/cli/README.md` in Task 1 and Task 7, and keep code review focused on boundary enforcement.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7

Do not start Task 5 or Task 6 before Tasks 2 through 4 are green. Those two batches have the highest blast radius.

## Review Note

This plan was written in-session and not sent to a subagent reviewer because this session does not currently permit delegated subagents unless explicitly requested by the user.
