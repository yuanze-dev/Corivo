# Memory Recall Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining v0.11 gaps so Corivo runs a real raw-ingest -> markdown memory -> injected index -> recall/query loop on Claude Code and Codex.

**Architecture:** Keep raw session/message storage as the source of truth in SQLite, then drive both full and incremental memory generation from the same raw-session-first pipeline. Treat markdown memory as a projection layer with stable index/detail files, and move prompt-time recall to read from that projection plus raw transcript fallback instead of the legacy block-only path.

**Tech Stack:** TypeScript, Commander, better-sqlite3, shell hooks, markdown artifact store, Vitest

---

## File Map

- Modify: `packages/cli/src/storage/database.ts`
- Modify: `packages/cli/src/cli/commands/memory.ts`
- Modify: `packages/cli/src/cli/commands/query.ts`
- Modify: `packages/cli/src/runtime/recall.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/append-detail-records.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts`
- Modify: `packages/cli/src/memory-pipeline/contracts/memory-documents.ts`
- Modify: `packages/cli/src/memory-pipeline/markdown/memory-writer.ts`
- Create: `packages/cli/src/memory-pipeline/sources/raw-session-record-source.ts`
- Create: `packages/cli/src/runtime/memory-index.ts`
- Create: `packages/cli/src/runtime/raw-recall.ts`
- Modify: `packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh`
- Modify: `packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh`
- Modify: `packages/plugins/hosts/codex/templates/AGENTS.codex.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/rfc/v0.11/corivo-memory-recall-architecture.md`
- Modify: `docs/rfc/v0.11/corivo-memory-recall-milestone.md`
- Test: `packages/cli/__tests__/unit/memory-pipeline-*.test.ts`
- Test: `packages/cli/__tests__/unit/query-*.test.ts`
- Test: `packages/cli/__tests__/unit/runtime-*.test.ts`
- Test: `packages/cli/__tests__/unit/host-doctor.test.ts`

## Must Do First

### Task 1: Lock The Workspace Decision

**Files:**
- Modify: `docs/rfc/v0.11/corivo-memory-recall-architecture.md`
- Modify: `docs/rfc/v0.11/corivo-memory-recall-milestone.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/cli/src/storage/database.ts`

- [ ] **Step 1: Choose one workspace naming contract**

Pick one of these and use it everywhere in code/docs:
- `~/.corivo/` stays canonical, with `.Corivo/` dropped from RFC
- `~/.Corivo/` becomes canonical, with migration/back-compat logic added

- [ ] **Step 2: Write failing tests for path resolution if the code path changes**

Add or update tests around config dir / db path resolution so the chosen workspace root is explicit and stable.

- [ ] **Step 3: Implement the chosen path contract**

Update path helpers, memory root resolution, and docs to remove the current split-brain state.

- [ ] **Step 4: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/query-save-passwordless.test.ts __tests__/unit/runtime-support.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/storage/database.ts packages/cli/README.md docs/rfc/v0.11/corivo-memory-recall-architecture.md docs/rfc/v0.11/corivo-memory-recall-milestone.md
git commit -m "docs: align memory workspace contract"
```

### Task 2: Make Full And Incremental Pipelines Share One Raw-Session Model

**Files:**
- Modify: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Modify: `packages/cli/src/cli/commands/memory.ts`
- Create: `packages/cli/src/memory-pipeline/sources/raw-session-record-source.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-registry.test.ts`

- [ ] **Step 1: Write failing tests for full pipeline input source**

Assert that full/init pipeline reads normalized raw sessions instead of `claude-session`-only records.

- [ ] **Step 2: Introduce a raw-session record source**

Create a source that reads imported/realtime raw transcripts from `raw_sessions` + `raw_messages` and emits the same session work items expected by extraction stages.

- [ ] **Step 3: Rewire init pipeline**

Replace `CollectClaudeSessionsStage` dependency with a raw-session-first source so history import and realtime ingest feed the same downstream extraction path.

- [ ] **Step 4: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-runner.test.ts __tests__/unit/memory-pipeline-registry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts packages/cli/src/cli/commands/memory.ts packages/cli/src/memory-pipeline/sources/raw-session-record-source.ts packages/cli/__tests__/unit/memory-pipeline-runner.test.ts packages/cli/__tests__/unit/memory-pipeline-registry.test.ts
git commit -m "refactor: unify memory pipeline on raw sessions"
```

