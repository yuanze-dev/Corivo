# Remove Inject Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy `corivo inject` command and the `project-claude` compatibility path so the CLI exposes only explicit host-management commands.

**Architecture:** Collapse CLI installation flows onto `corivo host ...` only. Delete the `inject` compatibility command, remove `project-claude` from the host registry and validation surfaces, and update installer/docs/tests to reference only `host install <host>`.

**Tech Stack:** TypeScript, Commander, Vitest, shell installer docs/tests

---

### Task 1: Record the new CLI contract in tests

**Files:**
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
- Modify: `packages/cli/__tests__/unit/host-boundary-docs.test.ts`
- Modify: `packages/cli/__tests__/unit/host-registry.test.ts`
- Modify: `packages/cli/__tests__/unit/host-registry.contract.test.ts`
- Modify: `packages/cli/__tests__/unit/ingest-message-command.test.ts`
- Delete: `packages/cli/__tests__/unit/inject-command.test.ts`
- Delete: `packages/cli/__tests__/unit/project-claude-install.test.ts`

- [ ] **Step 1: Write failing assertions for the new CLI surface**

Add or adjust expectations so tests require:
- no `inject` command references in installer/docs assertions
- no `project-claude` host id in registry assertions
- no `project-claude` value accepted by ingest-message validation

- [ ] **Step 2: Run the focused unit tests to verify they fail**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/host-boundary-docs.test.ts __tests__/unit/host-registry.test.ts __tests__/unit/host-registry.contract.test.ts __tests__/unit/ingest-message-command.test.ts`

Expected: failing assertions mentioning `inject` or `project-claude`

- [ ] **Step 3: Remove obsolete inject/project-claude-only tests**

Delete the tests that only verify legacy compatibility behavior.

- [ ] **Step 4: Keep test coverage focused on surviving behavior**

Update existing tests so they cover:
- host registry with `claude-code`, `codex`, `cursor`, `opencode`
- installer using `corivo host install <host>`
- docs boundary text with host-based installation

- [ ] **Step 5: Re-run the focused unit tests**

Run the same focused command and confirm remaining failures are due to production code still exposing the removed contract.

### Task 2: Remove inject and project-claude from the CLI/runtime surface

**Files:**
- Modify: `packages/cli/src/cli/index.ts`
- Modify: `packages/cli/src/cli/commands/ingest-message.ts`
- Modify: `packages/cli/src/hosts/types.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Modify: `packages/cli/src/hosts/index.ts`
- Delete: `packages/cli/src/cli/commands/inject.ts`
- Delete: `packages/cli/src/hosts/adapters/project-claude.ts`
- Modify or delete: `packages/cli/src/inject/claude-rules.ts`

- [ ] **Step 1: Remove the legacy CLI command registration**

Delete the `inject` import and Commander registration from `packages/cli/src/cli/index.ts`.

- [ ] **Step 2: Remove `project-claude` from host typing and registry**

Delete the adapter and `HostId` entry, then update registry exports/imports accordingly.

- [ ] **Step 3: Remove validation paths that still mention `project-claude`**

Update ingest-message validation and any other user-facing enum checks to reject `project-claude`.

- [ ] **Step 4: Remove dead helper paths**

Delete `installProjectClaudeHost`-only glue if no surviving code references it. Keep only helper functions still used by real hosts.

- [ ] **Step 5: Run the focused unit tests again**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/host-boundary-docs.test.ts __tests__/unit/host-registry.test.ts __tests__/unit/host-registry.contract.test.ts __tests__/unit/ingest-message-command.test.ts`

Expected: passing or reduced to installer/docs mismatches only

### Task 3: Switch installer and docs to host-only commands

**Files:**
- Modify: `scripts/install.sh`
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/plugins/hosts/README.md`
- Modify: `packages/plugins/hosts/claude-code/README.md`
- Modify: `packages/plugins/hosts/codex/README.md`
- Modify: `packages/plugins/hosts/cursor/README.md`
- Modify: `packages/plugins/hosts/opencode/README.md`
- Modify: `packages/plugins/runtime/opencode/README.md`

- [ ] **Step 1: Update installer shell commands**

Replace every `corivo inject --global --<host>` call and related messaging with `corivo host install <host>`.

- [ ] **Step 2: Remove compatibility wording from docs**

Rewrite docs to present `host` as the only installation surface and delete references to `inject` aliases.

- [ ] **Step 3: Update Claude-specific guidance**

Keep only `corivo host install claude-code`; remove project/global `CLAUDE.md` injection guidance.

- [ ] **Step 4: Run installer/docs tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/host-boundary-docs.test.ts`

Expected: PASS

### Task 4: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run host-related unit and integration coverage**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-registry.test.ts __tests__/unit/host-registry.contract.test.ts __tests__/unit/host-doctor.test.ts __tests__/unit/install-entrypoint.test.ts __tests__/unit/host-boundary-docs.test.ts __tests__/unit/ingest-message-command.test.ts`

- [ ] **Step 2: Run the full CLI package test suite**

Run: `cd packages/cli && npm run test`

- [ ] **Step 3: Check for stray legacy references**

Run: `rg -n "\\binject\\b|project-claude" README.md packages scripts`

Expected: no matches for the removed CLI command or host id, aside from intentionally retained internal helper comments if any

- [ ] **Step 4: Commit in logical chunks**

Suggested commits:
- `refactor: remove inject command and project claude host`
- `refactor: switch installer to host install commands`
- `docs: remove inject compatibility references`
