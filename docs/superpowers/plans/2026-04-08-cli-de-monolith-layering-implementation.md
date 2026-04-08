# CLI De-Monolith Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `packages/cli` into a boundary-governed layered package, freeze legacy bucket directories, and create a safe migration path for later package extraction without attempting a big-bang rewrite.

**Architecture:** Treat `docs/architecture/cli-de-monolith-layering-plan-2026-04.md` as the governing spec, then land the work in four passes: boundary contract, enforcement, package-internal convergence, and package-extraction preparation. Keep `packages/cli` runnable throughout, migrate one semantic slice at a time, and prefer temporary compatibility re-exports only inside a single task batch.

**Tech Stack:** TypeScript, Commander, better-sqlite3, Vitest, ESLint, pnpm workspace

---

## Scope Check

The spec spans multiple subsystems inside `packages/cli`: docs/contracts, boundary enforcement, legacy directory freeze, semantic migrations, and future package extraction. This plan keeps them in one umbrella file because they all serve one architectural outcome, but execution should stop after each task and verify the package still builds and tests cleanly.

## Execution Rules

- Work on a feature branch or worktree, never on `main`.
- Do not move unrelated code “while nearby”.
- Each migration task may introduce compatibility re-exports, but those re-exports must be removed before the task is closed or in the immediately following cleanup step.
- New behavior must land only in `cli/`, `application/`, `domain/`, `infrastructure/`, `runtime/`, or `memory-pipeline/`.
- Legacy directories in freeze state may receive bugfixes and migration edits only.

## Verification Baseline

Record the baseline before Task 1 and rerun the relevant subset after every task:

- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo && npm run lint`

If any command already fails, copy the exact failure into the commit message body or task notes before continuing.

## Planned File Structure

### Boundary Contract / Docs

- Modify: `docs/architecture/cli-de-monolith-layering-plan-2026-04.md`
- Modify: `docs/architecture/module-boundaries-2026-04.md`
- Modify: `packages/cli/README.md`
- Create: `packages/cli/src/application/README.md`
- Create: `packages/cli/src/domain/README.md`
- Create: `packages/cli/src/infrastructure/README.md`
- Create: `packages/cli/src/runtime/README.md`
- Modify: `packages/cli/__tests__/unit/module-boundaries.test.ts`

### Enforcement

- Modify: `eslint.config.js`
- Create: `packages/cli/__tests__/unit/cli-layering-freeze.test.ts`
- Modify: `packages/cli/package.json` only if a dedicated lint script is needed

### Semantic Migrations

- Modify: `packages/cli/src/storage/database.ts`
- Modify or create files under `packages/cli/src/infrastructure/storage/{lifecycle,repositories,search,schema}/`
- Modify or create files under `packages/cli/src/application/hosts/`
- Modify or create files under `packages/cli/src/domain/host/contracts/`
- Modify or create files under `packages/cli/src/infrastructure/hosts/`
- Modify or create files under `packages/cli/src/domain/memory/{models,rules,services}/`
- Modify or create files under `packages/cli/src/runtime/{daemon,scheduling,policies}/`
- Modify or create files under `packages/cli/src/application/{query,review,carry-over}/`
- Modify or create files under `packages/cli/src/domain/identity/`
- Modify or create files under `packages/cli/src/infrastructure/platform/`

### Extraction Preparation

- Create: `docs/architecture/cli-extraction-candidates-2026-04.md`
- Modify: `packages/cli/__tests__/unit/module-boundaries.test.ts`
- Create if needed: `packages/cli/__tests__/unit/extraction-candidates.test.ts`

---

### Task 1: Publish The Layering Contract

**Files:**
- Modify: `docs/architecture/cli-de-monolith-layering-plan-2026-04.md`
- Modify: `docs/architecture/module-boundaries-2026-04.md`
- Modify: `packages/cli/README.md`
- Create: `packages/cli/src/application/README.md`
- Create: `packages/cli/src/domain/README.md`
- Create: `packages/cli/src/infrastructure/README.md`
- Create: `packages/cli/src/runtime/README.md`
- Test: `packages/cli/__tests__/unit/module-boundaries.test.ts`

- [ ] **Step 1: Extend the boundary doc test before changing docs**

Update `packages/cli/__tests__/unit/module-boundaries.test.ts` so it asserts the new plan language exists:
- target layer names: `cli`, `application`, `domain`, `infrastructure`, `runtime`, `memory-pipeline`
- freeze directories: `engine`, `service`, `storage`, `hosts`, `models`, `type`
- feature-top-level directories that should not grow long-term: `identity`, `push`, `cold-scan`, `raw-memory`, `first-push`, `ingestors`, `update`
- required per-layer README paths

- [ ] **Step 2: Run the test and confirm it fails on current docs**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`
Expected: FAIL because the docs do not yet expose the full layering contract.

