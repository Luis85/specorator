---
title: "Vue 3 + Pinia harness and unified Library pilot — implementation plan"
date: 2026-07-01
status: draft
scope: build, tooling, testing, features/library, features/agents/roster, features/skills, features/tasks/loops, shared, app/views
---

# Vue 3 + Pinia Harness and Unified Library Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vue 3 + Pinia + Vitest development/quality harness (build, lint, typecheck, tests, CI) that extends every existing gate, and prove it by migrating the three library views (Loops, Skills, Agents) into one unified, feature-flagged Vue `LibraryView`.

**Architecture:** Vue mounts as an island per Obsidian leaf (`createApp` in `ItemView.onOpen`, `unmount()` + `contentEl.empty()` in `onClose`). One module-singleton Pinia carries three global setup stores that wrap the existing services (`LoopNoteStore`, `VaultSkillAggregator`, `AgentRosterStore`) — I/O stays in services, stores orchestrate. A reactive `activeTab` ref (provided into the tree; NO vue-router) switches three panel SFCs. Legacy views stay registered; a `useVueLibrary` flag (default off) flips ribbon/command targets and makes legacy leaves self-migrate. Editor modals and prompt flows stay imperative and are invoked from Vue handlers.

**Tech Stack:** vue 3.5, pinia 3, unplugin-vue/esbuild (build), vue-tsc (typecheck), eslint-plugin-vue (lint), Vitest 4 + @vitejs/plugin-vue + jsdom + @testing-library/vue + @vue/test-utils (tests; @pinia/testing dropped: never imported — tests use real pinia + service fakes). Jest stays untouched for all existing suites.

**Spec:** `docs/superpowers/specs/2026-07-01-vue3-pinia-library-harness-design.md`
**Research:** `docs/research/2026-07-01-vue3-pinia-frontend-refactor-research.md`

**Empirically verified in a spike before this plan was written** (throwaway in `.context/vue-spike/`, git-ignored):
- esbuild 0.28 + `unplugin-vue/esbuild` (option `sourceMap: false` is REQUIRED — the default `true` makes esbuild's CSS loader fail with "Unknown word sourceMappingURL") compiles `<script setup lang="ts">` + scoped styles. Scoped CSS is EXTRACTED to a sibling `main.css` (`data-v-*` attrs correct in both JS and CSS). The bundle contains no `eval`, no `new Function`, no runtime template compiler.
- Vitest 4.1.9 + @vitejs/plugin-vue + jsdom renders SFCs; Pinia setup stores work with `setActivePinia`; the EXISTING `tests/__mocks__/obsidian.ts` (which calls `jest.fn()` at module scope) works under Vitest via `resolve.alias` + a one-line `globalThis.jest = vi` setup shim — `vi.isMockFunction(setIcon)` is true and call assertions work.
- Registry versions checked 2026-07-01: vue 3.5.39, pinia 3.0.4, unplugin-vue 7.2.0, vue-tsc 3.3.6 (peer TS >=5 — repo has TS 6.0.2 ✓), eslint-plugin-vue 10.9.2 (peer eslint ^10 ✓), vitest 4.1.9 (vite ^8 is a REQUIRED peer), @vitejs/plugin-vue 6.0.7, @vue/test-utils 2.4.11, @testing-library/vue 8.1.0, jsdom 29.1.1.

---

## File structure

New files:

```
src/features/library/
  viewType.ts                    — VIEW_TYPE_LIBRARY, LibraryTab type, tab↔legacy-view-type map
  LibraryView.ts                 — ItemView host: per-leaf Vue app, flag redirect, state persistence
  activateLibrary.ts             — workspace helper (open/reveal + setActiveTab)
  vue/
    libraryKeys.ts               — typed InjectionKeys (plugin, view, activeTab)
    globalPinia.ts               — module-singleton Pinia (reset hook for tests)
    LibraryRoot.vue                  — root: tab nav + active panel
    useLibraryList.ts            — reactive search/sort/filter (wraps pure engine)
    components/
      LibraryToolbar.vue         — search input + sort select + filter chips
      LibraryCard.vue            — interactive card scaffold (role=button, slots)
      LibraryEmptyState.vue      — icon + message + optional CTA
    panels/
      LoopsPanel.vue
      SkillsPanel.vue
      AgentsPanel.vue
    stores/
      loopLibraryStore.ts        — useLoopLibraryStore (wraps LoopNoteStore)
      skillLibraryStore.ts       — useSkillLibraryStore (wraps VaultSkillAggregator)
      rosterStore.ts             — useRosterStore (wraps plugin.agentRosterStore)
src/vue-shims.d.ts               — declare module '*.vue'
src/features/skills/skillCloning.ts — isCloneableSkillPath + skillTemplate extracted from the view (shared with Vue panel)
tsconfig.vue.json                — vue-tsc project (src .ts+.vue + tests/vue)
vitest.config.mts                — Vitest project (tests/vue lane only)
tests/vue/
  setup.ts                       — globalThis.jest = vi shim
  fixtures/HarnessProbe.vue      — permanent harness canary SFC
  harness.test.ts
  useLibraryList.test.ts
  libraryView.test.ts
  libraryView.leak.test.ts
  components/libraryToolbar.test.ts
  components/libraryCard.test.ts
  panels/loopsPanel.test.ts
  panels/skillsPanel.test.ts
  panels/agentsPanel.test.ts
  stores/loopLibraryStore.test.ts
  stores/skillLibraryStore.test.ts
  stores/rosterStore.test.ts
```

Modified files:

```
package.json                     — deps + scripts (test:vue*, typecheck:vue), lint glob
esbuild.config.mjs               — unplugin-vue plugin, Vue define flags, merge-vue-sfc-styles plugin
eslint.config.mjs                — eslint-plugin-vue flat configs + .vue TS parser block + no-v-html
scripts/check-loc.mjs            — count .vue alongside .ts
.github/workflows/ci.yml         — typecheck job gains vue-tsc step; new component job
src/core/types/settings.ts       — useVueLibrary flag
src/app/settings/defaultSettings.ts — useVueLibrary: false
src/features/settings/registry/fields/general.ts — toggle field
src/i18n/types/settings.ts       — settings.useVueLibrary.* keys
src/i18n/types/toolLibrary.ts    — library.viewTitle key
src/i18n/locales/*.json (10)     — new strings
src/app/views/registerPluginViews.ts — register LibraryView, flag-aware ribbons + roster/skill commands
src/app/commands/registerPluginCommands.ts — make the EXISTING open-loop-library command flag-aware
src/shared/libraryToolbar.ts     — extract pure applyLibraryQuery/collectLibraryTags (behavior-preserving)
src/features/agents/roster/view/AgentRosterView.ts — 3-line flag redirect in onOpen
src/features/skills/view/SkillLibraryView.ts       — 3-line flag redirect + import from skillCloning.ts
src/features/tasks/ui/LoopLibraryView.ts           — 3-line flag redirect in onOpen
scripts/check-artifacts.mjs      — bundle marker smoke for compiled Vue
CLAUDE.md                        — features/library row in architecture table
```

Conventions that apply to ALL tasks:
- Imports inside `src/` use RELATIVE paths (repo style). Tests may use `@/` (Jest maps it; Vitest alias added in Task 3).
- All user-visible strings go through `t('key')`. New keys are added to the i18n type unions AND all 10 locale files (`de, en, es, fr, ja, ko, pt, ru, zh-CN, zh-TW`).
- No `v-html` anywhere. No `console.*` in src. DOM classes reuse the existing `specorator-library-*` CSS (already in `styles.css`) — expect ZERO new CSS in this plan.
- Run `git add <files> && git commit` after every green step as shown; commit messages follow the repo's conventional style.
- After creating any new `.ts` file, run `npm run lint:fix` before committing — `simple-import-sort` autofixes import ordering, which the code blocks in this plan do not guarantee.
- `npm run test -- --selectProjects unit` etc. must stay green — legacy suites are never edited except where a task says so.

---

### Task 1: Dependencies + esbuild Vue wiring

**Files:**
- Modify: `package.json`
- Modify: `esbuild.config.mjs`

- [ ] **Step 1.1: Install dependencies (exact versions)**

```bash
npm install vue@^3.5.39 pinia@^3.0.4
npm install -D unplugin-vue@^7.2.0 vue-tsc@^3.3.6 eslint-plugin-vue@^10.9.2 vue-eslint-parser@^10.4.1 \
  vitest@^4.1.9 vite@^8.1.2 @vitejs/plugin-vue@^6.0.7 jsdom@^29.1.1 \
  @vue/test-utils@^2.4.11 @testing-library/vue@^8.1.0 \
  @vitest/coverage-v8@^4.1.9
```

Expected: package.json gains `vue`/`pinia` under dependencies, the rest under devDependencies. `vite` is a REQUIRED peer of vitest 4 — do not omit it. `vue-eslint-parser` is a required PEER of eslint-plugin-vue (npm auto-installs it, but only into the lockfile) — declare it explicitly so Task 4's parser is a first-class pinned dep. Do NOT install `@vue/eslint-config-typescript` (we wire the parser manually in Task 4; the helper wraps the whole config and doesn't fit the repo's hand-rolled flat config). Do NOT install `esbuild-plugin-vue3` (rejected: unmaintained peers — cheerio/pug/sass — and the spike proved unplugin-vue).

- [ ] **Step 1.2: Wire unplugin-vue + Vue feature flags + CSS merge into esbuild.config.mjs**

Three edits to `esbuild.config.mjs`:

(a) Add imports near the top (after the existing imports, line ~14):

```js
import VuePlugin from 'unplugin-vue/esbuild';
```

(b) Add the style-merge plugin definition after the `copyToObsidian` const (after line ~134). The spike proved SFC `<style>` blocks are EXTRACTED by esbuild into a sibling `main.css`; Obsidian only loads `styles.css`, so this plugin folds `main.css` into `styles.css` under an idempotent marker (replace-not-append, so watch-mode rebuilds don't duplicate):

```js
// SFC <style> blocks are extracted by esbuild into main.css (sibling of the JS
// entry). Obsidian only auto-loads styles.css, so fold the emitted CSS into it
// under a marker section. Replacing everything after the marker keeps repeated
// watch-mode rebuilds idempotent. Runs BEFORE copyToObsidian (plugin order) so
// the copied styles.css already carries the Vue styles.
const VUE_STYLES_MARKER = '\n/* == vue-sfc-styles (generated by esbuild; do not edit — see esbuild.config.mjs) == */\n';
const mergeVueSfcStyles = {
  name: 'merge-vue-sfc-styles',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      const cssPath = path.join(process.cwd(), 'main.css');
      if (!existsSync(cssPath)) return;
      let vueCss = await fsPromises.readFile(cssPath, 'utf8');
      rmSync(cssPath, { force: true });
      rmSync(`${cssPath}.map`, { force: true });
      if (prod) {
        const minified = await esbuild.transform(vueCss, {
          loader: 'css',
          minify: true,
          legalComments: 'none',
        });
        vueCss = minified.code;
      }
      const stylesPath = path.join(process.cwd(), 'styles.css');
      const base = existsSync(stylesPath)
        ? await fsPromises.readFile(stylesPath, 'utf8')
        : '';
      const markerIdx = base.indexOf(VUE_STYLES_MARKER);
      const kept = markerIdx === -1 ? base : base.slice(0, markerIdx);
      await fsPromises.writeFile(stylesPath, kept + VUE_STYLES_MARKER + vueCss, 'utf8');
    });
  },
};
```

(c) In the `esbuild.context({...})` call: replace the `plugins` line and add `define`. `sourceMap: false` is load-bearing (see spike note at top). Plugin order matters: `mergeVueSfcStyles` MUST precede `copyToObsidian` (onEnd hooks run in registration order).

```js
  plugins: [
    patchSdkImportMeta,
    VuePlugin({ isProduction: prod, sourceMap: false }),
    mergeVueSfcStyles,
    patchRendererUnsafeUnref,
    copyToObsidian,
  ],
  define: {
    // Vue compile-time flags (https://vuejs.org/api/compile-time-flags):
    // Composition API only -> tree-shake the Options API out; no devtools/SSR.
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    // Vue's esm-bundler runtime gates its dev-mode branches on
    // process.env.NODE_ENV. Define it ONLY for prod so dev builds keep
    // today's behavior (undefined) for every other bundled dependency.
    ...(prod ? { 'process.env.NODE_ENV': '"production"' } : {}),
  },
```

- [ ] **Step 1.3: Verify the build still passes with zero .vue files in the graph**

```bash
npm run build && npm run check:artifacts
```

Expected: both green. No `main.css` is emitted (nothing imports a `.vue` yet), the merge plugin no-ops.

- [ ] **Step 1.4: Commit**

```bash
git add package.json package-lock.json esbuild.config.mjs
git commit -m "build: add Vue 3 toolchain deps and esbuild SFC wiring (unplugin-vue, feature-flag defines, styles merge)"
```

---

### Task 2: SFC typecheck gate (vue-tsc)

**Files:**
- Create: `src/vue-shims.d.ts`
- Create: `tsconfig.vue.json`
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/ci.yml` (typecheck job)

- [ ] **Step 2.1: Create `src/vue-shims.d.ts`**

```ts
// SFC module shim so plain tsc (which cannot parse .vue) accepts .vue imports.
// vue-tsc performs the real template/props typecheck via tsconfig.vue.json.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
```

(Already picked up by the root tsconfig's `"src/**/*.d.ts"` include — no tsconfig.json edit.)

- [ ] **Step 2.2: Create `tsconfig.vue.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.d.ts",
    "src/**/*.vue",
    "tests/vue/**/*.ts",
    "tests/vue/**/*.vue"
  ]
}
```

- [ ] **Step 2.3: Add the script to `package.json`** (after `"typecheck"`; the existing `typecheck` stays byte-identical):

```json
    "typecheck:vue": "vue-tsc --noEmit -p tsconfig.vue.json",
```

- [ ] **Step 2.4: Run both gates**

```bash
npm run typecheck && npm run typecheck:vue
```

Expected: both pass (`tests/vue/` doesn't exist yet — the `src/**/*.ts` include keeps vue-tsc's input non-empty, so no "No inputs were found" error).

- [ ] **Step 2.5: Add the CI step** — in `.github/workflows/ci.yml`, `typecheck` job, append after the `Typecheck` step:

```yaml
      - name: Typecheck SFCs (vue-tsc)
        run: npm run typecheck:vue
```

- [ ] **Step 2.6: Commit**

```bash
git add src/vue-shims.d.ts tsconfig.vue.json package.json .github/workflows/ci.yml
git commit -m "build: add vue-tsc --noEmit as a second typecheck gate for SFCs"
```

---

### Task 3: Vitest harness (config, obsidian alias, scripts, CI job, canary test)

**Files:**
- Create: `vitest.config.mts`
- Create: `tests/vue/setup.ts`
- Create: `tests/vue/fixtures/HarnessProbe.vue`
- Create: `tests/vue/harness.test.ts`
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/ci.yml` (new job)

- [ ] **Step 3.1: Create `vitest.config.mts`** at the repo root:

```ts
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
```

- [ ] **Step 3.2: Create `tests/vue/setup.ts`**

```ts
import { cleanup } from '@testing-library/vue';
import { afterEach, vi } from 'vitest';

// Obsidian's HTMLElement prototype extensions (empty/addClass/removeClass/...)
// — the same polyfill module the Jest lane uses; it self-installs on import.
// Without it, any code path touching contentEl.empty()/addClass() throws in
// the Vitest lane. Imported via `@test` so the alias is exercised every run.
import '@test/setup/obsidianDom';

// tests/__mocks__/obsidian.ts calls jest.fn() at module scope. vi.fn is
// API-compatible for everything the mock uses (fn/mockResolvedValue/
// mockReturnValue/mockImplementation), so alias the global before any test
// file imports 'obsidian' through the vitest resolve.alias.
(globalThis as Record<string, unknown>).jest = vi;

// @testing-library/vue auto-registers its per-test cleanup ONLY when a global
// afterEach exists at import time (it does not under vitest without
// test.globals). Register it explicitly, or every render() leaks its container
// into document.body and the second test in a file hits
// 'Found multiple elements'.
afterEach(() => cleanup());
```

