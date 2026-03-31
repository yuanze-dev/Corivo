---
title: "Host Registry Installation: Contract & Registry"
authors:
  - codex
date: 2026-04-01
---

# Host Registry Installation — Contract & Registry

## Context

This spec describes Task 1 of the **Host Registry Installation Plan** (2026-04-01). The goal is to start moving Corivo's host integration surface toward a `HostRegistry + HostAdapter` model so that `corivo host`, `corivo inject`, and future capability gates can share a single, type-safe contract for install/doctor/uninstall workflows.

Early in the plan we decided to keep the CLI-focused installation surface first, leaving runtime behaviors, push/notify routing, and plugin marketplaces for later stages.

## Goals

1. Define an explicit `HostAdapter` contract that every host (Codex, Cursor, OpenCode, Claude Code, project Claude) must implement.
2. Keep the registry as simple as possible while still allowing future registration extensions or tests to plug in additional adapters or mocks.
3. Make a narrow unit test that locks in the minimal registry API (enumerating builtin IDs, returning adapters by id).

## Host contract

- `HostId`: literal union of `claude-code`, `codex`, `cursor`, `opencode`, `project-claude`.
- `HostCapability`: union covering current install surface (`global-install`, `project-install`, `rules`, `hooks`, `notify`, `plugin-file`, `doctor`, `uninstall`).
- `HostInstallOptions`: basic fields `target?: string`, `force?: boolean`, `global?: boolean`.
- `HostInstallResult`: `success: boolean`, `host: HostId`, optional `path`, `summary`, optional `error`.
- `HostDoctorResult`: `ok: boolean`, `host: HostId`, `checks: Array<{ label: string; ok: boolean; detail: string }>`
- `HostAdapter`: `id`, `displayName`, `capabilities`, `install`, `doctor`, and optional `uninstall` methods. All methods are async and return the typed results.

This contract lives in `packages/cli/src/hosts/types.ts` so the rest of the CLI (commands, use cases, registry) can share the same surface.

## Registry

The registry will expose exactly these helpers:

1. `registerHostAdapter(adapter: HostAdapter): void` — allows future automation, tests, or dynamic discovery to inject adapters.
2. `getAllHostAdapters(): HostAdapter[]` — returns a shallow copy of the current adapters (pre-populated with the builtin five).
3. `getHostAdapter(id: HostId): HostAdapter | null` — returns the registered adapter or `null`.

Implementation detail:
- Keep a `Map<HostId, HostAdapter>` under the hood for efficient lookups but mirror the values in an array for deterministic enumeration order (`claude-code`, `codex`, `cursor`, `opencode`, `project-claude`).
- Register the five builtin stub adapters at module initialization so `getAllHostAdapters()` returns the stable list required by the test.
- The builtin stubs can simply resolve placeholder results (`{ success: true, summary: 'stub' }`) for now; the real logic lives in later tasks.

## Test plan

- Create `packages/cli/__tests__/unit/host-registry.test.ts`.
- Assertions:
  - `getAllHostAdapters().map((item) => item.id)` equals the stable array of host IDs.
  - `getHostAdapter('codex')` returns the codex stub; `getHostAdapter('missing')` yields `null`.
- These assertions lock the minimal registry API and give future refactors a safety net.

## Open question

- Should the registry be content with a static builtin list for this task, or do we need to extend it to discover adapters dynamically (plugins scanned from disk)? The current plan assumes a static + registerable registry so future automation can plug in extra adapters without touching this file.

## Next steps

- Once this spec is approved, wire up the types/registry files, add the stub adapters, and run the focused Vitest file.
- After the registry is stable, Task 2 will refactor the existing inject helpers to expose install/doctor/uninstall helpers that adapters can reuse.
