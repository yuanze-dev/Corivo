# Corivo Push / Recall Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current suggest-only lifecycle with explicit `carry-over`, `recall`, and `review` runtime flows, and wire Claude Code hooks to them.

**Architecture:** The refactor keeps lifecycle triggering in Claude Code hooks, moves trigger/retrieval/response decisions into CLI/runtime code, and standardizes responses as structured payloads rendered by shell adapters. Existing `suggest` remains as a compatibility wrapper while the new flow becomes the primary runtime path.

**Tech Stack:** TypeScript, Commander, better-sqlite3, shell hooks, Node test runner / Vitest depending on existing file patterns.

---

### Task 1: Define shared runtime payloads and query inputs

**Files:**
- Create: `packages/cli/src/runtime/types.ts`
- Create: `packages/cli/src/runtime/query-pack.ts`
- Modify: `packages/cli/src/models/index.ts`
- Test: `packages/cli/__tests__/unit/runtime-types.test.ts`

- [ ] **Step 1: Write the failing tests**

Write tests for:
- normalized `QueryPack` creation from prompt / assistant message input
- payload serialization for `carry_over`, `recall`, `challenge`, `uncertain`, `review`
- confidence validation and empty evidence handling

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/cli && npx vitest run __tests__/unit/runtime-types.test.ts`

Expected: FAIL because the runtime types and helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- runtime payload type definitions
- helper to build a `QueryPack`
- helper to normalize repeated input fields into a stable structure

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/cli && npx vitest run __tests__/unit/runtime-types.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/runtime/types.ts packages/cli/src/runtime/query-pack.ts packages/cli/src/models/index.ts packages/cli/__tests__/unit/runtime-types.test.ts
git commit -m "feat: add corivo runtime payload contracts"
```

### Task 2: Implement the retrieval and scoring engines

**Files:**
- Create: `packages/cli/src/runtime/retrieval.ts`
- Create: `packages/cli/src/runtime/scoring.ts`
- Create: `packages/cli/src/runtime/carry-over.ts`
- Create: `packages/cli/src/runtime/recall.ts`
- Create: `packages/cli/src/runtime/review.ts`
- Modify: `packages/cli/src/storage/database.ts`
- Test: `packages/cli/__tests__/unit/runtime-recall.test.ts`
- Test: `packages/cli/__tests__/unit/runtime-review.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- anchored recall prefers direct and structural matches over unrelated active blocks
- low-confidence but plausible matches become `uncertain`
- conflict/supersedes paths become `challenge`
- carry-over only returns unfinished or recently shifted memory
- review only emits post-answer follow-up when anchored tension exists

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cli && npx vitest run __tests__/unit/runtime-recall.test.ts __tests__/unit/runtime-review.test.ts`

Expected: FAIL because the engines do not exist and database helpers are insufficient.

- [ ] **Step 3: Write minimal implementation**

Implement:
- candidate collection across direct / structural / tension lanes
- scoring and ranking
- mode selection (`carry_over`, `recall`, `challenge`, `uncertain`, `review`)
- small database helpers only if required by tests

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cli && npx vitest run __tests__/unit/runtime-recall.test.ts __tests__/unit/runtime-review.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/runtime packages/cli/src/storage/database.ts packages/cli/__tests__/unit/runtime-recall.test.ts packages/cli/__tests__/unit/runtime-review.test.ts
git commit -m "feat: add corivo recall and review engines"
```

### Task 3: Add CLI commands and compatibility shim

**Files:**
- Create: `packages/cli/src/cli/commands/carry-over.ts`
- Create: `packages/cli/src/cli/commands/recall.ts`
- Create: `packages/cli/src/cli/commands/review.ts`
- Modify: `packages/cli/src/cli/commands/suggest.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Test: `packages/cli/__tests__/unit/cli-runtime-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- `carry-over` returns a structured payload or empty output
- `recall` accepts prompt input and returns formatted output
- `review` accepts last-message input and returns formatted output
- `suggest` compatibility mode delegates to the new runtime path

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cli && npx vitest run __tests__/unit/cli-runtime-commands.test.ts`

