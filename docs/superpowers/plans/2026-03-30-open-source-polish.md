# Corivo Open Source Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into a more elegant, trustworthy, and contributor-friendly open source project by aligning docs, package entry points, and repository-level community signals with the codebase's real current state.

**Architecture:** This pass is documentation-first and metadata-first. We will not refactor product code; instead, we will tighten the repository front door, add missing community docs, and make package-level entry points accurately reflect the monorepo structure and maturity of each package.

**Tech Stack:** Markdown, GitHub repository conventions, pnpm workspace metadata, existing Node.js/TypeScript monorepo scripts

---

### Task 1: Audit public repository claims against reality

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `CONTRIBUTING.md`
- Test: repository file tree and package metadata

- [ ] **Step 1: Read the current root docs and package manifests**

Run:

```bash
sed -n '1,260p' README.md
sed -n '1,260p' README.zh.md
sed -n '1,260p' CONTRIBUTING.md
find packages -maxdepth 3 -type f | sort
find .github -maxdepth 3 -type f | sort
```

Expected: enough context to identify mismatches between docs and the actual repository.

- [ ] **Step 2: Record the concrete mismatches that must be corrected**

Checklist:

- root docs mention package docs that do not exist
- root docs mention package names or paths that differ from the tree
- install/development instructions do not clearly match workspace tooling
- public support claims need clearer scope or maturity language

Expected: a short working list that directly informs the rewrite.

- [ ] **Step 3: Verify the actual package identities from manifests**

Run:

```bash
sed -n '1,220p' package.json
sed -n '1,220p' packages/cli/package.json
sed -n '1,220p' packages/solver/package.json
sed -n '1,220p' packages/shared/package.json
sed -n '1,220p' packages/plugins/claude-code/package.json
sed -n '1,220p' packages/plugins/codex/package.json
sed -n '1,220p' packages/plugins/openclaw/package.json
```

Expected: package names, scripts, and maturity signals are confirmed before rewriting docs.

- [ ] **Step 4: Commit the audit notes only if they need to exist as a doc**

If no dedicated audit note is needed, skip this commit step and proceed.

### Task 2: Rewrite the repository front door

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Test: markdown readability by reviewing rendered structure in plain text

- [ ] **Step 1: Write the new English README outline**

Sections to include:

- project identity and one-paragraph positioning
- what works today
- quick start with realistic commands
- how Corivo works
- package map
- privacy/local-first guarantees
- development entry points
- contribution and roadmap links

Expected: a tighter structure that follows the approved design doc.

- [ ] **Step 2: Rewrite `README.md` with accurate repository truth**

Content requirements:

- align package and plugin references with current paths
- make current platform/support status explicit
- reduce hype where the repo cannot back it up
- keep the product differentiated and memorable

- [ ] **Step 3: Mirror the same information architecture in `README.zh.md`**

Content requirements:

- same section order as English when practical
- same truthfulness about support status and beta scope
- natural Chinese, not literal sentence-by-sentence translation

- [ ] **Step 4: Review both READMEs for drift and contradiction**

Run:

```bash
sed -n '1,260p' README.md
sed -n '1,260p' README.zh.md
```

Expected: the two files tell the same story with no obvious contradictions.

- [ ] **Step 5: Commit the README rewrite**

```bash
git add README.md README.zh.md
git commit -m "docs: refresh repository front door for open source"
```

### Task 3: Upgrade contributor-facing repository docs

**Files:**
- Modify: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Test: document presence and internal link sanity

- [ ] **Step 1: Rewrite `CONTRIBUTING.md` around real contributor workflows**

Must cover:

- repo setup
- package/workspace commands
- branch and commit expectations already established by the repo
- which types of contributions are welcome
- where to open issues

- [ ] **Step 2: Add a lightweight `CODE_OF_CONDUCT.md`**

Recommended base:

- Contributor Covenant style structure
- calm tone
- maintainer enforcement contact path that matches the repo's current reality

- [ ] **Step 3: Add a lightweight `SECURITY.md`**

Must cover:

- how to report vulnerabilities
- whether to avoid public issues for security reports
- response expectation framed conservatively

- [ ] **Step 4: Cross-link these docs from the README where useful**

Expected: community and security docs are discoverable from the root surface.

