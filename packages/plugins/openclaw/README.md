# @corivo/openclaw

OpenClaw executable runtime plugin for Corivo.

This package contains runtime ingestion code that processes OpenClaw events/logs and feeds them into the Corivo CLI runtime.

## Boundary

- Type: `runtime plugin`
- Plugin root: `packages/plugins/openclaw`
- Internal scope: executable runtime code only

If OpenClaw later gains host-facing install assets, they should live inside this plugin root.

## Runtime Scope

- Plugin entry and runtime exports
- OpenClaw-specific ingestor implementation

## Local Development

```bash
npm install
npm run build
npm run typecheck
```
