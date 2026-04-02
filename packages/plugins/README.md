# Plugins

This directory is organized by plugin name:

- `claude-code`
- `codex`
- `cursor`
- `opencode`
- `openclaw`

Each plugin root contains the files that plugin needs. Some roots are asset-oriented, some are code-oriented, and `packages/plugins/opencode` currently contains both runtime source and the packaged install asset `packages/plugins/opencode/assets/corivo.ts` used by `corivo host install opencode`.

Repository-level rule:

- Navigate by plugin name first.
- Keep internal responsibilities clear inside each plugin root.
- Keep installation behavior centralized in the CLI instead of redefining install flows inside plugin packages.