- [ ] **Step 3: Update the architecture docs**

In `docs/architecture/cli-de-monolith-layering-plan-2026-04.md`:
- keep it as the governing spec
- add a short “execution baseline” note that Phase 1 is the first landing zone
- tighten the freeze language so it is testable, not aspirational

In `docs/architecture/module-boundaries-2026-04.md`:
- replace the earlier baseline with the new dependency rules from the spec
- document allowed direction: `cli -> application -> domain`, `application -> infrastructure`, `runtime -> application/domain/infrastructure`, `infrastructure -> domain`
- document forbidden directions and freeze directories

- [ ] **Step 4: Add per-layer README files**

Write one short README in each target layer directory:
- what belongs there
- what does not belong there
- 2-4 concrete file examples from the current tree
- one “common misplacement” example

- [ ] **Step 5: Update `packages/cli/README.md`**

Add:
- target layer structure
- freeze policy for legacy directories
- migration rule for new code placement
- link to the governing architecture docs

- [ ] **Step 6: Re-run the boundary doc test**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add docs/architecture/cli-de-monolith-layering-plan-2026-04.md \
  docs/architecture/module-boundaries-2026-04.md \
  packages/cli/README.md \
  packages/cli/src/application/README.md \
  packages/cli/src/domain/README.md \
  packages/cli/src/infrastructure/README.md \
  packages/cli/src/runtime/README.md \
  packages/cli/__tests__/unit/module-boundaries.test.ts
git commit -m "docs: publish cli layering contract" -m "原因：先统一唯一有效的分层语言，并让 freeze 规则与层职责进入可验证状态。"
```

### Task 2: Add Engineering Enforcement For The Contract

**Files:**
- Modify: `eslint.config.js`
- Modify: `packages/cli/__tests__/unit/module-boundaries.test.ts`
- Create: `packages/cli/__tests__/unit/cli-layering-freeze.test.ts`

- [ ] **Step 1: Write a failing freeze/enforcement test**

Create `packages/cli/__tests__/unit/cli-layering-freeze.test.ts` that scans `packages/cli/src` and asserts:
- no new top-level bucket directories appear beyond the approved set
- files in freeze directories are not imported by newly added files under target layers, except explicit compatibility shims
- `domain/**` does not import `cli/**`, `runtime/**`, or `infrastructure/**`
- `application/**` does not import `cli/**` or `runtime/**`
- `infrastructure/**` does not import `cli/**`

- [ ] **Step 2: Run the new test and capture current failures**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/cli-layering-freeze.test.ts`
Expected: FAIL on at least one currently ungoverned import pattern or missing allowlist.

- [ ] **Step 3: Add ESLint no-restricted-imports rules**

In `eslint.config.js`, add path-based restrictions for `packages/cli/src/**` that mirror the spec:
- `domain` cannot import from `cli`, `runtime`, `infrastructure`
- `application` cannot import from `cli`, `runtime`
- `infrastructure` cannot import from `cli`

Keep the rule scoped to `packages/cli/src/**/*.ts` so other packages are unaffected.

- [ ] **Step 4: Implement the filesystem-level test allowlist**

Finish `packages/cli/__tests__/unit/cli-layering-freeze.test.ts` with:
- exact approved top-level directories
- exact freeze directory list
- compatibility shim allowlist local to the test file

- [ ] **Step 5: Run focused verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts __tests__/unit/cli-layering-freeze.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo && npm run lint`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js \
  packages/cli/__tests__/unit/module-boundaries.test.ts \
  packages/cli/__tests__/unit/cli-layering-freeze.test.ts
