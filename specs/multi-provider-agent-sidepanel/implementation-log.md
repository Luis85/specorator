---
id: IMPL-MPS-001
title: "Multi-provider agent sidepanel — Implementation log"
stage: implementation-log
feature: multi-provider-agent-sidepanel
status: in-progress
owner: dev
inputs:
  - SPEC-MPS-001
  - TASKS-MPS-001
created: 2026-05-21
updated: 2026-05-21
---

# Implementation log — Multi-provider agent sidepanel

Append-only record of executed tasks. Each entry: task ID, files touched,
commit SHA, spec reference, outcome, deviation (if any), green-evidence
line.

## WS-1 — Rename `ClaudeCliPort` → `ChatTransportPort`

### T-MPS-001 — File ADR-MPS-001 (done)

- **Commit:** `cbc1cb7`
- **Files:**
  - `decisions/ADR-MPS-001-rename-claude-cli-port.md` (new)
  - `decisions/README.md` (new — decisions index)
  - `specs/multi-provider-agent-sidepanel/*` (spec inputs committed alongside)
- **Spec:** SPEC-MPS-001 §2.1, DES-MPS-001 §C2 / §C12.
- **Outcome:** done.
- **Deviation:** the ADR ships with status `accepted` rather than the
  template default `proposed` because the design has already been signed
  off in `design.md` §C12 and the rename PR cannot land otherwise.
- **Green evidence:** `npm run verify` green; bundle size 2.76 MB / 4.00 MB
  budget; coverage statements 93.34%.

### T-MPS-002 + T-MPS-003 — red lint tests (done)

- **Commit:** `c2b2d12`
- **Files:**
  - `tests/lint/no-legacy-claude-cli-port-names.test.ts` (new)
  - `tests/domain/ports/ChatTransportPort.imports.test.ts` (new)
- **Spec:** SPEC-MPS-001 §2.1 / §14; TST-MPS-34, TST-MPS-35.
- **Outcome:** done. Two failing tests landed first to codify the
  rename deny-rules ahead of the implementation per RALPH discipline.
- **Deviation:** none — both tests turn green in `e3b80bf`.
- **Red evidence:** the lint test reported ~120 legacy occurrences in
  18 files; the import-cleanliness test failed because the renamed
  port file did not yet exist.

### T-MPS-004 + T-MPS-005 + T-MPS-006 + T-MPS-007 — rename + codemod + lint rule (done)

- **Commit:** `e3b80bf`
- **Files:**
  - `src/domain/ports/ChatTransportPort.ts` (renamed from `ClaudeCliPort.ts`)
  - `src/domain/ports/index.ts` (re-export pointers updated)
  - `src/infrastructure/bridge/ports.ts` (`CLAUDE_CLI_PORT` → `CHAT_TRANSPORT_PORT`)
  - `src/ui/composables/useChatTransportPort.ts` (new canonical composable)
  - `src/ui/composables/useClaudeCliPort.ts` (now a one-release `@deprecated` re-export shim, allow-listed by lint + codemod)
  - `scripts/codemod/rename-claude-cli-port.mjs` (new) + `tests/scripts/rename-claude-cli-port.test.ts` (new)
  - `eslint-rules/no-legacy-claude-cli-port-names.cjs` (new) + `eslint-rules/__tests__/no-legacy-claude-cli-port-names.test.cjs` (new)
  - `eslint.config.js` (rule wired in; shim path carved out)
  - `package.json` (`lint:rules` runs the new RuleTester suite)
  - 18 production source files + 18 test files swept by the codemod
    across `src/application/chat/**`, `src/infrastructure/**`,
    `src/plugin/**`, `src/ui/**`, and their `tests/` mirrors.
- **Spec:** SPEC-MPS-001 §2.1 (rename table) + §design.md C2 / C12.
  Adds the two additive `ChatTransportErrorCode` members
  `ATTACHMENT_TOO_LARGE` (REQ-MPS-044) and `PROVIDER_UNAVAILABLE`
  required by later workstreams; `StreamDelta` is shape-preserving in
  WS-1 — the new `tool-result` / `todo-update` / `citation` variants
  land in WS-8.
