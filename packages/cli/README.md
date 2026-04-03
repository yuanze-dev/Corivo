# corivo (CLI)

Core local runtime for Corivo. This package ships the `corivo` binary and contains the local memory engine, storage layer, background heartbeat, and command implementations.

## Stability

- Status: `beta`, actively developed
- Scope: primary end-user package in this monorepo
- Platform notes: the daemon/runtime path is currently strongest on macOS; cross-platform support is still evolving

## What Is In This Package

- CLI command surface (`save`, `query`, `status`, `sync`, `host`, `suggest`, and more)
- Local storage and indexing (SQLite via `better-sqlite3`)
- Memory processing engine (annotation, vitality decay, associations, consolidation)
- Service management entry points for background execution

## Local Development

From this directory:

```bash
npm install
npm run build
npm run dev
npm run test
npm run typecheck
```

From repository root, build everything:

```bash
pnpm -r run build
```

## Where To Look Next

- CLI entrypoint: `src/cli/index.ts`
- CLI composition root: `src/application/bootstrap/create-cli-app.ts`
- Command implementations: `src/cli/commands/`
- Application orchestration: `src/application/`
- Runtime capabilities/policies: `src/runtime/`
- Memory pipeline state/capability/flow: `src/memory-pipeline/`
- Heartbeat and engine logic: `src/engine/`
- Database layer: `src/storage/database.ts`
- Service management: `src/service/`

## CLI Runtime Composition

`src/cli/context/` provides shared runtime capabilities for commands and services, including logger, config access, paths/fs helpers, clock, user-facing output, and database access.

Keep `CliContext` focused on horizontal runtime concerns. It exists to reduce repeated wiring such as `createLogger()`, config loading, path resolution, and database bootstrap code.

Do not place business actions in `CliContext`. Sync orchestration, heartbeat rules, block processing, and other domain logic should stay in their own modules.

Pure functions do not need the whole context. When a helper only needs a narrow dependency such as `logger` or `clock`, prefer passing that smaller capability explicitly.

## Architectural Split (State / Capability / Flow)

This package uses one directional layering:

- Command layer (`src/cli/commands/*`): parse CLI input and render output only.
- Application layer (`src/application/*`): use-cases and orchestration flow; compose dependencies instead of constructing them deep inside business modules.
- Runtime layer (`src/runtime/*`): reusable capability/policy functions (recall, query history store adapter, trigger/follow-up rendering rules, etc).
- Pipeline layer (`src/memory-pipeline/*`): state + stage capabilities + runner flow, without command parsing concerns.
- Host/plugin integration (`src/hosts/*`, `src/hosts/installers/*`, `packages/plugins/*`): host-specific differences and install assets, delegated through `corivo host ...`.

Composition roots:

- CLI app wiring: `src/application/bootstrap/create-cli-app.ts`
- Memory pipeline command orchestration: `src/application/memory/run-memory-pipeline.ts`

The cleanup pass intentionally removes pseudo-modules (pure 1:1 forwarding wrappers) where they do not add semantics, while keeping real boundaries that carry policy, contracts, or composition responsibilities.

## Memory Pipeline

### Host history import

`corivo host import <host>` is the manual history backfill entrypoint for hosts that advertise the `history-import` capability.

- Default behavior: reuse the stored import cursor for that host and run an incremental import.
- First import: if no stored cursor exists yet, the command fails and tells you to bootstrap with `--all` or an explicit `--since <cursor>`.
- `--all`: run a full import and establish the next cursor from the imported history.
- `--since <cursor>`: bypass the stored cursor and import incrementally from the supplied cursor.
- `--dry-run`: executes the import logic and prints the result, but does not persist imported raw sessions/messages and does not update the stored cursor.

For Codex specifically, history import distinguishes two failure classes:

- History source unavailable: no stable Codex history root was detected, so import returns an unavailable result.
- Parse failure: Codex history files were found, but none produced a parseable session, so import returns an error instead of an unavailable result.

### Memory command entrypoint

The `src/cli/commands/memory.ts` command tree is the public entrypoint for the memory pipeline framework. Running `corivo memory run` without flags triggers the incremental scheduled pipeline by default, while `corivo memory run --full` forces the init pipeline and `corivo memory run --incremental` forces the scheduled pipeline. The command simply parses the mode flag, instantiates the minimal runner (`ArtifactStore`, `FileRunLock`, `MemoryPipelineRunner`), and calls `runMemoryPipeline`, which returns a `MemoryPipelineRunResult` that the command prints.

### Memory pipeline responsibilities

The framework under `src/memory-pipeline/` owns orchestrating multi-stage memory processing. Its responsibilities include keeping pipelines/stages/ artifacts isolated, serializing stage results into manifests, enforcing the single-run lock, and then letting heartbeat trigger the scheduled pipeline while the CLI exposes the manual triggers. `MemoryPipelineRunner` executes each stage in order, persists manifests and artifact descriptors, and surface concise status via the CLI command without entangling stage implementations with the command wiring.

The scheduled pipeline is now driven by raw session extraction jobs instead of directly scanning for stale semantic memory. Realtime hooks and history import both write raw session/message records first, enqueue `extract-session` work, and then `corivo memory run --incremental` consumes those queued raw sessions as its incremental input.

### Artifact layout

Artifacts and run metadata live under the canonical Corivo workspace root, `~/.corivo/`. The memory pipeline currently writes under `~/.corivo/memory-pipeline/`, and the projected markdown memory root sits alongside it at `~/.corivo/memory/`. The layout mirrors the artifact store’s internal directories:

- `artifacts/detail/` holds append-only detail artifacts such as session summaries and block detail records.
- `artifacts/index/` keeps lightweight index projections that can be rebuilt from the detail layer.
- `artifacts/descriptors/` stores descriptor JSONs that list artifact metadata and upstream ids.
- `runs/<run-id>/stages/` contains per-stage outputs plus the `manifest.json` that tracks pipeline status and cursors.

Pipeline stages only interact with the artifact store, which keeps them from writing arbitrary paths themselves, so the CLI, heartbeat, and future automation can all rely on this stable structure.

### Prompt-time recall priority

`corivo query --prompt "<text>"` now follows the v0.11 memory recall priority:

1. read generated markdown memory index/detail under `~/.corivo/memory/final/`
2. fall back to raw session/message transcripts from SQLite when no markdown memory matches
3. fall back to legacy block recall only as a compatibility path

This keeps prompt hooks lightweight while still preferring the new markdown memory surface.
