# Corivo Installation Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the one-command installer into a guided autopilot journey that feels productized, keeps user interruptions minimal, explains sensitive actions clearly, generates AI-friendly diagnostics, and ends with a warm activation moment.

**Architecture:** Keep `scripts/install.sh` as the orchestration entrypoint and expand `scripts/install-lib.sh` into a reusable installer UX/runtime layer. Add a stage-state model, structured diagnostics, localized copy, optional warm-up consent, and a final activation summary without moving host-specific installation logic out of the existing CLI-backed `corivo inject` flow.

**Tech Stack:** Bash, existing `corivo` CLI commands, Vitest (`packages/cli/__tests__/unit/install-entrypoint.test.ts`), localized shell copy helpers

---

## File Map

- Modify: `scripts/install.sh`
  Responsibility: orchestrate the installer flow, call stage helpers, capture failures, run host integration, and trigger warm-up / CTA generation.
- Modify: `scripts/install-lib.sh`
  Responsibility: localization, installer UI copy, language confirmation, stage rendering, structured result recording, and diagnostic helpers.
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
  Responsibility: lock the installer’s new user-facing journey and summary behavior.
- Create: `packages/cli/__tests__/unit/install-copy.test.ts`
  Responsibility: verify localization fallback, key user-facing copy, and stable diagnostic formatting.
- Create: `docs/superpowers/specs/2026-04-01-installation-journey-design.md`
  Responsibility: approved product design reference for implementation.
- Modify: `README.md`
  Responsibility: document the new installer experience and any new user-visible behaviors.

## Task 1: Lock the New Journey in Tests First

**Files:**
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
- Create: `packages/cli/__tests__/unit/install-copy.test.ts`

- [ ] **Step 1: Add a failing test for English-first fallback and explicit language confirmation**

```ts
it('asks for language once and defaults unmatched locales to English', async () => {
  const output = execFileSync('bash', [installScriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: tempHome,
      PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
      LANG: 'fr_FR.UTF-8',
    },
    input: '\n',
    encoding: 'utf8',
  });

  expect(output).toContain('Choose your language');
  expect(output).toContain('English');
});
```

- [ ] **Step 2: Run the new installer tests to confirm they fail**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/install-copy.test.ts`

Expected: FAIL because the current installer does not render the new journey copy or language behavior.

- [ ] **Step 3: Add failing tests for the four-stage journey, warm-up consent, and activation ending**

```ts
expect(output).toContain('Preparing your machine');
expect(output).toContain('Connecting your AI tools');
expect(output).toContain('Starting Corivo');
expect(output).toContain('Warming up with local context');
expect(output).toContain('This stays on your device');
expect(output).toContain('Corivo is ready to work with you.');
```

- [ ] **Step 4: Add a failing test for structured diagnostic output**

```ts
expect(output).toContain('Diagnostic summary:');
expect(diagnosticContent).toContain('STEP_ID=');
expect(diagnosticContent).toContain('STEP_NAME=');
expect(diagnosticContent).toContain('RAW_ERROR=');
```

- [ ] **Step 5: Re-run the targeted tests and confirm they still fail for the intended reasons**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/install-copy.test.ts`

Expected: FAIL with missing journey copy / missing diagnostic artifact assertions.

- [ ] **Step 6: Commit the test-only changes**

```bash
git add packages/cli/__tests__/unit/install-entrypoint.test.ts packages/cli/__tests__/unit/install-copy.test.ts
git commit -m "test: lock guided installer journey"
```

## Task 2: Build the Installer UX Runtime Layer

**Files:**
- Modify: `scripts/install-lib.sh`

- [ ] **Step 1: Add a failing copy test for stage labels, status text, and safe copy helpers**

```ts
expect(getMessage('stage_prepare', 'en')).toBe('Preparing your machine');
expect(getMessage('stage_warmup', 'en')).toBe('Warming up with local context');
expect(getMessage('warmup_safety', 'en')).toContain('stays on your device');
```

- [ ] **Step 2: Implement a stage-state model in `install-lib.sh`**

Add helpers such as:

```bash
CURRENT_STAGE=""
STAGE_RESULTS=()

begin_stage() { :; }
finish_stage() { :; }
mark_stage_attention() { :; }
render_stage_board() { :; }
```

- [ ] **Step 3: Implement language confirmation with English-first fallback**

Add or update helpers for:

```bash
prompt_install_language()
resolve_install_lang()
```

Rules to implement:

- always prompt once in TTY mode
- default selection follows locale when clearly zh/en
- default all unmatched locales to English
- non-interactive mode keeps English-first fallback

