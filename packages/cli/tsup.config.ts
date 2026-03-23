import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'engine/heartbeat': 'src/engine/heartbeat.ts',
    'service/index': 'src/service/index.ts',
    // Cold scan 模块
    'cold-scan/index': 'src/cold-scan/index.ts',
    'cold-scan/extractors/openclaw': 'src/cold-scan/extractors/openclaw.ts',
    // Ingestors
    'ingestors/openclaw-ingestor': 'src/ingestors/openclaw-ingestor.ts',
  },
  format: ['esm'],
  target: 'node18',
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['better-sqlite3'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
  },
});
