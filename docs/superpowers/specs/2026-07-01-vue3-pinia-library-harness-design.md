---
title: "Vue 3 + Pinia harness and unified Library pilot"
date: 2026-07-01
status: draft
scope: build, tooling, testing, features/agents/roster, features/skills, features/tasks/loops, shared, app/views
---

# Vue 3 + Pinia harness and unified Library pilot

## Problem & goal

Specorator's UI is vanilla TypeScript building DOM with Obsidian's `createEl`/`createDiv`
inside `ItemView` subclasses, with state in a synchronous event bus plus mutable objects
and vault-backed stores. Manual `render()`/`renderList()` calls are the recurring
boilerplate. We want to move the frontend to **Vue 3 + Pinia** where it pays off, without
weakening the existing quality harness (ESLint errors-block/warnings-backlog, LOC ratchet,
CSS `!important` ratchet, fallow metric ratchet, coverage floors, blocking perf suite,
`tsc --noEmit`).

This spec delivers **two things together**:

1. **A Vue 3 + Pinia + Vitest development & quality harness and verification pipeline** —
   build wiring, lint, typecheck, test runner, coverage, perf, and CI, all extending
   (never weakening) the current gates.
2. **A unified Library view** (agent roster + skills + loops folded into one Vue view with
   in-view tabs) as the harness's **first real verification target**.

Chat and Agent Board are explicitly out of scope here; they become later specs that reuse
this harness.

Research backing every decision below: `docs/research/2026-07-01-vue3-pinia-frontend-refactor-research.md`.

## Scope

**In scope**

- esbuild SFC build wiring, Vue feature-flag `define`s, runtime style injection.
- New dev/quality tooling: `eslint-plugin-vue`, `vue-tsc`, Vitest + Vue testing libraries.
- Extending `check-loc.mjs`, `eslint.config.mjs`, `tsconfig`, CI to cover `.vue`.
- A unified `LibraryView` (`createApp` per leaf) rendering `Library.vue` with a reactive
  `activeTab` (`'loops' | 'skills' | 'agents'`) and three panel SFCs.
- Three global Pinia stores wrapping the existing services (`LoopNoteStore`,
  `VaultSkillAggregator`, `AgentRosterStore`) and a `useLibraryList` composable ported from
  `LibraryListController`.
- Back-compat: the three legacy view types resolve to the unified view; ribbon icons and
  commands open it at the right tab; a feature flag gates old-vs-new.

**Non-goals**

- Migrating Chat or Agent Board (later specs).
- Porting the editor modals (`AgentDetailEditor`, `SkillEditorModal`, `LoopEditorModal`) or
  the prompt flows (`runVaultSkill`, `launchLoopPrompt`, `ModelLaunchModal`) to SFCs — they
  stay imperative and are invoked from Vue handlers.
- Adding **vue-router** (Obsidian owns top-level navigation; intra-view tabs use a `ref`).
- Adding **Prettier** (the repo intentionally has no formatter; ESLint stays sole).
- Changing the tag/search/clone/prompt *behavior* shipped in #472 — we re-express it in Vue
  with parity, not redesign it.

## Part 1 — Harness

### 1.1 Build (keep esbuild)

- Add an SFC compiler plugin to `esbuild.config.mjs`. **Spike `esbuild-plugin-vue3` vs
  `unplugin-vue` first** and pick on scoped-`<style>` fidelity + `<script setup>` support;
  pin the chosen version. Both delegate compilation to the official `@vue/compiler-sfc`.
- Add a `define` block for Vue compile-time flags:
  ```js
  define: {
    __VUE_OPTIONS_API__: 'false',              // Composition API / <script setup> only
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  }
  ```
- **Runtime-inject** SFC `<style>` (inject at mount), so `scripts/build-css.mjs` →
  `styles.css` is untouched. Scoped `data-v` hashing prevents collisions with global CSS.