git commit -m "test: enforce cli layering boundaries" -m "原因：仅靠文档不足以阻止旧目录继续扩张，必须把分层依赖与 freeze 规则落成工程约束。"
```

### Task 3: Finish The Storage Migration Slice

**Files:**
- Modify: `packages/cli/src/storage/database.ts`
- Modify or create: `packages/cli/src/infrastructure/storage/lifecycle/database.ts`
- Modify or create: `packages/cli/src/infrastructure/storage/lifecycle/database-paths.ts`
- Modify or create: `packages/cli/src/infrastructure/storage/schema/*.ts`
- Modify or create: `packages/cli/src/infrastructure/storage/repositories/*.ts`
- Modify or create: `packages/cli/src/infrastructure/storage/search/*.ts`
- Test: `packages/cli/__tests__/unit/database.test.ts`
- Test: `packages/cli/__tests__/unit/raw-memory-repository.test.ts`
- Test: `packages/cli/__tests__/integration/heartbeat.test.ts`

- [ ] **Step 1: Write or extend a storage-boundary test**

Add assertions in `packages/cli/__tests__/unit/cli-layering-freeze.test.ts` or `packages/cli/__tests__/unit/database.test.ts` that new storage entrypoints resolve through `infrastructure/storage/**`, not `src/storage/database.ts`.

- [ ] **Step 2: Run the focused storage test and verify it fails**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/database.test.ts`
Expected: FAIL or expose missing abstraction if old `storage/database.ts` is still the primary entrypoint.

- [ ] **Step 3: Split `src/storage/database.ts` by responsibility**

Move code into:
- lifecycle/bootstrap concerns -> `infrastructure/storage/lifecycle`
- repository operations -> `infrastructure/storage/repositories`
- schema/migration concerns -> `infrastructure/storage/schema`
- search concerns -> `infrastructure/storage/search`

Keep `src/storage/database.ts` only as a temporary compatibility shim if needed during this task.

- [ ] **Step 4: Repoint imports**

Update application/runtime/infrastructure consumers to import the new modules directly. If a shim is kept temporarily, add a TODO and remove it before Task 3 closes.

- [ ] **Step 5: Remove or reduce the old storage bucket**

End Task 3 with either:
- `src/storage/database.ts` deleted, or
- `src/storage/database.ts` reduced to a narrow compatibility bridge with no new logic

- [ ] **Step 6: Run storage verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/database.test.ts __tests__/unit/raw-memory-repository.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/integration/heartbeat.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/storage/database.ts \
  packages/cli/src/infrastructure/storage \
  packages/cli/__tests__/unit/database.test.ts \
  packages/cli/__tests__/unit/raw-memory-repository.test.ts \
  packages/cli/__tests__/unit/cli-layering-freeze.test.ts \
  packages/cli/__tests__/integration/heartbeat.test.ts
git commit -m "refactor: converge storage into infrastructure layer" -m "原因：storage 是最清晰的基础设施能力，优先完成包内收敛并为后续拆包建立边界。"
```

### Task 4: Finish The Host Integration Migration Slice

**Files:**
- Modify: `packages/cli/src/hosts/index.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Modify: `packages/cli/src/hosts/types.ts`
- Modify or create: `packages/cli/src/domain/host/contracts/types.ts`
- Modify or create: `packages/cli/src/application/hosts/*.ts`
- Modify or create: `packages/cli/src/infrastructure/hosts/**/*.ts`
- Test: `packages/cli/__tests__/unit/host-registry.test.ts`
- Test: `packages/cli/__tests__/unit/host-registry.contract.test.ts`
- Test: `packages/cli/__tests__/unit/install-host-use-case.test.ts`
- Test: `packages/cli/__tests__/unit/host-import-use-case.test.ts`

- [ ] **Step 1: Add a host-boundary failing test**

Extend `packages/cli/__tests__/unit/host-registry.contract.test.ts` or add a new assertion to the freeze test so:
- host contracts must live under `domain/host/contracts`
- install/import/doctor orchestration must live under `application/hosts`
- installers/importers/adapters/registry implementation must live under `infrastructure/hosts`

- [ ] **Step 2: Run the focused host tests**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/host-registry.test.ts __tests__/unit/host-registry.contract.test.ts __tests__/unit/install-host-use-case.test.ts __tests__/unit/host-import-use-case.test.ts`
Expected: FAIL before the migration is complete.

- [ ] **Step 3: Move contracts, orchestration, and adapters to their target layers**

Follow the split exactly:
- contracts -> `domain/host/contracts`
- use cases -> `application/hosts`
- concrete host implementation -> `infrastructure/hosts`

- [ ] **Step 4: Remove new logic from legacy `src/hosts/*`**

Keep only temporary forwarding files if needed. Do not leave feature code in `src/hosts/*` at task close.

- [ ] **Step 5: Verify**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/host-registry.test.ts __tests__/unit/host-registry.contract.test.ts __tests__/unit/install-host-use-case.test.ts __tests__/unit/host-import-use-case.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/hosts \
  packages/cli/src/domain/host/contracts \
  packages/cli/src/application/hosts \
  packages/cli/src/infrastructure/hosts \
  packages/cli/__tests__/unit/host-registry.test.ts \
  packages/cli/__tests__/unit/host-registry.contract.test.ts \
  packages/cli/__tests__/unit/install-host-use-case.test.ts \
  packages/cli/__tests__/unit/host-import-use-case.test.ts \
  packages/cli/__tests__/unit/cli-layering-freeze.test.ts
