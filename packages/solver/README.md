# @corivo/solver

CRDT sync relay service for Corivo. This package runs a Fastify server that accepts authenticated sync push/pull requests from clients.

## Stability

- Status: `early beta`
- Scope: infrastructure package for multi-device sync
- Maturity notes: API and operational shape may continue to change while sync behavior is hardened

## What Is In This Package

- Fastify server bootstrap and plugin wiring
- Auth routes and challenge/token flows
- Sync routes for push/pull changesets
- Server-side SQLite persistence for per-identity sync state

## Architecture Boundaries

`@corivo/solver` is split by adapter/application/runtime responsibilities:

- Routes (`src/routes/*`): HTTP adapter only (schema, status code, request/response mapping).
- Application contracts (`src/application/*`): auth and sync contracts/use-case interfaces.
- Capabilities (`src/auth/*`, `src/sync/*`, `src/db/*`): token/challenge/pairing, sync repository logic, persistence.
- Runtime/composition roots (`src/runtime/create-server.ts`, `src/server.ts`): wire all dependencies and register routes.

Practical rule: routes never own persistence logic, repository/auth modules never parse HTTP, and composition roots are the only place that assembles concrete implementations.

## Local Development

From this directory:

```bash
npm install
npm run dev
npm run build
npm run start
```

Environment:

- Copy `.env.example` to `.env` if needed
- `dev`/`start` already use `--env-file-if-exists=.env`

## Where To Look Next

- Server bootstrap: `src/index.ts`, `src/server.ts`
- Runtime composition: `src/runtime/create-server.ts`
- HTTP routes: `src/routes/`
- Application contracts: `src/application/`
- Sync handling: `src/sync/sync-handler.ts`
- Auth flow: `src/auth/`
- DB layer: `src/db/`