- Resolve `vue` to the runtime-only esm-bundler build (SFC templates are precompiled to
  render functions at build time → no runtime template compiler, no `eval`, satisfies
  Obsidian's CSP posture). Never pass a string `template` to `createApp`.
- Externals unchanged (`obsidian`, `electron`, CodeMirror, node builtins). Output stays a
  single CJS `main.js`. Prod minify continues through the existing `patchRendererUnsafeUnref`
  end hook.

**Dependencies**

- Runtime: `vue`, `pinia`.
- Dev: the chosen esbuild SFC plugin, `eslint-plugin-vue`, `@vue/eslint-config-typescript`,
  `vue-tsc`, `vitest`, `@vue/test-utils`, `@testing-library/vue`, `@pinia/testing`,
  `@vitest/coverage-v8`.

### 1.2 Lint

- Widen the `lint` script glob from `"{src,tests}/**/*.ts"` to also match `.vue`.
- Add a `.vue` block to `eslint.config.mjs` composed via `@vue/eslint-config-typescript`'s
  `withVueTs()` (wires `vue-eslint-parser` as the main parser and `@typescript-eslint/parser`
  for `<script>`; **never** set the top-level parser to the TS parser).
  - `flat/essential` = **error** (safe: zero existing Vue code).
  - `flat/strongly-recommended` + `flat/recommended` = **warnings** (tracked backlog, matches
    existing policy); promote individually via the ESLint ratchet over time.
  - **`vue/no-v-html` = error** — the Vue analogue of the existing innerHTML ban
    (`eslint.config.mjs` lines ~146–162). Markdown/agent content renders through Obsidian's
    `MarkdownRenderer` from a lifecycle hook targeting a `ref`'d element, never `v-html`.
- Keep type-aware Vue linting **out** of the fast lint stage (it overlaps `vue-tsc` and is
  slow).

### 1.3 Typecheck

- Add `vue-tsc --noEmit` as a **separate** gate (`typecheck:vue`); leave `tsc --noEmit`
  (`typecheck`) untouched. Add `typecheck:all` running both.
- Add a `src/vue-shims.d.ts` (`declare module '*.vue' { … DefineComponent … }`) referenced by
  `tsconfig` include.
- Add a `tsconfig.vue.json` (extends the root) scoped to include `.vue`, checked only by
  `vue-tsc`, so the existing `tsconfig` stays intact.

### 1.4 Test runner (Vitest, bounded hybrid)

- Add **Vitest** scoped to `**/*.vue`, composables, and Pinia stores. **Keep Jest** for the
  existing TS unit/integration suites and the perf harness. Isolate by directory/glob so the
  two never overlap.
- Reuse the existing **`tests/__mocks__/obsidian.ts`** fake via Vitest `resolve.alias`
  (`obsidian` → that file); extend the fake only with the classes the Library components
  touch. Inject `App`/plugin into components via `provide`/props so they stay fakeable.
- Component tests: `@testing-library/vue` as the behavior-first default; `@vue/test-utils`
  for Vue-specifics (emitted events, slots, provide/inject). Mount store-backed components
  with `createTestingPinia`.
- Store unit tests: `setActivePinia(createPinia())` with real actions.
- Coverage: `@vitest/coverage-v8`; add a Vitest coverage floor for `.vue`/stores/composables
  from day one. New Vue components are **not** added to Jest's `!src/features/**/view/**`
  exclusion — they get covered.
- Treat the hybrid as a deprecation ramp: a follow-up may migrate all suites to Vitest, but
  that is out of scope here.

### 1.5 Quality-gate extensions (do not weaken)

- **LOC ratchet:** extend `scripts/check-loc.mjs` to count `.vue` source (same nonblank-line
  rule) so migration cannot hide LOC. Expect one deliberate baseline bump in
  `scripts/loc-baseline.json` for the Vue bootstrap, landed as a single reviewed commit, then
  held. Track legacy `.ts` deleted per tab (target net-negative once the flag defaults on).
- **fallow blindness:** fallow (`check:quality`, baseline `deadCodeIssues:0`,
  `boundaryViolations:0`) parses only `.ts`. Mitigation: keep **SFCs thin over plain `.ts`**
  composables/stores so logic stays visible to dead-code/dupe detection. Do not move logic
  that fallow currently sees into `<script>` blocks it cannot.
- **CSS `!important` ratchet:** unaffected (SFC styles are scoped; no `!important`).
- **Perf:** add a Vitest perf-style spec asserting island **mount cost is bounded** and
  `unmount()` leaves **no leaked DOM/listeners** across open/close cycles — mirrors
  `messageRenderer.perf`'s bounds-not-timings philosophy. (Kept in the Vitest lane, not the
  Jest perf config.)

### 1.6 CI pipeline (extends the 7 existing jobs)

| # | Job | Change |
|---|-----|--------|
| 1 | `lint` | now also lints `.vue`; runs `check:loc` (now `.vue`-aware), `check:css` |
| 2 | `quality` | unchanged (fallow) |
| 3 | `typecheck` | runs `tsc --noEmit` **and** `vue-tsc --noEmit` (parallel steps) |
| 4 | `test` | unchanged (Jest unit+integration, ubuntu+windows) |
| 5 | **`component` (new)** | Vitest `.vue`/stores/composables + coverage floor + mount/unmount leak spec |
| 6 | `coverage` | unchanged (Jest coverage) |
| 7 | `perf` | unchanged (Jest perf) |
| 8 | `build` | unchanged (`build` + `check:artifacts`); artifact smoke should assert a compiled `.vue` renders |

