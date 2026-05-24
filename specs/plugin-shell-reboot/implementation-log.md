---
id: IMPL-PSR-001
title: Plugin shell reboot (P0) — implementation log
stage: implementation
feature: plugin-shell-reboot
status: in-progress
owner: dev
epic: claudian-reboot
phase: P0
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — plugin shell reboot (P0)

Chronological, append-only record of T-PSR-* execution. Each entry names the
task, what changed, and the gate state at the time. RED-test (qa) tasks record
the failing state they establish; implementation (dev) tasks record the GREEN
convergence.

> TDD discipline (mission): RED test authored + watched fail, then minimal code
> to green. Delete waves end `npm run typecheck` green-or-expected.

---

## Phase A — surviving surface + RED tests

### T-PSR-001 / T-PSR-002 — RED: `coreSettingsModule` load-or-default (qa)

- `tests/core/core-settings.test.ts` rewritten to the slim, no-backwards-compat
  contract (SPEC-PSR-002/003/004): `validateSettings` load-or-default,
  **no** `migrate`, **no** `settingsVersion`, unknown-key hygiene, two-dropdown
  schema, `DEFAULT_SETTINGS` == `{locale,logLevel}`.
- **RED confirmed:** the slim assertions fail against the current fat module
  (`migrate()`, `settingsVersion: 3`, 16 fields). Green target = T-PSR-003/004.
- TEST-PSR-001..007. Commit `test(psr): RED load-or-default core-settings`.

### T-PSR-005 — RED: `AgentPanelRoot` placeholder (qa)

- New `tests/ui/agent/AgentPanelRoot.test.ts` + `AgentPanelRoot.po.ts` (queried
  by `data-testid="agent-panel-empty"`, ADR-009). **RED confirmed** (component
  does not exist → mount errors). Green target = T-PSR-007. TEST-PSR-008.

### T-PSR-006 — RED: i18n placeholder + `toSupportedLocale` (qa)

- Extended `tests/ui/i18n/index.test.ts`. **RED confirmed:** `toSupportedLocale`
  is not exported yet (typecheck TS2724 + runtime TypeError) and
  `agent.empty.placeholder` resolves to the bare key. Green target = T-PSR-007.
  TEST-PSR-009/010.

### T-PSR-011 — Trace ErrorBoundary E10 → TEST-PSR-015 (qa)

- The existing `tests/ui/components/ErrorBoundary.test.ts` already asserts
  `LoggerPort.error` + `NotificationPort.showError` + the fallback testid. Added
  a TEST-PSR-015 / SPEC-PSR-005 (E10) / OC-PSR-7 trace docblock. **GREEN** against
  the kept `ErrorBoundary.vue` (it must survive Wave 0 unedited — OC-PSR-7).

### T-PSR-012 — RED: `WorkspacePort` openFile-only (qa)

- New `tests/domain/ports/WorkspacePort.test.ts`: compile-time exact-key
  assertion (`keyof WorkspacePort === 'openFile'`) + `MockBridge` conformance.
  **RED confirmed via `npm run typecheck`** (TS2322 against the fat 7-member
  port). Green target = T-PSR-013. TEST-PSR-011.

### T-PSR-028 — RED: `ci.yml` `next` trigger (qa)

- New `tests/workflows/ci-next-trigger.test.ts` (YAML parse). **RED confirmed:**
  current `[develop, demo, main]` lists exclude `next`. Green target = T-PSR-029.
  TEST-PSR-023.

### T-PSR-024 — QA recon: programmatic-ESLint harness + fixtures carve-out (qa, OC-PSR-6)

- **Reuse target for the SPEC-PSR-014 guard test (T-PSR-027):**
  `tests/eslint-boundaries.test.ts` already drives the ESLint Node API
  (`new ESLint(...).lintFiles(...)`) over `src/**/__fixtures__/**` boundary
  fixtures. T-PSR-027 extends that pattern in a new
  `tests/architecture/no-deleted-subsystem-refs.test.ts` (no
  `tests/architecture/` dir exists yet). The two `tests/lint/*.test.ts` files use
  `readFileSync` walks, not the ESLint API — not the reuse target.
- **`__fixtures__` carve-out confirmed:** `eslint.config.js` ignores
  `**/__fixtures__/**` (≈ line 192, with the comment that fixtures are exercised
  "via the ESLint API"). The T-PSR-025 positive-control fixture therefore lives
  under a `__fixtures__/` path, ignored by daily `npm run lint` but lintable
  on demand by the harness. **OC-PSR-6 closed.**

### T-PSR-031 — ADR index + superseded-by pointers (dev, OC-PSR-3)

- **Created `docs/adr/README.md`** (no index existed — the architect flagged this
  in workflow-state). Lists every ADR with a "P0 reboot scope" column quoting
  ADR-PSR-001's kept/superseded split; adds the `ADR-PSR-001`/`ADR-PSR-002` rows.
- **Frontmatter pointers (bodies untouched):** added `superseded-by: ADR-PSR-001`
  to `ADR-008` (scoped to its feature-port surface; status stays `accepted` —
  six core ports remain) and set `ADR-PSR-001` `supersedes: [ADR-008]`.
