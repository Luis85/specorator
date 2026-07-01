---
title: "Vue 3 + Pinia frontend refactor — research and decisions"
date: 2026-07-01
status: research
scope: frontend, build, quality-harness, testing
---

# Vue 3 + Pinia frontend refactor — research and decisions

Consolidated findings from five parallel research sweeps commissioned before any
implementation. Purpose: settle the framework, build, state, testing, and quality
decisions with sourced evidence, so the first spec (the development & quality
harness) rests on facts rather than guesses.

## TL;DR decisions

| Question | Decision | Confidence |
|----------|----------|------------|
| UI framework | Adopt **Vue 3** (Composition API, `<script setup>` SFCs) | High |
| State | Adopt **Pinia** (setup stores) | High |
| Router | **Do not add vue-router.** Obsidian owns top-level navigation; intra-view sub-tabs use a reactive `activeTab` ref | High |
| Build | **Keep esbuild**; add an SFC plugin (`esbuild-plugin-vue3` or `unplugin-vue`). Do **not** migrate to Vite | High |
| SFC styles | **Runtime-inject** scoped styles so the existing `styles.css` concat pipeline is untouched | Medium-High |
| Test runner | **Vitest** scoped to `.vue`/composables/stores; keep **Jest** for existing TS + perf during a time-boxed hybrid | High |
| Migration | **Strangler-fig via Vue islands** (`createApp().mount()` per view), feature-flagged, view-by-view | High |
| Adoption order | **Harness + test concept + verification pipeline first**, then a pilot view | High (user-directed) |

## Why Vue is a clean fit here

The plugin is vanilla TS building DOM with Obsidian's `createEl`/`createDiv` inside
five `ItemView` subclasses (chat, agent board, agent roster, skill library, loops),
esbuild-bundled to a single CJS `main.js`, with state in a tiny synchronous event bus
plus mutable objects (`ChatState`) and vault-backed stores. There is **no incumbent
UI framework to fight**, manual `renderList()`/`refresh()` calls are exactly the
boilerplate reactivity removes, and explicit state objects map cleanly onto Pinia
stores. Real Obsidian precedent exists, including one **Vue 3 + Pinia** plugin
(`obsidian-toggl-accounting`) and the official-sample-style esbuild + `esbuild-plugin-vue3`
wiring (`qingyuanTech/Obsidian-Vue-Sample-Plugin`).

## Vue-in-Obsidian: the load-bearing constraints

1. **Per-leaf app isolation.** Obsidian can open the same view type in several
   leaves/tabs at once; `registerView` runs its callback per leaf. Each leaf must
   create its **own** `createApp(...)` instance stored as an instance field — never a
   plugin/module singleton. A Vue app is single-mount.
2. **Disciplined teardown.** In `onClose`: `app.unmount()` → `contentEl.empty()` →
   null the ref. Vue 3 has well-documented detached-DOM/listener leaks
   (`vuejs/core#5363`, `#9346`) if the container isn't emptied. Tear down
   `ResizeObserver`s, intervals, and Obsidian `registerEvent`/`registerDomEvent` in
   `onUnmounted`. Also `detachLeavesOfType` in the plugin's `onunload`.
3. **Wrap Obsidian objects with `markRaw`/`shallowRef`.** `App`, `TFile`, `Plugin`,
   `Menu` are large and cyclic; deep-proxying them hurts perf and causes subtle bugs.
   Pass the plugin/view in via **`provide`/`inject`** (typed `InjectionKey`), not props.
4. **Runtime-only build, no template compiler.** SFC `<template>` compiles to render
   functions at build time → no runtime `new Function`/eval (satisfies Obsidian's CSP
   posture). Resolve `vue` to the runtime-only esm-bundler build; never pass a string
   `template` to `createApp`.
5. **`MarkdownRenderer.render(app, md, el, sourcePath, component)`** needs a real
   parent `Component` (the `ItemView`, provided into the tree) or embedded
   Dataview/query handlers leak.

## State: Pinia topology

- **Setup stores** everywhere (SSR — the one drawback — is irrelevant in Obsidian, so
  we gain in-store `watch`/composables).
- **Never call `useStore()` at module top level** — defer inside methods; with multiple
  leaves, pass an **explicit `pinia`** instead of trusting the ambient active instance.
- **Hybrid instance model:**
  - **One plugin-global Pinia** for cross-leaf shared domains: settings, conversation/
    session index, work-orders, agents/providers, MCP. Normalize collections as
    `{ byId, allIds }`.
  - **Per-leaf chat/stream state** via **dynamic-id stores** (`defineStore('chat-'+leafId, …)`)
    on that same global pinia, created on mount and `$dispose()`'d on unmount — dodges
    the multi-instance active-pinia hazard while keeping per-tab isolation.
- **I/O stays in services; stores orchestrate.** Vault JSON/JSONL reads/writes and
  Obsidian APIs live in plain service classes; store actions call the service and commit
  results into reactive state. Use `shallowRef`/`markRaw` for high-frequency streaming
  transcripts/tool-call logs.