### Task 3: Turn Markdown Memory Into Real Detail And Index Files

**Files:**
- Modify: `packages/cli/src/memory-pipeline/stages/append-detail-records.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts`
- Modify: `packages/cli/src/memory-pipeline/contracts/memory-documents.ts`
- Modify: `packages/cli/src/memory-pipeline/markdown/memory-writer.ts`
- Modify: `packages/cli/src/memory-pipeline/artifacts/artifact-store.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-types.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`

- [ ] **Step 1: Write failing tests for markdown outputs**

Cover:
- detail markdown files created from raw/final batches
- stable `MEMORY.md` index generation
- incremental refresh preserving existing entries while updating touched ones

- [ ] **Step 2: Implement detail append**

`append-detail-records` should write durable markdown detail files, not `[]`.

- [ ] **Step 3: Implement index build/refresh**

`refresh-memory-index` and `rebuild-memory-index` should read detail files and emit real `MEMORY.md` projections, not status JSON blobs.

- [ ] **Step 4: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-types.test.ts __tests__/unit/memory-pipeline-runner.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/memory-pipeline/stages/append-detail-records.ts packages/cli/src/memory-pipeline/stages/refresh-memory-index.ts packages/cli/src/memory-pipeline/stages/rebuild-memory-index.ts packages/cli/src/memory-pipeline/contracts/memory-documents.ts packages/cli/src/memory-pipeline/markdown/memory-writer.ts packages/cli/src/memory-pipeline/artifacts/artifact-store.ts packages/cli/__tests__/unit/memory-pipeline-types.test.ts packages/cli/__tests__/unit/memory-pipeline-runner.test.ts
git commit -m "feat: generate markdown memory index and detail files"
```

### Task 4: Move Query And Recall To The New Memory Surface

**Files:**
- Modify: `packages/cli/src/cli/commands/query.ts`
- Modify: `packages/cli/src/runtime/recall.ts`
- Create: `packages/cli/src/runtime/memory-index.ts`
- Create: `packages/cli/src/runtime/raw-recall.ts`
- Test: `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`
- Test: `packages/cli/__tests__/unit/query-history.test.ts`
- Test: `packages/cli/__tests__/unit/runtime-recall.test.ts`

- [ ] **Step 1: Write failing tests for prompt query / recall**

Cover:
- prompt query prefers markdown memory index matches
- raw transcript fallback works when no index hit exists
- plain `query` can explicitly return summary vs raw transcript view

- [ ] **Step 2: Add a memory index reader**

Parse generated `MEMORY.md` and detail docs into a runtime lookup structure usable by hooks and CLI.

- [ ] **Step 3: Add raw transcript fallback**

Use raw session/message storage when the user needs exact prior wording or no markdown summary exists yet.

- [ ] **Step 4: Rewire `corivo query` and runtime recall**

Keep legacy block search only as a fallback path until fully removable.

- [ ] **Step 5: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/cli-runtime-commands.test.ts __tests__/unit/query-history.test.ts __tests__/unit/runtime-recall.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli/commands/query.ts packages/cli/src/runtime/recall.ts packages/cli/src/runtime/memory-index.ts packages/cli/src/runtime/raw-recall.ts packages/cli/__tests__/unit/cli-runtime-commands.test.ts packages/cli/__tests__/unit/query-history.test.ts packages/cli/__tests__/unit/runtime-recall.test.ts
git commit -m "feat: route recall and query through markdown memory"
```

### Task 5: Inject Memory Index In Host Hooks

