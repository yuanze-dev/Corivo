import tseslint from 'typescript-eslint'
import tsEslint from '@typescript-eslint/eslint-plugin'

export default [
  {
    ignores: ['dist/**', '**/*.test.ts', 'node_modules/**']
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  }
]