- [ ] **Step 3.3: Create the canary SFC `tests/vue/fixtures/HarnessProbe.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ label: string }>();
const count = ref(0);
const doubled = computed(() => count.value * 2);
function bump(): void {
  count.value += 1;
}
</script>

<template>
  <div class="harness-probe">
    <span>{{ props.label }}</span>
    <button type="button" @click="bump">{{ count }} / {{ doubled }}</button>
  </div>
</template>
```

- [ ] **Step 3.4: Write the harness canary test `tests/vue/harness.test.ts`**

```ts
import { fireEvent, render, screen } from '@testing-library/vue';
import { setIcon } from 'obsidian';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import HarnessProbe from './fixtures/HarnessProbe.vue';

const useProbeStore = defineStore('harness-probe', () => {
  const n = ref(0);
  const doubled = computed(() => n.value * 2);
  function bump(): void {
    n.value += 1;
  }
  return { n, doubled, bump };
});

describe('vue test harness', () => {
  it('compiles and renders an SFC with reactive updates', async () => {
    render(HarnessProbe, { props: { label: 'probe' } });
    expect(screen.getByText('probe')).toBeTruthy();
    const btn = screen.getByRole('button');
    await fireEvent.click(btn);
    expect(btn.textContent).toContain('1 / 2');
  });

  it('supports pinia setup stores via setActivePinia', () => {
    setActivePinia(createPinia());
    const store = useProbeStore();
    store.bump();
    expect(store.n).toBe(1);
    expect(store.doubled).toBe(2);
  });

  it('serves the shared obsidian fake through the alias + jest-global shim', () => {
    expect(vi.isMockFunction(setIcon)).toBe(true);
  });
});
```

- [ ] **Step 3.4b: Ignore the Vue coverage output everywhere.** `reportsDirectory: 'coverage-vue'` writes an unignored top-level dir that would dirty the worktree and get scanned by fallow. Add `coverage-vue/` to `.gitignore` (next to the existing `coverage/` entry) and add `"**/coverage-vue/**"` to the `ignorePatterns` array in `.fallowrc.json` (next to `"**/coverage/**"`).

- [ ] **Step 3.4c: KEEP the transient fallow ignore for `pinia`.** The harness canary test (Step 3.4) is the repo's first direct `pinia` import, but it is test-only — fallow's `test-only-dependency` rule flags a production dependency whose only importers are test files, so removing `"pinia"` from the `ignoreDependencies` array in `.fallowrc.json` here would trip `deadCodeIssues` 0 → 1 (verified 2026-07-02). The entry stays until Task 7 lands `src/features/library/vue/globalPinia.ts`, the first `src/` importer (retired in Step 7.12c). Do NOT add `"test-only-dependencies": "off"` — the rule class stays active.

- [ ] **Step 3.5: Add scripts to `package.json`** (after `"test:perf"`):

```json
    "test:vue": "vitest run --config vitest.config.mts",
    "test:vue:watch": "vitest --config vitest.config.mts",
    "test:vue:coverage": "vitest run --coverage --config vitest.config.mts",
```

- [ ] **Step 3.6: Run it**

```bash
npm run test:vue
```

Expected: `Test Files 1 passed`, `Tests 3 passed`.

- [ ] **Step 3.7: Confirm runner isolation** — Jest must NOT pick up the new lane:

```bash
npm run test -- --listTests | grep -c "tests/vue" || echo "isolated"
```

Expected: `isolated` (zero matches; Jest globs are `**/tests/unit|integration/**`).

- [ ] **Step 3.8: Add the CI job** — in `.github/workflows/ci.yml`, after the `coverage` job:

```yaml
  component:
    # Vue-surface lane (Vitest): SFC component tests, Pinia stores, composables.
    # Coverage floors for src/features/library/** are enforced here, mirroring
    # the Jest coverage job for the rest of src (docs/build-ci/quality-gates.md).
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Vue component tests with coverage thresholds
        run: npm run test:vue:coverage
```

- [ ] **Step 3.9: Commit**

Re-lock the quality baseline first: fallow's built-in Vitest plugin AST-parses the `resolve.alias` map in `vitest.config.mts` and applies it to the WHOLE repo module graph, so all ~275 `import 'obsidian'` sites (production `src/` included) now resolve to `tests/__mocks__/obsidian.ts` — ~270 untouched files each gain fan_out +1 (small maintainability dips), moving `averageMaintainability` 90.2 → 90.0 with every counter metric unchanged. Run `npm run check:quality -- --update` and verify the `scripts/quality-baseline.json` diff touches ONLY `averageMaintainability` (if any counter moved, stop and investigate). Side effect to remember: `tests/__mocks__/obsidian.ts` now shows fan-in ≈274 and ranks as a top hotspot/refactor target in `npm run quality:health` — that is an artifact of the Vitest alias, not a real refactor target.

```bash
git add vitest.config.mts tests/vue package.json .github/workflows/ci.yml .gitignore .fallowrc.json scripts/quality-baseline.json
git commit -m "test: add Vitest lane for the Vue surface (jsdom, obsidian alias, coverage floors, CI job)"
```

---

