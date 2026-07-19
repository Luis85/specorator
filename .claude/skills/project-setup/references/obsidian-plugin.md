# Obsidian plugin mode reference

Activated by an `obsidian` object in `answers.json`. Scaffolds a **new**
(greenfield) plugin workspace with the full quality harness wired in — a
complete sample app plus build, tests, lint, ratchets, CI, and docs. Encodes the
practices battle-tested in the Specorator plugin (marketplace review parity,
ratchets, Vue islands, artifact smoke). It targets a fresh repo (or an empty
directory); it does not retrofit an existing plugin. To add just the quality
gates to an existing codebase, use the generic harness mode (leave `obsidian`
null) — see `references/quality-harness.md`.

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
  "docs": { "scaffold": true },
  "hooks": { "sessionStart": false, "qualityGate": false, "preCommit": false }
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
- `minAppVersion` — default `1.7.2`. Validated against the newest Obsidian API
  the generated code calls, so the manifest can't advertise a version its
  commands can't run on: every variant uses `Vault.getFileByPath` (v1.5.7), and
  the Vue view awaits `Workspace.revealLeaf` (v1.7.2). A value below the
  applicable floor is rejected with guidance.
- Obsidian mode forces `testFramework: "vitest"` and `typescript: true`;
  `guardrails.cssGuard` adds the CSS `!important` ratchet (Obsidian-only).
