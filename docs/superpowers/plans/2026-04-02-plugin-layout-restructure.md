# Plugin Layout Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `packages/plugins` from `hosts/*` and `runtime/*` into plugin-named directories while keeping installer behavior, package publishing, docs, and tests aligned.

**Architecture:** The migration is a repository topology change, not a runtime redesign. Physical directories move to `packages/plugins/<plugin>`, CLI asset resolution switches to plugin-root paths, docs stop describing `hosts/runtime` as the top-level model, and tests become guardrails for the new topology.

**Tech Stack:** TypeScript, Node.js, pnpm workspace, Vitest, Markdown docs

---

### Task 1: Inventory Old Path Usage

**Files:**
- Modify: `docs/superpowers/plans/2026-04-02-plugin-layout-restructure.md`
- Verify: repository-wide search results for `packages/plugins/hosts` and `packages/plugins/runtime`

- [ ] **Step 1: Search for old plugin layout references**

Run: `rg -n "packages/plugins/(hosts|runtime)" .`
Expected: a list of docs, tests, and source files that depend on the old topology

- [ ] **Step 2: Group findings by concern**

Record buckets:
- source path resolution
- tests
- docs
- workspace / package metadata

- [ ] **Step 3: Mark any unexpected hard-coded path owners**

Expected: every path dependency has an owner file before edits begin

- [ ] **Step 4: Commit the inventory checkpoint**

```bash
git add docs/superpowers/plans/2026-04-02-plugin-layout-restructure.md
git commit -m "docs: inventory plugin layout migration surface" -m "原因：先锁定 packages/plugins 旧路径依赖面，避免目录迁移时遗漏 installer、测试或文档引用。"
```

### Task 2: Move Plugin Directories To Top-Level Plugin Roots

**Files:**
- Create: `packages/plugins/README.md`
- Move: `packages/plugins/hosts/codex` -> `packages/plugins/codex`
- Move: `packages/plugins/hosts/claude-code` -> `packages/plugins/claude-code`
- Move: `packages/plugins/hosts/cursor` -> `packages/plugins/cursor`
- Merge: `packages/plugins/runtime/opencode` + `packages/plugins/hosts/opencode` -> `packages/plugins/opencode`
- Move: `packages/plugins/runtime/openclaw` -> `packages/plugins/openclaw`
- Delete: `packages/plugins/hosts/README.md`
- Delete: `packages/plugins/runtime/README.md`

- [ ] **Step 1: Create the new top-level plugin index doc**

Write `packages/plugins/README.md` describing the plugin-named layout and per-plugin responsibility boundaries.

- [ ] **Step 2: Move host-only plugin packages**

Move `codex`, `claude-code`, and `cursor` into `packages/plugins/<plugin>`.

- [ ] **Step 3: Move runtime-only plugin packages**

Move `openclaw` into `packages/plugins/openclaw`.

- [ ] **Step 4: Consolidate OpenCode into one plugin directory**

Move runtime package files into `packages/plugins/opencode` and fold the reserved host-boundary README content into the plugin README.

- [ ] **Step 5: Remove obsolete index docs and empty parent directories**

Expected: no remaining workflow depends on `packages/plugins/hosts` or `packages/plugins/runtime`.

- [ ] **Step 6: Commit the directory topology change**

```bash
git add packages/plugins
git commit -m "refactor: reorganize plugins by plugin name" -m "原因：将 packages/plugins 从 hosts/runtime 横切目录改为按插件名组织，降低认知成本并统一插件入口。"
```

### Task 3: Update CLI Asset Resolution And Package Path Logic

**Files:**
- Modify: `packages/cli/src/inject/host-assets.js`
- Modify: any source file found in Task 1 that resolves `packages/plugins/hosts/*` or `packages/plugins/runtime/*`
- Test: `packages/cli/__tests__/unit/host-assets.test.ts`

- [ ] **Step 1: Write or update failing tests for new plugin-root asset resolution**

Add assertions that host assets resolve from `packages/plugins/<host>`.

