import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'engine/heartbeat': 'src/engine/heartbeat.ts',
    'service/types': 'src/service/types.ts',
    'service/macos': 'src/service/macos.ts',
    'service/linux': 'src/service/linux.ts',
    'service/unsupported': 'src/service/unsupported.ts',
    'service/index': 'src/service/index.ts',
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