- **Outcome:** done. The seven retired identifiers (`ClaudeCliPort`,
  `ClaudeCliError`, `ClaudeCliErrorCode`, `ClaudeCliQueryOptions`,
  `ClaudeCliStreamOptions`, `CLAUDE_CLI_PORT`, `useClaudeCliPort`)
  appear nowhere in `src/` except inside the allow-listed shim file.
  The custom ESLint rule also defensively bans `useBridge` and
  `useChatTransports` per ADR-008 / ADR-MPS-001 §Compliance.
- **Deviation:** T-MPS-004..007 shipped as a single atomic commit
  rather than the planned slice (a) rename, (b) InjectionKey, (c)
  composable. Reason: the codemod cannot leave the tree green at
  intermediate slice boundaries because every consumer would
  reference both old and new identifiers; a single commit honours the
  user instruction that "Each task ends with `npm run verify` green
  on its branch". Tests `T-MPS-002` and `T-MPS-003` are the deliberate
  exception: their commit (`c2b2d12`) is intentionally red and turns
  green in this commit. Filename-bound legacy artefacts
  (`MockClaudeCliPort.ts`, `degradedClaudeCliPort.ts`,
  `ClaudeCliAdapter.ts` and their test mirrors) keep their current
  paths in WS-1; the spec routes those file renames to later
  workstreams that touch those files for other reasons.
- **Green evidence:** `npm run verify` green at HEAD `e3b80bf` —
  typecheck clean, lint 0 errors / 24 pre-existing warnings, 152 test
  files / 1872 tests passing, coverage 93.34% statements /
  87.15% branches / 92.08% functions / 94.47% lines, plugin bundle
  2.76 MB / 4 MB budget, standalone chunk 0.26 MB / 2 MB budget, all
  workflow files SHA-pinned, manifest valid. `npm run lint:rules`
  also green (RuleTester reports both rule suites pass).

### T-MPS-008 — WS-1 closeout note (this entry)

- **Commit:** *this commit* (workflow-state + tasks.md tick-off + log entry).
- **Files:**
  - `specs/multi-provider-agent-sidepanel/implementation-log.md` (this entry)
  - `specs/multi-provider-agent-sidepanel/workflow-state.md`
    (Stage 7 promoted to `in-progress`; WS-1 hand-off note appended)
  - `specs/multi-provider-agent-sidepanel/tasks.md` (DoD checkboxes
    ticked for T-MPS-001..008; deviations noted)
- **Spec:** REQ-MPS-001, REQ-MPS-002, REQ-MPS-009.
- **Outcome:** done. WS-1 closed; WS-2 next ready task is **T-MPS-009**
  (file ADR-MPS-002 for the `ProviderSelection` discriminator + migration).
- **Deviation:** none.
- **Green evidence:** prior `npm run verify` and `npm run lint:rules`
  green at `e3b80bf`. This entry is metadata-only and does not change
  any executable surface, so the gate's earlier green stands.

## Branch summary

- **Branch:** `feature/mps-ws-1-rename-port`
- **Commits (3):** `cbc1cb7` (ADR + spec inputs) → `c2b2d12` (red TDD
  tests) → `e3b80bf` (rename + codemod + lint rule).
- **Stage status at hand-off:** Stage 7 (implementation) `in-progress`;
  WS-1 complete; WS-2..WS-10 pending; no blockers.
- **Next agent:** dev (WS-2). First ready task: T-MPS-009.

---

## WS-2 — `ProviderSelection`, `ProviderRegistry`, migration

### T-MPS-009 — ADR-MPS-002 filed

- **Commit:** `c5a96cb`
- **Files:** `decisions/ADR-MPS-002-provider-selection-discriminator.md`
  (new, 220 lines).
- **Spec:** SPEC-MPS-001 §§2.2–2.7, §3; REQ-MPS-003/004/005/006/007/008,
  NFR-MPS-006.
- **Outcome:** done.
- **Deviation:** none.

### T-MPS-010 + T-MPS-011 — `ProviderSelection` discriminator

- **Commit:** `16964dd`
- **Files:** `src/domain/chat/ProviderSelection.ts` (new, 56 lines);
  `tests/domain/chat/ProviderSelection.test.ts` (new, 93 lines, 13
  green).
- **Spec:** SPEC-MPS-001 §2.2 / REQ-MPS-003.
- **Outcome:** done.
- **Deviation:** none.

### T-MPS-012 + T-MPS-013 — `ProviderCapabilities` shape

