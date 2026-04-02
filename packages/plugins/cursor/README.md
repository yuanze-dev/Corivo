# @corivo/cursor

Cursor host integration bundle for Corivo.

This package contains Cursor-facing integration assets and hook scripts consumed by the CLI installer.

## Boundary

- Type: `host integration bundle`
- Plugin root: `packages/plugins/cursor`
- Internal scope: host-facing assets only

## Lifecycle Mapping (Host Hooks)

- `SessionStart` -> `session-carry-over.sh`
- `UserPromptSubmit` -> `prompt-recall.sh`
- `Stop` -> `stop-review.sh`

Each script delegates to CLI commands (`corivo carry-over`, `corivo recall`, `corivo review`).

## Installation Path

Install through the single CLI path:

```bash
corivo host install cursor
```

The CLI writes global rules, installs hook scripts, and updates Cursor settings/permissions. This bundle does not define a separate installation flow.
