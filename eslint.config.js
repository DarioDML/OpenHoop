import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const portable = {
  files: ['packages/*/src/**/*.ts'],
  ignores: ['packages/core/src/node/**', 'packages/ble-node/**'],
  rules: {
    'no-restricted-globals': ['error', 'Buffer', 'process', 'TextEncoder', 'TextDecoder', '__dirname', '__filename'],
    'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'crypto', 'zlib'], message: 'packages must stay bundleable by Metro; put Node-only code behind a /node subpath' }] }],
  },
};

const mobileReact = {
  files: ['apps/mobile/**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'no-control-regex': 'off',
  },
};

const mobileCommonJs = {
  files: ['apps/mobile/**/*.js'],
  languageOptions: {
    sourceType: 'commonjs',
    globals: { require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly', Buffer: 'readonly' },
  },
  rules: {
    '@typescript-eslint/no-require-imports': 'off',
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'openhoop-data/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/mobile/.expo/**',
      'apps/mobile/expo-env.d.ts',
    ],
  },
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
  mobileReact,
  mobileCommonJs,
);