### Task 4: ESLint coverage for .vue (vue-eslint-parser + no-v-html)

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json` (lint script glob)

- [ ] **Step 4.1: Add imports to `eslint.config.mjs`** (with the other imports at the top):

```js
import tsParser from '@typescript-eslint/parser';
import pluginVue from 'eslint-plugin-vue';
```

- [ ] **Step 4.2: Add the Vue config block** — insert immediately AFTER the `...tseslint.configs['flat/recommended'],` line (order matters: the Vue config must come later so `vue-eslint-parser` wins over the TS parser for `*.vue` files):

```js
  {
    // Vue SFC lint. flat/recommended = base + essential (errors) +
    // strongly-recommended + recommended (warnings — the tracked, non-blocking
    // backlog tier per docs/build-ci/quality-gates.md § lint severity policy).
    files: ['**/*.vue'],
    // Scoped via extends: three of flat/recommended's sub-configs ship with no
    // `files` restriction and would otherwise resolve 116 vue/* rules against
    // every .ts file (pure no-op cost, ~10% lint wall-clock).
    extends: [pluginVue.configs['flat/recommended']],
    languageOptions: {
      parserOptions: {
        // vue-eslint-parser stays the outer parser (set by the configs above);
        // the TS parser handles <script lang="ts"> blocks.
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // The Vue analogue of the innerHTML ban below (OBS-B): v-html sets
      // el.innerHTML under the hood. Render markdown/agent content through
      // Obsidian's MarkdownRenderer against a template ref instead.
      'vue/no-v-html': 'error',
      // vue-tsc owns undefined-identifier checking for <script lang="ts"> —
      // core no-undef is redundant there and false-positives on browser
      // globals (window/setTimeout), mirroring typescript-eslint's stance
      // that no-undef is off for type-checked code.
      'no-undef': 'off',
      // Mirror the repo's non-type-aware TS guardrails onto <script setup>
      // blocks (same options as the src/tests .ts block above). Type-aware
      // rules stay off SFC fast lint — vue-tsc is that gate.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
```

NOTE: the `plugins` key here must not collide — `simple-import-sort` is already registered by the earlier `src/**/*.ts` block, but flat config scopes plugin registration per config object, so re-declaring it for `**/*.vue` is required and safe.

Then mirror the src-only safety rules onto SFC `<script>` blocks — without this, a `.vue` under `src/` could use `console.*` or assign `innerHTML` and lint would stay green. Refactor the existing `src/**/*.ts` safety block: hoist its `rules` object into a module-level `const srcSafetyRules = { 'no-console': 'error', 'no-new-func': 'error', 'no-restricted-syntax': [ /* the existing array, moved verbatim: Notice-i18n selectors + innerHTML/outerHTML/insertAdjacentHTML bans */ ] }`, spread it back into the `src/**/*.ts` block (KEEP `'@typescript-eslint/no-implied-eval': 'error'` in that block only — it is type-aware and must stay off the `.vue` fast lint), and add:

```js
  {
    // SFC <script> parity with the src/**/*.ts safety gate. Type-aware rules
    // (no-implied-eval) intentionally excluded — vue-tsc is the type gate.
    files: ['src/**/*.vue'],
    rules: srcSafetyRules,
  },
```

Also widen the directive-comment discipline block (`@eslint-community/eslint-comments`) from `files: ['src/**/*.ts']` to `files: ['src/**/*.ts', 'src/**/*.vue']` so SFC `<script>` blocks carry the same disable-directive rules (justified disables only, restricted-disable list, stale disables error).

- [ ] **Step 4.3: Widen the lint glob in `package.json`:**

```json
    "lint": "eslint \"{src,tests}/**/*.{ts,vue}\"",
```

- [ ] **Step 4.3b: Drop the transient fallow ignore for `eslint-plugin-vue`.** Step 4.1's `eslint.config.mjs` import is the first direct use, so remove `"eslint-plugin-vue"` from the `ignoreDependencies` array in `.fallowrc.json` (it was added as a transient entry while nothing imported it yet). `npm run check:quality` must stay green (deadCodeIssues 0). (`vue-eslint-parser` stays ignored permanently: it is a required peer wired via the flat configs' parser, never imported directly.)

- [ ] **Step 4.4: Verify — clean pass, then prove the guard bites.** First:

```bash
npm run lint
```

Expected: PASS (the only `.vue` so far is the harness probe; warnings from the strongly-recommended tier are tolerated — errors are not).

Then create a deliberate violation, expect failure, and remove it:

```bash
cat > /tmp/no-v-html-probe.vue <<'EOF'
<script setup lang="ts">
const html = '<b>x</b>';
</script>
<template>
  <div v-html="html" />
</template>
EOF
cp /tmp/no-v-html-probe.vue tests/vue/fixtures/NoVHtmlProbe.vue
npm run lint ; echo "exit: $?"
rm tests/vue/fixtures/NoVHtmlProbe.vue
```

Expected: lint FAILS with `vue/no-v-html` at `NoVHtmlProbe.vue`; after `rm`, `npm run lint` passes again.

- [ ] **Step 4.5: Commit**

```bash
git add eslint.config.mjs package.json .fallowrc.json
git commit -m "lint: lint .vue SFCs (essential=error, recommended=warn backlog, no-v-html=error)"
```

---

### Task 5: LOC ratchet counts .vue

**Files:**
- Modify: `scripts/check-loc.mjs:65`

- [ ] **Step 5.1: Extend the file filter.** In `collectSourceFiles`, replace:

```js
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
```

with:

```js
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.vue'))
    ) {
```

Also update the doc comment's policy line 12 from ``Any `src/**` `.ts` file`` to ``Any `src/**` `.ts` or `.vue` file`` so the header stays honest.

- [ ] **Step 5.2: Verify**

```bash
npm run check:loc
```

Expected: `LOC guard OK` (no `.vue` exists under `src/` yet; counts unchanged).

- [ ] **Step 5.3: Commit**

```bash
git add scripts/check-loc.mjs
git commit -m "quality: count .vue sources in the LOC ratchet"
```

---

### Task 6: `useVueLibrary` feature flag (settings + toggle + i18n)

**Files:**
- Modify: `src/core/types/settings.ts` (UI preferences block, ~line 207)
- Modify: `src/app/settings/defaultSettings.ts` (~line 70)
- Modify: `src/features/settings/registry/fields/general.ts` (Display section)
- Modify: `src/i18n/types/settings.ts` (key union)
- Modify: `src/i18n/locales/{de,en,es,fr,ja,ko,pt,ru,zh-CN,zh-TW}.json`

- [ ] **Step 6.1: Add the flag to `SpecoratorSettings`** — in the `// UI preferences` block of `src/core/types/settings.ts`, after `firstRunDismissed: boolean;`:

```ts
  /** When true, the three library views open as the unified Vue Library view. */
  useVueLibrary?: boolean;
```

OPTIONAL, not required, deliberately (mirrors `promptCommitOnAccept?` in the same block): a required member would break every complete `SpecoratorSettings` object literal — e.g. the three fixtures in `tests/unit/providers/claude/types/types.test.ts:74/141/207` — at the Step 6.5 typecheck. Absence reads as off; every flag check in this plan is truthy-only (`plugin.settings.useVueLibrary ? … : …`), which is correct for `boolean | undefined`.

- [ ] **Step 6.2: Add the default** — in `src/app/settings/defaultSettings.ts` next to `firstRunDismissed: false,`:

```ts
  useVueLibrary: false,
```

- [ ] **Step 6.3: Add i18n keys.** In `src/i18n/types/settings.ts` add to the `SettingsTranslationKey` union (alphabetical position near other `settings.*` entries):

```ts
  | 'settings.useVueLibrary.name'
  | 'settings.useVueLibrary.desc'
```

In each locale JSON, inside the `"settings"` object, add (values per locale below):

| locale | name | desc |
|---|---|---|
| en | `Unified library view (beta)` | `Open Agents, Skills, and Loops as one library view with tabs. Applies the next time a library view is opened.` |
| de | `Vereinheitlichte Bibliotheksansicht (Beta)` | `Öffnet Agenten, Skills und Loops als eine Bibliotheksansicht mit Tabs. Gilt beim nächsten Öffnen einer Bibliotheksansicht.` |
| es | `Vista de biblioteca unificada (beta)` | `Abre agentes, habilidades y bucles como una sola vista de biblioteca con pestañas. Se aplica la próxima vez que se abra una vista de biblioteca.` |
| fr | `Vue de bibliothèque unifiée (bêta)` | `Ouvre les agents, compétences et boucles dans une seule vue de bibliothèque à onglets. S'applique à la prochaine ouverture d'une vue de bibliothèque.` |
| ja | `統合ライブラリビュー（ベータ）` | `エージェント、スキル、ループをタブ付きの1つのライブラリビューで開きます。次回ライブラリビューを開いたときに適用されます。` |
| ko | `통합 라이브러리 보기(베타)` | `에이전트, 스킬, 루프를 탭이 있는 하나의 라이브러리 보기로 엽니다. 다음에 라이브러리 보기를 열 때 적용됩니다.` |
| pt | `Visão de biblioteca unificada (beta)` | `Abre agentes, habilidades e loops como uma única visão de biblioteca com abas. Aplica-se na próxima vez que uma visão de biblioteca for aberta.` |
| ru | `Единый вид библиотеки (бета)` | `Открывает агентов, навыки и циклы как единый вид библиотеки с вкладками. Применяется при следующем открытии вида библиотеки.` |
| zh-CN | `统一库视图（测试版）` | `将智能体、技能和循环合并为一个带标签页的库视图。下次打开库视图时生效。` |
| zh-TW | `統一庫檢視（測試版）` | `將智慧代理、技能與迴圈合併為一個帶分頁的庫檢視。下次開啟庫檢視時生效。` |

- [ ] **Step 6.4: Register the toggle** — in `src/features/settings/registry/fields/general.ts`, in the Display section next to the `enableAutoScroll` field:

```ts
  r.registerField({
    id: 'useVueLibrary',
    tabId: 'general',
    sectionId: 'display',
    label: t('settings.useVueLibrary.name'),
    description: t('settings.useVueLibrary.desc'),
    type: { kind: 'toggle' },
    default: false,
    keywords: ['library', 'vue', 'agents', 'skills', 'loops', 'beta'],
  });
```

(The registry persists `id` as the settings path automatically — no extra wiring.)

- [ ] **Step 6.5: Run the settings suites**

```bash
npm run typecheck && npm run test -- --selectProjects integration -t "general"
npm run test -- --selectProjects unit
```

Expected: green. CONTINGENCY: if `tests/integration/settings/generalPort.test.ts` fails because it asserts registry↔legacy parity for the general tab, mirror the toggle in the legacy imperative general-tab renderer (find it via `grep -rn "enableAutoScroll" src/features/settings --include="*.ts" -l`, copy the adjacent legacy `Setting` toggle pattern for `useVueLibrary`), then re-run. If instead it enumerates registry fields against a fixture list, add `useVueLibrary` to that fixture.

- [ ] **Step 6.6: Commit**

```bash
git add src/core/types/settings.ts src/app/settings/defaultSettings.ts \
  src/features/settings/registry/fields/general.ts src/i18n
git commit -m "feat(settings): add useVueLibrary flag (default off) with toggle and i18n"
```

---

### Task 7: `LibraryView` island + `LibraryRoot.vue` shell + activation + redirects

**Files:**
- Create: `src/features/library/viewType.ts`
- Create: `src/features/library/vue/libraryKeys.ts`
- Create: `src/features/library/vue/globalPinia.ts`
- Create: `src/features/library/vue/LibraryRoot.vue`
- Create: `src/features/library/LibraryView.ts`
- Create: `src/features/library/activateLibrary.ts`
- Create: `tests/vue/helpers.ts` (shared fake-plugin factory)
- Create: `tests/vue/libraryView.test.ts`
- Create: `tests/vue/libraryView.leak.test.ts`
- Modify: `src/i18n/types/toolLibrary.ts`, all 10 locale JSONs (`library.viewTitle`)
- Modify: `src/app/views/registerPluginViews.ts`
- Modify: `src/app/commands/registerPluginCommands.ts` (existing open-loop-library command becomes flag-aware)
- Create: `tests/__mocks__/vueComponentStub.ts` (Jest-lane stub for .vue imports)
- Modify: `jest.base.config.js` (.vue moduleNameMapper) and `jest.config.js` (coverage exclusion for the Vitest-owned subtree)
- Modify: `src/features/agents/roster/view/AgentRosterView.ts` (onOpen guard)
- Modify: `src/features/skills/view/SkillLibraryView.ts` (onOpen guard)
- Modify: `src/features/tasks/ui/LoopLibraryView.ts` (onOpen guard)

- [ ] **Step 7.1: Create `src/features/library/viewType.ts`**

```ts
export const VIEW_TYPE_LIBRARY = 'specorator-library';

export type LibraryTab = 'agents' | 'skills' | 'loops';

/** Maps each legacy standalone library view type to its unified-view tab. */
export const LEGACY_VIEW_TYPE_TO_TAB: Readonly<Record<string, LibraryTab>> = {
  'specorator-agent-roster': 'agents',
  'specorator-skill-library': 'skills',
  'specorator-loop-library': 'loops',
};

/** Inverse of the above — used by the flag-off rollback redirect. */
export const TAB_TO_LEGACY_VIEW_TYPE: Readonly<Record<LibraryTab, string>> = {
  agents: 'specorator-agent-roster',
  skills: 'specorator-skill-library',
  loops: 'specorator-loop-library',
};
```

(Literals, not imports of the legacy `VIEW_TYPE_*` constants, mirroring `shared/libraryNav.ts`'s cycle-avoidance pattern.)

- [ ] **Step 7.2: Create `src/features/library/vue/libraryKeys.ts`**

```ts
import type { InjectionKey, Ref } from 'vue';

import type SpecoratorPlugin from '../../../main';
import type { LibraryView } from '../LibraryView';
import type { LibraryTab } from '../viewType';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');
export const VIEW_KEY: InjectionKey<LibraryView> = Symbol('specorator-library-view');
export const ACTIVE_TAB_KEY: InjectionKey<Ref<LibraryTab>> = Symbol('specorator-library-tab');
/**
 * A panel may register a guard that every tab switch must pass (resolve true)
 * first — e.g. the Agents detail editor guarding unsaved edits. Null = no guard.
 */
export const TAB_GUARD_KEY: InjectionKey<Ref<(() => Promise<boolean>) | null>> =
  Symbol('specorator-library-tab-guard');
```

- [ ] **Step 7.3: Create `src/features/library/vue/globalPinia.ts`**

```ts
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for every Library leaf: roster/skills/loops are vault-global, so
// all leaves must observe the same store state. Module scope is safe — the
// plugin bundle's module registry is discarded on plugin unload/reload.
let pinia: Pinia | null = null;

export function getLibraryPinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetLibraryPinia(): void {
  pinia = null;
}
```

- [ ] **Step 7.4: Create the root SFC `src/features/library/vue/LibraryRoot.vue`.** (Multi-word name on purpose: `vue/multi-word-component-names` is an ERROR in the essential ruleset, so a `Library.vue` would fail lint.) Tab strip reuses the existing `specorator-library-nav` CSS and i18n nav labels; panels arrive in Tasks 10–12 (placeholder until then):

```vue
<script setup lang="ts">
import { inject } from 'vue';

import { t } from '../../../i18n/i18n';
import type { LibraryTab } from '../viewType';
import { ACTIVE_TAB_KEY, TAB_GUARD_KEY } from './libraryKeys';

const injected = inject(ACTIVE_TAB_KEY);
if (!injected) throw new Error('LibraryRoot.vue mounted without ACTIVE_TAB_KEY');
// Re-bind after the guard so the template binding's DECLARED type is already
// narrowed to Ref<LibraryTab> — vue-tsc checks templates against declared types.
const activeTab = injected;
const tabGuard = inject(TAB_GUARD_KEY, null);

const TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: 'agents', label: t('agentRoster.navLabel') },
  { id: 'skills', label: t('skillLibrary.navLabel') },
  { id: 'loops', label: t('loopLibrary.navLabel') },
];

async function select(tab: LibraryTab): Promise<void> {
  if (activeTab.value === tab) return;
  // A panel may have registered a guard (dirty detail editor) — switching
  // tabs unmounts the panel, so silent discards must be intercepted here.
  const guard = tabGuard?.value;
  if (guard && !(await guard())) return;
  activeTab.value = tab;
}
</script>

<template>
  <div class="specorator-library-nav" role="navigation" :aria-label="t('agentRoster.navAriaLabel')">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="specorator-library-nav-item"
      :class="{ 'is-active': activeTab === tab.id }"
      :aria-current="activeTab === tab.id ? 'page' : undefined"
      @click="void select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
  <!-- Panels land in Tasks 10-12; keep the shell shippable until then. -->
  <div class="specorator-library-list" :data-active-tab="activeTab" />
</template>
```

NOTE for later tasks: `activeTab` is a TOP-LEVEL `<script setup>` binding, so the template AUTO-UNWRAPS the ref — write `activeTab === tab.id`, never `activeTab.value`, inside this template. (Refs nested inside objects, e.g. `list.query.value` in the panels, are NOT unwrapped — there `.value` stays.)

- [ ] **Step 7.5: Add the `library.viewTitle` i18n key.** In `src/i18n/types/toolLibrary.ts` add `| 'library.viewTitle'` to the union. In each locale's `"library"` object add: en `"viewTitle": "Library"`, de `"Bibliothek"`, es `"Biblioteca"`, fr `"Bibliothèque"`, ja `"ライブラリ"`, ko `"라이브러리"`, pt `"Biblioteca"`, ru `"Библиотека"`, zh-CN `"库"`, zh-TW `"庫"`.

- [ ] **Step 7.6: Create `src/features/library/LibraryView.ts`**

```ts
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import type { App as VueApp } from 'vue';
import { createApp, markRaw, ref } from 'vue';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { getLibraryPinia } from './vue/globalPinia';
import { ACTIVE_TAB_KEY, PLUGIN_KEY, TAB_GUARD_KEY, VIEW_KEY } from './vue/libraryKeys';
import LibraryRoot from './vue/LibraryRoot.vue';
import type { LibraryTab } from './viewType';
import { TAB_TO_LEGACY_VIEW_TYPE, VIEW_TYPE_LIBRARY } from './viewType';

const DEFAULT_TAB: LibraryTab = 'agents';

function isLibraryTab(value: unknown): value is LibraryTab {
  return value === 'agents' || value === 'skills' || value === 'loops';
}

export class LibraryView extends ItemView {
  /** One Vue app per leaf — Obsidian can open several Library leaves at once. */
  private vueApp: VueApp | null = null;
  private readonly activeTab = ref<LibraryTab>(DEFAULT_TAB);
  /** Set by panels (via TAB_GUARD_KEY) to intercept tab switches; see libraryKeys.ts. */
  private readonly tabGuard = ref<(() => Promise<boolean>) | null>(null);

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText(): string {
    return t('library.viewTitle');
  }

  getIcon(): string {
    return 'library';
  }

  async setActiveTab(tab: LibraryTab): Promise<void> {
    if (this.activeTab.value === tab) return;
    const guard = this.tabGuard.value;
    if (guard && !(await guard())) return;
    this.activeTab.value = tab;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const tab = (state as { tab?: unknown } | null)?.tab;
    // Workspace-restore path sets the tab directly (no guard): it runs before
    // any panel could have registered one.
    if (isLibraryTab(tab)) this.activeTab.value = tab;
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), tab: this.activeTab.value };
  }

  async onOpen(): Promise<void> {
    if (!this.plugin.settings.useVueLibrary) {
      // Flag off: hand this leaf to the MATCHING legacy view (setState has
      // already restored the persisted tab for saved leaves) so rollback
      // reopens Skills/Loops where they were, not always the roster.
      await this.leaf.setViewState({
        type: TAB_TO_LEGACY_VIEW_TYPE[this.activeTab.value],
        active: true,
      });
      return;
    }
    this.contentEl.empty();
    // Two calls, not one: Obsidian's real addClass is variadic but the shared
    // test-lane polyfill (tests/setup/obsidianDom.ts) is single-arg.
    this.contentEl.addClass('specorator-library');
    this.contentEl.addClass('specorator-library-vue-root');
    const app = createApp(LibraryRoot);
    app.use(getLibraryPinia());
    // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
    app.provide(PLUGIN_KEY, markRaw(this.plugin));
    app.provide(VIEW_KEY, markRaw(this));
    app.provide(ACTIVE_TAB_KEY, this.activeTab);
    app.provide(TAB_GUARD_KEY, this.tabGuard);
    app.mount(this.contentEl);
    this.vueApp = app;
  }

  async onClose(): Promise<void> {
    // unmount() runs onUnmounted hooks; empty() drops any detached DOM +
    // listeners (Vue's documented leak class when the container is kept).
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.removeClass('specorator-library');
    this.contentEl.removeClass('specorator-library-vue-root');
    this.contentEl.empty();
  }
}
```

- [ ] **Step 7.7: Create `src/features/library/activateLibrary.ts`**

```ts
import type SpecoratorPlugin from '../../main';
import { LibraryView } from './LibraryView';
import type { LibraryTab } from './viewType';
import { VIEW_TYPE_LIBRARY } from './viewType';

/** Reveals (or opens) the unified Library leaf and switches it to `tab`. */
export async function activateLibrary(plugin: SpecoratorPlugin, tab: LibraryTab): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
  }
  if (leaf.view instanceof LibraryView) await leaf.view.setActiveTab(tab);
  await workspace.revealLeaf(leaf);
}
```

- [ ] **Step 7.8: Create the shared fake and write the failing view tests.**

First `tests/vue/helpers.ts` — used by BOTH `libraryView.test.ts` and the leak
guard (once Task 12 makes AgentsPanel the default tab, `onOpen()` mounts a real
panel in every view/leak test, so every fake must carry the panel backends):

```ts
import { vi } from 'vitest';

/**
 * Fake SpecoratorPlugin covering every backend surface the three Library
 * panels touch on mount, so view-level tests keep working as Tasks 10-12 swap
 * real panels into the shell.
 */
export function makePlugin(useVueLibrary: boolean) {
  return {
    settings: { useVueLibrary },
    app: { vault: { getAbstractFileByPath: vi.fn().mockReturnValue(null) } },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
    agentRosterStore: { list: vi.fn().mockResolvedValue([]) },
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([]) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue(''),
      stat: vi.fn().mockResolvedValue(null),
    },
  } as never;
}
```

Then `tests/vue/libraryView.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/features/library/LibraryView';
import { resetLibraryPinia } from '@/features/library/vue/globalPinia';

import { makePlugin } from './helpers';

function makeLeaf() {
  return { setViewState: vi.fn().mockResolvedValue(undefined) } as never;
}

/** The obsidian mock's ItemView has no real contentEl; give the view a jsdom one. */
function mountView(view: LibraryView): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(view, 'contentEl', { value: el, configurable: true });
  return el;
}

describe('LibraryView', () => {
  beforeEach(() => resetLibraryPinia());

  it('mounts the tab strip with three tabs when the flag is on', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    const tabs = el.querySelectorAll('.specorator-library-nav-item');
    expect(tabs).toHaveLength(3);
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('Agents');
  });

  it('switches tabs on click and via setActiveTab', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    (el.querySelectorAll('.specorator-library-nav-item')[2] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('[data-active-tab]')?.getAttribute('data-active-tab')).toBe('loops');
    view.setActiveTab('skills');
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('[data-active-tab]')?.getAttribute('data-active-tab')).toBe('skills');
  });

  it('unmounts and empties contentEl on close', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    await view.onClose();
    expect(el.childElementCount).toBe(0);
  });

  it('redirects the leaf to the legacy roster view when the flag is off', async () => {
    const leaf = makeLeaf();
    const view = new LibraryView(leaf, makePlugin(false));
    mountView(view);
    await view.onOpen();
    expect((leaf as { setViewState: ReturnType<typeof vi.fn> }).setViewState).toHaveBeenCalledWith({
      type: 'specorator-agent-roster',
      active: true,
    });
  });

  it('re-homes a stale leaf to the legacy view MATCHING its persisted tab', async () => {
    const leaf = makeLeaf();
    const view = new LibraryView(leaf, makePlugin(false));
    mountView(view);
    await view.setActiveTab('loops'); // stands in for setState-restored tab
    await view.onOpen();
    expect((leaf as { setViewState: ReturnType<typeof vi.fn> }).setViewState).toHaveBeenCalledWith({
      type: 'specorator-loop-library',
      active: true,
    });
  });
});
```

- [ ] **Step 7.9: Run to verify state** — `npm run test:vue` — the suite should PASS if 7.1–7.7 landed first, or FAIL with resolution errors if you wrote the test first; either order is fine as long as it ends green. Also run `npm run typecheck:vue` — expected PASS.

- [ ] **Step 7.10: Write the leak guard `tests/vue/libraryView.leak.test.ts`.** Deterministic counts, not timings, mirroring `tests/perf/` philosophy:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/features/library/LibraryView';
import { resetLibraryPinia } from '@/features/library/vue/globalPinia';

import { makePlugin } from './helpers';

describe('LibraryView open/close leak guard', () => {
  let netListeners = 0;
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;

  beforeEach(() => {
    resetLibraryPinia();
    netListeners = 0;
    // Vue 3 does NOT removeEventListener on unmount — it drops the subtree and
    // lets GC reclaim element listeners (empirically verified: 3 adds, 0
    // removes per mount/unmount). Element-level listeners are therefore NOT a
    // leak once contentEl.empty() drops the subtree. The leak class this guard
    // targets is listeners attached to document/window/body, which empty()
    // cannot reclaim — count ONLY those.
    const counted = (target: unknown): boolean =>
      target === document || target === window || target === document.body;
    EventTarget.prototype.addEventListener = function (...args) {
      if (counted(this)) netListeners += 1;
      return origAdd.apply(this, args as Parameters<typeof origAdd>);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      if (counted(this)) netListeners -= 1;
      return origRemove.apply(this, args as Parameters<typeof origRemove>);
    };
  });

  afterEach(() => {
    EventTarget.prototype.addEventListener = origAdd;
    EventTarget.prototype.removeEventListener = origRemove;
  });

  it('leaves no DOM and no dangling document/window listeners across 5 cycles', async () => {
    const plugin = makePlugin(true);
    const leaf = { setViewState: vi.fn() } as never;
    for (let i = 0; i < 5; i += 1) {
      const view = new LibraryView(leaf, plugin);
      const el = document.createElement('div');
      Object.defineProperty(view, 'contentEl', { value: el, configurable: true });
      const before = netListeners;
      await view.onOpen();
      await view.onClose();
      expect(el.childElementCount).toBe(0);
      // Only document/window/body listeners are counted (see beforeEach); net
      // drift per cycle must be zero once the container is dropped.
      expect(netListeners - before).toBeLessThanOrEqual(0);
    }
  });
});
```

