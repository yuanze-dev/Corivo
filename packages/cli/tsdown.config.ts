import { defineConfig } from 'tsdown';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'cli/run': 'src/cli/run.ts',
    'runtime/daemon/heartbeat': 'src/runtime/daemon/heartbeat.ts',
    'service/index': 'src/infrastructure/platform/index.ts',
    'infrastructure/cold-scan/index': 'src/infrastructure/cold-scan/index.ts',
    'infrastructure/cold-scan/extractors/openclaw': 'src/infrastructure/cold-scan/extractors/openclaw.ts',
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
