import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vue-surface test lane. Scope is EXCLUSIVE with Jest: Vitest only sees
// tests/vue/**, Jest only sees tests/{unit,integration,perf}/** — the two
// runners never overlap (docs/superpowers/specs/2026-07-01-... § test concept).
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Reuse the shared Jest-flavored obsidian fake; tests/vue/setup.ts
      // aliases the `jest` global to `vi` before any test imports it.
      obsidian: fileURLToPath(new URL('./tests/__mocks__/obsidian.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@test': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/vue/setup.ts'],
    include: ['tests/vue/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/features/library/**/*.{ts,vue}'],
      reportsDirectory: 'coverage-vue',
      // Regression floors, not aspirations (repo convention). Provisional until
      // Task 13 re-measures and locks them a few points under actuals; dormant
      // (0/0 passes) until Task 7 lands the first library file.
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
});
