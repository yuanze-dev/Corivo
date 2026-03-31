# AGENTS.md

This file provides guidance when working on `@corivo/codex`.

## Package Overview

`@corivo/codex` is the Codex plugin package for Corivo. It packages Codex-facing assets rather than a runtime service:

- `.codex-plugin/plugin.json` for marketplace/install metadata
- `skills/` for reusable Corivo save/query workflows
- `commands/` for slash-command prompt templates
- `hooks/` for repo-local hook samples compatible with Codex hooks
- `assets/` for plugin presentation in Codex install surfaces

The actual memory runtime lives in the `corivo` CLI. This package does not talk to SQLite directly.

## Official Codex Boundaries

Per Codex plugin docs:

- Plugin manifests officially bundle `skills`, `.app.json`, `.mcp.json`, and `assets`
- Hooks are configured through `~/.codex/hooks.json` or `<repo>/.codex/hooks.json`
- Slash commands are a Codex app feature; this package ships command templates and install docs, not a separate runtime

Keep those boundaries intact. Do not add unsupported top-level fields to `plugin.json`.

## Directory Structure

```text
.codex-plugin/
  plugin.json
assets/
  corivo-icon.svg
  corivo-logo.svg
commands/
  _conventions.md
  init.md
  query.md
  save.md
  status.md
hooks/
  hooks.json
  scripts/
    session-init.sh
    user-prompt-submit.sh
    stop.sh
skills/
  corivo-query/SKILL.md
  corivo-save/SKILL.md
```

## Development Notes

- This package is markdown/config heavy and has no dedicated build step.
- Keep plugin paths relative and prefixed with `./` in `plugin.json`.
- Keep install-surface copy concise and user-facing.
- Hook scripts should be deterministic, fast, and safe to run repeatedly.
- If you change command or hook behavior, update `README.md` in the same change.
