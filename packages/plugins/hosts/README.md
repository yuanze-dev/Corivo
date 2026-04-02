# Host Assets

This directory defines host-facing integration boundaries grouped by host:

- CLI asset-backed host bundles: `claude-code`, `codex`, `cursor`
- Reserved boundary (not CLI asset-backed in this stage): `opencode`

OpenCode installation goes through `corivo host install opencode`, and the installed plugin is sourced from the packaged runtime asset path:
`packages/plugins/runtime/opencode/assets/corivo.ts`.