- **Commit:** `0b5a8e2`
- **Files:** `src/domain/chat/ProviderCapabilities.ts` (new, 41 lines);
  `tests/domain/chat/ProviderCapabilities.test.ts` (new, 76 lines, 3
  green).
- **Spec:** SPEC-MPS-001 §2.4 / REQ-MPS-006.
- **Outcome:** done.
- **Deviation:** none.

### T-MPS-014 + T-MPS-015 — `ProviderRegistry` interface

- **Commit:** `f304d34`
- **Files:** `src/domain/chat/ProviderRegistry.ts` (new, 53 lines);
  `tests/domain/chat/ProviderRegistry.test.ts` (new, 100 lines, 7
  green).
- **Spec:** SPEC-MPS-001 §2.3 / REQ-MPS-006, NFR-MPS-003.
- **Outcome:** done. Interface only — no concrete registry built;
  WS-3's `buildProviderRegistry` wires the runtime.
- **Deviation:** none.

### T-MPS-016 + T-MPS-017 — `ChatThreadRecord` extension

- **Commit:** `3dece04`
- **Files:**
  - `src/domain/chat/ChatThreadRecord.ts` (transport → discriminated
    object, +title, +forkParent).
  - `src/plugin/chatThreadsPersistence.ts` (decode accepts both legacy
    string and new object shape; encode emits object shape).
  - `src/application/chat/ChatTurnOrchestrator.ts`,
    `src/application/chat/SessionLogWriter.ts`,
    `src/application/chat/TurnInputBuilder.ts` — translate at boundary
    so `ResolvedTransport` (legacy union) and `SessionLogFrontmatter`
    (YAML schema) keep their existing shapes.
  - `tests/domain/chat/ChatThreadRecord.test.ts` (new, 64 lines, 5
    green) plus 11 test files swept to the new fixture shape.
- **Spec:** SPEC-MPS-001 §2.6 / REQ-MPS-005, REQ-MPS-020, REQ-MPS-021,
  REQ-MPS-023.
- **Outcome:** done.
- **Deviation:** `SessionLogFrontmatter` keeps its `'api-key' |
  'subscription'` string union (separate type, mirrors the YAML
  schema). Translation happens at the writer boundary. WS-3 or a
  follow-up may align it.

### T-MPS-018..022 — `migrateProviderSelection` pure migration

- **Commit:** `16e1b9e` (+ `f4f55aa` refactor for lint compliance)
- **Files:**
  - `src/application/migration/migrateProviderSelection.ts` (new, 264
    lines after refactor — helper-extracted to keep complexity ≤ 10).
  - `src/application/migration/index.ts` (barrel).
  - Four red-then-green test files under
    `tests/application/migration/` — settings (5 cases), threads (4),
    idempotency (5), errors (5). 25 tests total, all green.
- **Spec:** SPEC-MPS-001 §3 / REQ-MPS-004, REQ-MPS-005, NFR-MPS-006.
- **Outcome:** done. Pure, idempotent, never-throws contract verified
  by tests.
- **Deviation:** ADR-MPS-002 wording said "delete the legacy key" —
  lint rule `no-restricted-syntax` forbids the `delete` operator, so
  the implementation rebuilds the settings object without the legacy
  key (semantically equivalent). Recorded for traceability.

### T-MPS-023 + T-MPS-024 — `PluginSettings` delta + defaults

- **Commit:** `c265b0a`
- **Files:**
  - `src/domain/settings/PluginSettings.ts` (added 6 new fields with
    defaults; `transportKind` retained as deprecated optional pending
    WS-3 removal).
  - `src/core/core-settings.ts` (validator emits the new fields, drops
    `transportKind`; new helpers `validateProviderSelection`,
    `validateProviderModel`, `coerceNumber`).
  - `src/plugin/loadSettings-migrate.ts` (PLUGIN_SETTINGS_KEYS extended).
  - `tests/domain/settings/PluginSettings.test.ts` (new, 70 lines, 9
    green) + cross-WS test updates (core-settings,
    loadSettings-migrate, main.chat-threads-flush,
    ChatSidebar.sessionPersistence).
- **Spec:** SPEC-MPS-001 §2.7 / REQ-MPS-003, REQ-MPS-008, REQ-MPS-014,
  REQ-MPS-025, REQ-MPS-040.
