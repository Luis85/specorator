# Obsidian plugin mode reference

Activated by an `obsidian` object in `answers.json`. Produces a
ready-to-feature-develop plugin workspace with the full quality harness wired
in. Encodes the practices battle-tested in the Specorator plugin (marketplace
review parity, ratchets, Vue islands, artifact smoke).

## `answers.json` shape

```json
{
  "obsidian": {
    "id": "demo-notes",
    "name": "Demo Notes",
    "description": "Track and review demo notes in a sidebar view.",
    "author": "Jane Dev",
    "authorUrl": "https://github.com/jane",
    "minAppVersion": "1.7.2",
    "mobile": false,
    "vue": true
  },
  "guardrails": { "cssGuard": true },
  "github": { "integrate": true },
  "docs": { "scaffold": true }
}
```

- `id` — lowercase kebab; the engine strips `obsidian` from it (marketplace
  policy) and sanitizes to `[a-z0-9-]`. Drives the view type, CSS class prefix,
  and package name.
- `mobile` — **always ask the user**: mobile-ready or desktop-only?
  - `false` (desktop): manifest `isDesktopOnly: true`; Node builtins are
    esbuild externals (importable — Obsidian desktop ships Electron).
  - `true` (mobile-ready): manifest `isDesktopOnly: false`; Node builtins are
    NOT external (an accidental `import 'fs'` fails the build loudly), and a
    `no-restricted-imports` lint ban blocks `node:*`/`fs`/`path`/`os`/
    `child_process`/`electron` in `src/`.
- `vue` — default `true`: a Vue 3 island view (Pinia store, vue-router on
  **memory history**, sample pages + component tests). `false` scaffolds a
  vanilla plugin (settings tab + a Notice command).
- `minAppVersion` — default `1.7.2`, the floor for `workspace.revealLeaf` used
  by the scaffold. `obsidianmd/no-unsupported-api` lints API use against it, so
  raising/lowering it is checked, not guessed.
- Obsidian mode forces `testFramework: "vitest"` and `typescript: true`;
  `guardrails.cssGuard` adds the CSS `!important` ratchet (Obsidian-only).

## What gets generated

| Area | Files |
|------|-------|
| Plugin identity | `manifest.json`, `versions.json` (version ↔ minAppVersion map) |
| Build | `esbuild.config.mjs` (CJS es2018 bundle, SFC-style merge into `styles.css`, dev deploy to `$OBSIDIAN_VAULT` + `.hotreload` marker), `scripts/sync-version.mjs` |
| Sources | `src/main.ts`, `src/settings.ts` (+ `withDefaults` merge helper), `src/styles.css`; Vue: `src/ui/VueView.ts`, `src/ui/vue/{App.vue,router.ts,pinia.ts,keys.ts,stores/counter.ts,pages/*.vue}`, `src/vue-shims.d.ts` |
| Tests | `vitest.config.mjs` (jsdom; `obsidian` aliased to the mock; istanbul coverage for fallow), `tests/setup.ts` (createEl/empty/addClass polyfills), `tests/__mocks__/obsidian.ts`, sample unit + component tests |
| Lint/format | `eslint.config.mjs` (obsidianmd recommended + type-aware typescript-eslint + eslint-plugin-vue + import sort + raw-HTML bans + function-health caps + eslint-comments discipline + prettier compat), `.prettierrc.json`, `.prettierignore`, `.editorconfig` |
| Ratchets | shared fallow/LOC harness plus `scripts/check-css-important.mjs` (+ baseline) and `scripts/check-artifacts.mjs` (presence, version sync, size budgets) |
| Docs | `README.md`, `CLAUDE.md` (commands + Obsidian dev rules), plus the generic docs scaffold |
| CI/CD | `.github/workflows/ci.yml` (lint → loc → css → quality → typecheck → format → coverage → build → artifact smoke), `.github/workflows/release.yml` (tag push → build → attach `main.js`/`manifest.json`/`styles.css`) — both only with `github.integrate` |

Everything user-editable is `skip-if-exists` (brownfield adoption never
clobbers); engine-owned ratchet/build scripts under `scripts/` are
overwrite-backup and prettier-ignored so formatting can't fight idempotency.

