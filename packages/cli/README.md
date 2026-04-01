# corivo (CLI)

Core local runtime for Corivo. This package ships the `corivo` binary and contains the local memory engine, storage layer, background heartbeat, and command implementations.

## Stability

- Status: `beta`, actively developed
- Scope: primary end-user package in this monorepo
- Platform notes: the daemon/runtime path is currently strongest on macOS; cross-platform support is still evolving

## What Is In This Package

- CLI command surface (`save`, `query`, `status`, `sync`, `inject`, `suggest`, and more)
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
- Command implementations: `src/cli/commands/`
- Heartbeat and engine logic: `src/engine/`
- Database layer: `src/storage/database.ts`
- Service management: `src/service/`

## CLI Runtime Composition

`src/cli/context/` provides shared runtime capabilities for commands and services, including logger, config access, paths/fs helpers, clock, user-facing output, and database access.

Keep `CliContext` focused on horizontal runtime concerns. It exists to reduce repeated wiring such as `createLogger()`, config loading, path resolution, and database bootstrap code.

Do not place business actions in `CliContext`. Sync orchestration, heartbeat rules, block processing, and other domain logic should stay in their own modules.

Pure functions do not need the whole context. When a helper only needs a narrow dependency such as `logger` or `clock`, prefer passing that smaller capability explicitly.

## Memory Pipeline

### Memory command entrypoint

The `src/cli/commands/memory.ts` command tree is the public entrypoint for the memory pipeline framework. Running `corivo memory run` without flags triggers the incremental scheduled pipeline by default, while `corivo memory run --full` forces the init pipeline and `corivo memory run --incremental` forces the scheduled pipeline. The command simply parses the mode flag, instantiates the minimal runner (`ArtifactStore`, `FileRunLock`, `MemoryPipelineRunner`), and calls `runMemoryPipeline`, which returns a `MemoryPipelineRunResult` that the command prints.

### Memory pipeline responsibilities

The framework under `src/memory-pipeline/` owns orchestrating multi-stage memory processing. Its responsibilities include keeping pipelines/stages/ artifacts isolated, serializing stage results into manifests, enforcing the single-run lock, and then letting heartbeat trigger the scheduled pipeline while the CLI exposes the manual triggers. `MemoryPipelineRunner` executes each stage in order, persists manifests and artifact descriptors, and surface concise status via the CLI command without entangling stage implementations with the command wiring.

### Artifact layout

Artifacts and run metadata live under the config tree in `~/.corivo/memory-pipeline/` (this matches the spec’s vision of `~/.corivo/memory/`). The layout mirrors the artifact store’s internal directories:

- `artifacts/detail/` holds append-only detail artifacts such as session summaries and block detail records.
- `artifacts/index/` keeps lightweight index projections that can be rebuilt from the detail layer.
- `artifacts/descriptors/` stores descriptor JSONs that list artifact metadata and upstream ids.
- `runs/<run-id>/stages/` contains per-stage outputs plus the `manifest.json` that tracks pipeline status and cursors.

Pipeline stages only interact with the artifact store, which keeps them from writing arbitrary paths themselves, so the CLI, heartbeat, and future automation can all rely on this stable structure.
