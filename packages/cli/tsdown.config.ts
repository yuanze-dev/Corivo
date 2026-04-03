import { defineConfig } from 'tsdown';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'engine/heartbeat': 'src/engine/heartbeat.ts',
    'service/index': 'src/infrastructure/platform/index.ts',
    'cold-scan/index': 'src/cold-scan/index.ts',
    'cold-scan/extractors/openclaw': 'src/cold-scan/extractors/openclaw.ts',
  },
  format: 'esm',
  target: 'node18',
  unbundle: false,
  minify: isProd,
  treeshake: true,
  hash: false,
  clean: true,
  dts: true,
  sourcemap: !isProd,
  outExtensions: () => ({
    js: '.js',
    dts: '.d.ts',
  }),
  deps: {
    neverBundle: ['better-sqlite3'],
  },
});
