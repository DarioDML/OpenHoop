import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const portable = {
  files: ['packages/*/src/**/*.ts'],
  ignores: ['packages/core/src/node/**', 'packages/ble-node/**'],
  rules: {
    'no-restricted-globals': ['error', 'Buffer', 'process', 'TextEncoder', 'TextDecoder', '__dirname', '__filename'],
    'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'crypto', 'zlib'], message: 'packages must stay bundleable by Metro; put Node-only code behind a /node subpath' }] }],
  },
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', 'apps/mobile/**', '**/dist/**', 'stoop-data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  portable,
);
