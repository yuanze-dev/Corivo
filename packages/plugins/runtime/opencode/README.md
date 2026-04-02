# @corivo/opencode

OpenCode executable runtime plugin for Corivo.

This package implements runtime event handling for OpenCode and delegates memory decisions to the local Corivo CLI runtime.

## Boundary

- Type: `runtime plugin`
- Directory model: `packages/plugins/runtime/*`
- Not this package: host integration bundle assets

Host installation assets for OpenCode belong in `packages/plugins/hosts/opencode`.

## Lifecycle Mapping

- `session.created` -> `corivo carry-over`
- `chat.message` -> `corivo recall`
- `message.updated` / `session.idle` -> `corivo review` (deduped by assistant message text)

## Installation Path

Install via CLI:

```bash
corivo host install opencode
```

The CLI installs the runtime plugin file into `~/.config/opencode/plugins/`.
