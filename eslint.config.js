import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', '**/*.test.ts', 'node_modules/**']
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
  }
)
