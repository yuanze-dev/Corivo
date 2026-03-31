# RFC: Host Integration Asset Boundaries

Date: 2026-03-31  
Status: Accepted (docs alignment baseline)

## Context

Corivo now uses a split plugin tree:

- `packages/plugins/hosts/*`
- `packages/plugins/runtime/*`

Historically, docs mixed host integration assets and runtime plugin code terminology. This RFC defines a single boundary contract used by root docs, package READMEs, and lightweight tests.

## Definitions

### Host Integration Bundle

A host integration bundle is a package/directory under `packages/plugins/hosts/*` that provides host-facing install assets consumed by the `corivo` CLI installer.

Current-stage exception:

- `packages/plugins/hosts/opencode` is a reserved host boundary and is not CLI asset-backed in this stage.
- OpenCode install still uses `corivo inject --global --opencode`, sourcing the installed plugin from `packages/plugins/runtime/opencode/assets/corivo.ts`.

Typical contents:

- hook configs and scripts
- skills/prompts/templates
- adapter scripts
- marketplace/plugin metadata
- static assets

### Runtime Plugin

A runtime plugin is an executable code package under `packages/plugins/runtime/*` that runs runtime logic (event handling, ingestion, transforms) and can be built/tested as code.

Typical contents:

- runtime source code (`src/*`)
- package/runtime entrypoints
- build/typecheck configs

## Boundary Rules

1. Host integration assets live only in `packages/plugins/hosts/*`.
2. Executable runtime plugin code lives only in `packages/plugins/runtime/*`.
3. `hosts/opencode` stays reserved and non-asset-backed at this stage; OpenCode install is runtime-asset sourced.
4. Host README files must describe host integration bundles, not runtime plugin implementation.
5. Runtime README files must describe runtime plugins, not host installer assets.
6. Installation behavior remains centralized through the CLI path (`corivo inject` and installer delegation), not redefined per package.

## Non-Goals

- No injector behavior redesign in this RFC
- No changes to host detection logic
- No runtime architecture changes

## Verification Strategy

Add a lightweight docs consistency test to assert:

- root docs mention both directory boundaries
- host index docs + RFC describe the OpenCode host exception consistently
- host docs include host-bundle framing
- runtime docs include runtime-plugin framing

This is intended to catch high-impact wording regressions early without over-constraining documentation style.