- **Outcome:** done.
- **Deviation:** spec §2.7 says "remove `transportKind`". Dispatch
  forbids WS-2 from touching `TransportSelector` / `ChatSidebar` /
  `TurnInputBuilder`, all of which still consume `settings.transportKind`
  on read. Compromise: kept `transportKind` as a **deprecated
  optional** field on the type (not in `DEFAULT_SETTINGS`, not emitted
  by the validator), with a JSDoc note pointing at WS-3 / T-MPS-029 for
  final removal. Migration deletes the key from `_storedData` before
  validation runs, so legacy state never leaks back in. Logged so WS-3
  can complete the removal alongside the selector reshape.

### T-MPS-025 + T-MPS-026 — Migration wiring + integration tests

- **Commit:** `d75b1d0`
- **Files:**
  - `src/plugin/main.ts` (`_runProviderSelectionMigration()` invoked
    from `loadSettings()` after `promoteLegacyFlatSettings`; wrapped in
    `tryAsync` so a future throw can not crash startup).
  - `tests/plugin/migration-on-load.test.ts` (new, 188 lines, 7 green).
  - `tests/fixtures/data-json-legacy/{auto,api-key,subscription}.json`
    (new fixtures matching the release-criteria scenarios).
- **Spec:** SPEC-MPS-001 §3 / REQ-MPS-004, REQ-MPS-005, NFR-MPS-006.
- **Outcome:** done. Integration test asserts: legacy `transportKind`
  translated and removed, per-record `chatThreads.transport`
  translated, `title`/`forkParent` defaulted, `saveData` called exactly
  once on first load, idempotent on second load.
- **Deviation:** none.

### T-MPS-027 — WS-2 closeout (this entry)

- **Commit:** *this commit* (workflow-state + tasks.md tick-off + log
  entry).
- **Spec:** —
- **Outcome:** done. WS-2 complete; WS-3 next ready task is **T-MPS-028**
  (selector truth table parameterised test, all 15 rows red).
- **Deviation:** Branch was cut from `feature/mps-ws-1-rename-port`
  (WS-1 tip), not `develop`, to keep throughput high while PR #417
  awaits auto-merge. Will rebase onto `develop` after WS-1 squashes.
- **Green evidence:** `npm run verify` green (typecheck, lint, full
  test suite 1934+ unit tests, plugin bundle 2.77 MB / 4 MB budget,
  standalone chunk 0.26 MB / 2 MB budget, all workflow files
  SHA-pinned, manifest valid). Targeted re-run of WS-2 surfaces +
  affected legacy tests: 304/304 green; broader UI + integration:
  932/932 green.

## WS-2 branch summary

- **Branch:** `feature/mps-ws-2-provider-selection` (cut from
  `feature/mps-ws-1-rename-port`).
- **Commits (10):** `c5a96cb` (ADR) → `16964dd` (ProviderSelection) →
  `0b5a8e2` (Capabilities) → `f304d34` (Registry) → `3dece04`
  (ChatThreadRecord) → `16e1b9e` (migration pure fn) → `c265b0a`
  (PluginSettings) → `d75b1d0` (main.ts wiring + integration tests) →
  `f4f55aa` (lint-clean refactor) → *this commit* (closeout).
- **Stage status at hand-off:** Stage 7 `in-progress`; WS-1 + WS-2
  complete; WS-3..WS-10 pending; no blockers.
- **Next agent:** dev (WS-3). First ready task: T-MPS-028
  (`TransportSelector` truth table — 15 red rows, design §C4 / spec §11
  rows R1..R15).

---

## WS-3 — `TransportSelector` reshape + `buildProviderRegistry` + plugin wiring

### T-MPS-028 — 15-row truth-table test (RED)

- **Commit:** `97daffc`
- **Files:** `tests/plugin/transport/TransportSelector.test.ts` (rewritten,
  lines 1..323).
- **Spec:** SPEC-MPS-001 §4 / design §C4. Maps TST-MPS-04 (R6),
  TST-MPS-05 (R7), TST-MPS-06 (R11); covers R1..R5, R8..R10, R12..R15 for
  completeness.
- **Outcome:** done — all 15 truth-table rows + 2 purity guards intentionally
  red because the selector still consumed the old `TransportSelectorDeps`
  shape.

