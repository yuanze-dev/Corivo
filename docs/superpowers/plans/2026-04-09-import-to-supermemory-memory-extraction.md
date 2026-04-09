# Import-To-Supermemory Memory Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change import-driven memory processing so Corivo extracts discrete useful memories from sessions and syncs them to Supermemory via stable `customId`s instead of treating session summaries as the remote write target.

**Architecture:** Keep `host import` and raw-session persistence unchanged. Extend the scheduled memory pipeline so transcript extraction yields discrete memory items, then add a provider-sync stage that reads final memory files, normalizes memory content into stable `customId`s, and upserts them through the configured memory provider. Supermemory remains the remote sync target while raw transcripts and local artifacts remain the source of truth and fallback layer.

**Tech Stack:** TypeScript, Vitest, existing memory pipeline artifact store, Supermemory SDK/provider abstraction

---

### Task 1: Teach the provider layer about stable remote IDs

**Files:**
- Modify: `packages/cli/src/domain/memory/providers/types.ts`
- Modify: `packages/cli/src/domain/memory/providers/supermemory-provider.ts`
- Test: `packages/cli/__tests__/unit/supermemory-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that calls `provider.save()` with `customId` and expects Supermemory `documents.add()` to receive it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- __tests__/unit/supermemory-provider.test.ts`
Expected: FAIL because `customId` is not forwarded.

- [ ] **Step 3: Write minimal implementation**

Add optional `customId` to provider save input and forward it in the Supermemory provider request body.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- __tests__/unit/supermemory-provider.test.ts`
Expected: PASS

### Task 2: Add a pipeline stage that syncs final memories to the active provider

**Files:**
- Create: `packages/cli/src/memory-pipeline/stages/sync-provider-memories.ts`
- Modify: `packages/cli/src/memory-pipeline/types.ts`
- Modify: `packages/cli/src/memory-pipeline/index.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for a stage that:
- reads final detail memory files
- extracts body text
- computes stable `customId`s from normalized content
- calls provider `save()` once per memory
- skips index files
- reports partial failure when some remote writes fail

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`
Expected: FAIL because the stage does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the stage with injected provider dependency and local normalization/hash helper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`
Expected: PASS

### Task 3: Wire the scheduled pipeline to include provider sync when configured

**Files:**
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/src/application/memory/config.ts`
- Modify: `packages/cli/src/application/memory/run-memory-pipeline.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Test: `packages/cli/__tests__/integration/memory-command.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that:
- scheduled pipeline includes the sync stage when the configured memory engine is `supermemory`
- scheduled pipeline omits the sync stage for local provider
- memory command still runs successfully with the new stage order

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`
Expected: FAIL because pipeline building does not know about memory provider configuration.

- [ ] **Step 3: Write minimal implementation**

Extend memory pipeline config loading to return parsed memory engine config, resolve the provider once in pipeline runtime wiring, and inject it into the scheduled pipeline.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts`
Expected: PASS

### Task 4: Reframe transcript extraction around useful memory items instead of summaries

**Files:**
- Modify: `packages/cli/src/memory-pipeline/prompts/raw-extraction-prompt.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/summarize-block-batch.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that verify transcript-derived artifacts are treated as extracted memory items and that prompt wording now asks for useful discrete memories instead of generic summaries.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`
Expected: FAIL because prompt/stage wording still assumes summary output semantics.

- [ ] **Step 3: Write minimal implementation**

Update prompt text and artifact payload naming so the pipeline reflects memory extraction semantics while preserving current parser compatibility.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`
Expected: PASS

### Task 5: Run focused verification on the end-to-end path

**Files:**
- Test: `packages/cli/__tests__/unit/supermemory-provider.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Test: `packages/cli/__tests__/integration/memory-command.test.ts`
- Test: `packages/cli/__tests__/unit/host-import-use-case.test.ts`

- [ ] **Step 1: Run the focused suite**

Run:
```bash
npm run test -- __tests__/unit/supermemory-provider.test.ts __tests__/unit/memory-pipeline-stages.test.ts __tests__/integration/memory-command.test.ts __tests__/unit/host-import-use-case.test.ts
```

Expected: PASS

- [ ] **Step 2: Check for regressions in the import path**

Confirm `host import` still persists raw sessions/messages and only the pipeline handles remote sync.

- [ ] **Step 3: Summarize the final behavior**

Record which stages run, whether sync is conditional on provider config, and what remains local-only.
