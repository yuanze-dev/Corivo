# @corivo/openclaw

OpenClaw executable runtime plugin for Corivo.

This package contains runtime ingestion code that processes OpenClaw events/logs and feeds them into the Corivo CLI runtime.

## Boundary

- Type: `runtime plugin`
- Directory model: `packages/plugins/runtime/*`
- Not this package: host integration bundle assets

If a change is host installation metadata/hooks/templates, it belongs in `packages/plugins/hosts/*`.

## Runtime Scope

- Plugin entry and runtime exports
- OpenClaw-specific ingestor implementation

## Local Development

```bash
npm install
npm run build
npm run typecheck
```
