import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
});
