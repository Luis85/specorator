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

> Batch 1 gate snapshot (post-RED): `npm run typecheck` reports exactly two
> intended RED type errors (WorkspacePort exact-key assertion; missing
> `toSupportedLocale`); `npm run test` shows the 4 RED unit files failing for the
> expected reasons; ErrorBoundary + WorkspacePort runtime checks pass. No lint
> errors introduced.
