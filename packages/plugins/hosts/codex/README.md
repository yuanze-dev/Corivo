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
corivo host install codex
```

The installer wires Codex global instructions and notify adapters. This package does not define a separate installation pipeline.

If the install is running in an interactive TTY and the host advertises `history-import`, the CLI asks whether to import existing history immediately. That import is opt-in confirmation only; it is not an implicit default. Non-interactive installs skip the prompt.

## History Import

Codex history import runs through the CLI:

```bash
corivo host import codex --all
```

- Default behavior: reuse the stored import cursor and run incrementally.
- First import: requires `--all` or `--since <cursor>` when no stored cursor exists yet.
- `--all`: bootstrap from detected Codex history and persist the next cursor.
- `--since <cursor>`: import from a specific cursor instead of the stored one.
- `--dry-run`: evaluate the import without persisting raw import results or cursor updates.

Codex currently distinguishes two non-success outcomes:

- Unavailable: no stable Codex history source was detected.
- Parse failure: history files exist, but no parseable Codex sessions were found.

## Hook Behavior

The Codex realtime ingest path is now intentionally lightweight. `hooks/scripts/ingest-turn.sh` handles the raw ingest for both `UserPromptSubmit` and `Stop` hook events by normalizing the payload and calling `corivo ingest-message`.

That path writes raw session/message data and ensures or refreshes an `extract-session` job for the memory pipeline. `user-prompt-submit.sh` remains the recall hook and `stop.sh` remains the follow-up/review hook; neither script performs direct semantic memory writes.

## Local Validation

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("packages/plugins/hosts/codex/.codex-plugin/plugin.json","utf8"))'
node -e 'JSON.parse(require("node:fs").readFileSync(".agents/plugins/marketplace.json","utf8"))'
```