- **MPS/AUX scope call (flag to maintainer):** no standalone `ADR-MPS-*` /
  `ADR-AUX-*` files exist in `docs/adr/`. Rather than stamp `superseded-by` onto
  accepted numbered/feature ADRs (013–018, 0027–0034) whose non-feature parts may
  survive, the feature-surface supersession is recorded in the index's reboot-scope
  column. This is the OC-PSR-3 re-scope the architect anticipated. **OC-PSR-3
  closed** pending the maintainer's nod at the P0 checkpoint.
- Noted the pre-existing duplicate `0030` ADR-number collision in the index
  (out of P0 scope).

### T-PSR-014 — RED: slim settings-tab round-trip (qa)

- Rewrote `tests/plugin/settings.test.ts` to mount `SpecoratorSettingTab` and
  drive the schema `locale` dropdown's `onChange` through `SettingsPort`
  (E12 round-trip). Uses a Proxy `obsidian` mock (real `Setting`/`PluginSettingTab`
  capturing the dropdown; no-op for every other export) + `fakeModulePorts`.
- **RED confirmed:** `display()` throws at the fat tab's `renderAboutYouSection`
  (`containerEl.createEl`) — the very surface T-PSR-015 deletes. Once the tab is
  slimmed to the module loop, `display()` completes and the round-trip asserts
  green. TEST-PSR-014; SPEC-PSR-008.

> Batch 1 gate snapshot (post-RED): `npm run typecheck` reports exactly two
> intended RED type errors (WorkspacePort exact-key assertion; missing
> `toSupportedLocale`); `npm run test` shows the 4 RED unit files failing for the
> expected reasons; ErrorBoundary + WorkspacePort runtime checks pass. No lint
> errors introduced.

## Phase A — GREEN: slim the surviving surface

> From here, slimming the surviving surface deletes fields/symbols the
> not-yet-deleted fat consumers still import, so tree-wide `npm run typecheck`
> is **expected red** until the Phase B delete waves land (Phase A exit
> condition, spec §9). Each slim task is verified GREEN via its targeted tests.

### T-PSR-003 — Slim `PluginSettings` (dev)

- `src/domain/settings/PluginSettings.ts` reduced to `{ locale, logLevel }` +
  `DEFAULT_SETTINGS`; dropped the 16 feature/provider/workflow fields and both
  `@/domain/chat` type imports. SPEC-PSR-001; REQ-PSR-006.

### T-PSR-004 — Slim `coreSettingsModule` (dev)

- `src/core/core-settings.ts` rewritten to **load-or-default**: no `migrate`, no
  `settingsVersion`, a two-field `validateSettings` (`coerceString` locale,
  `coerceEnum`/`VALID_LOG_LEVELS` logLevel), two-dropdown schema. Deleted every
  other coercion helper, the `VALID_*` provider constants, the provider
  validators, and the `@/domain/chat` imports.
- **T-PSR-001/002 GREEN** (13 tests). SPEC-PSR-002/003/004; CHARTER-REQ-FRESH.

### T-PSR-007 — `AgentPanelRoot.vue` + trimmed i18n + `toSupportedLocale` (dev)

- Created `src/ui/agent/AgentPanelRoot.vue` (single `data-testid="agent-panel-empty"`
  reading `t('agent.empty.placeholder')`, `<script setup>` only).
- Trimmed `src/ui/i18n/locales/en.ts` + `de.ts` to the single
  `agent.empty.placeholder` key (kept `export default … as const`).
- Added exported `toSupportedLocale(locale)` to `src/ui/i18n/index.ts`; `i18n` /
  `setLocale` / `i18nTranslate` / `i18nMerge` / `SupportedLocale` /
  `SUPPORTED_LOCALES` / `MessageSchema` kept in shape.
- **T-PSR-005/006 GREEN** (11 tests). SPEC-PSR-006/010/011/012.

### T-PSR-013 — Revert `WorkspacePort` to `openFile`-only (dev)

- `src/domain/ports/WorkspacePort.ts` reduced to `{ openFile(path): Promise<void> }`;
  deleted the six chat-era methods + the `ActiveFileSnapshot` interface + the
  `Unsubscriber` import (used only by `onActiveFileChanged`). Removed the
  `ActiveFileSnapshot` re-export from `src/domain/ports/index.ts` (kept
  `Unsubscriber` per SPEC-PSR-009). T-PSR-012's type-level assertion is now
  satisfiable; confirmed at the Phase B typecheck-clean gate. SPEC-PSR-009; OC-PSR-1.

### T-PSR-029 — Add `next` to `ci.yml` triggers (dev)

- `.github/workflows/ci.yml`: added `next` to `on.push.branches` and
  `on.pull_request.branches`. Only change; no `uses:` touched
  (`verify:workflows` clean — 7 files, all SHA-pinned). `actionlint` not
  installed locally (CI `workflow-lint` job enforces it); the edit is a pure
  branch-list extension. **T-PSR-028 GREEN** (2 tests). SPEC-PSR-015; REQ-PSR-012.
