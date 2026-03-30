# @corivo/codex

Codex plugin assets for Corivo. This package is structured to match Codex's current plugin model: a `.codex-plugin/plugin.json` manifest, bundled `skills/`, install-surface `assets/`, slash-command templates in `commands/`, and repo-local hook samples in `hooks/`.

## What this package includes

- `.codex-plugin/plugin.json` for Codex marketplace metadata
- `skills/corivo-save/SKILL.md` and `skills/corivo-query/SKILL.md`
- `commands/` prompt templates for common Corivo slash commands
- `hooks/` sample Codex hook config and scripts
- `assets/` for plugin card and composer presentation
- Repo marketplace entry at [`/.agents/plugins/marketplace.json`](/Users/airbo/Developer/corivo/Corivo/.agents/plugins/marketplace.json)

## Codex compatibility

This package follows the current Codex plugin docs:

- Plugins officially package `skills`, optional `.app.json`, optional `.mcp.json`, and `assets`
- Plugin discovery happens through a marketplace file at `/.agents/plugins/marketplace.json` or `~/.agents/plugins/marketplace.json`
- Hooks are configured separately through `~/.codex/hooks.json` or `<repo>/.codex/hooks.json`
- Slash commands are a Codex app feature; this package ships reusable command templates for that flow

That means `hooks/` is intentionally shipped as an installable sample instead of being referenced from `plugin.json`.

## Install in this repo

1. Restart Codex after pulling this branch.
2. Open the plugin directory and select the `Corivo Local Plugins` marketplace.
3. Install the `Corivo` plugin.

This repo marketplace points directly at `./packages/plugins/codex`, which is allowed because Codex resolves `source.path` relative to the marketplace root.

## Optional repo-local hooks

Codex loads hooks from `<repo>/.codex/hooks.json`, not from the plugin manifest. To enable the sample hooks in this repo:

1. Create `.codex/hooks.json` in the repo root.
2. Copy the contents of `packages/plugins/codex/hooks/hooks.json` into it.
3. Enable hooks in `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

The sample hooks do three things:

- `SessionStart`: summarize Corivo readiness
- `UserPromptSubmit`: run a light recall against the current prompt
- `Stop`: nudge Codex to save durable memory if it promised to "remember" something without using Corivo

## Slash command templates

The `commands/` directory contains reusable command docs for:

- `/corivo:init`
- `/corivo:status`
- `/corivo:save`
- `/corivo:query`

These files mirror the command style used in Codex example plugins: preflight checks, command plan, verification, and next steps.

## Local development

This package is configuration and markdown heavy. There is no dedicated build step.

Useful checks:

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("packages/plugins/codex/.codex-plugin/plugin.json","utf8"))'
node -e 'JSON.parse(require("node:fs").readFileSync(".agents/plugins/marketplace.json","utf8"))'
```

## Publishing note

Codex's official public plugin publishing flow is not generally open yet. What this package does provide today is:

- a valid local marketplace manifest
- a publishable plugin manifest structure
- install-surface assets and metadata
- repo-ready hooks and command templates

If you later want a separate public packaging repo, you can move or copy this package to a dedicated plugin root without changing the internal structure.
