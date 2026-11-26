import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/cli/test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    benchmark: {
      include: ['packages/*/bench/**/*.bench.ts'],
    },
  },
});
