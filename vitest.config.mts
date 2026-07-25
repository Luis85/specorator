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
      include: [
        'src/features/library/**/*.{ts,vue}',
        // Agent Board Vue island (store, useBoardEventRouting, vueIsland, and the
        // board/editor SFCs) — tested in this lane (~400 vue specs) and excluded
        // from Jest collection; gate its coverage here where it is exercised.
        'src/features/tasks/ui/vue/**/*.{ts,vue}',
        // Chat shell Vue island (store, useChatShellEventRouting, header/tab
        // strip/content-host SFCs) — tested in this lane and excluded from
        // Jest collection; gate its coverage here where it is exercised.
        'src/features/chat/ui/vue/**/*.{ts,vue}',
        // Marketplace Vue island (store, MarketplaceRoot/MarketplaceCard SFCs,
        // accessors) — tested in this lane and excluded from Jest collection
        // (jest.config.js); gate its coverage here where it is exercised.
        'src/features/marketplace/vue/**/*.{ts,vue}',
        // Team Chat Vue island (store, pinia, keys, callbacks, TeamChatRoot/
        // TeamRoster SFCs) — tested in this lane (tests/vue/teamChat) and
        // excluded from Jest collection (jest.config.js); gate its coverage here
        // where it is exercised.
        'src/features/teamChat/ui/vue/**/*.{ts,vue}',
        // Shared accessor/action modules whose meaningful exercise lives in
        // this lane: the loop accessors feed LoopsPanel, and the roster pair
        // is only function-covered by AgentsPanel tests (the legacy
        // AgentRosterView Jest test evaluates but barely calls them, and is
        // slated for deletion with the flag flip). skillLibraryRows stays
        // Jest-gated via tests/unit/features/skills/skillLibraryRows.test.ts.
        'src/features/tasks/loops/loopLibraryAccessors.ts',
        'src/features/agents/roster/rosterLibraryAccessors.ts',
        'src/features/agents/roster/rosterAgentActions.ts',
        // Shared Vue helpers (mountLucide, the Lucide function-ref host shared by
        // the board + marketplace islands) — tested in this lane and excluded
        // from Jest collection; gate its coverage here where it is exercised.
        'src/shared/vue/**/*.{ts,vue}',
      ],
      reportsDirectory: 'coverage-vue',
      // Regression floors, not aspirations (repo convention; see jest.config.js).
      // Locked 2026-07-02 (Task 13) a few points under the measured actuals:
      //   statements 92.38 / branches 79.00 / functions 94.70 / lines 97.05
      thresholds: { statements: 88, branches: 75, functions: 90, lines: 93 },
    },
  },
});