- [ ] **Step 4: Replace technical user-facing copy with result-oriented copy**

Update `msg()` keys so the main surface prefers:

- “Preparing your machine”
- “Connecting your AI tools”
- “Starting Corivo”
- “Warming up with local context”
- “Needs attention”

and removes jargon from the primary surface.

- [ ] **Step 5: Add warm-up consent copy and reusable prompt helpers**

Add keys and helpers for:

```bash
prompt_local_warmup_consent()
msg warmup_intro
msg warmup_value
msg warmup_safety
```

- [ ] **Step 6: Run the targeted tests and make sure the UX runtime passes**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-copy.test.ts __tests__/unit/install-entrypoint.test.ts`

Expected: PASS for copy and stage rendering assertions added so far.

- [ ] **Step 7: Commit the installer UX runtime changes**

```bash
git add scripts/install-lib.sh packages/cli/__tests__/unit/install-copy.test.ts packages/cli/__tests__/unit/install-entrypoint.test.ts
git commit -m "feat: add guided installer stage runtime"
```

## Task 3: Rework the Main Installer Flow Around the New Journey

**Files:**
- Modify: `scripts/install.sh`
- Modify: `scripts/install-lib.sh`

- [ ] **Step 1: Add a failing test for the welcome moment and one-line installer promise**

```ts
expect(output).toContain('Corivo is getting your machine ready.');
expect(output).toContain('I’ll prepare this machine, connect the AI tools you already use, and start Corivo with a local warm-up.');
```

- [ ] **Step 2: Implement the arrival flow in `install.sh`**

Add a minimal TUI opening sequence that:

- renders the Corivo companion/logo
- prints the welcome line
- prompts for language
- prints the one-line installer promise

Keep animation minimal and optional so tests can disable it with an env var such as `CORIVO_INSTALL_NO_ANIMATION=1`.

- [ ] **Step 3: Refactor `main()` to execute the four user-facing stages explicitly**

Structure:

```bash
begin_stage "prepare"
check_node
install_build_deps
install_corivo_cli
finish_stage "prepare"

begin_stage "connect"
detect_hosts
install_detected_hosts
finish_stage "connect"

begin_stage "start"
init_corivo
finish_stage "start"

begin_stage "warmup"
run_local_warmup_flow
finish_stage "warmup"
```

- [ ] **Step 4: Remove false-positive success paths**

In particular:

- if build dependencies could not be installed automatically, do not report them as ready
- if host install fails, preserve the specific reason instead of generic “try again later”

- [ ] **Step 5: Keep the installer non-blocking for partial failures**

Ensure:

- one host failing does not abort the full run
- missing agents do not make the whole install fail
- skipped warm-up still ends in a ready state

- [ ] **Step 6: Run the installer unit tests**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts`

Expected: PASS with the new arrival flow, staged output, and activation ending.

- [ ] **Step 7: Commit the journey-flow changes**

```bash
git add scripts/install.sh scripts/install-lib.sh packages/cli/__tests__/unit/install-entrypoint.test.ts
git commit -m "feat: rework installer into guided autopilot flow"
```

## Task 4: Add Structured Diagnostics and AI-Friendly Recovery

**Files:**
- Modify: `scripts/install.sh`
- Modify: `scripts/install-lib.sh`
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
- Create: `packages/cli/__tests__/unit/install-copy.test.ts`

- [ ] **Step 1: Add a failing test for per-step diagnostic capture**

```ts
expect(diagnosticContent).toContain('STEP_ID=prepare.install_runtime');
expect(diagnosticContent).toContain('STEP_NAME=Preparing your machine');
expect(diagnosticContent).toContain('ACTION=npm install -g corivo');
expect(diagnosticContent).toContain('NEXT_ACTION=');
```

- [ ] **Step 2: Implement diagnostic summary helpers**

Add helpers such as:

```bash
DIAGNOSTIC_PATH="$HOME/.corivo/install-diagnostic.txt"

write_diagnostic_summary() { :; }
record_failure_context() { :; }
render_recovery_message() { :; }
```

Required fields:

- stable step ID
- stage name
- attempted action
- raw error excerpt
- detected OS / shell / locale
- detected hosts
- suggested next step

- [ ] **Step 3: Stop discarding important host installer errors**

Replace blind redirection like:

```bash
corivo inject --global --codex >/dev/null 2>&1
```

with captured stderr/stdout excerpts routed into diagnostic artifacts while keeping the main surface calm.

