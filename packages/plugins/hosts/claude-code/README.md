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
corivo host install claude-code
```

No separate installer is defined in this package.

If installation runs in an interactive TTY and the adapter supports `history-import`, the CLI asks whether to import existing conversation history immediately. That import is explicit confirmation only. Non-interactive installs skip the prompt and do not auto-import.

## History Import

Claude Code history import runs through the CLI:

```bash
corivo host import claude-code --all
```

- Default behavior: reuse the stored import cursor and run incrementally.
- First import: requires `--all` or `--since <cursor>` when no stored cursor exists yet.
- `--all`: bootstrap from the full available history.
- `--since <cursor>`: import from the supplied cursor instead of the stored one.
- `--dry-run`: runs the import without persisting imported raw data or updating the cursor.

## Hook Behavior

The realtime Claude Code hooks now do fast raw ingest only. `hooks/scripts/ingest-turn.sh` normalizes the user or assistant payload and pipes it into `corivo ingest-message`.

That command stores raw session/message records and enqueues an `extract-session` job for later pipeline processing. Semantic memory extraction is asynchronous and no longer happens directly inside the shell hook.

## Local Development

This is a host asset bundle (scripts + markdown + config). Validate behavior through CLI-driven integration flows.
