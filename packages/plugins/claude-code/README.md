# @corivo/claude-code

Claude Code integration package for Corivo. It provides skills, hook scripts, and command docs that connect Claude Code events to the local `corivo` CLI runtime.

## Stability

- Status: `beta`
- Scope: primary AI-tool integration package
- Maturity notes: hook flow and prompt contracts may evolve with Claude Code and Corivo runtime changes

## What Is In This Package

- Runtime hook configuration (`hooks/hooks.json`)
- Hook scripts for ingest, recall, carry-over, and review flows
- Skill prompts for save/query behaviors
- Plugin command docs (`commands/`)

## Local Development

This package is mainly configuration, scripts, and markdown assets.

- No dedicated build script is currently defined in `package.json`
- Iterate by editing package files and validating behavior through the main `corivo` CLI runtime

## Where To Look Next

- Hook config: `hooks/hooks.json`
- Hook scripts: `hooks/scripts/`
- Skills: `skills/corivo-save/skill.md`, `skills/corivo-query/skill.md`
- Plugin command docs: `commands/`
- Example usage: `EXAMPLES.md`