## Dev loop

```bash
cp .env.example .env.local     # set OBSIDIAN_VAULT=/path/to/test-vault
npm run dev                    # watch build; copies artifacts into the vault
```

Dev builds write a `.hotreload` marker into the vault plugin folder — install
the community **Hot Reload** plugin there once and every rebuild reloads in
place. Production builds (`npm run build`) never touch the vault.

## Marketplace-review parity (the point of the lint surface)

- `obsidianmd.configs.recommended` needs `manifest.json` at the repo root (it
  reads it at import time) and also lints `package.json`/manifest fields.
- Raw HTML sinks (`innerHTML`/`outerHTML`/`insertAdjacentHTML`) and
  `v-html` are `error` — the #1 review finding for plugin UIs.
- `no-console`, `no-new-func`, sentence-case UI copy (plugin name registered as
  a brand), justified-only `eslint-disable` directives, function-health caps.
- Type-aware rules run on `.ts` via the project service; `.vue` type checking
  belongs to `vue-tsc` (`npm run typecheck`). `src/vue-shims.d.ts` gives
  ESLint's plain-tsc resolution a fallback type for `.vue` imports.
- `@typescript-eslint/require-await` is off: Obsidian lifecycle overrides
  (`onOpen`/`onClose`/`onload`) are declared async by the API.
- `obsidianmd/settings-tab/prefer-setting-definitions` stays a warning — adopt
  the declarative settings API once you target Obsidian ≥ 1.13.0.
- The CSS `!important` ratchet mirrors the validator's CSS finding; it scans
  `src/**/*.css` **and** SFC `<style>` blocks, so moving CSS into a component
  cannot dodge it.

## Vue island pattern (when `vue: true`)

- One Vue app per leaf: mount in `onOpen`, `unmount()` + `contentEl.empty()` in
  `onClose` (Vue's documented leak class), and guard against double `onOpen`
  (popout/move flows).
- `markRaw` the plugin before `provide` — Obsidian objects are large and
  cyclic; never let Vue deep-proxy them.
- vue-router uses `createMemoryHistory` (no URL bar in Obsidian); one router
  per island. Pinia is per-island by default — switch to a module singleton for
  cross-leaf shared state.
- SFC `<style>` blocks are extracted by esbuild into `main.css` and folded into
  `styles.css` by the build (Obsidian only loads `styles.css`).
- fallow parses the vitest `obsidian` alias into its module graph, so the mock
  shows high fan-in in `quality:health` — an alias artifact, not a refactor
  target.
- fallow's `usedClassMembers` config declares Obsidian lifecycle members
  (`display`, `onOpen`, `getViewType`, …) as framework-used; extend it when you
  override more lifecycle methods, or dead-code will flag them.

## Release flow

```bash
npm version patch    # sync-version.mjs updates manifest.json + versions.json
git push --follow-tags
```

The tag push triggers `release.yml`: build, then attach `main.js`,
`manifest.json`, `styles.css` to a GitHub release — the layout Obsidian's
community-plugin updater expects. `check:artifacts` fails on version desync or
a missing `versions.json` entry, so a broken release is caught in CI first.

## Brownfield behavior

- Existing `manifest.json`, sources, and configs are kept byte-for-byte;
  the engine only fills gaps.
- A user-authored `vitest.config.*`/`vite.config.*` stands the generated test
  config down (notice; wire the `obsidian` alias + jsdom yourself). Same for a
  foreign prettier config, an unmarked `esbuild.config.mjs`, and existing
  workflows.
- Engine-written files carry a `Generated by project-setup` marker (or exact
  template content for strict-JSON files), so a converged re-apply emits no
  notices.

## Verification

After template or pin changes, re-run the E2E smoke: scaffold into a temp dir
(one desktop+vue run, one mobile+no-vue run) and require ALL of:
`format:check`, `lint` (0 errors), `typecheck`, `test`, `test:coverage`,
`check:loc`, `check:css`, `check:quality`, `build`, `check:artifacts`, a
converged second `apply` (no changes, no warning notices), and
`setup.mjs verify` exiting 0.