All gating. A visual-regression stage is deferred (advisory when introduced).

## Part 2 — Unified Library view

### 2.1 Current state (post-#472)

Three separate Obsidian views, each enriched with a shared toolbar engine:

| View | Type | Icon | Service |
|------|------|------|---------|
| `AgentRosterView` | `specorator-agent-roster` | `users` | `plugin.agentRosterStore` (`AgentRosterStore`) |
| `SkillLibraryView` | `specorator-skill-library` | `book-open` | `plugin.vaultSkillAggregator` (`VaultSkillAggregator`) |
| `LoopLibraryView` | `specorator-loop-library` | `repeat` | `new LoopNoteStore()` per view |

Shared today: `src/shared/libraryNav.ts` (`renderLibraryNav`, `LIBRARY_VIEW_TYPES`),
`src/utils/libraryView.ts` (`createLibraryCard`, shell/empty/loading), `src/shared/libraryToolbar.ts`
(`LibraryListController<T>` — search/sort/filter). Each view carries user **tags**, **clone**,
interactive cards, and **in-library prompting** (`runVaultSkill` direct; loops via
`ModelLaunchModal` → `InputController.seedComposerDraft`).

### 2.2 Target Vue architecture

- **One `LibraryView` ItemView** (`VIEW_TYPE_LIBRARY = 'specorator-library'`) under
  `src/features/library/` that, per leaf:
  - `onOpen`: `createApp(Library)`, `app.use(globalPinia)`, `app.provide(PLUGIN_KEY, markRaw(plugin))`,
    `app.provide(VIEW_KEY, markRaw(this))`, `app.mount(this.contentEl)`.
  - `onClose`: `app.unmount()` → `this.contentEl.empty()` → null the ref.
  - Stores `vueApp` as an **instance field** (never a singleton — Obsidian opens the type in
    multiple leaves).
- **`Library.vue` root** holds `const activeTab = ref<'loops'|'skills'|'agents'>(initialTab)`
  and renders a tab bar (the Vue expression of `renderLibraryNav`) + `<component :is>` for the
  active panel. `activeTab` is per-leaf UI state → a local `ref`, not a store.
- **Three panel SFCs** — `LoopsPanel.vue`, `SkillsPanel.vue`, `AgentsPanel.vue` — thin,
  delegating list/search state to `useLibraryList` and data to the stores; each renders the
  shared toolbar, tag chips, interactive cards, clone, and Prompt affordances.
- **`useLibraryList<T>(accessors)` composable** ported from `LibraryListController`: reactive
  `query` / `sort` / `activeFilters` + a `computed` filtered-sorted list. Keep the pure engine
  in `.ts` (fallow-visible, unit-tested); the SFC only binds to it.

### 2.3 Pinia topology

- **One plugin-global Pinia**, created once at plugin load, held on the plugin instance; each
  leaf's app does `app.use(globalPinia)`. Roster/skills/loops are vault-global (not per-leaf),
  so they are global stores.
- **Setup stores**, one per domain, each **wrapping the existing service** (I/O stays in the
  service; the store action calls it and commits into reactive state):
  - `useLoopLibraryStore` → `LoopNoteStore` (`list`/`save`/`delete`, tags round-trip).
  - `useSkillLibraryStore` → `VaultSkillAggregator` (`listAll`/cache/invalidate; keep the
    source `SkillTabEntry` beside each `SkillLibraryRow` for prompting).
  - `useAgentRosterStore` → `AgentRosterStore` (`list`/`get`/`save`/`delete`).
- Never call `useStore()` at module top level; call inside methods/handlers after Pinia is
  installed. Collections normalized as needed; use `shallowRef` for large/streaming data
  (not expected in the Library, but the rule stands).
- The event bus is **not** strangled in this spec (Library data flows through services, not the
  bus). Bus→Pinia bridging is a later spec (chat/board).

### 2.4 Prompt & edit flows (imperative, invoked from Vue)

Kept as-is and called from Vue event handlers:

- **Skill Prompt** → `runVaultSkill(plugin, entry, null)` (direct send).
- **Loop Prompt** → `launchLoopPrompt` → `ModelLaunchModal` → `InputController.seedComposerDraft`.
- **Clone** → existing per-view clone helpers.
- **Edit** → `AgentDetailEditor` / `SkillEditorModal` / `LoopEditorModal` (Obsidian modals).
- **Tag editing** → the modal tag inputs shipped in #472.

### 2.5 Back-compat & rollback

- Register the new `VIEW_TYPE_LIBRARY`. Add `plugin.activateLibrary(tab?)` mirroring the
  existing `activateView`/`activateAgentBoardView` helpers.