- `hooks` — **all opt-in, default off; ask which the user wants**:
  - `sessionStart` — a Claude Code `SessionStart` hook that installs deps
    (`.claude/settings.json`), so a fresh web session is dependency-ready.
  - `qualityGate` — a Claude Code `Stop` hook running `typecheck && lint`, so
    the agent self-corrects when it finishes a turn.
  - `preCommit` — `simple-git-hooks` + `nano-staged` running `eslint --fix` +
    `prettier` on staged files (installed via a `prepare` script). `nano-staged`,
    not `lint-staged` (which the scaffold's `depend/ban-dependencies` rule bans).

  `.claude/settings.json` is written only when a hook is enabled. The slash
  commands, publishing guide, and `manifest-beta.json` are NOT hooks — they ship
  always (inert until used).

## What gets generated

| Area | Files |
|------|-------|
| Plugin identity | `manifest.json`, `versions.json` (version ↔ minAppVersion map) |
| Build | `esbuild.config.mjs` (CJS es2018 bundle, SFC-style merge into `styles.css`, dev deploy to `$OBSIDIAN_VAULT` + `.hotreload` marker), `scripts/sync-version.mjs` |
| Entry + registration | `src/main.ts` (orchestration-only), `src/settings.ts` (+ versioned `migrateSettings` helper), `src/commands.ts` (`registerCommands`), `src/styles.css` |
| Core services (`src/core/`) | `commands/CommandsService.ts` (addSimple/addChecked/addEditor/addEditorChecked over `addCommand`), `events/EventBus.ts` + `events/AppEvents.ts` (typed pub/sub), `notices/NoticeService.ts` (the only sanctioned `new Notice()` — raw use is lint-banned), `modals/ModalService.ts` (async `confirm`), `errors/ErrorService.ts` (`run`/`wrap` catch→log→notice seam; `onload` + fallible command demos route through it), `ribbon/RibbonService.ts` (over `addRibbonIcon`), `statusbar/StatusBarService.ts` (chainable item handle over `addStatusBarItem`; clicks via `registerDomEvent`), `menus/MenuService.ts` (`onEditorMenu`/`onFileMenu` over workspace context menus), `timers/TimersService.ts` (`every` over `registerInterval` + self-cleaning `debounce`), `vaultEvents/VaultEventsService.ts` (typed `onModify`/`onCreate`/`onDelete`/`onRename` over `vault.on`), `logging/Logger.ts` (the only sanctioned `console` user; debug/info gated by a setting), `settings/SettingsService.ts` (load/migrate/save + change events), `vault/VaultService.ts` (Vault-API wrapper with normalizePath), `http/RequestService.ts` (over `requestUrl`) |
| UI (`src/ui/`) | both variants: `statusBar.ts` (event-bus subscriber), `registerExtras.ts` (ribbon icon + `editor-menu`/`file-menu` items via MenuService), `registerActivity.ts` (vault-event reactions via VaultEventsService + debounced/heartbeat timers via TimersService), `GreetingSuggestModal.ts` (a `SuggestModal` picker, UI-only — returns its choice via callback); Vue: `registerViews.ts`, `VueView.ts`, `vue/{App.vue,router.ts,pinia.ts,keys.ts,stores/counter.ts,composables/useGreeting.ts,pages/*.vue}`, `src/vue-shims.d.ts` |
| Tests | `vitest.config.mjs` (jsdom; `obsidian` aliased to the mock; istanbul coverage for fallow), `tests/setup.ts` (createEl/empty/addClass polyfills), `tests/__mocks__/obsidian.ts`, `tests/obsidian-augment.d.ts` (types the mock's test-only helpers), unit tests for every service + component/composable tests |
| Lint/format | `eslint.config.mjs` (obsidianmd recommended + type-aware typescript-eslint + eslint-plugin-vue + import sort + raw-HTML + raw-`Notice` bans + function-health caps + eslint-comments discipline + prettier compat), `.prettierrc.json`, `.prettierignore`, `.editorconfig` |
| Ratchets | shared fallow/LOC harness (fallow gates `boundaryViolations` at 0 via `main`/`core`/`ui` zones) plus `scripts/check-css-important.mjs` (+ baseline) and `scripts/check-artifacts.mjs` (presence, version sync, size budgets) |
| i18n (`src/i18n/`) | `i18n.ts` (`t(key, params)`) + `en.json`; literal/template text in `plugin.notices.info/error` is lint-banned (forced through `t()`) |
| Agent workflow | `verify` script (chains the whole gate set in CI order); `.claude/commands/{add-command,add-setting,new-service,release}.md` (slash commands, always); **opt-in** `.claude/settings.json` — `sessionStart` install hook and/or `qualityGate` Stop hook (typecheck+lint) — written only when a hook is enabled |
| Pre-commit (opt-in `hooks.preCommit`) | `simple-git-hooks` + `nano-staged` on staged files (eslint --fix + prettier), installed via the `prepare` script |
| Publishing | `manifest-beta.json` (BRAT-ready, kept in lockstep by sync-version), `docs/publishing.md` (BRAT beta flow + community-plugins submission checklist) — always |
| Docs | `AGENTS.md` (architecture, services, command types, boundaries, i18n, add-a-feature checklist), `README.md`, `CLAUDE.md` (points at AGENTS.md), `docs/adr/0001-plugin-architecture-baseline.md` (with `docs.scaffold`), plus the generic docs scaffold |
| CI/CD | `.github/workflows/ci.yml` (lint → loc → css → quality → typecheck → format → coverage → build → artifact smoke), `.github/workflows/release.yml`, `.github/dependabot.yml` (weekly, grouped), `.github/pull_request_template.md` — all only with `github.integrate` |

## Architecture the scaffold ships

`main.ts` is orchestration-only: it constructs four plugin-owned services
(`commands`, `events`, `notices`, `modals`) and delegates every registration to
a focused `register*` module. Three layers — `main` (entry + `commands.ts`),
`core` (UI-free services), `ui` (views, status bar) — are enforced by fallow
boundary zones (`boundaryViolations` gated at 0): core stays leaf-ward and takes
what it needs by constructor arg or event, never an import. `AGENTS.md` is the
generated guide to all of this, including the command-type table
(callback / checkCallback / editorCallback) and the settings→event→view worked
example. A fresh scaffold is zero-debt: 0 dead-code, 0 boundary violations, all
gates green on day one.

Everything user-editable is `skip-if-exists` (a re-apply never clobbers your
edits); engine-owned ratchet/build scripts under `scripts/` are
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
- `obsidianmd/settings-tab/prefer-setting-definitions` is turned **off** (the
  imperative `PluginSettingTab` the scaffold ships is correct below 1.13); turn it
  back on once you target Obsidian ≥ 1.13.0 and adopt the declarative settings API.
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

## Re-apply behavior

Obsidian mode is greenfield: it writes a complete new plugin. Re-running `apply`
on the generated project is safe and idempotent:

- User-editable files (sources, docs, `package.json` scripts) are
  `skip-if-exists` — your edits are never overwritten.
- Engine-owned scripts and configs (`scripts/*.mjs`, `eslint.config.mjs`,
  `vitest.config.mjs`, `esbuild.config.mjs`, `tsconfig.json`) are
  overwrite-backup, so template updates from a newer skill version reach the
  project (a `.backup` is kept), and apply no-ops when the content already
  matches. Engine-owned CI (`.github/workflows/ci.yml`, `release.yml`) is
  refreshed the same way, so a package-manager switch updates their install/run
  commands; a workflow you wrote yourself (no generated marker) is kept with a
  notice instead.
- Identity and structural choices — `id`, `name`, `vue`, `mobile` — are frozen
  to the first apply. They shape retained skip-if-exists sources (the CSS class
  prefix, the view title/brand, `.vue` files, import bans) that a re-apply won't
  rewrite, so changing them in `answers.json` is ignored. A rename or a
  vue/mobile switch is a deliberate manual refactor, not a re-apply.
- A converged re-apply changes nothing and emits no warning notices.

## Verification

After template or pin changes, run the real-install E2E smoke — it scaffolds a
fresh plugin into a temp dir (one desktop+vue run, one mobile+no-vue run), runs a
real `npm install`, and requires `setup.mjs verify` to exit 0 (the full gate:
`lint` at 0 errors, `check:loc`, `check:css`, `check:quality`, `typecheck`,
`format:check`, `test:coverage`, `build`, `check:artifacts`):

```bash
PROJECT_SETUP_E2E=1 node --test scripts/tests/e2eScaffold.test.js
```

The test is skipped in the normal `node --test` suite (it needs network + a few
minutes), so run it manually. It is the guard that the greenfield guarantee — a
fresh scaffold is green on day one — does not silently regress.