### T-MPS-029 — Reshape `selectTransport` to `ProviderSelection` (GREEN)

- **Commit:** `3d1b2e4`
- **Files:**
  - `src/plugin/transport/TransportSelector.ts` (rewritten, lines 1..172)
  - `src/application/chat/selectTransport.ts` (re-export updated to
    `ProviderRouterDeps` / `TransportResolution`)
  - `src/plugin/SpecoratorView.ts` (introduces local `TransportSelection`
    `{ port, kind }` so the deprecated `TransportKind` vocabulary stays
    out of `TransportSelector.ts` — NFR-MPS-003)
  - `src/plugin/AgentSidepanelView.ts` (re-imports `TransportSelection`
    from `./SpecoratorView`)
  - `src/plugin/main.ts` (inlines a `_routeTransport(settings)` adapter
    that calls the new selector and maps the result back to the legacy
    `{ port, kind }` shape; cursor adapter slots filled with degraded
    stubs flagged for WS-4/WS-5 replacement)
  - `tests/plugin/SpecoratorView.test.ts` (fixture translates
    legacy `transportKind` → `ProviderSelection`; assertions unchanged)
  - `tests/plugin/AgentSidepanelView.test.ts` (same fixture refactor)
- **Spec:** SPEC-MPS-001 §4 / design §C4 / REQ-MPS-007, REQ-MPS-008,
  REQ-MPS-012, REQ-MPS-014.
- **Outcome:** done — all 15 truth-table rows + 2 purity guards green;
  full unit suite passes (no behavioural regression).
- **Deviation:** none. `TransportSelection { port, kind }` is *not* part
  of the new spec but is retained as a private view-layer adapter type
  so `ChatSidebar`'s `TRANSPORT_KIND_KEY` consumers stay bit-for-bit
  identical (ccs-parity). The vocabulary is documented as legacy in the
  view; future WS removes it once UI surfaces consume the new
  `ProviderSelection` directly.

### T-MPS-030 — `buildProviderRegistry` metadata-only test (RED)

- **Commit:** `1dccec7`
- **Files:** `tests/plugin/transport/buildProviderRegistry.test.ts` (new).
- **Spec:** SPEC-MPS-001 §2.3 / REQ-MPS-006, NFR-MPS-003.
- **Outcome:** done — fails because the module does not yet exist.

### T-MPS-031 — Implement `buildProviderRegistry.ts` (GREEN)

- **Commit:** `736ad6c`
- **Files:**
  - `src/plugin/transport/buildProviderRegistry.ts` (new, 89 lines)
  - `src/infrastructure/bridge/ports.ts` (adds `PROVIDER_REGISTRY_KEY`
    `InjectionKey` alongside the other ADR-008 narrow-port keys)
- **Spec:** SPEC-MPS-001 §2.3 / §2.4 / REQ-MPS-006, NFR-MPS-003.
- **Outcome:** done — 6 registry tests green. Registry carries
  `ProviderCapabilities` records only; no `ChatTransportPort` references
  on `ProviderEntry` (NFR-MPS-003 audited by the test).

### T-MPS-032 — `useProviderRegistry` composable

- **Commit:** `1e258c7`
- **Files:**
  - `src/ui/composables/useProviderRegistry.ts` (new, mirrors
    `useCommunityPluginPort` pattern)
  - `tests/ui/composables/useProviderRegistry.test.ts` (new, 2 cases:
    happy-path inject + throw-when-missing).
- **Spec:** REQ-MPS-006.
- **Outcome:** done — 2 cases green.

### T-MPS-033 — Wire selector + registry into `plugin/main.ts`

- **Commit:** `bccaf61`
- **Files:**
  - `src/plugin/main.ts` (lazy `getProviderRegistry()` accessor backed by
    `buildProviderRegistry`; `_routeTransport` already wired in T-MPS-029
    re-imported `buildProviderRegistry`)
  - `src/plugin/SpecoratorView.ts` (`provide(PROVIDER_REGISTRY_KEY, …)`
    alongside the existing chat-transport provide)
  - `src/plugin/AgentSidepanelView.ts` (same provide)
- **Spec:** SPEC-MPS-001 §9 / REQ-MPS-006, REQ-MPS-007, REQ-MPS-008.
- **Outcome:** done — both views expose the registry under
  `PROVIDER_REGISTRY_KEY`; `useProviderRegistry()` resolves in production
  and test trees alike.
