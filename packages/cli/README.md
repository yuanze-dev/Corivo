# corivo (CLI)

Core local runtime for Corivo. This package ships the `corivo` binary and contains the local memory engine, storage layer, background heartbeat, and command implementations.

## Stability

- Status: `beta`, actively developed
- Scope: primary end-user package in this monorepo
- Platform notes: the daemon/runtime path is currently strongest on macOS; cross-platform support is still evolving

## What Is In This Package

- CLI command surface (`save`, `query`, `status`, `sync`, `inject`, `recall`, `suggest`, and more)
- Local storage and indexing (SQLite via `better-sqlite3`)
- Memory processing engine (annotation, vitality decay, associations, consolidation)
- Service management entry points for background execution

## Local Development

From this directory:

```bash
npm install
npm run build
npm run dev
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

