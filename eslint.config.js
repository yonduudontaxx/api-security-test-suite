import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'playwright-report', 'test-results', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**', 'tests/support/upstream-stub.ts', 'src/server.ts'],
    rules: { 'no-console': 'off' },
  },
);
