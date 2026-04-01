import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'engine/heartbeat': 'src/engine/heartbeat.ts',
    'service/index': 'src/service/index.ts',
    'cold-scan/index': 'src/cold-scan/index.ts',
    'cold-scan/extractors/openclaw': 'src/cold-scan/extractors/openclaw.ts',
  },
  format: 'esm',
  target: 'node18',
  unbundle: true,
  hash: false,
  outExtensions: () => ({
    js: '.js',
    dts: '.d.ts',
  }),
  sourcemap: true,
  clean: true,
  dts: true,
  deps: {
    neverBundle: ['better-sqlite3'],
  },
  onSuccess: 'node scripts/copy-host-assets.mjs',
});