Run: `npm run test:vue` — expected PASS.

- [ ] **Step 7.11: Register the view + flag-aware entry points.** In `src/app/views/registerPluginViews.ts`:

Add imports:

```ts
import { activateLibrary } from '@/features/library/activateLibrary';
import { LibraryView } from '@/features/library/LibraryView';
import type { LibraryTab } from '@/features/library/viewType';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
```

After the three legacy `registerView` calls, add:

```ts
  plugin.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, plugin));
```

Replace the `openView` helper block (the three ribbons + two commands, lines 40–53) with:

```ts
  const openView = (viewType: string) => plugin.openLeafView(viewType);
  const openLibrary = (tab: LibraryTab, legacyType: string) =>
    plugin.settings.useVueLibrary ? activateLibrary(plugin, tab) : openView(legacyType);
  plugin.addRibbonIcon('users', t('ribbon.openAgentRoster'), () => void openLibrary('agents', VIEW_TYPE_AGENT_ROSTER));
  plugin.addRibbonIcon('book-open', t('ribbon.openSkillLibrary'), () => void openLibrary('skills', VIEW_TYPE_SKILL_LIBRARY));
  plugin.addRibbonIcon('repeat', t('ribbon.openLoopLibrary'), () => void openLibrary('loops', VIEW_TYPE_LOOP_LIBRARY));
  plugin.addCommand({
    id: 'open-agent-roster',
    name: t('commands.openAgentRoster'),
    callback: () => void openLibrary('agents', VIEW_TYPE_AGENT_ROSTER),
  });
  plugin.addCommand({
    id: 'open-skill-library',
    name: t('commands.openSkillLibrary'),
    callback: () => void openLibrary('skills', VIEW_TYPE_SKILL_LIBRARY),
  });
```

IMPORTANT — do NOT add an `open-loop-library` command here: it is ALREADY registered in `src/app/commands/registerPluginCommands.ts:111-115` (a duplicate id would shadow/duplicate registry + hotkey metadata). Instead, make that existing registration flag-aware. In `registerPluginCommands.ts`, add the imports:

```ts
import { activateLibrary } from '@/features/library/activateLibrary';
```

and change the existing block (lines 111–115) to:

```ts
  register({
    id: 'open-loop-library',
    name: t('commands.openLoopLibrary'),
    callback: () =>
      void (plugin.settings.useVueLibrary
        ? activateLibrary(plugin, 'loops')
        : plugin.openLeafView(VIEW_TYPE_LOOP_LIBRARY)),
  });
```

(Match the import style already used in that file — if it uses relative imports, mirror them.)

- [ ] **Step 7.12: Legacy-view self-migration.** Add the same 4-line guard at the TOP of `onOpen()` in each of the three legacy views (adjust the tab literal per view — `'agents'` / `'skills'` / `'loops'`):

```ts
  async onOpen(): Promise<void> {
    if (this.plugin.settings.useVueLibrary) {
      await this.leaf.setViewState({ type: 'specorator-library', active: true, state: { tab: 'agents' } });
      return;
    }
    await this.renderList(); // (existing body — `this.render()` in Skill/Loop views)
  }
```

Use the literal `'specorator-library'` (not an import) to avoid feature-layer import cycles — matching the `viewType.ts` comment.

- [ ] **Step 7.12b: Keep the Jest lane green (REQUIRED — 16 Jest suites transitively import `@/main`, which now reaches `LibraryRoot.vue`).** Jest cannot parse `.vue`. Create `tests/__mocks__/vueComponentStub.ts`:

```ts
// Jest-lane stand-in for any .vue import (Jest never renders Vue components;
// the Vitest lane owns them). Shaped like an SFC default export.
export default {};
```

In `jest.base.config.js`, add to `moduleNameMapper` (before the `@/` entry):

```js
    '\\.vue$': '<rootDir>/tests/__mocks__/vueComponentStub.ts',
```

In `jest.config.js`, add to `collectCoverageFrom` (with the comment):

```js
    // src/features/library/** is tested and coverage-gated in the Vitest lane
    // (vitest.config.mts coverage.include + the CI component job); counting it
    // here at 0% would sink the Jest global floors.
    '!src/features/library/**',
```

Run `npm run test` — expected: all Jest suites green.

- [ ] **Step 7.12c: Retire the transient fallow ignore for `pinia`.** `src/features/library/vue/globalPinia.ts` (Step 7.3) is the repo's first `src/` importer of `pinia`, so fallow's `test-only-dependency` rule no longer fires: remove `"pinia"` from the `ignoreDependencies` array in `.fallowrc.json` (deferred from Task 3 Step 3.4c, where the canary's test-only import would have tripped it). `npm run check:quality` must stay green (deadCodeIssues 0). `.fallowrc.json` is staged in this task's commit (Step 7.15).

- [ ] **Step 7.13: Full verification**

```bash
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue
npm run test
```

Expected: all green. (`tests/integration/main.test.ts` uses `toHaveBeenCalledWith`/find-by-id assertions, not exact call counts — verified 2026-07-01 — so the extra `registerView` needs no test change; the Jest lane stays green because of Step 7.12b.)

- [ ] **Step 7.14: Build check** (first task where a real `.vue` enters the bundle):

```bash
npm run build && grep -c "specorator-library-vue-root" main.js && npm run check:artifacts
```

Expected: build green; grep count ≥ 1 (the compiled Library island is in the bundle); artifacts green.

- [ ] **Step 7.15: Commit**

```bash
git add src/features/library src/app/views/registerPluginViews.ts \
  src/app/commands/registerPluginCommands.ts \
  src/features/agents/roster/view/AgentRosterView.ts \
  src/features/skills/view/SkillLibraryView.ts \
  src/features/tasks/ui/LoopLibraryView.ts \
  src/i18n tests/vue .fallowrc.json \
  tests/__mocks__/vueComponentStub.ts jest.base.config.js jest.config.js
git commit -m "feat(library): unified Vue LibraryView behind useVueLibrary (per-leaf island, tab shell, redirects, leak guard)"
```

---

### Task 8: Pure list engine extraction + `useLibraryList` composable

**Files:**
- Modify: `src/shared/libraryToolbar.ts` (behavior-preserving extraction)
- Create: `src/features/library/vue/useLibraryList.ts`
- Test: `tests/vue/useLibraryList.test.ts`
- Existing guard: `tests/unit/shared/libraryToolbar.test.ts` must stay green untouched

- [ ] **Step 8.1: Extract pure functions in `src/shared/libraryToolbar.ts`.** Add these two exported functions ABOVE the `LibraryListController` class, then rewrite the class's `allTags()` and `apply()` to delegate (same file, no import changes elsewhere):

```ts
/** Sorted union of every trimmed, non-empty tag across `items`. */
export function collectLibraryTags<T>(items: T[], accessors: LibraryItemAccessors<T>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const tag of accessors.getTags(item)) {
      const trimmed = tag.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Case-insensitive substring filter + OR-tag filter + name/updated sort. */
export function applyLibraryQuery<T>(
  items: T[],
  accessors: LibraryItemAccessors<T>,
  state: { query: string; sort: LibrarySort; active: ReadonlySet<string> },
): T[] {
  const q = state.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (q) {
      const haystack = [
        accessors.getName(item),
        accessors.getDescription(item),
        ...accessors.getTags(item),
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (state.active.size > 0) {
      const tags = accessors.getTags(item).map((tag) => tag.trim());
      if (!tags.some((tag) => state.active.has(tag))) return false;
    }
    return true;
  });
  const sorted = [...filtered];
  if (state.sort === 'name') {
    sorted.sort((a, b) => accessors.getName(a).localeCompare(accessors.getName(b)));
  } else {
    sorted.sort((a, b) => accessors.getUpdatedAt(b) - accessors.getUpdatedAt(a));
  }
  return sorted;
}
```

Class delegation (replace the bodies of `allTags` and `apply`; delete the now-duplicated logic):

```ts
  allTags(): string[] {
    return collectLibraryTags(this.items, this.accessors);
  }

  apply(): T[] {
    return applyLibraryQuery(this.items, this.accessors, {
      query: this.query,
      sort: this.sort,
      active: this.active,
    });
  }
```

- [ ] **Step 8.2: Prove behavior preservation**

```bash
npm run test -- --selectProjects unit -t "libraryToolbar"
npm run test -- --selectProjects unit
```

Expected: existing controller tests PASS unchanged.

- [ ] **Step 8.3: Write the failing composable test `tests/vue/useLibraryList.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { shallowRef } from 'vue';

import { useLibraryList } from '@/features/library/vue/useLibraryList';

interface Row { name: string; desc: string; tags: string[]; updated: number }

const accessors = {
  getName: (r: Row) => r.name,
  getDescription: (r: Row) => r.desc,
  getTags: (r: Row) => r.tags,
  getUpdatedAt: (r: Row) => r.updated,
};

const rows: Row[] = [
  { name: 'Beta', desc: 'second', tags: ['x'], updated: 2 },
  { name: 'Alpha', desc: 'first thing', tags: ['x', 'y'], updated: 3 },
  { name: 'Gamma', desc: 'third', tags: [], updated: 1 },
];

// The composable consumes a reactive SOURCE (not snapshots) so every mounted
// panel — including a second Library leaf — re-derives when the shared store
// changes. Tests drive the source through a shallowRef.
function makeList(initial: Row[]) {
  const src = shallowRef(initial);
  return { src, list: useLibraryList(() => src.value, accessors) };
}

describe('useLibraryList', () => {
  it('sorts by name by default and by updated desc when switched', () => {
    const { list } = makeList(rows);
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    list.sort.value = 'updated';
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma'].sort(
      (a, b) => rows.find((r) => r.name === b)!.updated - rows.find((r) => r.name === a)!.updated,
    ));
  });

  it('filters by case-insensitive substring over name+desc+tags', () => {
    const { list } = makeList(rows);
    list.query.value = 'FIRST';
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha']);
  });

  it('OR-filters by active tags and exposes the sorted tag union', () => {
    const { list } = makeList(rows);
    expect(list.allTags.value).toEqual(['x', 'y']);
    list.toggleFilter('y');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha']);
    list.toggleFilter('x');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    list.clearFilters();
    expect(list.rows.value).toHaveLength(3);
  });

  it('re-derives rows when the source changes (cross-leaf consistency)', () => {
    const { src, list } = makeList(rows);
    src.value = rows.filter((r) => r.name !== 'Beta');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Gamma']);
  });

  it('prunes active filters that vanish from the source', () => {
    const { src, list } = makeList(rows);
    list.toggleFilter('y');
    src.value = rows.filter((r) => !r.tags.includes('y'));
    expect(list.activeFilters.value).toEqual([]);
  });
});
```

Run: `npx vitest run --config vitest.config.mts tests/vue/useLibraryList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8.4: Implement `src/features/library/vue/useLibraryList.ts`**

```ts
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, shallowRef, triggerRef, watch } from 'vue';

import type { LibraryItemAccessors, LibrarySort } from '../../../shared/libraryToolbar';
import { applyLibraryQuery, collectLibraryTags } from '../../../shared/libraryToolbar';

export interface LibraryList<T> {
  items: ComputedRef<T[]>;
  query: Ref<string>;
  sort: Ref<LibrarySort>;
  activeFilters: ComputedRef<string[]>;
  allTags: ComputedRef<string[]>;
  rows: ComputedRef<T[]>;
  toggleFilter(tag: string): void;
  clearFilters(): void;
}

/**
 * Reactive twin of LibraryListController for the Vue panels: same pure engine
 * (applyLibraryQuery/collectLibraryTags), driven by a reactive SOURCE getter
 * (typically `() => store.xxx`) rather than snapshots. This is what keeps a
 * SECOND Library leaf consistent: the stores are plugin-global, so any leaf's
 * mutation reloads the store and every mounted panel's rows re-derive — no
 * manual "setItems after each action" step to forget.
 */
export function useLibraryList<T>(
  source: () => T[],
  accessors: LibraryItemAccessors<T>,
): LibraryList<T> {
  const items = computed(source);
  const query = ref('');
  const sort = ref<LibrarySort>('name');
  const active = shallowRef(new Set<string>());

  const allTags = computed(() => collectLibraryTags(items.value, accessors));
  const activeFilters = computed(() => [...active.value]);
  const rows = computed(() =>
    applyLibraryQuery(items.value, accessors, {
      query: query.value,
      sort: sort.value,
      active: active.value,
    }),
  );

  // Prune active filters whose tag vanished from the item set. flush: 'sync'
  // keeps the semantics of the old setItems() prune (and test determinism).
  // Called from component setup, the watcher is auto-disposed on unmount.
  watch(allTags, (tags) => {
    const present = new Set(tags);
    let changed = false;
    for (const tag of [...active.value]) {
      if (!present.has(tag)) {
        active.value.delete(tag);
        changed = true;
      }
    }
    if (changed) triggerRef(active);
  }, { flush: 'sync' });

  function toggleFilter(tag: string): void {
    if (active.value.has(tag)) active.value.delete(tag);
    else active.value.add(tag);
    triggerRef(active);
  }

  function clearFilters(): void {
    active.value.clear();
    triggerRef(active);
  }

  return { items, query, sort, activeFilters, allTags, rows, toggleFilter, clearFilters };
}
```

- [ ] **Step 8.5: Run to pass**

```bash
npm run test:vue && npm run typecheck:vue && npm run lint
```

Expected: all PASS.

- [ ] **Step 8.6: Commit**

```bash
git add src/shared/libraryToolbar.ts src/features/library/vue/useLibraryList.ts tests/vue/useLibraryList.test.ts
git commit -m "feat(library): extract pure list engine and add reactive useLibraryList composable"
```

---

### Task 9: Shared Vue atoms — LibraryToolbar, LibraryCard, LibraryEmptyState

**Files:**
- Create: `src/features/library/vue/components/LibraryToolbar.vue`
- Create: `src/features/library/vue/components/LibraryCard.vue`
- Create: `src/features/library/vue/components/LibraryEmptyState.vue`
- Test: `tests/vue/components/libraryToolbar.test.ts`
- Test: `tests/vue/components/libraryCard.test.ts`

- [ ] **Step 9.1: Write the failing toolbar test `tests/vue/components/libraryToolbar.test.ts`**

```ts
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import LibraryToolbar from '@/features/library/vue/components/LibraryToolbar.vue';

const baseProps = {
  query: '',
  sort: 'name' as const,
  tags: ['alpha', 'beta'],
  activeFilters: [] as string[],
};

describe('LibraryToolbar', () => {
  it('emits update:query on input', async () => {
    const { emitted } = render(LibraryToolbar, { props: baseProps });
    await fireEvent.update(screen.getByRole('searchbox'), 'abc');
    expect(emitted()['update:query']).toEqual([['abc']]);
  });

  it('emits update:sort on select change', async () => {
    const { emitted } = render(LibraryToolbar, { props: baseProps });
    await fireEvent.update(screen.getByRole('combobox'), 'updated');
    expect(emitted()['update:sort']).toEqual([['updated']]);
  });

  it('renders a chip per tag, marks active ones pressed, and emits toggle/clear', async () => {
    const { emitted } = render(LibraryToolbar, {
      props: { ...baseProps, activeFilters: ['beta'] },
    });
    const beta = screen.getByRole('button', { name: 'beta' });
    expect(beta.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'alpha' }));
    expect(emitted()['toggle-filter']).toEqual([['alpha']]);
    await fireEvent.click(screen.getByText('Clear filters'));
    expect(emitted()['clear-filters']).toHaveLength(1);
  });

  it('hides the chip row entirely when there are no tags', () => {
    render(LibraryToolbar, { props: { ...baseProps, tags: [] } });
    expect(document.querySelector('.specorator-library-filterchips')).toBeNull();
  });
});
```

Run: `npx vitest run --config vitest.config.mts tests/vue/components/libraryToolbar.test.ts` — expected FAIL (module not found).

- [ ] **Step 9.2: Implement `LibraryToolbar.vue`** (labels resolved internally via the same `libraryToolbarLabels()` the legacy toolbar uses — same i18n keys, no prop plumbing):

```vue
<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { LibrarySort } from '../../../../shared/libraryToolbar';
import { libraryToolbarLabels } from '../../../../shared/libraryToolbar';