git commit -m "refactor: split host contracts and implementations by layer" -m "原因：宿主集成当前同时混合契约、编排和适配实现，需要按层拆开后才能继续收敛。"
```

### Task 5: Narrow Runtime To Runtime-Only Responsibilities

**Files:**
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Modify: `packages/cli/src/engine/auto-sync.ts`
- Modify: `packages/cli/src/runtime/*.ts`
- Modify or create: `packages/cli/src/runtime/daemon/*.ts`
- Modify or create: `packages/cli/src/runtime/scheduling/*.ts`
- Modify or create: `packages/cli/src/runtime/policies/*.ts`
- Modify or create: `packages/cli/src/application/query/*.ts`
- Modify or create: `packages/cli/src/application/review/*.ts`
- Modify or create: `packages/cli/src/application/carry-over/*.ts`
- Test: `packages/cli/__tests__/unit/auto-sync.test.ts`
- Test: `packages/cli/__tests__/unit/heartbeat-runtime.test.ts`
- Test: `packages/cli/__tests__/unit/runtime-review.test.ts`
- Test: `packages/cli/__tests__/unit/runtime-recall.test.ts`

- [ ] **Step 1: Add a failing runtime-boundary test**

Add assertions so:
- `runtime/**` only contains lifecycle/scheduling/policy code
- query/review/carry-over orchestration lives under `application/**`
- pure memory rules do not live under `runtime/**`

- [ ] **Step 2: Run the targeted runtime tests**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/auto-sync.test.ts __tests__/unit/heartbeat-runtime.test.ts __tests__/unit/runtime-review.test.ts __tests__/unit/runtime-recall.test.ts`
Expected: FAIL before migration.

- [ ] **Step 3: Move orchestration out of `runtime/` and `engine/`**

Apply the split:
- query/recall/review/carry-over flows -> `application/**`
- heartbeat/daemon/scheduling -> `runtime/**`
- rule logic -> `domain/**`

- [ ] **Step 4: Remove stale forwarding layers**

Delete or collapse any old files in `runtime/` or `engine/` that only exist as pre-migration shells but still attract new imports.

- [ ] **Step 5: Verify**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/auto-sync.test.ts __tests__/unit/heartbeat-runtime.test.ts __tests__/unit/runtime-review.test.ts __tests__/unit/runtime-recall.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/engine \
  packages/cli/src/runtime \
  packages/cli/src/application/query \
  packages/cli/src/application/review \
  packages/cli/src/application/carry-over \
  packages/cli/src/domain/memory \
  packages/cli/__tests__/unit/auto-sync.test.ts \
  packages/cli/__tests__/unit/heartbeat-runtime.test.ts \
  packages/cli/__tests__/unit/runtime-review.test.ts \
  packages/cli/__tests__/unit/runtime-recall.test.ts \
  packages/cli/__tests__/unit/cli-layering-freeze.test.ts
git commit -m "refactor: narrow runtime and engine responsibilities" -m "原因：runtime 只能回答何时执行与如何持续运行，产品动作编排必须回到 application 层。"
```

### Task 6: Dissolve Remaining Bucket Directories By Semantic Slice

**Files:**
- Modify or create: `packages/cli/src/domain/identity/**/*.ts`
- Modify or create: `packages/cli/src/infrastructure/platform/**/*.ts`
- Modify or create: `packages/cli/src/application/memory-ingest/**/*.ts`
- Modify or create: `packages/cli/src/infrastructure/output/**/*.ts`
- Modify or create: `packages/cli/src/domain/memory/**/*.ts`
- Modify or create: `packages/cli/src/cold-scan/**/*.ts`
- Modify or create: `packages/cli/src/raw-memory/**/*.ts`
- Modify or create: `packages/cli/src/update/**/*.ts`
- Test: `packages/cli/__tests__/unit/ingestor-types.test.ts`
- Test: `packages/cli/__tests__/unit/query-history.test.ts`
- Test: `packages/cli/__tests__/unit/update-checker.test.ts`
- Test: `packages/cli/__tests__/unit/cold-scan-extractors.test.ts`

- [ ] **Step 1: Inventory the remaining bucket directories**

Create a checklist in the task notes for:
- `service/`
- `models/`
- `type/`
- `identity/`
- `push/`
- `first-push/`
- `ingestors/`

Assign each file to its destination layer before moving code.

- [ ] **Step 2: Write the failing scan test**

Extend `packages/cli/__tests__/unit/cli-layering-freeze.test.ts` to assert the inventory either:
- is empty, or
- contains only compatibility shims explicitly listed in an allowlist

- [ ] **Step 3: Migrate one semantic slice at a time**

Suggested order:
1. `models/` and `type/`
2. `service/`
3. `identity/`
4. `push/` and `first-push/`
5. `ingestors/`

After each slice, remove the old logic-bearing file rather than stacking aliases indefinitely.

- [ ] **Step 4: Verify after each slice**

Run the smallest relevant test subset after every slice, then at the end run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/ingestor-types.test.ts __tests__/unit/query-history.test.ts __tests__/unit/update-checker.test.ts __tests__/unit/cold-scan-extractors.test.ts __tests__/unit/cli-layering-freeze.test.ts`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/service \
  packages/cli/src/models \
  packages/cli/src/type \
  packages/cli/src/identity \
  packages/cli/src/push \
  packages/cli/src/first-push \
  packages/cli/src/ingestors \
  packages/cli/src/domain \
  packages/cli/src/application \
  packages/cli/src/infrastructure \
  packages/cli/src/runtime \
  packages/cli/__tests__/unit/cli-layering-freeze.test.ts \
  packages/cli/__tests__/unit/ingestor-types.test.ts \
  packages/cli/__tests__/unit/query-history.test.ts \
  packages/cli/__tests__/unit/update-checker.test.ts \
  packages/cli/__tests__/unit/cold-scan-extractors.test.ts
