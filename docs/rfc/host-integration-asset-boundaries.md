# RFC: Plugin Root Boundaries

Date: 2026-03-31  
Status: Accepted (docs alignment baseline)

## Context

Corivo now uses a plugin-root tree:

- `packages/plugins/<plugin>`

Historically, docs mixed plugin names with a split `hosts/*` and `runtime/*` topology. This RFC updates the contract so repository navigation is by plugin name, while host-facing assets and runtime code remain internal responsibilities inside a plugin root.

## Definitions

### Plugin Root

A plugin root is a package/directory under `packages/plugins/<plugin>` that contains the files required by one integration.

Typical contents:

- hook configs and scripts
- skills/prompts/templates
- adapter scripts
- marketplace/plugin metadata
- static assets
- runtime source code (`src/*`)
- package/runtime entrypoints
- build/typecheck configs

## Boundary Rules

1. Every plugin lives at `packages/plugins/<plugin>`.
2. Host-facing install assets and executable runtime code can coexist in one plugin root.
3. `opencode` keeps both concerns in one directory; the install asset is `packages/plugins/opencode/assets/corivo.ts`.
4. Plugin README files must explain the internal responsibilities of that plugin root.
5. Installation behavior remains centralized through the CLI path (`corivo host install` and installer delegation), not redefined per package.

## Non-Goals

- No injector behavior redesign in this RFC
- No changes to host detection logic
- No runtime architecture changes

## Verification Strategy

Add a lightweight docs consistency test to assert:

- root docs mention the plugin-root model
- plugin docs describe whether a plugin root is asset-oriented, code-oriented, or mixed
- OpenCode docs and RFC consistently point to `packages/plugins/opencode/assets/corivo.ts`

This is intended to catch high-impact wording regressions early without over-constraining documentation style.
