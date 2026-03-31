# @corivo/claude-code

Claude Code host integration bundle for Corivo.

This package provides host-side assets (hooks, scripts, skills, and command docs) used by the CLI installer for Claude Code.

## Boundary

- Type: `host integration bundle`
- Directory model: `packages/plugins/hosts/*`
- Not this package: executable runtime plugin code

## What This Bundle Contains

- `hooks/hooks.json` host hook configuration
- `hooks/scripts/` lifecycle scripts for carry-over, recall, and review
- `skills/` prompt assets for Corivo save/query
- `commands/` command documentation

## Installation Path

Install through the single CLI path:

```bash
corivo inject --global --claude-code
```

No separate installer is defined in this package.

## Local Development

This is a host asset bundle (scripts + markdown + config). Validate behavior through CLI-driven integration flows.
