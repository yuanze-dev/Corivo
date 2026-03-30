# Corivo Multi-Host Active Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Claude-Code-style active memory behavior to Codex, OpenCode, and Cursor using the existing Corivo carry-over / recall / review runtime.

**Architecture:** Keep Corivo runtime centralized in `packages/cli/src/runtime`, and add host-specific adapters for Codex, OpenCode, and Cursor. Cursor will reuse the hook model, OpenCode will use the plugin/event-transform model, and Codex will use instruction + notify integration for functional parity.

**Tech Stack:** TypeScript, Commander, shell adapters, OpenCode plugin API, host config/templates, Vitest.

---

### Task 1: Add shared host-adapter contract and fixtures

**Files:**
- Create: `packages/cli/src/runtime/host-adapter.ts`
- Create: `packages/cli/__tests__/unit/host-adapter.test.ts`
- Modify: `packages/cli/src/runtime/types.ts`

- [ ] **Step 1: Write the failing test**

Add tests that define:
- host capability types (`full-hook`, `plugin-transform`, `instruction-driven`)
- a normalized adapter output contract for session-start / prompt-submit / response-done
- a helper for selecting `hook-text` vs `text` output by host

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/host-adapter.test.ts`

Expected: FAIL because the host adapter contract does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- host capability enums/interfaces
- adapter payload helpers
- any small type exports needed by later host adapters

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/host-adapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/runtime/host-adapter.ts packages/cli/src/runtime/types.ts packages/cli/__tests__/unit/host-adapter.test.ts
git commit -m "feat: add multi-host adapter contract"
```

### Task 2: Implement Cursor adapter

**Files:**
- Create: `packages/plugins/cursor/package.json`
- Create: `packages/plugins/cursor/README.md`
- Create: `packages/plugins/cursor/hooks/hooks.json`
- Create: `packages/plugins/cursor/hooks/scripts/session-carry-over.sh`
- Create: `packages/plugins/cursor/hooks/scripts/prompt-recall.sh`
- Create: `packages/plugins/cursor/hooks/scripts/stop-review.sh`
- Create: `packages/cli/__tests__/unit/cursor-hook-config.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- Cursor hook config includes `SessionStart`, `UserPromptSubmit`, `Stop`
- prompt hook uses `corivo recall --format hook-text`
- stop hook uses `corivo review --format hook-text`

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/cursor-hook-config.test.ts`

Expected: FAIL because the Cursor adapter files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a Cursor adapter mirroring the Claude Code hook pattern.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/cursor-hook-config.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/cursor packages/cli/__tests__/unit/cursor-hook-config.test.ts
git commit -m "feat: add cursor active memory hooks"
```

### Task 3: Implement OpenCode plugin adapter

**Files:**
- Modify: `packages/plugins/openclaw/package.json` (if naming/docs overlap must stay correct)
- Create: `packages/plugins/opencode/package.json`
- Create: `packages/plugins/opencode/tsconfig.json`
- Create: `packages/plugins/opencode/src/index.ts`
- Create: `packages/plugins/opencode/src/adapter.ts`
- Create: `packages/plugins/opencode/README.md`
- Create: `packages/cli/__tests__/unit/opencode-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- `chat.message` user prompts trigger recall path
- `experimental.chat.system.transform` can inject hook-text context
- session events trigger carry-over path
- assistant message completion triggers review path

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/opencode-adapter.test.ts`

Expected: FAIL because the OpenCode adapter package does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- OpenCode plugin module
- event mapping to carry-over / recall / review
- message transform injection path

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/opencode-adapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode packages/cli/__tests__/unit/opencode-adapter.test.ts
git commit -m "feat: add opencode active memory adapter"
```

### Task 4: Implement Codex functional-parity adapter

**Files:**
- Modify: `packages/plugins/codex/README.md`
- Create: `packages/plugins/codex/templates/AGENTS.codex.md`
- Create: `packages/plugins/codex/adapters/notify-review.sh`
- Create: `packages/cli/src/inject/codex-rules.ts`
- Modify: `packages/cli/src/cli/commands/inject.ts`
- Create: `packages/cli/__tests__/unit/codex-inject.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- Codex template instructs carry-over and prompt-time recall behavior
- adopted memories require explicit “根据 Corivo 的记忆” attribution
- notify adapter maps post-response into review
- inject command can write/update Codex global rules/template

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/codex-inject.test.ts`

Expected: FAIL because the Codex adapter and injection path do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- Codex AGENTS template
- notify-review adapter
- inject support for Codex host configuration

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/codex-inject.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/codex/templates/AGENTS.codex.md packages/plugins/codex/adapters/notify-review.sh packages/plugins/codex/README.md packages/cli/src/inject/codex-rules.ts packages/cli/src/cli/commands/inject.ts packages/cli/__tests__/unit/codex-inject.test.ts
git commit -m "feat: add codex active memory integration"
```

### Task 5: Docs and cross-host verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Create: `docs/rfc/v0.11/corivo-multi-host-runtime.md`
- Create: `packages/cli/__tests__/unit/multi-host-matrix.test.ts`

- [ ] **Step 1: Write the failing test**

Add a small matrix-style test asserting host capability coverage and expected integration mode for:
- Claude Code
- Cursor
- OpenCode
- Codex

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run packages/cli/__tests__/unit/multi-host-matrix.test.ts`

Expected: FAIL because the matrix and docs references are missing.

- [ ] **Step 3: Write minimal implementation**

Update docs to explain:
- full-hook hosts
- plugin-transform hosts
- instruction-driven hosts

- [ ] **Step 4: Run focused verification**

Run:
- `./node_modules/.bin/vitest run packages/cli/__tests__/unit/host-adapter.test.ts packages/cli/__tests__/unit/cursor-hook-config.test.ts packages/cli/__tests__/unit/opencode-adapter.test.ts packages/cli/__tests__/unit/codex-inject.test.ts packages/cli/__tests__/unit/multi-host-matrix.test.ts`
- `pnpm --dir packages/cli run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md docs/rfc/v0.11/corivo-multi-host-runtime.md packages/cli/__tests__/unit/multi-host-matrix.test.ts
git commit -m "docs: describe multi-host active memory runtime"
```
