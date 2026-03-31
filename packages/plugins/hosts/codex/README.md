# @corivo/codex

Codex host integration bundle for Corivo.

This package ships host-facing assets that the `corivo` CLI installer can consume for Codex environments.

## Boundary

- Type: `host integration bundle`
- Directory model: `packages/plugins/hosts/*`
- Not this package: executable runtime plugin code

If you need runtime behavior in executable code, it belongs under `packages/plugins/runtime/*`, not here.

## What This Bundle Contains

- `.codex-plugin/plugin.json` marketplace manifest
- `skills/` prompts for Corivo save/query flows
- `commands/` slash-command templates
- `hooks/` sample hook config and scripts
- `assets/` plugin presentation assets
- `adapters/` notify adapter scripts

## Installation Path

Use the single CLI install path:

```bash
corivo inject --global --codex
```

The installer wires Codex global instructions and notify adapters. This package does not define a separate installation pipeline.

## Local Validation

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("packages/plugins/hosts/codex/.codex-plugin/plugin.json","utf8"))'
node -e 'JSON.parse(require("node:fs").readFileSync(".agents/plugins/marketplace.json","utf8"))'
```
