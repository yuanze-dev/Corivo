# @corivo/opencode

OpenCode plugin for Corivo.

This package combines the OpenCode runtime plugin implementation with the packaged asset that `corivo host install opencode` installs into the OpenCode plugin directory.

## Boundary

- Type: `plugin root`
- Plugin root: `packages/plugins/opencode`
- Internal scopes:
  - `src/` and `scripts/` contain executable runtime code
  - `assets/corivo.ts` is the packaged install asset consumed by the CLI installer

OpenCode no longer uses a separate top-level host/runtime split in the repository. The plugin root owns both concerns.

## Lifecycle Mapping

- `session.created` -> `corivo carry-over`
- `chat.message` -> `corivo recall`
- `message.updated` / `session.idle` -> `corivo review` (deduped by assistant message text)

## Installation Path

Install via CLI:

```bash
corivo host install opencode
```

The CLI installs the packaged plugin file from `packages/plugins/opencode/assets/corivo.ts` into `~/.config/opencode/plugins/`.