- **Deviation:** the Cursor adapter slots are temporary stubs returning
  `degradedClaudeCliPort`. They are flagged with a
  `// WS-4/WS-5 will replace this stub` comment on each declaration. The
  selector's `cursorApiKeyPresent` / `cursorCliResolved` projections are
  hard-wired to `false` so every Cursor row collapses to `degraded` until
  WS-4 / WS-5 wire the real adapters. ccs-parity (REQ-CCS-001..028)
  remains green because every Claude path bypasses the stubs.

### T-MPS-029 refactor — cyclomatic-complexity split

- **Commit:** `ab73dc2`
- **Files:** `src/plugin/transport/TransportSelector.ts`.
- **Outcome:** done — extracted `isCellAvailable`, `resolveExplicit`,
  `resolveAuto` helpers so each sits under the project's
  `max-complexity: 10` ceiling. Behaviour identical; all 25 truth-table
  tests stay green.

### T-MPS-034 — Regression: `@ccs-parity` suite under the new selector

- **Commit:** *(no code change — regression-gate task)*
- **Spec:** Release criterion G7, TST-MPS-33.
- **Outcome:** done — `npm run verify` green: 1953 unit tests passed
  across 164 files, including the predecessor `claude-cli-chat-sidebar`
  surface (`tests/plugin/{SpecoratorView,AgentSidepanelView}.test.ts`,
  `tests/ui/components/chat/*`, `tests/infrastructure/obsidian/Claude*`,
  `tests/application/chat/*`). Plugin bundle 2.78 MB / 4 MB budget;
  standalone 0.26 MB / 2 MB budget; typedoc + manifest + scaffold +
  workflow SHA-pin gates all clean.

### T-MPS-035 — WS-3 closeout + fan-out notice (this entry)

- **Files:**
  - `specs/multi-provider-agent-sidepanel/implementation-log.md` (this
    file)
  - `specs/multi-provider-agent-sidepanel/workflow-state.md` (hand-off
    entry pointing WS-4..WS-9 leads at the WS-3 tip)

## WS-3 branch summary

- **Branch:** `feature/mps-ws-3-selector-wiring` (cut from
  `feature/mps-ws-2-provider-selection` @ `df31b3f`).
- **Commits (7):** `97daffc` (T-MPS-028 RED) → `3d1b2e4` (T-MPS-029
  selector reshape) → `1dccec7` (T-MPS-030 RED) → `736ad6c` (T-MPS-031
  registry) → `1e258c7` (T-MPS-032 composable) → `bccaf61` (T-MPS-033
  plugin wiring) → `ab73dc2` (lint-driven complexity refactor) → *this
  commit* (closeout).
- **Stage status at hand-off:** Stage 7 `in-progress`; WS-1 + WS-2 +
  WS-3 complete; WS-4..WS-9 ready to start in parallel; WS-10
  integration waits on the fan-out.
- **Next agents (parallel fan-out):**
  - **WS-4 — Cursor API adapter + `SECRET_ID_CURSOR` + settings UX.**
    First ready task: T-MPS-036 (ADR-MPS-003).
  - **WS-5 — Cursor CLI adapter + binary resolver.** First ready task:
    T-MPS-058 (placeholder spec stub) — confirm against
    `dispatch-plan.md`.
  - **WS-6 — Multi-thread switcher (ThreadTabStrip + chat store
    extensions).**
  - **WS-7 — Per-message actions (edit, regenerate, fork).** Requires
    WS-6 thread-record shape before T-MPS-074.
  - **WS-8 — Status panel (todos / bash output / plan mode).**
  - **WS-9 — Provider model selector + settings polish.**
  - All fan-out branches must be cut from this branch's tip and rebase
    onto `develop` after the WS-3 PR squash-merges.

## WS-7 — Per-message actions (Copy / Regenerate / Edit-and-resend)

### T-MPS-084..088 + T-MPS-092 — `MessageActions.vue` + `streamingTurnStore.isStreaming`

