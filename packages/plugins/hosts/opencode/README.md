# OpenCode host boundary (reserved)

Reserved host integration bundle boundary for OpenCode (non-package asset directory).

This directory is currently a reserved host boundary for OpenCode and is not CLI asset-backed in this stage.

## Boundary

- Type: `host integration bundle`
- Directory model: `packages/plugins/hosts/*`
- Not this package: executable runtime plugin code

OpenCode install still uses `corivo inject --global --opencode`, and the installed plugin comes from the packaged runtime asset path:
`packages/plugins/runtime/opencode/assets/corivo.ts`.
