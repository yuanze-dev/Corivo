import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        'packages/cli/__tests__/**',
        'packages/cli/src/cli/commands/**' // CLI commands mainly handle I/O
      ],
      // MVP 覆盖率目标
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
})
