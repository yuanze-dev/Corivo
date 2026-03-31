# Host Registry Installation Architecture

## Summary

Corivo now manages host integrations through a shared host registry instead of routing every host through bespoke CLI branching.

Two command surfaces now coexist:

- `corivo host ...` is the primary host-management interface
- `corivo inject ...` remains as a compatibility alias for older workflows

Both surfaces resolve to the same host install/doctor/uninstall use cases.

## Layers

### CLI surface

- `packages/cli/src/cli/commands/host.ts`
- `packages/cli/src/cli/commands/inject.ts`

These files are responsible for:

- parsing command-line flags
- selecting a host id
- rendering banners and success/failure output

They should not contain host-specific installation logic.

### Application use cases

- `packages/cli/src/application/hosts/install-host.ts`
- `packages/cli/src/application/hosts/doctor-host.ts`
- `packages/cli/src/application/hosts/uninstall-host.ts`

These use cases:

- resolve the adapter from the registry
- return structured results
- keep orchestration separate from terminal formatting

### Host registry and adapters

- `packages/cli/src/hosts/registry.ts`
- `packages/cli/src/hosts/adapters/*`

The registry provides built-in adapters for:

- `claude-code`
- `codex`
- `cursor`
- `opencode`
- `project-claude`

Adapters are intentionally thin. They delegate to host-local helper functions and do not own installation behavior themselves.

### Host-local install helpers

- `packages/cli/src/inject/codex-rules.ts`
- `packages/cli/src/inject/cursor-rules.ts`
- `packages/cli/src/inject/opencode-plugin.ts`
- `packages/cli/src/inject/claude-host.ts`
- `packages/cli/src/inject/claude-rules.ts`

These modules remain the concrete implementation layer for:

- file layout and path resolution
- install side effects
- doctor checks
- uninstall cleanup

## Why this split

This change keeps the CLI from expanding into host-specific branching while still preserving compatibility for existing `corivo inject ...` users.

Benefits:

- new hosts can be added by implementing a thin adapter and helper set
- `host` and `inject` now share the same orchestration path
- install/doctor/uninstall results use the same typed shape
- host-specific details stay local to the relevant helper module

## Compatibility notes

- `corivo inject --global --codex`
- `corivo inject --global --cursor`
- `corivo inject --global --opencode`
- `corivo inject --global --claude-code`
- `corivo inject`

still work, but they now dispatch through the host registry.

## Future work

- strengthen doctor integrity checks for weaker hosts such as OpenCode
- consider removing dead compatibility exports once callers are fully migrated
- document or split `packages/plugins/*` versus future runtime-focused `packages/hosts/*` if that boundary grows
