# @corivo/openclaw

OpenClaw realtime ingestor plugin for Corivo. It feeds conversation/event data from OpenClaw logs into the Corivo CLI runtime.

## Stability

- Status: `experimental`
- Scope: optional integration plugin
- Maturity notes: plugin interface and ingestion strategy may change as plugin architecture evolves

## What Is In This Package

- Plugin entry and exports for Corivo ingestion
- OpenClaw-specific ingestor implementation

## Local Development

From this directory:

```bash
npm install
npm run build
npm run typecheck
```

## Where To Look Next

- Plugin entry: `src/index.ts`
- Ingestor implementation: `src/ingestor.ts`
- Package constraints: `package.json` (peer dependency on `corivo`)