- **Strangle the event bus per slice** using `$onAction`/`$subscribe` (detached) to bridge
  **outward only** — single writer per slice, migrate readers, delete the bus events,
  repeat. Never double-source a fact.

## Build: esbuild, not Vite

Obsidian's hard constraints — single `main.js`, CJS output, externalized
`obsidian`/electron/node builtins, no code-splitting — are esbuild's native output and
Vite library-mode's uphill fight (Vite splits by default, emits CSS as a separate asset,
and its dev-server/HMR value is useless inside Obsidian). Keep esbuild and add an SFC
plugin. `esbuild-plugin-vue3` (v0.5.1, Oct 2025, active) is the Obsidian-sample choice;
`unplugin-vue` is a more robust multi-bundler alternative worth evaluating in the spike,
especially for scoped-CSS fidelity. Both delegate the hard part to the official
`@vue/compiler-sfc`.

- **Feature flags via esbuild `define`:** `__VUE_OPTIONS_API__: false` (biggest size win;
  safe with `<script setup>` only), `__VUE_PROD_DEVTOOLS__: false`,
  `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false`.
- **SFC `<style>`:** runtime-inject at mount so the existing CSS concat pipeline is
  untouched; scoped `data-v` hashing prevents collisions. Alternative: route esbuild's
  emitted CSS into the concat step (more moving parts).
- **Bundle cost:** ~20–24 KB gzip (Vue + Pinia); vue-router would add ~10–12 KB gzip for
  features we can't use — another reason to skip it. Negligible for a load-once plugin.
- **Escape hatch:** pin the SFC plugin version, add a build-artifact smoke test that a
  compiled `.vue` renders; if the 0.x plugin stalls, drive `@vue/compiler-sfc` directly
  (~150 lines of glue). If `<template>` ergonomics aren't essential for a given view,
  plain Vue `.ts`/`h()`/JSX components need **no** SFC plugin at all.

## Router verdict: skip vue-router

There is no browser URL/history in Obsidian, and Obsidian already owns navigation
between the five views (leaves, ribbon, command palette). vue-router could only serve
**intra-view** sub-tabs (e.g. a unified Library view with roster/skills/loops panes), and
for a handful of sibling tabs with no deep-linking a reactive `activeTab` ref +
`<component :is>` is simpler, dependency-free, and trivially testable. Revisit only if a
single view later grows nested, parameterized, guard-gated navigation worth serializing.

## Test concept

- **Runner:** **Vitest** for the Vue surface (`.vue`, composables, Pinia stores); **keep
  Jest** for existing TS unit/integration + the perf harness. Treat the hybrid as a
  **deprecation ramp with a deletion date**, not a permanent state — `@vue/vue3-jest` is
  effectively unmaintained, and Vitest matches the production Vite-style SFC transform,
  is far faster, and ships codemods for an eventual full migration. Isolate the two
  runners by glob/directory so they never overlap.
- **Component API:** `@testing-library/vue` as the behavior-first default (query by
  role/text, survives refactors); `@vue/test-utils` for Vue-specifics (emitted events,
  slots, `provide`/`inject`, async `<Suspense>`).
- **Stores:** `setActivePinia(createPinia())` for pure store unit tests (real actions);
  `createTestingPinia({ createSpy })` in component tests (actions auto-stubbed;
  `stubActions: false` when you want them to run; `initialState` to seed).
- **Composables:** call pure ones directly; use a `withSetup` helper for
  lifecycle/DI-dependent ones (unmount the throwaway app in `afterEach`).
- **Mock Obsidian:** a hand-written, typed `obsidian` fake aliased in
  (`resolve.alias` / `moduleNameMapper`); inject `App`/plugin via props/provide so they're
  trivially fakeable. Do **not** depend on the unmaintained `jest-environment-obsidian`.
- **Coverage:** `@vitest/coverage-v8` (AST-remapped ≈ Istanbul accuracy). Keep the two
  runners' reports separate during the hybrid. Prefer behavioral DOM assertions over
  full-SFC snapshots (snapshot only small stable sub-trees).

### Testing pyramid

| Layer | Target | Tools | Assert |
|-------|--------|-------|--------|
| Unit | Pinia stores, composables, pure logic | Vitest (no mount for pure fns) | state transitions, getters, action outcomes |
| Component | SFCs in isolation | Testing Library (default) + VTU + `createTestingPinia` | rendered DOM, interactions, emitted events |
| Integration | a mounted view vs fakes | VTU/TL + real Pinia + faked obsidian | components + store wired end-to-end |
| (existing) | provider runtimes, core contracts, perf | **Jest, unchanged** | as today |

## Quality harness & guardrails

- **Lint:** flat config via `@vue/eslint-config-typescript`'s `withVueTs()` (wires
  `vue-eslint-parser` as main parser, TS parser for `<script>`). Adopt `flat/essential`
  at **error** now (zero legacy Vue violations), `strongly-recommended`/`recommended` as
  **warnings** (tracked, matches the existing errors-block/warnings-backlog policy),
  promote via the ESLint ratchet. `@vue/eslint-config-prettier` **last**.
