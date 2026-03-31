import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/cli/src')
    }
  },
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
      // MVP coverage goals
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
})
