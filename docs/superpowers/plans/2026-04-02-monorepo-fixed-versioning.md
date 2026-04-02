# Corivo Monorepo Fixed Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Corivo monorepo to a single fixed version line so the root package and every workspace package always share the same version.

**Architecture:** Use `@changesets/cli` as the release orchestrator and configure one fixed package group covering the root package and all workspace packages. Keep workspace development links with `workspace:*`, and let Changesets own version bumps, release notes, and publish-time package version alignment.

**Tech Stack:** `pnpm` workspaces, `@changesets/cli`, Node.js ESM, existing workspace `package.json` files

---

## File Structure

- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Create: `.changeset/.gitignore`
- Modify: `package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/solver/package.json`
- Modify: `packages/plugins/hosts/codex/package.json`
- Modify: `packages/plugins/hosts/claude-code/package.json`
- Modify: `packages/plugins/hosts/cursor/package.json`
- Modify: `packages/plugins/runtime/opencode/package.json`
- Modify: `packages/plugins/runtime/openclaw/package.json`
- Modify: `README.md`
- Optional Modify: `CHANGELOG.md`

The release boundary stays at the repo root. Individual packages keep their current responsibilities; only version ownership and release flow move to a shared root-level system.

### Task 1: Add Changesets as the Release Controller

**Files:**
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Create: `.changeset/.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Write the failing configuration expectation**

Document the intended configuration in the plan before implementation:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    [
      "@corivo/mono",
      "corivo",
      "@corivo/shared",
      "@corivo/solver",
      "@corivo-ai/codex",
      "@corivo-ai/claude-code",
      "@corivo-ai/cursor",
      "@corivo-ai/opencode",
      "@corivo-ai/openclaw"
    ]
  ],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 2: Verify the repo does not already have Changesets**

Run: `test ! -d .changeset && echo "missing"`
Expected: `missing`

- [ ] **Step 3: Add the minimal release tooling**

Update root `package.json`:

```json
{
  "devDependencies": {
    "@changesets/cli": "^2.29.0"
  },
  "scripts": {
    "changeset": "changeset",
    "release:check": "changeset status --verbose",
    "release:version": "changeset version",
    "release:publish": "changeset publish"
  }
}
```

Create `.changeset/config.json` with the fixed group shown above.

Create `.changeset/README.md` with a short repo-specific note:

```md
# Changesets

This repo uses a single fixed version group. Any release bump applies to the root package and every workspace package together.
```

Create `.changeset/.gitignore`:

```gitignore
.tmp
```

- [ ] **Step 4: Install dependencies and verify the CLI is available**

Run: `pnpm install`
Expected: lockfile updates and `@changesets/cli` added

Run: `pnpm changeset --version`
Expected: prints the installed Changesets version

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .changeset
git commit -m "feat: add fixed-version release tooling"
```

### Task 2: Align All Workspace Package Versions to One Baseline

**Files:**
- Modify: `package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/solver/package.json`
- Modify: `packages/plugins/hosts/codex/package.json`
- Modify: `packages/plugins/hosts/claude-code/package.json`
- Modify: `packages/plugins/hosts/cursor/package.json`
- Modify: `packages/plugins/runtime/opencode/package.json`
- Modify: `packages/plugins/runtime/openclaw/package.json`

- [ ] **Step 1: Write the failing version-audit command**

Use the repo to show the mismatch before changing anything:

Run:

```bash
node -e "const fs=require('fs'); const paths=['package.json','packages/cli/package.json','packages/shared/package.json','packages/solver/package.json','packages/plugins/hosts/codex/package.json','packages/plugins/hosts/claude-code/package.json','packages/plugins/hosts/cursor/package.json','packages/plugins/runtime/opencode/package.json','packages/plugins/runtime/openclaw/package.json']; const versions=[...new Set(paths.map((p)=>JSON.parse(fs.readFileSync(p,'utf8')).version))]; if(versions.length===1){console.log('aligned')} else {console.log('mismatch:'+versions.join(',')); process.exit(1)}"
```

Expected: fail with multiple versions, currently including `0.10.26`, `0.12.6`, `0.11.0`, and `0.1.0`

- [ ] **Step 2: Pick the baseline version**

Use the highest current public line as the initial fixed baseline unless product wants a deliberate reset. For the current repo state, the pragmatic baseline is `0.12.6`.

- [ ] **Step 3: Update every package version to the baseline**

Set `version` to the chosen baseline in:

- `package.json`
- `packages/cli/package.json`
- `packages/shared/package.json`
- `packages/solver/package.json`
- `packages/plugins/hosts/codex/package.json`
- `packages/plugins/hosts/claude-code/package.json`
- `packages/plugins/hosts/cursor/package.json`
- `packages/plugins/runtime/opencode/package.json`
- `packages/plugins/runtime/openclaw/package.json`

Do not replace workspace dependency specifiers like `workspace:*` unless a package must publish an external semver range.

- [ ] **Step 4: Re-run the audit**

Run the same Node audit command from Step 1.
Expected: `aligned`

- [ ] **Step 5: Commit**

```bash
git add package.json packages/*/package.json packages/plugins/hosts/*/package.json packages/plugins/runtime/*/package.json
git commit -m "refactor: align workspace packages to one version line"
```

