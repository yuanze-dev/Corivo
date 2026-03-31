# Host Assets

This directory defines host-facing integration boundaries grouped by host:

- CLI asset-backed host bundles: `claude-code`, `codex`, `cursor`
- Reserved boundary (not CLI asset-backed in this stage): `opencode`

OpenCode installation still goes through `corivo inject --global --opencode`, but the installed plugin is sourced from the packaged runtime asset path:
`packages/plugins/runtime/opencode/assets/corivo.ts`.