- **Commit:** `4065879`
- **Files:**
  - `src/ui/components/agent/MessageActions.vue` (new, 132 lines)
  - `src/ui/stores/streamingTurnStore.ts` — added `isStreaming` computed
    derived from `messagesStore.status === 'loading'`
  - `src/ui/i18n/locales/{en,de}.ts` — `agent.messageActions.*` labels +
    aria-labels (NFR-MPS-008)
  - Tests: `tests/ui/components/agent/MessageActions.{a11y,copy,regen,streaming}.test.ts`
    + `MessageActions.po.ts` (15 cases)
- **Spec:** REQ-MPS-026 (copy), REQ-MPS-027 (regenerate latest only),
  REQ-MPS-028 (edit), REQ-MPS-029 (disabled while streaming),
  NFR-MPS-008 (per-action aria-labels). Spec §8.3.
- **Outcome:** done. Component is intent-only — emits
  `copy/regenerate/edit { messageId }` and the host owns the side
  effects. Regenerate hidden for non-latest assistant; Edit hidden for
  assistant role; both disabled while
  `streamingTurnStore.isStreaming` is true.

### T-MPS-089, T-MPS-090 — `messagesStore.removeLatestAssistant()` + `truncateAfter()`

- **Commit:** `17aaae7`
- **Files:**
  - `src/ui/stores/messagesStore.ts` — two new mutations + 5 new tests
  - `tests/ui/stores/messagesStore.editRegen.test.ts` (new, 9 cases)
- **Spec:** REQ-MPS-027 (regenerate truncation primitive),
  REQ-MPS-028 (edit-and-resend truncation primitive).
- **Outcome:** done. Both mutations idempotent on missing buckets,
  out-of-range indices, and wrong-role tails. Thread-isolated.

### T-MPS-091..094 — Wire `MessageActions` through `MessageList` + `ChatSidebar`

- **Commit:** `9ec2e27` (+ lint fixes in `0cde417`)
- **Files:**
  - `src/ui/components/agent/MessageList.vue` — render
    `<MessageActions>` per turn; compute `latestAssistantId`; re-emit
    `copy/regenerate/edit` (edit carries `{ messageId, index, text }`
    so the host can truncate the trailing turns).
  - `src/ui/components/chat/ChatSidebar.vue` — expose three handlers
    via `defineExpose`: `copyMessageToClipboard`, `regenerateMessage`,
    `editMessage`. Regenerate drops the latest assistant via
    `removeLatestAssistant`, restores the prior user prompt to the
    textarea, and re-dispatches through the existing `handleSend()`
    pipeline (orchestrator's `resume_session_id` semantics keep the
    SDK session continuous). Edit calls `truncateAfter(index - 1)`,
    populates the textarea, and focuses input — user adjusts and
    presses Enter.
  - `src/ui/agent/AgentSidepanelRoot.vue` — wire MessageList's
    `copy/regenerate/edit` to the `ChatSidebar` ref.
  - Tests: `MessageList.regenerate.test.ts`, `MessageList.edit.test.ts`.
- **Spec:** REQ-MPS-026, REQ-MPS-027, REQ-MPS-028. Spec §8.3.
- **Outcome:** done. Architecture mirrors the existing tile-action
  emit chain (`MessageList → AgentSidepanelRoot → ChatSidebar.expose`).
  No new state lives in the root; the sidebar owns the side effects
  because it already holds the orchestrator and the textarea ref.

### T-MPS-095 — WS-7 closeout (this entry)

- **Files:**
  - `specs/multi-provider-agent-sidepanel/implementation-log.md` (this
    file)
  - `specs/multi-provider-agent-sidepanel/workflow-state.md` (hand-off
    entry)

## WS-7 branch summary

- **Branch:** `feature/mps-ws-7-message-actions` (cut from
  `feature/mps-ws-6-multi-thread` tip `89ea04f`).
- **Commits (4):** `4065879` (MessageActions + isStreaming) → `17aaae7`
  (store mutations) → `9ec2e27` (MessageList/ChatSidebar wiring) →
  `0cde417` (lint fixes) → *this commit* (closeout).
- **Stage status at hand-off:** Stage 7 `in-progress`; WS-7 complete;
  WS-4 / WS-5 / WS-8 / WS-9 may continue in parallel; WS-10
  integration still waits on full fan-out.
- **Verification:** `npm run test` green (2017 tests across 178
  files), `npm run typecheck` clean, `npm run lint` 0 errors / 31
  pre-existing warnings, targeted vitest suites for the WS-7 surface
  all green.