const props = defineProps<{
  query: string;
  sort: LibrarySort;
  tags: string[];
  activeFilters: string[];
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:sort': [value: LibrarySort];
  'toggle-filter': [tag: string];
  'clear-filters': [];
}>();

const labels = libraryToolbarLabels();
const activeSet = computed(() => new Set(props.activeFilters));

function onSearch(e: Event): void {
  emit('update:query', (e.target as HTMLInputElement).value);
}

function onSort(e: Event): void {
  emit('update:sort', (e.target as HTMLSelectElement).value as LibrarySort);
}
</script>

<template>
  <div class="specorator-library-toolbar">
    <input
      class="specorator-library-search"
      type="search"
      :placeholder="labels.searchPlaceholder"
      :aria-label="labels.searchPlaceholder"
      :value="props.query"
      @input="onSearch"
    />
    <select
      class="specorator-library-sort dropdown"
      :aria-label="labels.sortLabel"
      :value="props.sort"
      @change="onSort"
    >
      <option value="name">{{ labels.sortName }}</option>
      <option value="updated">{{ labels.sortUpdated }}</option>
    </select>
    <div
      v-if="props.tags.length > 0"
      class="specorator-library-filterchips"
      role="group"
      :aria-label="t('library.filterGroupLabel')"
    >
      <button
        type="button"
        class="specorator-library-filterreset"
        :class="{ 'is-hidden': props.activeFilters.length === 0 }"
        @click="emit('clear-filters')"
      >
        {{ labels.resetFilters }}
      </button>
      <button
        v-for="tag in props.tags"
        :key="tag"
        type="button"
        class="specorator-library-filterchip"
        :class="{ 'is-on': activeSet.has(tag) }"
        :aria-pressed="String(activeSet.has(tag))"
        @click="emit('toggle-filter', tag)"
      >
        {{ tag }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 9.3: Write the failing card test `tests/vue/components/libraryCard.test.ts`**

```ts
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';

import LibraryCard from '@/features/library/vue/components/LibraryCard.vue';

describe('LibraryCard', () => {
  it('renders name, activates on card click and on Enter, but NOT from nested buttons', async () => {
    let activations = 0;
    let nested = 0;
    render(LibraryCard, {
      props: { name: 'My item', ariaLabel: 'My item', onActivate: () => { activations += 1; } },
      slots: {
        actions: () => h('button', { type: 'button', onClick: (e: MouseEvent) => { e.stopPropagation(); nested += 1; } }, 'Do'),
      },
    });
    const card = screen.getByRole('button', { name: 'My item' });
    await fireEvent.click(card);
    expect(activations).toBe(1);
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(activations).toBe(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Do' }));
    expect(nested).toBe(1);
    expect(activations).toBe(2);
  });

  it('renders tag chips only when tags exist', () => {
    render(LibraryCard, {
      props: { name: 'x', ariaLabel: 'x', tags: ['t1', 't2'] },
    });
    expect(document.querySelectorAll('.specorator-library-chip')).toHaveLength(2);
  });
});
```

Run — expected FAIL.

- [ ] **Step 9.4: Implement `LibraryCard.vue`** (parity with `createLibraryCard` in `src/utils/libraryView.ts`: `role=button`, `tabindex=0`, Enter/Space with `e.target !== card` guard so nested action buttons keep native behavior):

```vue
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  name: string;
  ariaLabel: string;
  tags?: string[];
}>();

const emit = defineEmits<{ activate: [] }>();
const cardEl = ref<HTMLElement | null>(null);

function onKeydown(e: KeyboardEvent): void {
  if (e.target !== cardEl.value) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('activate');
  }
}
</script>

<template>
  <div
    ref="cardEl"
    class="specorator-library-card"
    role="button"
    tabindex="0"
    :aria-label="props.ariaLabel"
    @click="emit('activate')"
    @keydown="onKeydown"
  >
    <div v-if="$slots.leading" class="specorator-library-card-leading">
      <slot name="leading" />
    </div>
    <div class="specorator-library-card-body">
      <div class="specorator-library-card-name">
        <span>{{ props.name }}</span>
        <slot name="name-chips" />
      </div>
      <slot />
      <div v-if="props.tags && props.tags.length > 0" class="specorator-library-card-caps">
        <span v-for="tag in props.tags" :key="tag" class="specorator-library-chip">{{ tag }}</span>
      </div>
    </div>
    <div class="specorator-library-card-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>
```

NOTE: `@click.stop` on the actions container is the Vue idiom replacing the per-button `stopPropagation` calls in the legacy views — nested action clicks never bubble to the card.

- [ ] **Step 9.5: Implement `LibraryEmptyState.vue`** (no dedicated test — covered through panel tests):

```vue
<script setup lang="ts">
import { setIcon } from 'obsidian';
import { onMounted, ref } from 'vue';

const props = defineProps<{
  icon: string;
  message: string;
  actionLabel?: string;
}>();

const emit = defineEmits<{ action: [] }>();
const iconEl = ref<HTMLElement | null>(null);

onMounted(() => {
  if (iconEl.value) setIcon(iconEl.value, props.icon);
});
</script>

<template>
  <div class="specorator-library-empty">
    <div ref="iconEl" class="specorator-library-empty-icon" />
    <div class="specorator-library-empty-text">{{ props.message }}</div>
    <button
      v-if="props.actionLabel"
      type="button"
      class="mod-cta specorator-library-empty-action"
      @click="emit('action')"
    >
      {{ props.actionLabel }}
    </button>
  </div>
</template>
```

- [ ] **Step 9.6: Run everything**

```bash
npm run test:vue && npm run typecheck:vue && npm run lint
```

Expected: all PASS.

- [ ] **Step 9.7: Commit**

```bash
git add src/features/library/vue/components tests/vue/components
git commit -m "feat(library): shared Vue atoms — toolbar, interactive card, empty state"
```

---

### Task 10: Loops tab — `useLoopLibraryStore` + `LoopsPanel.vue`

**Files:**
- Create: `src/features/library/vue/stores/loopLibraryStore.ts`
- Create: `src/features/library/vue/panels/LoopsPanel.vue`
- Modify: `src/features/library/vue/LibraryRoot.vue` (mount the panel)
- Test: `tests/vue/stores/loopLibraryStore.test.ts`
- Test: `tests/vue/panels/loopsPanel.test.ts`

Reference APIs (verified 2026-07-01):
- `LoopNoteStore` (`src/features/tasks/loops/LoopNoteStore.ts`): `list(vault, folder): Promise<{ loops: LoopDefinition[]; warnings: string[] }>`, `save(vault, folder, input: SaveLoopInput, originalPath?): Promise<string>`, `delete(app, path): Promise<void>`, `getFilePathForName(folder, name): string`.
- `LoopEditorModal` ctor: `(app, existing: LoopDefinition | null, onSave: (payload: LoopEditorPayload) => Promise<void>)` where `LoopEditorPayload extends SaveLoopInput { originalPath?: string }`.
- `launchLoopPrompt(plugin, loop): void` (`src/features/quickActions/launchLoopPrompt.ts`).
- `installPresetLoopsWithNotice(plugin)` (`src/features/tasks/loops/installPresetLoops.ts`).
- Folder resolution: `plugin.settings.agentBoardLoopFolder || 'Agent Board/loops'`.

- [ ] **Step 10.1: Write the failing store test `tests/vue/stores/loopLibraryStore.test.ts`**

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';

const loopA = { path: 'l/a.md', id: 'a', name: 'A loop', useWhen: '', approach: 'x', steps: '', verify: '', notes: '', tags: ['t'] };

function makePlugin() {
  return {
    app: { vault: { getAbstractFileByPath: vi.fn().mockReturnValue(null) } },
    settings: { agentBoardLoopFolder: '' },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('useLoopLibraryStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() lists loops from the note store into reactive state', async () => {
    const store = useLoopLibraryStore();
    store.init(makePlugin(), {
      list: vi.fn().mockResolvedValue({ loops: [loopA], warnings: [] }),
    } as never);
    await store.load();
    expect(store.loops).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it('clone() saves "<name> copy" with a deduped name, then reloads', async () => {
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn().mockResolvedValue({ loops: [loopA], warnings: [] }),
      save: vi.fn().mockResolvedValue('l/a-copy.md'),
      getFilePathForName: (_f: string, name: string) => `l/${name}.md`,
    };
    const plugin = makePlugin();
    // First candidate exists -> expect "A loop copy 2"
    (plugin as { app: { vault: { getAbstractFileByPath: ReturnType<typeof vi.fn> } } }).app.vault
      .getAbstractFileByPath = vi.fn((p: string) => (p === 'l/A loop copy.md' ? {} : null));
    store.init(plugin, noteStore as never);
    await store.clone(loopA as never);
    expect(noteStore.save).toHaveBeenCalledWith(
      expect.anything(), 'Agent Board/loops',
      expect.objectContaining({ name: 'A loop copy 2' }),
    );
    expect(noteStore.list).toHaveBeenCalled();
  });

  it('save() persists through the note store and reloads', async () => {
    const store = useLoopLibraryStore();
    const noteStore = {
      list: vi.fn().mockResolvedValue({ loops: [], warnings: [] }),
      save: vi.fn().mockResolvedValue('l/new.md'),
    };
    store.init(makePlugin(), noteStore as never);
    await store.save({ name: 'New', useWhen: '', approach: 'a', steps: '', verify: '', notes: '' });
    expect(noteStore.save).toHaveBeenCalled();
    expect(noteStore.list).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --config vitest.config.mts tests/vue/stores/loopLibraryStore.test.ts` — expected FAIL.

- [ ] **Step 10.2: Implement `src/features/library/vue/stores/loopLibraryStore.ts`**

```ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { LoopNoteStore } from '../../../tasks/loops/LoopNoteStore';
import type { LoopDefinition, SaveLoopInput } from '../../../tasks/loops/loopTypes';

/**
 * Reactive projection of the loop notes. I/O stays in LoopNoteStore; actions
 * orchestrate and commit into refs (spec § Pinia topology). `init` wires the
 * plugin once per pinia lifetime — stores are module-global, the plugin
 * reference is not reactive state.
 */
export const useLoopLibraryStore = defineStore('library-loops', () => {
  const loops = shallowRef<LoopDefinition[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;
  let noteStore = new LoopNoteStore();

  function init(p: SpecoratorPlugin, store?: LoopNoteStore): void {
    plugin = p;
    if (store) noteStore = store;
  }

  function folder(): string {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    return plugin.settings.agentBoardLoopFolder || 'Agent Board/loops';
  }

  async function load(): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    loading.value = true;
    try {
      const { loops: list } = await noteStore.list(plugin.app.vault, folder());
      loops.value = list;
    } finally {
      loading.value = false;
    }
  }

  async function save(input: SaveLoopInput, originalPath?: string): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    await noteStore.save(plugin.app.vault, folder(), input, originalPath);
    await load();
  }

  async function remove(loop: LoopDefinition): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    await noteStore.delete(plugin.app, loop.path);
    await load();
  }

  /** Port of LoopLibraryView.cloneLoop: probe "<name> copy[ n]" until free. */
  async function clone(loop: LoopDefinition): Promise<void> {
    if (!plugin) throw new Error('loopLibraryStore used before init()');
    const vault = plugin.app.vault;
    let cloneName = `${loop.name} copy`;
    for (let n = 2; vault.getAbstractFileByPath(noteStore.getFilePathForName(folder(), cloneName)); n += 1) {
      cloneName = `${loop.name} copy ${n}`;
    }
    await noteStore.save(vault, folder(), { ...loop, name: cloneName });
    await load();
  }

  return { loops, loading, init, load, save, remove, clone };
});
```

Run the store test again — expected PASS.

- [ ] **Step 10.3: Write the failing panel test `tests/vue/panels/loopsPanel.test.ts`**

```ts
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoopsPanel from '@/features/library/vue/panels/LoopsPanel.vue';
import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';
import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';

vi.mock('@/features/quickActions/launchLoopPrompt', () => ({ launchLoopPrompt: vi.fn() }));
import { launchLoopPrompt } from '@/features/quickActions/launchLoopPrompt';

const loop = { path: 'l/a.md', id: 'a', name: 'A loop', description: 'desc', useWhen: 'when', approach: 'x', steps: '', verify: '', notes: '', tags: ['tag1'] };

function setup(loops: unknown[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  // One plugin object for BOTH init() and provide() — the panel re-inits the
  // store with the injected plugin, so they must be the same fake.
  const plugin = {
    app: { vault: {} },
    settings: {},
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
  const store = useLoopLibraryStore();
  store.init(plugin, { list: vi.fn().mockResolvedValue({ loops, warnings: [] }) } as never);
  const utils = render(LoopsPanel, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: plugin },
    },
  });
  return { store, plugin, ...utils };
}

describe('LoopsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders loop cards with description, useWhen row, and tag chips', async () => {
    setup([loop]);
    expect(await screen.findByText('A loop')).toBeTruthy();
    expect(screen.getByText('desc')).toBeTruthy();
    // Tags render in BOTH the toolbar filter chips and the card — scope to the
    // card or getByText throws 'Found multiple elements'.
    const card = screen.getByRole('button', { name: 'A loop' });
    expect(within(card).getByText('tag1')).toBeTruthy();
  });

  it('Prompt button launches the loop prompt flow without activating the card', async () => {
    setup([loop]);
    await screen.findByText('A loop');
    await fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(launchLoopPrompt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'a' }));
  });

  it('shows the empty state with a New loop CTA when there are no loops', async () => {
    setup([]);
    expect(await screen.findByText(/No loops yet/)).toBeTruthy();
  });
});
```

Run — expected FAIL.

- [ ] **Step 10.4: Implement `src/features/library/vue/panels/LoopsPanel.vue`**

```vue
<script setup lang="ts">
import { Notice } from 'obsidian';
import { inject, onMounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { launchLoopPrompt } from '../../../quickActions/launchLoopPrompt';
import { installPresetLoopsWithNotice } from '../../../tasks/loops/installPresetLoops';
import type { LoopDefinition } from '../../../tasks/loops/loopTypes';
import { LoopEditorModal } from '../../../tasks/ui/LoopEditorModal';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { useLoopLibraryStore } from '../stores/loopLibraryStore';
import { useLibraryList } from '../useLibraryList';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('LoopsPanel mounted without PLUGIN_KEY');

const store = useLoopLibraryStore();
store.init(plugin);

// Source-based: rows re-derive from the global store, so a mutation in ANY
// Library leaf updates every mounted panel (multi-leaf consistency).
const list = useLibraryList<LoopDefinition>(() => store.loops, {
  getName: (l) => l.name,
  getDescription: (l) => `${l.description ?? ''} ${l.useWhen ?? ''}`,
  getTags: (l) => l.tags ?? [],
  getUpdatedAt: (l) => l.updatedAt ?? 0,
});

onMounted(() => void withErrorNotice(() => store.load(), t('loopLibrary.actionFailed'), fail));

function fail(error: unknown): void {
  plugin?.logger.scope('tasks').error('loop library action failed', error);
}

function openEditor(existing: LoopDefinition | null): void {
  if (!plugin) return;
  new LoopEditorModal(plugin.app, existing, async (payload) => {
    await store.save(payload, payload.originalPath); // store reload propagates reactively
  }).open();
}

function onPrompt(loop: LoopDefinition): void {
  if (plugin) launchLoopPrompt(plugin, loop);
}

function onClone(loop: LoopDefinition): void {
  void withErrorNotice(() => store.clone(loop), t('loopLibrary.actionFailed'), fail);
}

function onDelete(loop: LoopDefinition): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    const ok = await confirm(plugin.app, t('loopLibrary.deleteConfirm', { name: loop.name }), t('loopLibrary.delete'));
    if (!ok) return;
    await store.remove(loop);
    new Notice(t('loopLibrary.deleted', { name: loop.name }));
  }, t('loopLibrary.actionFailed'), fail);
}

