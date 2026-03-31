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
