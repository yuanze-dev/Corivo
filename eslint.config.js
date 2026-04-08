import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', '**/dist/**', '**/*.test.ts', 'node_modules/**']
  },
  {
    files: ['packages/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    files: ['packages/cli/src/domain/**/*.ts'],
    ignores: [
      'packages/cli/src/domain/memory/models/index.ts',
      'packages/cli/src/domain/memory/providers/local-memory-provider.ts',
      'packages/cli/src/domain/memory/providers/supermemory-provider.ts',
      'packages/cli/src/domain/memory/providers/types.ts',
      'packages/cli/src/domain/memory/services/follow-up.ts',
      'packages/cli/src/domain/memory/services/query-history.ts',
      'packages/cli/src/domain/memory/services/trigger-decision.ts'
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/cli/**'], message: 'domain layer must not depend on cli modules' },
          { group: ['@/runtime/**'], message: 'domain layer must not depend on runtime modules' },
          { group: ['@/infrastructure/**'], message: 'domain layer must not depend on infrastructure modules' }
        ]
      }]
    }
  },
  {
    files: ['packages/cli/src/application/**/*.ts'],
    ignores: [
      'packages/cli/src/application/bootstrap/create-cli-app.ts',
      'packages/cli/src/application/bootstrap/query-execution.ts',
      'packages/cli/src/application/carry-over/run-carry-over.ts',
      'packages/cli/src/application/hosts/bridge-host-event.ts',
      'packages/cli/src/application/query/generate-raw-recall.ts',
      'packages/cli/src/application/query/generate-recall.ts',
      'packages/cli/src/application/query/provider-recall.ts',
      'packages/cli/src/application/review/run-review.ts'
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/cli/**'], message: 'application layer must not depend on cli modules outside the composition root' },
          { group: ['@/runtime/**'], message: 'application layer must not depend on runtime modules' }
        ]
      }]
    }
  },
  {
    files: ['packages/cli/src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/cli/**'], message: 'infrastructure layer must not depend on cli modules' }
        ]
      }]
    }
  }
)