- [ ] **Step 4: Add the user-facing AI handoff message**

Add copy such as:

- “If you want help, paste the diagnostic summary into your AI assistant.”

- [ ] **Step 5: Run the targeted tests and confirm diagnostic output works**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/install-copy.test.ts`

Expected: PASS for diagnostic-file and recovery-message assertions.

- [ ] **Step 6: Commit the diagnostics work**

```bash
git add scripts/install.sh scripts/install-lib.sh packages/cli/__tests__/unit/install-entrypoint.test.ts packages/cli/__tests__/unit/install-copy.test.ts
git commit -m "feat: add installer diagnostics and recovery guidance"
```

## Task 5: Add Local Warm-Up and Personalized Activation CTA

**Files:**
- Modify: `scripts/install.sh`
- Modify: `scripts/install-lib.sh`
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Identify the smallest existing CLI-backed warm-up path that can safely run during install**

Check existing commands and modules related to:

- cold scan
- carry-over
- recall
- recent local context bootstrap

Document the chosen call path in the installer code comments only if it is not obvious.

- [ ] **Step 2: Add a failing test for warm-up consent and skip behavior**

```ts
expect(output).toContain('Corivo can get ready faster by learning from your recent local AI conversations.');
expect(output).toContain('This stays on your device.');
expect(output).toContain('Skip for now');
```

- [ ] **Step 3: Implement the warm-up flow in `install.sh`**

Behavior:

- show consent prompt in interactive mode
- default to a safe non-destructive path in non-interactive mode
- if user continues, run the chosen warm-up path
- if user skips, mark warm-up as skipped without failing the install

- [ ] **Step 4: Implement CTA generation**

Add a final helper that returns:

- one universal prompt
- optionally personalized with detected project or recent-context signals
- still safe when no personalization signal exists

Example shape:

```bash
render_activation_cta() { :; }
```

- [ ] **Step 5: Update the final summary to become an activation screen**

The ending should include:

- readiness headline
- connected agents
- warm-up status
- attention items
- copyable CTA

- [ ] **Step 6: Run the installer tests and README sanity check**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts`

Expected: PASS with warm-up consent, skip path, activation ending, and CTA output.

- [ ] **Step 7: Update user-facing installer docs**

Document:

- the new staged installer flow
- the local warm-up consent step
- the final activation prompt

- [ ] **Step 8: Commit the warm-up and activation changes**

```bash
git add scripts/install.sh scripts/install-lib.sh packages/cli/__tests__/unit/install-entrypoint.test.ts README.md
git commit -m "feat: add installer warm-up and activation ending"
```

## Task 6: Run Full Verification and Clean Up the Narrative

**Files:**
- Modify: `README.md`
- Modify: `scripts/install.sh`
- Modify: `scripts/install-lib.sh`
- Modify: `packages/cli/__tests__/unit/install-entrypoint.test.ts`
- Modify: `packages/cli/__tests__/unit/install-copy.test.ts`

- [ ] **Step 1: Run the full targeted verification suite**

Run: `cd packages/cli && npm run test -- __tests__/unit/install-entrypoint.test.ts __tests__/unit/install-copy.test.ts`

Expected: PASS

- [ ] **Step 2: Run the broader CLI unit suite if the install tests pass**

Run: `cd packages/cli && npm run test`

Expected: PASS or only pre-existing unrelated failures.

- [ ] **Step 3: Manually smoke-test the shell installer in a temp HOME**

Run:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" bash scripts/install.sh --lang en
```

Expected:

- welcome moment appears
- language path is stable
- stage flow is readable
- summary is activation-oriented

- [ ] **Step 4: Tighten any user-facing copy that still sounds like implementation detail**

Remove terms that should not appear on the main surface, such as:

- nvm
- gcc
- hooks
- inject
- host adapter

- [ ] **Step 5: Commit the final polish**

```bash
git add scripts/install.sh scripts/install-lib.sh packages/cli/__tests__/unit/install-entrypoint.test.ts packages/cli/__tests__/unit/install-copy.test.ts README.md
git commit -m "docs: polish guided installer experience"
```

## Notes for Execution

- Keep the main surface productized and calm. Raw command noise belongs in diagnostics.
- Do not require users to choose among detected agents. Connect all supported agents automatically.
- Do not treat “no detected agents” or “warm-up skipped” as fatal failures.
- Prefer English-first fallback for unmatched locales.
- Preserve idempotency so rerunning the installer feels safe.
- When adding animation, keep tests deterministic with a disable flag.
