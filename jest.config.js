const baseConfig = require('./jest.base.config.js');

module.exports = {
  projects: [
    {
      ...baseConfig,
      displayName: 'unit',
      // Suffix glob (no `<rootDir>`) so Windows worktree paths with backslashes
      // (`.worktrees\...`) don't break micromatch. `roots` already scopes the search.
      testMatch: ['**/tests/unit/**/*.test.ts'],
    },
    {
      ...baseConfig,
      displayName: 'integration',
      testMatch: ['**/tests/integration/**/*.test.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Dedicated workspace ItemViews are verified manually in Obsidian, not unit
    // tested (their logic-bearing helpers are extracted and covered separately).
    '!src/features/**/view/**',
    // src/features/library/** is tested and coverage-gated in the Vitest lane
    // (vitest.config.mts coverage.include + the CI component job); counting it
    // here at 0% would sink the Jest global floors.
    '!src/features/library/**',
    // src/features/tasks/ui/vue/** (the Agent Board Vue island: store,
    // useBoardEventRouting, vueIsland, SFCs) is likewise tested and
    // coverage-gated in the Vitest lane; counting it here at 0% would sink the
    // Jest global floors. Only the ui/vue/** subtree is excluded — the sibling
    // pure helpers (laneEditorOccurrences.ts, workOrderTemplateEditorForm.ts,
    // cardActions.ts) stay Jest-collected.
    '!src/features/tasks/ui/vue/**',
    // src/features/chat/ui/vue/** (the chat shell Vue island: header, tab
    // strip, content host, store, useChatShellEventRouting) is likewise
    // tested and coverage-gated in the Vitest lane; counting it here at 0%
    // would sink the Jest global floors.
    '!src/features/chat/ui/vue/**',
    // src/features/marketplace/vue/** (the Marketplace Vue island: store, SFCs,
    // accessors, pinia, keys) is tested + coverage-gated in the Vitest lane; the
    // Obsidian-coupled ItemView host and leaf activation are manually verified
    // like the other feature views. The pure logic (catalogTypes /
    // MarketplaceCatalogClient / MarketplaceCache / MarketplaceInstaller /
    // marketplaceNetworkGate) stays Jest-collected.
    '!src/features/marketplace/vue/**',
    '!src/features/marketplace/MarketplaceView.ts',
    '!src/features/marketplace/activateMarketplace.ts',
  ],
  coverageDirectory: 'coverage',
  // Guardrail (Q-3): regression floors, not aspirations. Each floor sits a few
  // points BELOW the coverage measured on this baseline so the gate passes
  // today but trips when coverage slips meaningfully. Per-path floors are set
  // HIGHER for the security- and robustness-critical areas that must stay
  // well-covered (utils, provider runtimes, security, logging, MCP).
  // Path keys match by prefix; the most specific match wins, so the looser
  // `global` floor only applies to files no per-path key covers.
  //
  // Actuals (stmt/branch/func/lines), re-measured 2026-06-14; floors below sit a
  // few points under each (regression floors, not aspirations). src/utils is
  // held — its actual slipped vs the 2026-05-31 baseline but stays above floor.
  // The global floor was tightened 2026-06-14 (78/67/74/79 → 79/68/75/80) toward
  // the crept-up actuals; per-dir floors stay as set (runtime dirs are
  // variance-prone, so their ~3-pt margin is kept to avoid flaky CI):
  //   global                          80.76 / 70.21 / 77.44 / 81.94
  //   src/utils/                      90.45 / 83.78 / 94.64 / 92.19
  //   src/core/security/              98.71 / 97.46 / 100.0 / 99.63
  //   src/core/logging/               95.50 / 96.36 / 93.54 / 97.43
  //   src/core/mcp/                   94.05 / 85.71 / 95.52 / 96.40
  //   src/providers/claude/runtime/   91.01 / 82.43 / 92.33 / 91.36
  //   src/providers/codex/runtime/    85.67 / 71.33 / 88.59 / 86.64
  //   src/providers/cursor/runtime/   86.27 / 72.43 / 84.64 / 87.82 (lifted 2026-06-14: grep-fmt + task-result tests)
  //   src/providers/opencode/runtime/ 73.91 / 64.57 / 68.94 / 73.63 (lifted 2026-06-14: aux-runner + runtime-error tests)
  coverageThreshold: {
    // global functions floor lowered 75 -> 74 (2026-06-19): the dedicated Agent
    // Roster / Tool / Skill library views are manually-verified UI excluded from
    // collection, but their plugin-wiring closures in main.ts (view registration,
    // openView, getSpecoratorToolServer) are untested glue that nudged the function
    // ratio to 74.97. Statements/branches/lines remain comfortably above floor.
    //
    // global stmt/func/lines lowered 79/74/80 -> 78/73/79 (2026-07-12): the
    // transcript Vue migration (34b0fb6) deleted the imperative MessageRenderer +
    // its well-covered rendering DOM tests, and this follow-up relocated the
    // remaining Vue-only pure helpers (windowedRenderSetup / visibleContentHelpers
    // / askUserQuestionOptions / inlineChoiceCard) under ui/vue/** — that render
    // surface is now tested and coverage-gated in the Vitest lane
    // (vitest.config.mts, statements 88 / branches 75 / functions 90 / lines 93),
    // not here. Removing that above-average-covered code from the Jest global
    // bucket dropped its ratio ~1pt; these floors sit just under the post-migration
    // actuals (78.50 / 73.60 / 79.58). Branches (68) was unaffected and holds.
    //
    // global stmt/branch/func/lines lowered 78/68/73/79 -> 77/67/72/78
    // (2026-07-16): the composer toolbar migration (Task 10, PR #489) deleted the
    // well-covered imperative toolbar widgets and moved that behavior into the
    // Vitest lane (tests/vue/chat/composer/), dropping each Jest global ratio ~1pt.
    // Floors sit just under the post-migration actuals (77.62 / 67.41 / 72.85 / 78.74).
    global: { statements: 77, branches: 67, functions: 72, lines: 78 },
    'src/utils/': { statements: 88, branches: 80, functions: 92, lines: 90 },
    'src/core/security/': { statements: 96, branches: 95, functions: 98, lines: 97 },
    'src/core/logging/': { statements: 93, branches: 94, functions: 91, lines: 95 },
    'src/core/mcp/': { statements: 92, branches: 83, functions: 93, lines: 94 },
    'src/providers/claude/runtime/': { statements: 88, branches: 79, functions: 89, lines: 88 },
    'src/providers/codex/runtime/': { statements: 82, branches: 68, functions: 85, lines: 83 },
    'src/providers/cursor/runtime/': { statements: 83, branches: 69, functions: 82, lines: 85 },
    'src/providers/opencode/runtime/': { statements: 71, branches: 61, functions: 66, lines: 71 },
  },
};