Expected: FAIL because the new CLI commands are not registered yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- command wrappers that load config + DB like existing internal commands
- text/json output formatting
- a compatibility layer in `suggest.ts`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cli && npx vitest run __tests__/unit/cli-runtime-commands.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/commands/carry-over.ts packages/cli/src/cli/commands/recall.ts packages/cli/src/cli/commands/review.ts packages/cli/src/cli/commands/suggest.ts packages/cli/src/cli/index.ts packages/cli/__tests__/unit/cli-runtime-commands.test.ts
git commit -m "feat: expose carry-over recall and review commands"
```

### Task 4: Rewire Claude Code shell adapters

**Files:**
- Modify: `packages/plugins/claude-code/hooks/hooks.json`
- Modify: `packages/plugins/claude-code/hooks/scripts/session-init.sh`
- Modify: `packages/plugins/claude-code/hooks/scripts/ingest-turn.sh`
- Modify: `packages/plugins/claude-code/hooks/scripts/stop-suggest.sh`
- Test: `packages/cli/__tests__/integration/claude-code-ingestor.test.ts`
- Test: `packages/plugins/claude-code/README.md`
- Test: `packages/plugins/claude-code/CLAUDE.md`

- [ ] **Step 1: Write the failing tests**

Cover:
- session start calls `carry-over`
- user prompt submit preserves ingestion and also requests `recall`
- stop hook preserves ingestion and calls `review`
- shell adapters tolerate empty payloads and missing CLI gracefully

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cli && npx vitest run __tests__/integration/claude-code-ingestor.test.ts`

Expected: FAIL because the scripts still call the old flow.

- [ ] **Step 3: Write minimal implementation**

Implement:
- script split between ingestion and runtime surfacing
- JSON `additionalContext` output on the appropriate hooks
- keep shell scripts thin, with runtime logic in CLI only

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cli && npx vitest run __tests__/integration/claude-code-ingestor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/claude-code/hooks/hooks.json packages/plugins/claude-code/hooks/scripts/session-init.sh packages/plugins/claude-code/hooks/scripts/ingest-turn.sh packages/plugins/claude-code/hooks/scripts/stop-suggest.sh packages/cli/__tests__/integration/claude-code-ingestor.test.ts packages/plugins/claude-code/README.md packages/plugins/claude-code/CLAUDE.md
git commit -m "feat: wire claude hooks to corivo runtime commands"
```

### Task 5: Final verification and cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-03-29-corivo-push-recall-redesign.md`
- Modify: `docs/superpowers/plans/2026-03-29-corivo-push-recall-redesign.md`

- [ ] **Step 1: Run focused verification**

Run:
- `cd packages/cli && npx vitest run __tests__/unit/runtime-types.test.ts __tests__/unit/runtime-recall.test.ts __tests__/unit/runtime-review.test.ts __tests__/unit/cli-runtime-commands.test.ts __tests__/integration/claude-code-ingestor.test.ts`

Expected: PASS

- [ ] **Step 2: Run broader package verification**

Run:
- `cd packages/cli && npm run build`
- `cd /tmp/corivo-recall-refactor-1 && npm run lint`

Expected: PASS or clearly scoped failures that are investigated before claiming completion.

- [ ] **Step 3: Update docs if behavior drifted during implementation**

Reflect the final hook flow and command surfaces in the spec/plan if needed.

- [ ] **Step 4: Prepare for final review**

Gather:
- final diff summary
- commands run
- any remaining limitations

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-03-29-corivo-push-recall-redesign.md docs/superpowers/plans/2026-03-29-corivo-push-recall-redesign.md
git commit -m "docs: finalize corivo push recall redesign notes"
```
