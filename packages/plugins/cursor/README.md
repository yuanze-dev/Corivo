# Corivo for Cursor

Active memory adapter for Cursor using the same lifecycle shape as the Claude Code integration.

## Hook Flow

- `SessionStart` -> `session-carry-over.sh`
- `UserPromptSubmit` -> `prompt-recall.sh`
- `Stop` -> `stop-review.sh`

Each script delegates to the Corivo CLI runtime:

- `corivo carry-over`
- `corivo recall`
- `corivo review`

The returned payload uses `hook-text` so adopted memories can be attributed as coming from Corivo.