git commit -m "refactor: dissolve remaining cli bucket directories" -m "原因：只有停止旧桶目录承载真实逻辑，CLI 包内分层收敛才算真正建立。"
```

### Task 7: Document Extraction Candidates For Phase 3

**Files:**
- Create: `docs/architecture/cli-extraction-candidates-2026-04.md`
- Modify: `packages/cli/__tests__/unit/module-boundaries.test.ts`

- [ ] **Step 1: Write a failing doc-consistency test**

Extend `packages/cli/__tests__/unit/module-boundaries.test.ts` so it expects an extraction-candidates document that names:
- storage
- memory core
- runtime
- host core / integrations

- [ ] **Step 2: Run the doc-consistency test**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`
Expected: FAIL because the extraction document does not exist yet.

- [ ] **Step 3: Write `docs/architecture/cli-extraction-candidates-2026-04.md`**

For each candidate, document:
- why it is not CLI-specific
- current source directories
- contract that must stabilize before extraction
- test surface required before split
- blockers that still keep it inside `packages/cli`

- [ ] **Step 4: Verify**

Run: `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/cli-extraction-candidates-2026-04.md \
  packages/cli/__tests__/unit/module-boundaries.test.ts
git commit -m "docs: capture cli extraction candidates" -m "原因：把中期拆包判断标准写实，避免 Phase 2 刚完成就立即开始无边界拆包。"
```

### Task 8: Final Verification And Cleanup

**Files:**
- Modify as needed: any touched files from Tasks 1-7

- [ ] **Step 1: Remove temporary compatibility shims that survived earlier tasks**

Search for:
- legacy re-exports
- TODO markers tied to completed migration batches
- imports still pointing at frozen directories without allowlist justification

- [ ] **Step 2: Run the full package verification**

Run:
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run test`
- `cd /Users/airbo/Developer/corivo/Corivo/packages/cli && npm run typecheck`
- `cd /Users/airbo/Developer/corivo/Corivo && npm run lint`

Expected: PASS

- [ ] **Step 3: Run a final structural spot-check**

Manually confirm:
- new code paths land only in target layers or `memory-pipeline`
- freeze directories contain no new feature logic
- `packages/cli` still exports the same user-facing CLI behavior

- [ ] **Step 4: Commit**

```bash
git add docs/architecture \
  packages/cli \
  eslint.config.js
git commit -m "refactor: finalize cli de-monolith layering baseline" -m "原因：在保持可运行的前提下完成分层契约、工程约束与首批语义迁移，为后续拆包创造稳定前提。"
```

## Handoff Notes

- If execution pressure is high, stop after Task 2. That gives the repo a real Phase 1 landing zone with docs plus enforcement.
- If runtime and storage migrations reveal hidden coupling, split Task 5 or Task 6 into smaller follow-up plans rather than forcing a giant refactor commit.
- Treat `memory-pipeline/`, `raw-memory/`, `cold-scan/`, and `update/` as controlled exceptions until the rest of the package stops growing through bucket directories.
