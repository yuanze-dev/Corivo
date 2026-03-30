# @corivo/codex

Codex-oriented plugin assets for Corivo. This package currently contains the prompt and skill content used to save to and query from the local Corivo memory runtime during Codex sessions.

## Stability

- Status: `experimental`
- Scope: optional integration package
- Maturity notes: packaging and installation flow may continue to change as Codex plugin conventions evolve

## What Is In This Package

- Codex-facing save/query skill content
- Documentation and prompt assets for connecting Codex to local Corivo memory

## Local Development

This package is currently markdown-first and does not define a dedicated build script.

- Edit the package files directly
- Validate behavior through a local Codex setup plus the main `corivo` CLI runtime

## Where To Look Next

- Package metadata: `package.json`
- Skill content: `skills/SAVE.md`, `skills/QUERY.md`
- Repository-level setup and context: root `README.md`
