# Corivo for Cursor

Active memory adapter for Cursor using a hybrid install:

- global Cursor rules for model-driven `carry-over / recall / review`
- native Cursor hook wiring for `SessionStart / UserPromptSubmit / Stop`
- CLI permission allowlist so Cursor can run `corivo`

## Lifecycle Flow

- `SessionStart` -> `session-carry-over.sh`
- `UserPromptSubmit` -> `prompt-recall.sh`
- `Stop` -> `stop-review.sh`

Each script delegates to the Corivo CLI runtime:

- `corivo carry-over`
- `corivo recall`
- `corivo review`

The returned payload uses `hook-text` so adopted memories can be attributed as coming from Corivo.

## Installation

```bash
corivo inject --global --cursor
```

This writes the global `corivo.mdc` rule file, installs the Corivo hook scripts under
`~/.cursor/corivo/`, updates `~/.cursor/settings.json` with the three lifecycle hooks, and
ensures Cursor CLI permissions allow `Shell(corivo)`.