function onInstallStarters(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    await installPresetLoopsWithNotice(plugin);
    await store.load();
  }, t('loopLibrary.actionFailed'), fail);
}
</script>

<template>
  <div class="specorator-library-header">
    <h2>{{ t('loopLibrary.title') }}</h2>
    <div class="specorator-library-header-actions">
      <button type="button" class="mod-cta" @click="openEditor(null)">{{ t('loopLibrary.newLoop') }}</button>
      <button type="button" @click="onInstallStarters">{{ t('loopLibrary.installStarter') }}</button>
    </div>
  </div>
  <div class="specorator-library-toolbar-slot">
    <LibraryToolbar
      v-if="store.loops.length > 0"
      :query="list.query.value"
      :sort="list.sort.value"
      :tags="list.allTags.value"
      :active-filters="list.activeFilters.value"
      @update:query="list.query.value = $event"
      @update:sort="list.sort.value = $event"
      @toggle-filter="list.toggleFilter($event)"
      @clear-filters="list.clearFilters()"
    />
  </div>
  <div class="specorator-library-list">
    <div v-if="store.loading" class="specorator-library-loading">{{ t('common.loading') }}</div>
    <LibraryEmptyState
      v-else-if="store.loops.length === 0"
      icon="repeat"
      :message="t('loopLibrary.empty')"
      :action-label="t('loopLibrary.newLoop')"
      @action="openEditor(null)"
    />
    <template v-else>
      <div v-if="list.rows.value.length === 0" class="specorator-library-empty-text">
        {{ t('library.noMatches') }}
      </div>
      <LibraryCard
        v-for="loop in list.rows.value"
        :key="loop.path"
        :name="loop.name"
        :aria-label="loop.name"
        :tags="loop.tags ?? []"
        @activate="openEditor(loop)"
      >
        <div v-if="loop.description" class="specorator-library-card-desc">{{ loop.description }}</div>
        <div v-if="loop.useWhen" class="specorator-library-card-desc">
          {{ t('loopLibrary.useWhenLabel') }} {{ loop.useWhen }}
        </div>
        <template #actions>
          <button type="button" class="mod-cta" @click="onPrompt(loop)">{{ t('loopLibrary.prompt') }}</button>
          <button type="button" class="specorator-library-card-icon" :aria-label="t('library.duplicate')" :title="t('library.duplicate')" @click="onClone(loop)">⧉</button>
          <button type="button" class="specorator-library-card-delete" @click="onDelete(loop)">{{ t('loopLibrary.delete') }}</button>
        </template>
      </LibraryCard>
    </template>
  </div>
</template>
```

NOTE on the clone button glyph: the legacy button uses Obsidian `setIcon(btn, 'copy')`. In Vue, either keep the `⧉` text glyph OR reproduce the icon with a tiny `onMounted`+`setIcon` sub-component. Parity check in Step 10.6 uses the aria-label, not the glyph — but for visual parity implement a 10-line `ObsidianIcon.vue` in `components/` if the glyph looks off in manual QA:

```vue
<script setup lang="ts">
import { setIcon } from 'obsidian';
import { onMounted, ref } from 'vue';
const props = defineProps<{ icon: string }>();
const el = ref<HTMLElement | null>(null);
onMounted(() => { if (el.value) setIcon(el.value, props.icon); });
</script>
<template><span ref="el" /></template>
```

- [ ] **Step 10.5: Wire the panel into `LibraryRoot.vue`.** Replace the placeholder `<div class="specorator-library-list" ... />` with:

```vue
  <LoopsPanel v-if="activeTab === 'loops'" />
  <div v-else class="specorator-library-list" :data-active-tab="activeTab" />
```

and add the import in the script block:

```ts
import LoopsPanel from './panels/LoopsPanel.vue';
```

Then update `tests/vue/libraryView.test.ts`'s tab-switch assertions: clicking the third tab now mounts the Loops panel instead of the placeholder — assert `el.querySelector('.specorator-library-header h2')?.textContent` contains the loop title (`'Loop library'`) instead of checking `data-active-tab="loops"` (keep the `skills` placeholder assertion as-is until Task 11).

ALSO: the mounted panel resolves its Pinia store against the view's module-singleton pinia, and the real `LoopNoteStore.list` would hit the fake vault. Pre-init the store with a stubbed note store on THAT pinia before `view.onOpen()`:

```ts
import { setActivePinia } from 'pinia';
import { getLibraryPinia } from '@/features/library/vue/globalPinia';
import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';
// inside the test, after makePlugin():
setActivePinia(getLibraryPinia());
useLoopLibraryStore().init(plugin, { list: vi.fn().mockResolvedValue({ loops: [], warnings: [] }) } as never);
```

(The Skills/Agents panels' backends are already stubbed on the shared `makePlugin` fake, so Tasks 11/12 need no extra store pre-init here.)

- [ ] **Step 10.6: Run everything**

```bash
npm run test:vue && npm run typecheck:vue && npm run lint && npm run test
```

Expected: all PASS (Jest untouched; runs as regression guard).

- [ ] **Step 10.7: Commit**

```bash
git add src/features/library tests/vue
git commit -m "feat(library): Loops tab — useLoopLibraryStore + LoopsPanel with search/tags/clone/prompt parity"
```

---

### Task 11: Skills tab — `useSkillLibraryStore` + `SkillsPanel.vue`

**Files:**
- Create: `src/features/skills/skillCloning.ts` (extraction from the legacy view)
- Modify: `src/features/skills/view/SkillLibraryView.ts` (import from skillCloning.ts, delete the local copies)
- Create: `src/features/library/vue/stores/skillLibraryStore.ts`
- Create: `src/features/library/vue/panels/SkillsPanel.vue`
- Modify: `src/features/library/vue/LibraryRoot.vue`
- Test: `tests/vue/stores/skillLibraryStore.test.ts`
- Test: `tests/vue/panels/skillsPanel.test.ts`

Reference APIs: `plugin.vaultSkillAggregator.listAll(): Promise<SkillTabEntry[]>`; `toSkillLibraryRows(entries, tagsById): SkillLibraryRow[]` (`src/features/skills/skillLibraryRows.ts`); tag/mtime loading reads frontmatter via `plugin.vaultFileAdapter.read/stat` + `resolveSkillVaultPath(plugin.app, sourceFilePath)` (`src/features/skills/skillPaths.ts`); `runVaultSkill(plugin, entry, null)`; `SkillEditorModal(app, plugin, row, onSaved)`; `promptReason(app, title)` from `shared/modals/PromptModal`.

- [ ] **Step 11.1: Extract `src/features/skills/skillCloning.ts`.** Move `isCloneableSkillPath` and `skillTemplate` VERBATIM out of `SkillLibraryView.ts` (lines 31–46) into the new module, export both, keep their doc comments, and update `SkillLibraryView.ts` to import them. Also export the constant:

```ts
export const SKILLS_DIR = '.claude/skills';
```

and import it in the view (delete the local `const SKILLS_DIR`). Run `npm run test -- --selectProjects unit -t "skill"` + `npm run typecheck` — expected green (pure move).

- [ ] **Step 11.2: Write the failing store test `tests/vue/stores/skillLibraryStore.test.ts`**

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSkillLibraryStore } from '@/features/library/vue/stores/skillLibraryStore';

const entry = {
  id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Vault',
  name: 'a', description: 'd', insertPrefix: '$' as const,
  sourceFilePath: '.claude/skills/a/SKILL.md', providerEnabled: true,
};

function makePlugin(entries: unknown[]) {
  return {
    app: {},
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue(entries) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue('---\ntags: [t1]\n---\nbody'),
      stat: vi.fn().mockResolvedValue({ mtime: 42 }),
      write: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    },
    events: { emit: vi.fn() },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('useSkillLibraryStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() builds rows with frontmatter tags and keeps the entry lookup', async () => {
    const store = useSkillLibraryStore();
    store.init(makePlugin([entry]));
    await store.load();
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tags).toEqual(['t1']);
    expect(store.entryFor(store.rows[0].id)).toMatchObject({ name: 'a' });
    expect(store.mtimeFor(store.rows[0].id)).toBe(42);
  });

  it('clone() writes a -copy dir, emits vaultSkill.changed, and reloads', async () => {
    const store = useSkillLibraryStore();
    const plugin = makePlugin([entry]);
    store.init(plugin);
    await store.load();
    const clonePath = await store.clone(store.rows[0]);
    expect(clonePath).toBe('.claude/skills/a-copy/SKILL.md');
    const p = plugin as { vaultFileAdapter: { write: ReturnType<typeof vi.fn> }; events: { emit: ReturnType<typeof vi.fn> } };
    expect(p.vaultFileAdapter.write).toHaveBeenCalled();
    expect(p.events.emit).toHaveBeenCalledWith('vaultSkill.changed', { providerId: 'claude' });
  });
});
```

Run — expected FAIL.

- [ ] **Step 11.3: Implement `src/features/library/vue/stores/skillLibraryStore.ts`** (ports `SkillLibraryView.render`'s data half + `loadSkillTags` + `cloneSkill`'s write half verbatim in behavior):

```ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { extractStringArray, parseFrontmatter } from '../../../../utils/frontmatter';
import { librarySlug, uniqueChildDir } from '../../../../utils/libraryView';
import type { SkillTabEntry } from '../../../quickActions/skills/types';
import { isCloneableSkillPath } from '../../../skills/skillCloning';
import type { SkillLibraryRow } from '../../../skills/skillLibraryRows';
import { toSkillLibraryRows } from '../../../skills/skillLibraryRows';
import { resolveSkillVaultPath } from '../../../skills/skillPaths';

export const useSkillLibraryStore = defineStore('library-skills', () => {
  const rows = shallowRef<SkillLibraryRow[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;
  let entryById = new Map<string, SkillTabEntry>();
  let mtimeById = new Map<string, number>();

  function init(p: SpecoratorPlugin): void {
    plugin = p;
  }

  function entryFor(id: string): SkillTabEntry | undefined {
    return entryById.get(id);
  }

  function mtimeFor(id: string): number {
    return mtimeById.get(id) ?? 0;
  }

  async function loadSkillTags(entries: SkillTabEntry[]): Promise<Map<string, string[]>> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    mtimeById = new Map();
    const out = new Map<string, string[]>();
    await Promise.all(entries.map(async (e) => {
      if (!e.sourceFilePath) return;
      const readPath = resolveSkillVaultPath(p.app, e.sourceFilePath);
      if (!readPath) return;
      try {
        const content = await p.vaultFileAdapter.read(readPath);
        const parsed = parseFrontmatter(content);
        const tags = parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
        if (tags && tags.length > 0) out.set(e.id, tags);
        const st = await p.vaultFileAdapter.stat(readPath);
        if (st) mtimeById.set(e.id, st.mtime);
      } catch { /* out-of-vault path or missing -> no tags/mtime */ }
    }));
    return out;
  }

  async function load(): Promise<void> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    loading.value = true;
    try {
      const entries = (await p.vaultSkillAggregator?.listAll()) ?? [];
      entryById = new Map(entries.map((e) => [e.id, e]));
      const tagsById = await loadSkillTags(entries);
      rows.value = toSkillLibraryRows(entries, tagsById);
    } finally {
      loading.value = false;
    }
  }

  /** Port of SkillLibraryView.cloneSkill's write half; returns the clone path. */
  async function clone(row: SkillLibraryRow): Promise<string | null> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    if (!isCloneableSkillPath(row.sourceFilePath)) return null;
    const adapter = p.vaultFileAdapter;
    const root = row.sourceFilePath.split('/').slice(0, -2).join('/');
    const content = await adapter.read(row.sourceFilePath).catch(() => '');
    const dir = await uniqueChildDir(adapter, root, `${librarySlug(row.name)}-copy`);
    const path = `${dir}/SKILL.md`;
    await adapter.write(path, content);
    p.events.emit('vaultSkill.changed', { providerId: 'claude' });
    await load();
    return path;
  }

  return { rows, loading, init, load, clone, entryFor, mtimeFor };
});
```

Run the store test — expected PASS.

- [ ] **Step 11.4: Write the failing panel test `tests/vue/panels/skillsPanel.test.ts`**

```ts
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';
import SkillsPanel from '@/features/library/vue/panels/SkillsPanel.vue';
import { useSkillLibraryStore } from '@/features/library/vue/stores/skillLibraryStore';

vi.mock('@/features/quickActions/skills/runVaultSkill', () => ({ runVaultSkill: vi.fn().mockResolvedValue(undefined) }));
import { runVaultSkill } from '@/features/quickActions/skills/runVaultSkill';

const entry = {
  id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Vault',
  name: 'a-skill', description: 'does a', insertPrefix: '$' as const,
  sourceFilePath: '.claude/skills/a/SKILL.md', providerEnabled: true,
};

function makePlugin() {
  return {
    app: {},
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([entry]) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue('---\ntags: [t1]\n---\n'),
      stat: vi.fn().mockResolvedValue({ mtime: 1 }),
    },
    events: { emit: vi.fn() },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('SkillsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('renders skill rows with provider chip and tags', async () => {
    const plugin = makePlugin();
    useSkillLibraryStore().init(plugin);
    render(SkillsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    expect(await screen.findByText('a-skill')).toBeTruthy();
    // Provider name + tags also appear as toolbar filter chips — scope to the card.
    const card = screen.getByRole('button', { name: 'a-skill' });
    expect(within(card).getByText('Vault')).toBeTruthy();
    expect(within(card).getByText('t1')).toBeTruthy();
  });

  it('Prompt routes through runVaultSkill with the source entry', async () => {
    const plugin = makePlugin();
    useSkillLibraryStore().init(plugin);
    render(SkillsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('a-skill');
    await fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(runVaultSkill).toHaveBeenCalledWith(plugin, expect.objectContaining({ id: 'claude:skill-a' }), null);
  });
});
```

Run — expected FAIL.

- [ ] **Step 11.5: Implement `src/features/library/vue/panels/SkillsPanel.vue`.** Same shape as LoopsPanel; differences only listed here — copy LoopsPanel and adapt:

- Store: `useSkillLibraryStore`; accessors:

```ts
const list = useLibraryList<SkillLibraryRow>(() => store.rows, {
  getName: (r) => r.name,
  getDescription: (r) => r.description,
  getTags: (r) => [r.providerDisplayName, ...(r.tags ?? [])],
  getUpdatedAt: (r) => store.mtimeFor(r.id),
});

// reload() in this panel is just store.load() — rows re-derive reactively.
```

- Header: title `t('skillLibrary.title')`; single CTA `t('skillLibrary.newSkill')` → `onCreateSkill()`.
- Card: name-chips slot renders the provider chip and, when `!row.editable`, the read-only chip:

```vue
<template #name-chips>
  <span class="specorator-library-chip specorator-library-chip-muted">{{ row.providerDisplayName }}</span>
  <span v-if="!row.editable" class="specorator-library-chip specorator-library-chip-outline">{{ t('skillLibrary.readOnlyNote') }}</span>
</template>
```

- Card body: `<div class="specorator-library-card-desc">{{ row.description }}</div>`; `:tags="row.tags ?? []"`.
- Activate → `openEditor(row)`:

```ts
function openEditor(row: SkillLibraryRow): void {
  if (!plugin) return;
  new SkillEditorModal(plugin.app, plugin, row, () => void reload()).open();
}
```

- Actions: Prompt button (`t('skillLibrary.prompt')`) calling:

```ts
function onPrompt(row: SkillLibraryRow): void {
  const entry = store.entryFor(row.id);
  if (entry && plugin) {
    void runVaultSkill(plugin, entry, null);
  } else {
    new Notice(t('skillLibrary.actionFailed'));
    plugin?.logger.scope('skills').warn('skill prompt: no entry for row', row.id);
  }
}
```

Clone button rendered only `v-if="isCloneableSkillPath(row.sourceFilePath)"`, calling `store.clone(row)` then opening the editor on the synthesized clone row exactly as `SkillLibraryView.cloneSkill` does (lines 168–182 of the legacy view — copy that row-synthesis block).
- Create flow (port of `createSkill`, lines 197–219):

```ts
function onCreateSkill(): void {
  void withErrorNotice(async () => {
    if (!plugin) return;
    const name = await promptReason(plugin.app, t('skillLibrary.namePrompt'));
    if (!name) return;
    const dir = await uniqueChildDir(plugin.vaultFileAdapter, SKILLS_DIR, librarySlug(name) || 'skill');
    const path = `${dir}/SKILL.md`;
    await plugin.vaultFileAdapter.write(path, skillTemplate(name));
    plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    new Notice(t('skillLibrary.created', { path }));
    await reload();
    openEditor({
      id: `skill-${dir.split('/').pop() ?? ''}`,
      name,
      description: '',
      providerId: 'claude',
      providerDisplayName: t('skillLibrary.providerVault'),
      sourceFilePath: path,
      editable: true,
    });
  }, t('skillLibrary.actionFailed'), fail);
}
```

- Empty state: icon `book-open`, `t('skillLibrary.empty')`, CTA `t('skillLibrary.newSkill')`.

- [ ] **Step 11.6: Wire into `LibraryRoot.vue`** (add `SkillsPanel v-else-if="activeTab === 'skills'"` + import; the placeholder now only covers `agents`). Update `tests/vue/libraryView.test.ts` accordingly (skills tab asserts the Skill Library h2).

- [ ] **Step 11.7: Run everything**

```bash
npm run test:vue && npm run typecheck:vue && npm run lint && npm run test
```

Expected: all PASS.

- [ ] **Step 11.8: Commit**

```bash
git add src/features/skills src/features/library tests/vue
git commit -m "feat(library): Skills tab — useSkillLibraryStore + SkillsPanel with prompt/clone/create parity"
```

---

### Task 12: Agents tab — `useRosterStore` + `AgentsPanel.vue`

**Files:**
- Create: `src/features/library/vue/stores/rosterStore.ts`
- Create: `src/features/library/vue/panels/AgentsPanel.vue`
- Modify: `src/features/agents/roster/view/AgentDetailEditor.ts` (optional `onSaved` callback)
- Modify: `src/features/library/vue/LibraryRoot.vue`
- Test: `tests/vue/stores/rosterStore.test.ts`
- Test: `tests/vue/panels/agentsPanel.test.ts`

Reference APIs: `plugin.agentRosterStore` (`AgentRosterStore`: `list/get/save/delete`); `AgentDetailEditor` is a PAGE-OWNING class, not a modal — `new AgentDetailEditor(plugin, { onBack, onStartChat, onDeleted })` then `await editor.render(rootEl, agent, opts?)`; clone helpers `createRosterAgent(name, now)` / `dedupeRosterId(baseId, existingIds)` from `src/features/agents/roster/rosterCapabilities.ts`; avatar via `renderAgentAvatar(slot, rosterAgentToPersona(agent), 36)` — NOTE these live directly under `src/features/agents/` (`agentAvatar.ts:23`, `personaRegistry.ts:48`), NOT under `agents/roster/`; provider resolution via `resolveAgentProvider` (`resolveAgentProvider.ts`) + `ProviderRegistry`; starters via `installPresetAgents(store)` (`presetAgents.ts`); chat start via `plugin.createConversation({ providerId, boundAgentId })` + `plugin.openConversation(id, { requireNewTab: true })`; sync via `plugin.syncRosterAgentsToProviders()`.

- [ ] **Step 12.1: Write the failing store test `tests/vue/stores/rosterStore.test.ts`**

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRosterStore } from '@/features/library/vue/stores/rosterStore';

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: ['t'],
  createdAt: 1, updatedAt: 2,
};

function makePlugin(agents: unknown[]) {
  const rosterStore = {
    list: vi.fn().mockResolvedValue(agents),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    plugin: { agentRosterStore: rosterStore, removeRosterAgentProjection: vi.fn().mockResolvedValue(undefined) } as never,
    rosterStore,
  };
}

describe('useRosterStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() lists agents into reactive state', async () => {
    const { plugin } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.load();
    expect(store.agents).toHaveLength(1);
  });

  it('clone() saves "<name> copy" with deduped id and returns the clone', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.load();
    const clone = await store.clone(agent as never);
    expect(clone.name).toBe('Alice copy');
    expect(clone.id).not.toBe(agent.id);
    expect(rosterStore.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice copy' }));
  });

  it('remove() deletes, clears the projection, and reloads', async () => {
    const { plugin, rosterStore } = makePlugin([agent]);
    const store = useRosterStore();
    store.init(plugin);
    await store.remove(agent as never);
    expect(rosterStore.delete).toHaveBeenCalledWith('roster:a');
    expect((plugin as { removeRosterAgentProjection: ReturnType<typeof vi.fn> }).removeRosterAgentProjection).toHaveBeenCalled();
    expect(rosterStore.list).toHaveBeenCalled();
  });
});
```

Run — expected FAIL.

- [ ] **Step 12.2: Implement `src/features/library/vue/stores/rosterStore.ts`**

```ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { createRosterAgent, dedupeRosterId } from '../../../agents/roster/rosterCapabilities';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';

export const useRosterStore = defineStore('library-agents', () => {
  const agents = shallowRef<RosterAgent[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;

  function init(p: SpecoratorPlugin): void {
    plugin = p;
  }

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('rosterStore used before init()');
    return plugin;
  }

  async function load(): Promise<void> {
    const p = requirePlugin();
    loading.value = true;
    try {
      agents.value = await p.agentRosterStore.list();
    } finally {
      loading.value = false;
    }
  }

  async function save(agent: RosterAgent): Promise<void> {
    await requirePlugin().agentRosterStore.save(agent);
    await load();
  }

  /** Port of AgentRosterView.cloneAgent (name probe + id dedupe). */
  async function clone(agent: RosterAgent): Promise<RosterAgent> {
    const p = requirePlugin();
    const existing = await p.agentRosterStore.list();
    const existingNames = new Set(existing.map((a) => a.name));
    let cloneName = `${agent.name} copy`;
    for (let n = 2; existingNames.has(cloneName); n += 1) {
      cloneName = `${agent.name} copy ${n}`;
    }
    const base = createRosterAgent(cloneName, Date.now());
    const cloned: RosterAgent = {
      ...agent,
      id: dedupeRosterId(base.id, existing.map((a) => a.id)),
      name: cloneName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await p.agentRosterStore.save(cloned);
    await load();
    return cloned;
  }

  /** Port of AgentRosterView.createAndEdit's in-memory draft (NOT pre-saved). */
  async function draftNewAgent(newAgentLabel: string): Promise<RosterAgent> {
    const p = requirePlugin();
    const existing = await p.agentRosterStore.list();
    const agent = createRosterAgent(newAgentLabel, Date.now());
    const uniqueId = dedupeRosterId(agent.id, existing.map((a) => a.id));
    if (uniqueId !== agent.id) {
      agent.id = uniqueId;
      agent.name = `${newAgentLabel} ${uniqueId.split('-').pop() ?? ''}`;
    }
    return agent;
  }

  async function remove(agent: RosterAgent): Promise<void> {
    const p = requirePlugin();
    await p.agentRosterStore.delete(agent.id);
    await p.removeRosterAgentProjection(agent);
    await load();
  }

  return { agents, loading, init, load, save, clone, draftNewAgent, remove };
});
```

Run the store test — expected PASS.

- [ ] **Step 12.2b: Add an optional `onSaved` callback to `AgentDetailEditor`.** The editor's `save()` writes straight to `plugin.agentRosterStore.save(this.draft)` (line ~268), bypassing the Pinia store — with two Library leaves open, the other leaf keeps stale name/tags/model until the detail page closes. In `src/features/agents/roster/view/AgentDetailEditor.ts`:

```ts
export interface AgentDetailEditorCallbacks {
  onBack(): void;
  onStartChat(agent: RosterAgent): void;
  onDeleted(agent: RosterAgent): void;
  /** Fires after every successful persist (explicit Save AND the start-chat auto-save). */
  onSaved?(agent: RosterAgent): void;
}
```

and at the end of the private `save()` method, after the store write succeeds, add:

```ts
    this.callbacks.onSaved?.(this.original);
```

Additionally expose the editor's dirty state as a public method. The
comparison already lives in an exported helper (`isRosterAgentDirty`, used by
`handleBack()` at AgentDetailEditor.ts:71), so this is a one-liner — and have
`handleBack()` call it so Back and the tab guard can never disagree:

```ts
  /** True when the draft differs from the last persisted state. */
  isDirty(): boolean {
    return isRosterAgentDirty(this.original, this.draft);
  }
```

The legacy `AgentRosterView` passes no `onSaved` (optional — zero behavior change); the Vue panel supplies one in Step 12.4. Run `npm run test -- --selectProjects unit -t "AgentDetail"` + `npm run typecheck` — expected green.

- [ ] **Step 12.3: Write the failing panel test `tests/vue/panels/agentsPanel.test.ts`**

```ts
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';
import AgentsPanel from '@/features/library/vue/panels/AgentsPanel.vue';
import { useRosterStore } from '@/features/library/vue/stores/rosterStore';

// The imperative detail editor renders into a Vue-owned host div; stub it so
// panel tests assert the handoff, not the editor internals. vi.hoisted is
// REQUIRED: vi.mock factories are hoisted above imports, so a plain top-level
// const would still be in the temporal dead zone when the factory runs.
const { renderSpy } = vi.hoisted(() => ({
  renderSpy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/features/agents/roster/view/AgentDetailEditor', () => ({
  AgentDetailEditor: vi.fn().mockImplementation(() => ({ render: renderSpy })),
}));
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: ['t'],
  createdAt: 1, updatedAt: 2,
};

function makePlugin() {
  return {
    agentRosterStore: { list: vi.fn().mockResolvedValue([agent]) },
    settings: {},
    logger: { scope: () => ({ error: vi.fn() }) },
  } as never;
}

describe('AgentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('renders agent cards with description and role + user tags', async () => {
    const plugin = makePlugin();
    useRosterStore().init(plugin);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(screen.getByText('router')).toBeTruthy();
    // Role labels + tags also appear as toolbar filter chips — scope to the card.
    expect(within(screen.getByRole('button', { name: 'Alice' })).getByText('t')).toBeTruthy();
  });

  it('cloning opens the detail editor on the returned clone (legacy parity)', async () => {
    const plugin = makePlugin();
    const store = useRosterStore();
    store.init(plugin);
    vi.spyOn(store, 'clone').mockResolvedValue({ ...agent, id: 'roster:a-copy', name: 'Alice copy' } as never);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(renderSpy).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'roster:a-copy' }), undefined);
  });

  it('activating a card hands off to the imperative AgentDetailEditor', async () => {
    const plugin = makePlugin();
    useRosterStore().init(plugin);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    expect(renderSpy).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'roster:a' }), undefined);
  });
});
```

Run — expected FAIL.

- [ ] **Step 12.4: Implement `src/features/library/vue/panels/AgentsPanel.vue`.** Same skeleton as the other panels plus the detail-editor host. Key parts (assemble the full SFC from the LoopsPanel shape + these):

Script additions (on top of the LoopsPanel skeleton's imports, add `nextTick`, `onUnmounted`, and `ref` to the `vue` import, and `TAB_GUARD_KEY` to the libraryKeys import):

```ts
import { AgentDetailEditor } from '../../../agents/roster/view/AgentDetailEditor';
import AvatarSlot from '../components/AvatarSlot.vue';
import { resolveAgentProvider } from '../../../agents/roster/resolveAgentProvider';
import { installPresetAgents } from '../../../agents/roster/presetAgents';
import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import { asSettingsBag } from '../../../../core/types/settings';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { useRosterStore } from '../stores/rosterStore';

const CARD_AVATAR_SIZE = 36;
const detailHost = ref<HTMLElement | null>(null);
const detailOpen = ref(false);

// Rows re-derive from the global store (source-based useLibraryList), so
// mutations in ANY leaf propagate to every mounted panel automatically.
async function reload(): Promise<void> {
  await store.load();
}

const list = useLibraryList<RosterAgent>(() => store.agents, {
  getName: (a) => a.name,
  getDescription: (a) => a.description,
  getTags: (a) => [
    ...a.roles.map((r) => (r === 'verifier' ? t('agentRoster.roleVerifier') : t('agentRoster.roleWorker'))),
    ...(a.tags ?? []),
  ],
  getUpdatedAt: (a) => a.updatedAt,
});

const tabGuard = inject(TAB_GUARD_KEY, null);

async function openDetail(agent: RosterAgent, opts?: { isNew?: boolean }): Promise<void> {
  if (!plugin) return;
  detailOpen.value = true;
  await nextTick(); // detailHost mounts on the flag flip
  if (!detailHost.value) return;
  const editor = new AgentDetailEditor(plugin, {
    onBack: () => void closeDetail(),
    onStartChat: (a) => void withErrorNotice(() => startChat(a), t('agentRoster.actionFailed'), fail),
    onDeleted: (a) =>
      void withErrorNotice(async () => {
        if (await confirmedDelete(a)) await closeDetail();
      }, t('agentRoster.actionFailed'), fail),
    // Keep the shared Pinia store fresh on every detail save so OTHER mounted
    // Library leaves re-derive immediately (the editor persists directly to
    // plugin.agentRosterStore, not through useRosterStore).
    onSaved: () => void withErrorNotice(() => store.load(), t('agentRoster.actionFailed'), fail),
  });
  await editor.render(detailHost.value, agent, opts);
  // Tab switches unmount this panel and would silently discard dirty edits —
  // register a guard that reuses the editor's own dirty state and the SAME
  // confirm strings its Back path uses (see AgentDetailEditor ~lines 69–77).
  if (tabGuard) {
    tabGuard.value = async () => {
      if (!editor.isDirty()) {
        await closeDetail();
        return true;
      }
      // Same strings as AgentDetailEditor.handleBack (AgentDetailEditor.ts:74).
      const ok = await confirm(plugin.app, t('agentRoster.discardConfirm'), t('agentRoster.discard'));
      if (ok) await closeDetail();
      return ok;
    };
  }
}

async function closeDetail(): Promise<void> {
  // v-if destroys the host node on the flag flip — no manual cleanup needed.
  detailOpen.value = false;
  if (tabGuard) tabGuard.value = null;
  await reload();
}

// Safety net: if the panel unmounts through any other path, never leave a
// stale guard blocking the tab strip.
onUnmounted(() => {
  if (tabGuard) tabGuard.value = null;
});

/** Card-action wrapper the template calls; mirrors the detail editor's path. */
function onStartChat(agent: RosterAgent): void {
  void withErrorNotice(() => startChat(agent), t('agentRoster.actionFailed'), fail);
}

async function startChat(agent: RosterAgent): Promise<void> {
  if (!plugin) return;
  const settings = asSettingsBag(plugin.settings);
  const providerId = resolveAgentProvider(
    agent,
    (p) => ProviderRegistry.isEnabled(p, settings),
    ProviderRegistry.resolveSettingsProviderId(settings),
  );
  const conversation = await plugin.createConversation({ providerId, boundAgentId: agent.id });
  await plugin.openConversation(conversation.id, { requireNewTab: true });
}