### Task 3: Establish the Release Workflow

**Files:**
- Modify: `README.md`
- Optional Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing workflow gap**

Confirm the current docs do not describe a single-version release path:

Run: `rg -n "changeset|release:version|fixed version|single version" README.md`
Expected: no matches or incomplete release instructions

- [ ] **Step 2: Document the new release commands**

Add a short section to `README.md` covering:

```md
## Release Workflow

This monorepo uses Changesets in a single fixed version group.

1. Run `pnpm changeset` after user-facing or package-affecting changes.
2. Run `pnpm release:version` to apply the next shared version across the root package and every workspace package.
3. Commit the generated version and changelog changes.
4. Run `pnpm release:publish` when ready to publish packages.
```

If the repo wants an explicit policy note, state that `@corivo/shared` and `@corivo/solver` are intentionally tied to product release cadence rather than independent maturity.

- [ ] **Step 3: Verify the documented commands**

Run: `pnpm release:check`
Expected: Changesets prints status successfully, even if there are no unreleased changesets yet

Run: `pnpm changeset --help`
Expected: command help output

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document fixed-version release workflow"
```

### Task 4: Add a Guardrail Check for CI and Local Validation

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Write the failing guardrail command**

Capture a reusable check script in `package.json`:

```json
{
  "scripts": {
    "version:assert": "node -e \"const fs=require('fs'); const paths=['package.json','packages/cli/package.json','packages/shared/package.json','packages/solver/package.json','packages/plugins/hosts/codex/package.json','packages/plugins/hosts/claude-code/package.json','packages/plugins/hosts/cursor/package.json','packages/plugins/runtime/opencode/package.json','packages/plugins/runtime/openclaw/package.json']; const versions=[...new Set(paths.map((p)=>JSON.parse(fs.readFileSync(p,'utf8')).version))]; if(versions.length!==1){console.error('Version mismatch: '+versions.join(', ')); process.exit(1)} console.log('All package versions aligned at '+versions[0])\""
  }
}
```

- [ ] **Step 2: Implement the script**

Add `version:assert` to the root `scripts` section.

- [ ] **Step 3: Verify the guardrail**

Run: `pnpm version:assert`
Expected: `All package versions aligned at 0.12.6` or the selected baseline

If CI is already configured for checks, add this script to the existing validation workflow in a follow-up task. Keep this plan scoped to the repo implementation first.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: add version alignment guardrail"
```

### Task 5: Smoke-Test the End-to-End Versioning Flow

**Files:**
- Create: `.changeset/<generated-id>.md`
- Modify: package manifests and changelogs generated by Changesets

- [ ] **Step 1: Write a disposable test changeset**

Create a temporary changeset that bumps the fixed group with a patch release:

```md
---
"@corivo/mono": patch
"corivo": patch
---

Smoke-test fixed-version release flow.
```

Changesets should propagate the fixed-group bump to every package in the group.

- [ ] **Step 2: Run version generation**

Run: `pnpm release:version`
Expected: all package versions advance together from the shared baseline to the next shared version

- [ ] **Step 3: Verify the outcome**

Run: `pnpm version:assert`
Expected: all versions still match

Run:

```bash
node -e "const fs=require('fs'); const paths=['package.json','packages/cli/package.json','packages/shared/package.json','packages/solver/package.json','packages/plugins/hosts/codex/package.json','packages/plugins/hosts/claude-code/package.json','packages/plugins/hosts/cursor/package.json','packages/plugins/runtime/opencode/package.json','packages/plugins/runtime/openclaw/package.json']; console.log(paths.map((p)=>p+' '+JSON.parse(fs.readFileSync(p,'utf8')).version).join('\n'))"
```

Expected: every line reports the same next version

- [ ] **Step 4: Decide whether to keep or discard the smoke-test bump**

If this task runs on the real release branch, keep it and treat it as the first official shared-version release.

If this task runs as a dry run, revert only the generated release artifacts before merging:

```bash
git restore package.json packages/cli/package.json packages/shared/package.json packages/solver/package.json packages/plugins/hosts/codex/package.json packages/plugins/hosts/claude-code/package.json packages/plugins/hosts/cursor/package.json packages/plugins/runtime/opencode/package.json packages/plugins/runtime/openclaw/package.json CHANGELOG.md .changeset
```

Use the dry-run path only if you explicitly do not want the first real fixed-group release yet.

- [ ] **Step 5: Commit**

For a real first release:

```bash
git add .
git commit -m "feat: cut first shared monorepo release"
```

## Verification Checklist

- [ ] `pnpm install`
- [ ] `pnpm changeset --version`
- [ ] `pnpm release:check`
- [ ] `pnpm version:assert`
- [ ] Version audit command reports one unique version
- [ ] `README.md` documents the fixed-version release flow
- [ ] A smoke-test changeset proves all packages bump together

## Notes for the Implementer

- Keep the scope tight: this plan is about version ownership and release workflow, not broader publish automation.
- Preserve existing `workspace:*` internal dependency declarations unless a specific publish issue forces a change.
- The root package is private today. Keeping it inside the fixed group is acceptable because it acts as the repo’s canonical version source, not as a published artifact.
- `@corivo/shared` and `@corivo/solver` will stop signaling independent release maturity. That is an intentional product decision for this repo.