- [ ] **Step 2: Run the focused host asset test**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-assets.test.ts`
Expected: FAIL on old path assumptions

- [ ] **Step 3: Update runtime/source path helpers**

Implement the minimal changes required for source resolution to use plugin-root directories.

- [ ] **Step 4: Re-run the focused host asset test**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit asset path resolution changes**

```bash
git add packages/cli/src/inject/host-assets.js packages/cli/__tests__/unit/host-assets.test.ts
git commit -m "refactor: resolve plugin assets from plugin-root layout" -m "原因：让 CLI installer 与 host asset loader 适配按插件名组织的新目录结构。"
```

### Task 4: Rewrite Layout Guardrail Tests For The New Topology

**Files:**
- Modify: `packages/cli/__tests__/unit/plugin-layout.test.ts`
- Modify: `packages/cli/__tests__/unit/host-boundary-docs.test.ts`
- Modify: any other test files found in Task 1 with old path assumptions

- [ ] **Step 1: Rewrite layout tests to assert top-level plugin directories**

New assertions should require:
- `packages/plugins/codex`
- `packages/plugins/claude-code`
- `packages/plugins/cursor`
- `packages/plugins/opencode`
- `packages/plugins/openclaw`

- [ ] **Step 2: Rewrite docs tests to assert the new documentation model**

Old assertions against `hosts/*` and `runtime/*` should be replaced with plugin-root wording checks.

- [ ] **Step 3: Run focused topology tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/plugin-layout.test.ts __tests__/unit/host-boundary-docs.test.ts`
Expected: PASS

- [ ] **Step 4: Commit the guardrail test rewrite**

```bash
git add packages/cli/__tests__/unit/plugin-layout.test.ts packages/cli/__tests__/unit/host-boundary-docs.test.ts
git commit -m "test: align plugin topology guardrails with plugin-root layout" -m "原因：用测试锁定新的 packages/plugins 目录模型，防止回归到 hosts/runtime 横切结构。"
```

### Task 5: Update Root Docs And Plugin READMEs

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/rfc/host-integration-asset-boundaries.md`
- Modify: `packages/plugins/codex/README.md`
- Modify: `packages/plugins/claude-code/README.md`
- Modify: `packages/plugins/cursor/README.md`
- Modify: `packages/plugins/opencode/README.md`
- Modify: `packages/plugins/openclaw/README.md`

- [ ] **Step 1: Rewrite top-level docs to describe the plugin-root directory model**

Remove wording that treats `hosts/*` and `runtime/*` as the primary structure.

- [ ] **Step 2: Update plugin READMEs to describe internal responsibilities**

Each plugin README should explain whether the plugin currently contains host-facing assets, runtime code, or both.

- [ ] **Step 3: Update the RFC**

Turn the RFC from “split tree accepted baseline” into a migration record for the plugin-root model.

- [ ] **Step 4: Run focused docs consistency tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-boundary-docs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit documentation updates**

```bash
git add README.md AGENTS.md docs/rfc/host-integration-asset-boundaries.md packages/plugins
git commit -m "docs: describe plugin-root layout and internal boundaries" -m "原因：让仓库文档、插件 README 与新的目录结构保持一致，避免继续暴露 hosts/runtime 旧模型。"
```

### Task 6: Align Workspace Metadata And Lockfile Paths

**Files:**
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Modify: any workspace metadata files found in Task 1

- [ ] **Step 1: Check workspace metadata for old importer paths**

Run: `rg -n "packages/plugins/(hosts|runtime)" pnpm-lock.yaml tsconfig.json package.json pnpm-workspace.yaml`
Expected: all remaining references are intentional and queued for update

- [ ] **Step 2: Update metadata to new plugin-root paths**

Expected: lockfile importers and references use `packages/plugins/<plugin>`

- [ ] **Step 3: Run focused layout test**

Run: `cd packages/cli && npm run test -- __tests__/unit/plugin-layout.test.ts`
Expected: PASS

- [ ] **Step 4: Commit metadata alignment**

```bash
git add pnpm-lock.yaml tsconfig.json package.json pnpm-workspace.yaml packages/cli/__tests__/unit/plugin-layout.test.ts
git commit -m "chore: align workspace metadata with plugin-root layout" -m "原因：更新 lockfile、project references 与拓扑测试，确保工作区元数据跟随新目录结构。"
```

### Task 7: Run Targeted Verification And Sweep Remaining Old Paths

**Files:**
- Verify: whole repo references and focused test set

- [ ] **Step 1: Sweep for stale old-layout references**

Run: `rg -n "packages/plugins/(hosts|runtime)" .`
Expected: no stale references, or only intentionally historical docs with explicit context

- [ ] **Step 2: Run the focused verification suite**

Run: `cd packages/cli && npm run test -- __tests__/unit/host-assets.test.ts __tests__/unit/plugin-layout.test.ts __tests__/unit/host-boundary-docs.test.ts`
Expected: PASS

- [ ] **Step 3: Run any additional focused tests touched by path changes**

Run the smallest set needed from Task 1 discoveries.

- [ ] **Step 4: Commit the verification sweep**

```bash
git add -A
git commit -m "test: verify plugin-root layout migration" -m "原因：在迁移收尾阶段清理残留旧路径并补做聚焦验证，确保目录重组可稳定落地。"
```