**Files:**
- Modify: `packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh`
- Modify: `packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh`
- Modify: `packages/plugins/hosts/codex/templates/AGENTS.codex.md`
- Test: `packages/cli/__tests__/unit/codex-inject.test.ts`
- Test: `packages/cli/__tests__/unit/claude-hook-config.test.ts`

- [ ] **Step 1: Write failing tests for prompt hook output**

Assert host hooks inject memory index / recall context generated from the new query path rather than raw `db.searchBlocks` behavior.

- [ ] **Step 2: Simplify host hook scripts**

Remove special-case shell heuristics where they duplicate recall logic; keep hooks as thin bridges into CLI/runtime output.

- [ ] **Step 3: Update Codex instruction template**

Keep `carry-over` / `review`, but ensure “答前 query” reflects the actual supported CLI contract and expected attribution wording.

- [ ] **Step 4: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/codex-inject.test.ts __tests__/unit/claude-hook-config.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/hosts/codex/hooks/scripts/user-prompt-submit.sh packages/plugins/hosts/claude-code/hooks/scripts/prompt-recall.sh packages/plugins/hosts/codex/templates/AGENTS.codex.md packages/cli/__tests__/unit/codex-inject.test.ts packages/cli/__tests__/unit/claude-hook-config.test.ts
git commit -m "refactor: thin host recall hooks around memory index query"
```

## Can Do After The Core Loop Works

### Task 6: Tighten Host Install And Doctor Around The New Memory Loop

**Files:**
- Modify: `packages/cli/src/application/hosts/install-host.ts`
- Modify: `packages/cli/src/application/hosts/doctor-host.ts`
- Test: `packages/cli/__tests__/unit/install-host-use-case.test.ts`
- Test: `packages/cli/__tests__/unit/host-doctor.test.ts`

- [ ] **Step 1: Add failing tests for doctor coverage**

Doctor should verify:
- memory workspace exists
- generated memory index is readable
- hook entrypoints point to the current CLI surface

- [ ] **Step 2: Implement doctor/install adjustments**

Keep install single-entry, but surface actionable errors when the new memory runtime pieces are missing.

- [ ] **Step 3: Run focused tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-host-use-case.test.ts __tests__/unit/host-doctor.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/application/hosts/install-host.ts packages/cli/src/application/hosts/doctor-host.ts packages/cli/__tests__/unit/install-host-use-case.test.ts packages/cli/__tests__/unit/host-doctor.test.ts
git commit -m "fix: verify memory recall runtime in host install and doctor"
```

### Task 7: Update Docs And Acceptance Checklist

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `docs/rfc/v0.11/corivo-memory-recall-architecture.md`
- Modify: `docs/rfc/v0.11/corivo-memory-recall-milestone.md`
- Modify: `docs/rfc/v0.11/test-checklist.md`

- [ ] **Step 1: Update docs to match shipped behavior**

Remove speculative or stale wording once the implementation is done.

- [ ] **Step 2: Add an explicit acceptance checklist**

Checklist should prove:
- history import enters raw DB
- realtime hook enters raw DB
- incremental pipeline emits markdown detail/index
- host prompt hook injects recall context from the new path
- agent can query summary and raw transcript

- [ ] **Step 3: Sanity-read the docs**

Confirm no `.Corivo` / `.corivo`, old block recall / new markdown recall contradictions remain.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/README.md docs/rfc/v0.11/corivo-memory-recall-architecture.md docs/rfc/v0.11/corivo-memory-recall-milestone.md docs/rfc/v0.11/test-checklist.md
git commit -m "docs: finalize v0.11 memory recall acceptance criteria"
```

## Suggested Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7

## Exit Criteria

- `corivo host import <host>` persists raw sessions/messages and enqueues extraction work
- both full and incremental memory pipelines operate on the same raw-session-first model
- markdown detail files and `MEMORY.md` are real runtime artifacts, not placeholders
- prompt-time recall reads markdown memory first and raw transcripts second
- Codex and Claude Code hooks stay thin and inject runtime output without local semantic logic
- docs, CLI help, and host templates describe the same recall contract
