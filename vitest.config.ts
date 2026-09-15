import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Test integrasi memakai satu database bersama: jalankan berurutan
    fileParallelism: false,
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
  },
})
