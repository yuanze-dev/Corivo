# Command Conventions

These command files are prompt templates for Codex app slash commands. Keep them deterministic and operationally useful.

## Required Sections

Every command file in this plugin should include:

1. `Preflight`
2. `Plan`
3. `Commands`
4. `Verification`
5. `Summary`
6. `Next Steps`

## Frontmatter

Every command file needs YAML frontmatter with a `description` field:

```yaml
---
description: One-line summary of what the command does.
---
```

## Command Style

- Prefer `corivo` CLI commands over ad-hoc shell logic.
- Always check whether `corivo` is installed and initialized before performing writes or reads.
- Use `--no-password` for non-interactive flows.
- Avoid echoing sensitive content such as secrets or raw private data unless the user asked for it.
- If a command writes memory, show the proposed annotation before executing the save.

## Naming

- Store user-invocable command files directly under `commands/`.
- Files prefixed with `_` are documentation-only and should not be treated as commands.
- Assume Codex will expose these commands with the plugin prefix, for example `/corivo:status`.
