# @corivo/cursor

Cursor host integration bundle for Corivo.

This package contains Cursor-facing integration assets and hook scripts consumed by the CLI installer.

## Boundary

- Type: `host integration bundle`
- Directory model: `packages/plugins/hosts/*`
- Not this package: executable runtime plugin code

## Lifecycle Mapping (Host Hooks)

- `SessionStart` -> `session-carry-over.sh`
- `UserPromptSubmit` -> `prompt-recall.sh`
- `Stop` -> `stop-review.sh`

Each script delegates to CLI commands (`corivo carry-over`, `corivo recall`, `corivo review`).

## Installation Path

Install through the single CLI path:

```bash
corivo inject --global --cursor
```

The CLI writes global rules, installs hook scripts, and updates Cursor settings/permissions. This bundle does not define a separate installation flow.
