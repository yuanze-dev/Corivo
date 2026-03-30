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
- HTTP routes: `src/routes/`
- Sync handling: `src/sync/sync-handler.ts`
- Auth flow: `src/auth/`
- DB layer: `src/db/`