- **Flagged (repo-settings, to release/SRE):** branch protection on `next` must
  require the `verify` check before merge.

### T-PSR-015 — Slim `SpecoratorSettingTab` (dev)

- `src/plugin/settings.ts` rewritten to the module-schema loop only
  (`display` + `currentValue` + generic `addControl` switch + `saveField`).
  Deleted every `render*`/`handle*`/`_test*`/`_set*`/`_bumpAllViews` helper and
  the `node:path`/`node:child_process`/binary-resolver/`SECRET_ID_*`/
  `SpecoratorView`/`AgentSidepanelView`/`CursorSettingsSection` imports.
- **T-PSR-014 GREEN** (round-trip through `SettingsPort`). SPEC-PSR-008; REQ-PSR-007.

## Phase A/B — assemble the new surface (Batch 3)

> **OC-PSR-4 closed:** `ALL_MODULES = [coreSettingsModule, helloModule]` already
> (`src/modules/index.ts`); `helloModule` names no deleted subsystem. It persists
> (settingsKey `hello`, version 1) so the minimal `_storedData`/`core.init`
> round-trip is kept; only the settings `saveData` is dropped.
>
> **NFR-PSR-011 closed (no escalation):** `App.loadLocalStorage(key): any|null`
> and `App.saveLocalStorage(key, data): void` are present in the obsidian
> typings (resolved from the hoisted root `node_modules`; devDep `obsidian
> ^1.12.3` ≥ `minAppVersion 1.12.7`). `secretStorage` is a P1 concern (deferred).

### T-PSR-021 (settings-store slice, pulled forward for T-PSR-008) — `ObsidianBridge` device-local re-point + TEST-PSR-024

- **Sequencing note (TDD honoured):** the slim `main.ts` (T-PSR-008) routes
  settings through `bridge.getSettings`/`saveSettings`; with the old bridge that
  recursed (`saveSettings → onSaveSettings → updateSettings`). So the SettingsPort
  device-local re-point (T-021's settings slice) was pulled forward. **RED watched**
  (impl stashed): `activateAgentSidebar is not a function`, `settingsGetter`/
  `onSaveSettings is not a function` — then GREEN.
- `ObsidianBridge` constructor → app-only; `getSettings` reads
  `app.loadLocalStorage('specorator:settings')` (load-or-default, defaults on
  absent/corrupt); `saveSettings` writes `app.saveLocalStorage` (never
  `data.json` — the bridge has no `saveData` access); `_shouldLog` reads the
  device-local logLevel. TEST-PSR-024 GREEN (3 tests).
- **Remaining T-021 (Wave 3b):** drop `ChatTransportPort`/`IconPort` from all
  three bridges, the `MockBridge`/`LocalStorageBridge` de-couple, `ports.ts` +
  `fake-ports.ts` trim. SPEC-PSR-008; REQ-PSR-013, NFR-PSR-010; ADR-PSR-002.

### T-PSR-009 — `AgentSidebarView` + `VIEW_TYPE_AGENT` (dev)

- `src/plugin/AgentSidebarView.ts` (`ItemView`): `VIEW_TYPE_AGENT='specorator-agent'`,
  `getIcon()='bot'` (native), `onOpen` mounts `AgentPanelRoot` inside
  `ErrorBoundary`'s default slot via `createApp({ render: () => h(ErrorBoundary,
  null, { default: () => h(AgentPanelRoot) }) })`, installs Pinia + i18n, provides
  the six core ports, narrows locale via `toSupportedLocale`; `onClose` unmounts +
  empties; `bridge === null` no-op. SPEC-PSR-005.

### T-PSR-008 — slim `main.ts` (dev)

- Rewrote `src/plugin/main.ts` to the SPEC-PSR-016 shape: `settings`/`core`/`bridge`
  public; `onload` = construct `ObsidianBridge(app)` → `loadSettings`
  (load-or-default via `bridge.getSettings`, **no** legacy data.json read) →
  `PluginCore(ALL_MODULES, ports)` → `setLocale(toSupportedLocale(...))` →
  `core.init(_storedData)` → **drop `_storedData.specorator`** (keep
  locale/logLevel out of data.json) → `registerView(VIEW_TYPE_AGENT)` → one command
  `open-agent-sidebar` (no ribbon) → `addSettingTab`. `onload` carries **no**
  settings `saveData`; `updateSettings` → `bridge.saveSettings` (device-local) +
  `core.notifySettingsChanged`. SPEC-PSR-016; REQ-PSR-001/003/013, NFR-PSR-010/011.

### T-PSR-010 — RED→GREEN: `activateAgentSidebar` E1/E2 (qa)

- `tests/plugin/activateAgentSidebar.test.ts`: E1 (twice → one leaf + reveal),
  E2 (`getRightLeaf` null → no throw). RED watched (method absent on fat main),
  then GREEN. TEST-PSR-012/013; SPEC-PSR-007.