/**
 * Legacy deleteAgent parity (AgentRosterView.ts:229-238): confirm -> remove ->
 * Notice. Shared by the card Delete button AND the detail editor's onDeleted
 * so neither path is destructive without confirmation. Returns whether deleted.
 */
async function confirmedDelete(agent: RosterAgent): Promise<boolean> {
  if (!plugin) return false;
  const ok = await confirm(
    plugin.app,
    t('agentRoster.deleteConfirm', { name: agent.name }),
    t('agentRoster.delete'),
  );
  if (!ok) return false;
  await store.remove(agent);
  new Notice(t('agentRoster.deleted', { name: agent.name }));
  return true;
}

// Avatar rendering lives in components/AvatarSlot.vue (watchEffect-based; see
// the AvatarSlot note below) — imported and used in the card's leading slot.
```

CAUTION (import name): the legacy view imports `resolveAgentProvider as resolveAgentProviderId` from `../resolveAgentProvider` and ALSO defines a private method of the same name. Check the actual export name in `src/features/agents/roster/resolveAgentProvider.ts` before writing the import; the exported function takes `(agent, isEnabled, fallback)` per the legacy call site (`AgentRosterView.ts:250-257`).

Template shape:

```vue
<template>
  <div v-show="!detailOpen">
    <div class="specorator-library-header">
      <h2>{{ t('agentRoster.title') }}</h2>
      <div class="specorator-library-header-actions">
        <button type="button" class="mod-cta" @click="onNewAgent">{{ t('agentRoster.newAgent') }}</button>
        <button type="button" @click="onInstallStarters">{{ t('agentRoster.installStarter') }}</button>
        <button type="button" :title="t('agentRoster.syncProvidersHint')" @click="onSync">{{ t('agentRoster.syncProviders') }}</button>
      </div>
    </div>
    <div class="specorator-library-toolbar-slot">
      <LibraryToolbar
        v-if="store.agents.length > 0"
        :query="list.query.value"
        :sort="list.sort.value"
        :tags="list.allTags.value"
        :active-filters="list.activeFilters.value"
        @update:query="list.query.value = $event"
        @update:sort="list.sort.value = $event"
        @toggle-filter="list.toggleFilter($event)"
        @clear-filters="list.clearFilters()"
      />
    </div>
    <div class="specorator-library-list">
      <div v-if="store.loading" class="specorator-library-loading">{{ t('common.loading') }}</div>
      <LibraryEmptyState v-else-if="store.agents.length === 0" icon="users" :message="t('agentRoster.emptyState')" :action-label="t('agentRoster.newAgent')" @action="onNewAgent" />
      <template v-else>
        <div v-if="list.rows.value.length === 0" class="specorator-library-empty-text">{{ t('library.noMatches') }}</div>
        <LibraryCard
          v-for="agent in list.rows.value"
          :key="agent.id"
          class="specorator-roster-card"
          :name="agent.name"
          :aria-label="agent.name"
          @activate="openDetail(agent)"
        >
          <template #leading><AvatarSlot :agent="agent" :size="CARD_AVATAR_SIZE" /></template>
          <div class="specorator-roster-card-desc">{{ agent.description || '—' }}</div>
          <div class="specorator-library-card-caps">
            <span v-for="role in agent.roles" :key="role" class="specorator-roster-chip specorator-roster-chip-role">
              {{ role === 'verifier' ? t('agentRoster.roleVerifier') : t('agentRoster.roleWorker') }}
            </span>
            <span v-for="tag in agent.tags ?? []" :key="tag" class="specorator-library-chip">{{ tag }}</span>
            <span v-if="agent.skills.length > 0" class="specorator-roster-chip">
              {{ t('agentRoster.capsSummary', { skills: String(agent.skills.length) }) }}
            </span>
          </div>
          <template #actions>
            <button type="button" class="mod-cta" @click="onStartChat(agent)">{{ t('agentRoster.startChatShort') }}</button>
            <button type="button" class="specorator-library-card-icon" :aria-label="t('library.duplicate')" :title="t('library.duplicate')" @click="onClone(agent)">⧉</button>
            <button type="button" class="specorator-library-card-delete" @click="onDelete(agent)">{{ t('agentRoster.delete') }}</button>
          </template>
        </LibraryCard>
      </template>
    </div>
  </div>
  <div v-if="detailOpen" ref="detailHost" class="specorator-roster-detail" />
</template>
```

Notes:
- `AvatarSlot` (`components/AvatarSlot.vue`) must use `watchEffect`, NOT `onMounted`: cards are keyed by `agent.id`, so after a detail save the SAME component instance receives a new agent object — an `onMounted`-only render would leave name/initials/color/icon avatars stale (in this leaf and any other open Library leaf). Full component:

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../agents/agentAvatar';
import { rosterAgentToPersona } from '../../../agents/personaRegistry';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';

const props = defineProps<{ agent: RosterAgent; size: number }>();
const host = ref<HTMLElement | null>(null);

// Runs on mount (template ref assignment is reactive) AND whenever the agent
// prop is replaced by a store reload — avatar edits re-render in place.
watchEffect(() => {
  const el = host.value;
  if (!el) return;
  el.textContent = '';
  renderAgentAvatar(el, rosterAgentToPersona(props.agent), props.size);
});
</script>

<template>
  <span ref="host" class="specorator-roster-card-avatar" aria-hidden="true" />
</template>
```

  Template usage in the card's leading slot: `<AvatarSlot :agent="agent" :size="CARD_AVATAR_SIZE" />`. The `leadingAvatar` helper from the script additions is superseded by this component — do not implement both.
- Model chip parity (legacy lines 115–120: `agent.modelSelection` → label from `ProviderRegistry.getChatUIConfig(providerId).getModelOptions(asSettingsBag(plugin.settings))`) — include it in the caps row guarded by `v-if="agent.modelSelection"` with the label computed in a script helper.
- `onClone` must reproduce the legacy handoff (`AgentRosterView.cloneAgent` ends with `openDetail(clone)` — `AgentRosterView.ts:225-226`): saving the clone and reloading is NOT enough; the user is taken straight to the clone for review/editing. `useRosterStore.clone()` returns the clone for exactly this:

```ts
function onClone(agent: RosterAgent): void {
  void withErrorNotice(async () => {
    const clone = await store.clone(agent);
    await openDetail(clone);
  }, t('agentRoster.actionFailed'), fail);
}
```

- The card's `onDelete(agent)`:

```ts
function onDelete(agent: RosterAgent): void {
  // async wrapper: withErrorNotice takes () => Promise<void> and TS 6 rejects
  // a Promise<boolean>-returning callback (verified); keep the boolean internal.
  void withErrorNotice(async () => {
    await confirmedDelete(agent);
  }, t('agentRoster.actionFailed'), fail);
}
```

  BOTH delete paths (card button and detail editor) go through `confirmedDelete`; never call `store.remove` directly from a UI handler. No manual list re-sync anywhere: `useLibraryList` is source-based, so `store.remove()`'s internal reload propagates to every mounted panel — including a second Library leaf.
- `onNewAgent` = `store.draftNewAgent(t('agentRoster.newAgent'))` → `openDetail(draft, { isNew: true })` (in-memory draft, NOT pre-saved — parity with `createAndEdit`).
- `onSync` ports `syncToProviders` (legacy lines 174–188) verbatim including both Notice branches.
- `onInstallStarters` ports `installStarters` (legacy lines 194–205): `installPresetAgents(plugin.agentRosterStore)` + Notice + reload.

- [ ] **Step 12.5: Wire into `LibraryRoot.vue`** — replace the last placeholder with `<AgentsPanel v-else />` + import; delete the `data-active-tab` placeholder div entirely. Update `tests/vue/libraryView.test.ts`: the default tab now asserts the Agent Roster h2; drop the `data-active-tab` assertions and assert per-tab h2 text instead (`'Agent Roster'` / `'Skill Library'` / `'Loop library'`).

- [ ] **Step 12.6: Run everything**

```bash
npm run test:vue && npm run typecheck:vue && npm run lint && npm run test
```

Expected: all PASS.

- [ ] **Step 12.7: Commit**

```bash
git add src/features/library tests/vue src/features/agents/roster/view/AgentDetailEditor.ts
git commit -m "feat(library): Agents tab — useRosterStore + AgentsPanel with detail-editor handoff"
```

---

### Task 13: Guardrail lock-in (coverage floors, ratchets, artifact smoke, docs)

**Files:**
- Modify: `vitest.config.mts` (final coverage floors)
- Modify: `scripts/check-artifacts.mjs` (Vue bundle marker)
- Possibly modify: `scripts/loc-baseline.json`, `scripts/quality-baseline.json` (only per ratchet policy)
- Modify: `CLAUDE.md`

- [ ] **Step 13.1: Measure and lock Vue coverage floors**

```bash
npm run test:vue:coverage
```

Read the summary table for `src/features/library/**`. Set `coverage.thresholds` in `vitest.config.mts` to ~3–5 points BELOW each measured actual (repo convention: regression floors, not aspirations — see `jest.config.js` comments). If any actual is below the provisional 80/70/80/80, write the missing tests first (panels' error paths are the usual gap), don't lower floors below 75/65/75/75.

- [ ] **Step 13.2: Run every ratchet**

```bash
npm run check:loc && npm run check:css && npm run check:quality
```

Expected: all OK. Contingencies, per policy:
- `check:loc` fails on a new `.vue`/`.ts` over 500 LOC → split the file (panels should stay well under; `AgentsPanel.vue` is the only candidate — extract `AvatarSlot.vue`/helpers if needed). Do NOT allowlist new files.
- `check:quality` fails on `cloneGroups`/`duplicatedLines` (the three panels share structure) → extract the shared panel scaffolding into a `LibraryPanelFrame.vue` (header + toolbar-slot + list slots) and re-run. Only if a metric regression is a false positive (fallow can't parse `.vue` and the flagged dupe is in extracted `.ts` that mirrors legacy code scheduled for deletion), update `scripts/quality-baseline.json` in THIS commit with a justification line in the commit body.

- [ ] **Step 13.3: Add the Vue bundle marker to the artifact smoke.** In `scripts/check-artifacts.mjs`, after the existing size checks, add:

```js
// The unified Library island must survive bundling+minification: its root
// class name is emitted by LibraryView.onOpen and proves compiled-SFC code
// (unplugin-vue output) reached main.js.
const mainJs = readFileSync(join(ROOT, 'main.js'), 'utf8');
if (!mainJs.includes('specorator-library-vue-root')) {
  errors.push('main.js is missing the compiled Vue Library island (specorator-library-vue-root marker).');
}
```

(Adapt `readFileSync`/`join`/`ROOT` names to that script's existing imports/helpers.) Then:

```bash
npm run build && npm run check:artifacts
```

Expected: green, and `styles.css` may now contain the `vue-sfc-styles` marker section only if any SFC declares a `<style>` block (this plan reuses global CSS, so it may legitimately be absent — the JS marker is the load-bearing check).

- [ ] **Step 13.4: Commit one card-level DOM snapshot per panel** (spec DoD item 5: small stable sub-trees, never whole views). Append to each of the three panel test files a test like this (adapt the find-text per panel):

```ts
  it('card structure snapshot (small, stable sub-tree)', async () => {
    setup([loop]);
    await screen.findByText('A loop');
    expect(document.querySelector('.specorator-library-card')).toMatchSnapshot();
  });
```

Run `npm run test:vue` once to write the snapshots, eyeball each `tests/vue/panels/__snapshots__/*.snap` for accidental volatility (no ids/timestamps), and commit them with the tests.

- [ ] **Step 13.5: Update `CLAUDE.md`** — add a row to the Architecture table after `features/settings`:

```markdown
| **features/library** | Unified Library view (Vue 3 island) | `LibraryView` mounts a per-leaf Vue app behind the `useVueLibrary` flag (default off); Pinia stores wrap `LoopNoteStore`/`VaultSkillAggregator`/`AgentRosterStore`; legacy roster/skill/loop views redirect when the flag is on. Tests run in the Vitest lane (`npm run test:vue`, `tests/vue/`). |
```

And in the Commands block add:

```bash
npm run test:vue        # Vue-surface tests (Vitest lane, tests/vue/)
npm run typecheck:vue   # SFC typecheck (vue-tsc)
```

- [ ] **Step 13.6: Full pipeline + commit**

```bash
npm run typecheck && npm run typecheck:vue && npm run lint && npm run check:loc && \
npm run check:css && npm run check:quality && npm run test && npm run test:vue:coverage && \
npm run test:perf && npm run build && npm run check:artifacts
```

Expected: ALL green.

```bash
git add vitest.config.mts scripts/check-artifacts.mjs CLAUDE.md scripts/*.json tests/vue
git commit -m "quality: lock Vue coverage floors, artifact marker, and docs for the library pilot"
```

---

### Task 14: Final verification, push, PR

- [ ] **Step 14.1: Manual QA checklist (in a real Obsidian vault via `npm run dev`)** — this is the one non-automated gate; record results in the PR description:
  1. Flag OFF (default): the three ribbons/commands open the legacy views exactly as before.
  2. Toggle the flag ON in settings → click each of the three ribbons → the unified Library opens at the matching tab; tab strip switches panels; search/sort/filter chips work in each tab.
  3. Loops: create, edit, clone, delete, Prompt (model picker → composer draft seeded, NOT sent).
  4. Skills: Prompt sends `$name`/`/name` to a matching tab; clone gated to vault skills; create → editor opens.
  5. Agents: open detail (page swap), back, start chat (new tab), clone, delete, install starters, sync. With unsaved edits in the detail editor, click another Library tab → the discard confirm appears; Cancel keeps the editor, Confirm switches tabs.
  6. Open a second Library leaf (drag/split): both leaves render independently; closing one leaves the other working (per-leaf app isolation).
  7. Toggle the flag OFF → open a library ribbon → legacy view; any open unified leaf re-homes to the legacy view MATCHING its saved tab when reopened (a leaf left on Skills reopens as the Skill Library, Loops as the Loop library — never always-roster).
- [ ] **Step 14.2: Push and open the PR**

```bash
git push -u origin claude/frontend-vue3-pinia-refactor-2ptqlt
```

PR body: summary of harness + pilot, the QA checklist results, the measured coverage numbers, and the LOC delta (`npm run check:loc` summary line). Link the spec and research docs.

---

## Deferred (explicitly NOT in this plan)

- Porting `AgentDetailEditor` / `SkillEditorModal` / `LoopEditorModal` to SFCs (user-approved: stay imperative).
- Bus→Pinia strangler bridging (`$onAction`/`$subscribe`) — no Library data flows through the event bus today; this lands with the chat/board specs.
- Flipping `useVueLibrary` default on + deleting the legacy views (separate spec after bake; banks the LOC net-negative).
- Vitest browser mode, visual regression, full Jest→Vitest migration.

## Risks & mitigations (carried from spec, updated by the spike)

| Risk | Status |
|---|---|
| esbuild SFC plugin maturity | RESOLVED: unplugin-vue 7.2.0 spike-verified (needs `sourceMap: false`); pin the version |
| eslint 10 / TS 6 peer compat | RESOLVED: registry-checked (eslint-plugin-vue ^10 supports eslint ^10; vue-tsc peer TS >=5) |
| Jest mock reuse under Vitest | RESOLVED: `globalThis.jest = vi` shim spike-verified |
| SFC styles vs styles.css pipeline | RESOLVED: extraction confirmed; merge plugin (Task 1) folds main.css into styles.css idempotently |
| fallow blind to .vue | Mitigated: logic lives in `.ts` stores/composable; panels are thin templates |
| Settings parity tests | Contingency in Task 6.5 |
| registerView/addCommand count assertions | Contingency in Task 7.13 |
