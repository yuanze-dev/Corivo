# Contributing to Corivo

Thanks for helping improve Corivo.

This document explains how to contribute in a way that matches the current monorepo workflow.

## Before You Start

- License: this project is released under MIT, and contributions are accepted under the same license.
- Node.js: `>=18`
- Package manager: `pnpm` workspace (recommended for repo-level development)

## Repository Layout

- `packages/cli` - main `corivo` CLI package
- `packages/solver` - sync relay server
- `packages/shared` - shared types and APIs
- `packages/plugins/*` - plugin packages

## Local Setup

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
pnpm install
```

## Development Commands

Run from repository root:

```bash
pnpm run build
pnpm run dev
pnpm run lint
pnpm run test
```

Run package-level commands when working on a specific package:

```bash
cd packages/cli
npm run build
npm run dev

cd ../solver
npm run build
npm run dev
```

## Testing

- Root-level tests currently run through `pnpm run test` (`vitest`).
- Some packages also keep package-specific tests under `__tests__/`.
- If your change affects runtime behavior, include or update tests in the relevant package.

## What We Usually Accept

- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage improvements
- New integrations that fit Corivo's core scope

## Scope Boundary

To keep Corivo Core focused, we generally do not accept enterprise-only features in this repository, such as:

- team workspace administration
- advanced permission systems
- enterprise SSO and similar commercial-only modules

## Branch and Commit Conventions

Please do not commit directly to `main`.

Recommended branch names:

- `feature/<name>`
- `fix/<name>`
- `refactor/<name>`

Recommended commit format:

```text
<type>: <summary>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

Keep commits atomic: one clear change per commit.

## Pull Requests

1. Create a branch from `main`.
2. Make focused changes with tests/docs as needed.
3. Ensure build and relevant tests pass locally.
4. Open a PR with a clear description:
   - what changed
   - why it changed
   - how it was validated

## Community Standards

By participating, you agree to follow our Code of Conduct:

- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Security Reports

Please do not open public issues for security vulnerabilities.

See:

- [SECURITY.md](./SECURITY.md)

## Need Help?

- Open a discussion in Issues: <https://github.com/xiaolin26/Corivo/issues>