- **`vue/no-v-html` = error.** Vue templates compile to render functions (innerHTML-safe
  by construction), so they satisfy Obsidian's `innerHTML` source ban; `v-html` is the
  one hazard. Render markdown/agent content through Obsidian's `MarkdownRenderer`, never
  `v-html`. (Note for reviewers: Vue's runtime internally uses `innerHTML` for static-vnode
  hoisting from compile-time-known static strings — not plugin source, not an XSS vector.)
- **Typecheck:** add **`vue-tsc --noEmit`** as a **separate** gate; leave the existing
  `tsc --noEmit` untouched. Add a `*.vue` shim (`declare module '*.vue'`).
- **LOC ratchet (biggest silent-defeat risk):** count `.vue` source in the ratchet
  (don't exempt it — that's a migration loophole); exclude `node_modules`/build output;
  make the one-time bootstrap bump a **single reviewed commit**, then hold. Track
  "legacy imperative-DOM LOC deleted" per migration (target net-negative).
- **fallow ratchet:** confirm it parses SFC `<script>`; if not, keep SFCs thin over plain
  `.ts` so dead-code/dupe detection stays honest.
- **Perf gate:** add a spec asserting island mount cost is bounded by the render window
  (mirrors `messageRenderer.perf`) and that `unmount()` is leak-free across open/close.
- **Feature-flag every migrated view** for instant rollback; keep the legacy renderer
  switchable until the Vue view is signed off, then schedule deletion.

### Proposed verification pipeline (ordered, fail-fast)

| # | Stage | Gating? |
|---|-------|---------|
| 1 | Prettier `--check` | advisory → gating |
| 2 | ESLint (flat; `essential`=error incl. `no-v-html`) | **gating** |
| 3a / 3b | `tsc --noEmit` ∥ `vue-tsc --noEmit` | **gating** |
| 4 | Ratchets: `check:loc`, `check:css`, `check:quality` | **gating** |
| 5 | Jest unit (+ coverage floor) | **gating** |
| 6 | Vitest component (`.vue`, + coverage floor, DOM snapshots) | **gating** |
| 7 | Jest integration | **gating** |
| 8 | Perf suite (incl. island mount/unmount specs) | **gating** (bounds, never timings) |
| 9 | `npm run build` | **gating** |
| 10 | `check:artifacts` | **gating** |
| 11 | Visual regression (Playwright+Storybook/Chromatic) | advisory → gating once stable |
| 12 | fallow `quality`/`quality:health` | advisory |

Parallelize independent lanes (3a∥3b, lint∥typecheck). Pre-commit runs only the fast
staged subset (Prettier + `eslint --fix`, optionally affected `vue-tsc`).

### Definition of Done — per migrated view

1. Rendered by a Vue island (`createApp().mount()` into the Obsidian element); `unmount()`
   on close; perf spec proves no leaked listeners/DOM.
2. State via Pinia/adapter; `Conversation.providerId`/`providerState` stays the source of
   truth; no duplicated state.
3. Behind a feature flag; legacy renderer switchable until sign-off.
4. `vue-tsc` clean; ESLint clean (errors) with `no-v-html` passing; Prettier-formatted.
5. Component tests meet the coverage floor; DOM snapshot committed.
6. LOC delta reviewed (ideally net-negative); fallow ratchet not backslid; CSS `!important`
   ratchet held.
7. Perf suite green; a11y warnings triaged.
8. Legacy renderer scheduled for deletion once the flag defaults on and bakes.

## Open questions for the design phase

1. **Scope/ambition:** pilot one view first (recommended: the Library — roster + skills +
   loops, unified with a reactive `activeTab`), incremental coexistence, full migration, or
   Pinia/state-layer only?
2. **Exploratory vs committed:** prove the approach in Specorator, or commit to Vue as the
   target and plan the full migration path?
3. **First deliverable (user-directed):** the development & quality harness + test concept +
   verification pipeline, landed and green on a trivial "hello-island" view, before any real
   view migration.

## Sources

Full source URLs are captured per topic in the five research agent reports that fed this
doc (Vue-in-Obsidian lifecycle, Pinia architecture, Vue testing, esbuild+Vue build & router,
quality harness & guardrails). Key anchors: Vue docs (application API, compile-time flags,
TypeScript/`vue-tsc`, rendering mechanism, testing), Pinia docs (core concepts, outside-
component usage, actions/`$onAction`, testing cookbook), `eslint-plugin-vue` user guide,
`esbuild-plugin-vue3` / `unplugin-vue` repos, `@vue/compiler-sfc`, and real Obsidian plugins
(`obsidian-toggl-accounting` [Vue+Pinia], `qingyuanTech/Obsidian-Vue-Sample-Plugin`
[esbuild+Vue], `obsidian-journal`, `obsidian-acp-bridge`).