- [ ] **Step 5: Commit the community docs pass**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md README.md README.zh.md
git commit -m "docs: add community and security guidance"
```

### Task 4: Add package entry points that match the actual monorepo

**Files:**
- Create: `packages/cli/README.md`
- Create: `packages/solver/README.md`
- Create: `packages/shared/README.md`
- Create: `packages/plugins/openclaw/README.md`
- Modify: `packages/plugins/claude-code/README.md`
- Modify: `packages/plugins/codex/README.md`
- Test: package docs exist for all public-facing package paths referenced by root docs

- [ ] **Step 1: Decide which packages are externally meaningful**

Current expectation:

- `packages/cli`
- `packages/solver`
- `packages/shared` if referenced by contributors
- plugin packages under `packages/plugins/*`

- [ ] **Step 2: Add concise package READMEs for missing public packages**

Each package README should answer:

- what this package is
- whether it is stable, internal, or experimental
- how to build/test it
- where to look next in the code

- [ ] **Step 3: Refresh existing plugin READMEs to match current naming and scope**

Expected: package docs read as part of one coherent monorepo, not separate eras.

- [ ] **Step 4: Review root README package links against the new package docs**

Run:

```bash
find packages -maxdepth 2 -type f -name 'README.md' | sort
```

Expected: every package surfaced from the root now has a real entry point.

- [ ] **Step 5: Commit the package doc additions**

```bash
git add packages/cli/README.md packages/solver/README.md packages/shared/README.md packages/plugins/openclaw/README.md packages/plugins/claude-code/README.md packages/plugins/codex/README.md README.md README.zh.md
git commit -m "docs: add package entry points across the monorepo"
```

### Task 5: Tighten repository maintenance signals

**Files:**
- Modify: `.gitignore` (only if needed)
- Modify: root docs if local-only artifacts need acknowledgement or de-emphasis
- Test: `git status --short` remains clean aside from intentional changes

- [ ] **Step 1: Inspect tracked repository noise that weakens the open source surface**

Run:

```bash
git ls-files .idea
git ls-files '*.tsbuildinfo'
git ls-files 'packages/*/dist/*' | head -50
git ls-files 'packages/*/node_modules/*' | head -50
```

Expected: identify whether tracked local/build artifacts should be handled in this pass or deferred.

- [ ] **Step 2: Make only low-risk presentation-level cleanup changes**

Rules:

- do not mass-delete tracked artifacts without explicit review
- if cleanup is risky, document it rather than forcing it into this pass
- prefer adjusting `.gitignore` for future hygiene over destructive history surgery

- [ ] **Step 3: Make final root doc consistency fixes**

Expected: top-level docs and package docs reflect a single coherent repository story.

- [ ] **Step 4: Commit the hygiene adjustments if any files changed**

```bash
git add .gitignore README.md README.zh.md CONTRIBUTING.md
git commit -m "docs: tighten repository maintenance signals"
```

### Task 6: Verify the open source polish pass before handoff

**Files:**
- Test only

- [ ] **Step 1: Review all changed docs in plain text**

Run:

```bash
git diff -- README.md README.zh.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md packages/cli/README.md packages/solver/README.md packages/shared/README.md packages/plugins/claude-code/README.md packages/plugins/codex/README.md packages/plugins/openclaw/README.md .gitignore
```

Expected: no contradictory instructions, broken paths, or obvious tone drift.

- [ ] **Step 2: Verify package links and file existence**

Run:

```bash
test -f README.md
test -f README.zh.md
test -f CONTRIBUTING.md
test -f CODE_OF_CONDUCT.md
test -f SECURITY.md
test -f packages/cli/README.md
test -f packages/solver/README.md
test -f packages/shared/README.md
test -f packages/plugins/claude-code/README.md
test -f packages/plugins/codex/README.md
test -f packages/plugins/openclaw/README.md
```

Expected: all expected repository entry points exist.

- [ ] **Step 3: Optionally run a lightweight markdown lint/readability pass if tooling exists**

Run:

```bash
rg -n "TODO|TBD|FIXME" README.md README.zh.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md packages/cli/README.md packages/solver/README.md packages/shared/README.md packages/plugins/claude-code/README.md packages/plugins/codex/README.md packages/plugins/openclaw/README.md
```

Expected: no placeholder text remains unless intentional.

- [ ] **Step 4: Prepare a short handoff summary with known deferred items**

Must mention:

- any risky git hygiene cleanup intentionally deferred
- any package maturity caveats that remain
- any doc links or screenshots still worth improving later