- Keep the three ribbon icons (`users`/`book-open`/`repeat`) and the roster/skill commands
  (add the missing loop command); each now opens the unified Library at its tab via
  `activateLibrary('agents'|'skills'|'loops')`.
- The three legacy `VIEW_TYPE_*` resolve/redirect to the Library at the matching tab; stale
  already-open leaves of the old types are re-homed on plugin load. `detachLeavesOfType` for
  `VIEW_TYPE_LIBRARY` (and the legacy types) in `onunload`.
- **Feature flag** `useVueLibrary` in settings, **default off**. Off → the legacy three views
  (unchanged). On → the unified Vue Library. Legacy renderers stay switchable until the flag
  is signed off and defaulted on; a later cleanup pass deletes them (banking the LOC
  net-negative).

## Sequencing

Land the harness incrementally, proving each gate on the smallest slice first.

1. **Build + tooling bootstrap.** Spike & pick the SFC plugin; wire esbuild `define` +
   style injection; add deps; add `vue-shims.d.ts`, `tsconfig.vue.json`, `typecheck:vue`;
   Vitest config with the obsidian alias; ESLint `.vue` block + `no-v-html`; extend
   `check-loc.mjs`; add the `component` CI job. Prove green by mounting a **minimal
   `Library.vue` shell** (tab bar only) in a leaf behind the flag.
2. **Loops tab (first real target).** `useLoopLibraryStore` + `useLibraryList` +
   `LoopsPanel.vue` with search/sort/filter, tag chips, clone, Loop Prompt. Full test set.
3. **Skills tab.** `useSkillLibraryStore` + `SkillsPanel.vue` (incl. direct Prompt, read-only
   tag display).
4. **Agents tab.** `useAgentRosterStore` + `AgentsPanel.vue` (incl. detail editor open, clone).
5. **Back-compat wiring.** `activateLibrary`, legacy-type redirects, stale-leaf re-homing,
   ribbon/commands, the `useVueLibrary` flag.
6. **Guardrail lock-in.** One reviewed `loc-baseline.json` bump; perf mount/unmount leak spec;
   confirm fallow/coverage/CSS ratchets hold; docs.
7. **(Later spec) Flip the flag on, bake, delete legacy renderers.**

## Testing plan

- **Unit (Vitest):** `useLibraryList` (search match, sort name/updated, OR-chip filter,
  reset); the three stores via `setActivePinia` (list/save/delete/tags round-trip, real
  service faked at the boundary).
- **Component (Vitest + Testing Library):** each panel renders toolbar + tag chips + card +
  clone + Prompt; interactive card opens on Enter/click; `Library.vue` tab switching swaps
  panels. Small stable DOM snapshots per panel (not full-view snapshots).
- **Integration:** mount `LibraryView` against the faked `obsidian` + fake services; assert a
  panel renders and a Prompt handler calls the (spied) flow.
- **Perf:** island mount cost bounded; `unmount()` leak-free across open/close.
- **Regression:** the legacy views + #472 quick-actions/prompt suites stay green (flag off by
  default; imperative flows unchanged).

## Definition of Done (per tab, then the view)

1. Rendered by the Vue island; `unmount()` + `contentEl.empty()` on close; perf spec proves no
   leaked listeners/DOM.
2. Data via a Pinia store wrapping the existing service; no duplicated state; I/O stays in the
   service.
3. Behind `useVueLibrary`; legacy renderer switchable until sign-off.
4. `vue-tsc` clean; ESLint clean (errors) with `no-v-html` passing.
5. Store/composable unit tests + Testing-Library component tests meet the coverage floor; DOM
   snapshot committed.
6. LOC delta reviewed; fallow ratchet not backslid; CSS `!important` ratchet held.
7. Search/sort/filter/tags/clone/Prompt behavior at **parity** with the #472 imperative view.
8. (View-level) legacy renderers scheduled for deletion once the flag defaults on and bakes.

## Risks & early verification (spike)

- **ESLint 10 peer compat** with `eslint-plugin-vue` / `@vue/eslint-config-typescript` — verify
  versions align; pin as needed.
- **TypeScript 6 + `vue-tsc`** compatibility — verify the checker runs against TS 6; pin `vue-tsc`
  to a compatible line.
- **esbuild SFC plugin** scoped-CSS + runtime style injection actually working inside an
  Obsidian leaf — the reason step 1 spikes and mounts a real shell before any panel work.
- **fallow blindness to `.vue`** — mitigated by thin SFCs over `.ts`; verify the baseline holds
  after the bootstrap.

## Open questions

None — scope (unified view), imperative modals/flows, and default-off flag are resolved with
the user.
