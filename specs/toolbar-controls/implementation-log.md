---
id: IMPL-LOG-TC-001
title: Toolbar & Controls (P6) — Implementation Log
stage: implementation
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
---

# Implementation Log — Toolbar & Controls (P6)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-TC-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-TC-008 (baseline leg), NFR-TC-001 (guard verification),
  SPEC-TC-012/020/026.
- **Files:** `specs/toolbar-controls/parity-screenshots.md` (new — baseline
  skeleton, seven widget groups × 320/520/720 × light/dark, baseline column keyed
  to `claudian-main` `InputToolbar.ts` widget classes + the 240° `ContextUsageMeter`),
  `specs/toolbar-controls/test-plan.md` (new — guard-verification note + the
  TEST-TC-M1/M2/M3 manual legs + the DOMAIN-batch automated status),
  `specs/toolbar-controls/implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification:** the new `TOOLBAR_CATALOG_PORT` key and the new
  domain/application/ui toolbar paths (`@/domain/chat/Reasoning`,
  `@/domain/chat/toolbar/**`, `@/domain/ports/ToolbarCatalogPort`,
  `@/application/chat/toolbar/**`, `@/ui/chat/toolbar/**`) match **no**
  `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` glob — no relaxation task
  needed (recorded in `test-plan.md`). A whole-project `npm run lint` over the
  pre-existing surface passes clean (no new key/port referenced yet).
- **Commit:** `ca037ac`.
- **Deviation:** none. No file under `src/` changed.

## DOMAIN batch (T-TC-002..008)

### T-TC-002 — RED Reasoning union + ToolbarCatalog/TabControls DTOs + query fields (🧪 qa)

- **Spec/test:** TEST-TC-002/006/010/013/017/018/019/027; SPEC-TC-001/002/003/
  006/027.
- **Files:** `tests/domain/chat/Reasoning.test.ts`,
  `tests/domain/chat/toolbar/ToolbarCatalog.test.ts`,
  `tests/domain/chat/toolbar/TabControls.test.ts` (new); `tests/domain/chat/
  ChatTurn.ts.test.ts` (extended — the P6 additivity legs + the P5-shaped query
  byte-identical serialisation leg, the `_queryKeys` exact-keys assertion widened
  to the six members).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on the
  missing `@/domain/chat/Reasoning`, `@/domain/chat/toolbar`, and the three
  `ChatRuntimeQueryOptions` fields).
- **Commit:** `f12f14c`.

### T-TC-003 — `Reasoning.ts` + `ChatRuntimeQueryOptions` three additive fields (🔨 dev)

- **Spec/req:** SPEC-TC-001/002/027; REQ-TC-004/014/017/018/020; NFR-TC-001.
- **Files:** `src/domain/chat/Reasoning.ts` (new — `ReasoningEffort =
  'high'|'medium'|'low'` closed lower-case union + the two-member `readonly`
  discriminated `ReasoningChoice`, `budget.tokens` documented finite non-negative
  integer); `src/domain/chat/ChatTurn.ts` (the three optional fields `mode?`/
  `reasoning?`/`serviceTier?` appended after `appendSystemPrompt`, importing
  `ReasoningChoice` from `./Reasoning`; the P0–P5 members byte-identical;
  `PreparedChatTurn`/`ChatRuntimeEnsureReadyOptions`/`ChatTurnRequest` unchanged);
  `src/domain/ports/index.ts` (barrel re-export of `ReasoningChoice`/
  `ReasoningEffort` appended).
- **Outcome:** done — the TEST-TC-018 type-shape leg + TEST-TC-002 serialisation +
  the TEST-TC-027 `ChatRuntimeQueryOptions` additivity leg now green (8/8 across
  `Reasoning.test.ts` + `ChatTurn.ts.test.ts`); a P5-shaped query is byte-identical
  to P5. The `toolbar/*` DTO tests stay RED for T-TC-004 (by design).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors outside the
  still-RED `toolbar/{ToolbarCatalog,TabControls}.test.ts`; `eslint` clean on the
  three changed files; `vitest run` 8/8 green on the T-TC-003 legs. No
  `obsidian`/`node:*`/Vue import in `src/domain/chat/**`.
- **Commit:** `293809c`.
- **Deviation:** none.

### T-TC-004 — `ToolbarCatalog` descriptor DTOs + `TabControls` bag + barrel (🔨 dev)

- **Spec/req:** SPEC-TC-003/006; REQ-TC-010/011/013/017/019/042; NFR-TC-005/011.
- **Files:** `src/domain/chat/toolbar/ToolbarCatalog.ts` (new — `ModelOption`,
  `ModeDescriptor`, `ReasoningDescriptor`, `ServiceTierDescriptor`, `ToolbarCatalog`,
  all `readonly`; `ReasoningDescriptor.options.length >= 2` to render, distinct
  active/inactive values, every label a display string — all documented),
  `src/domain/chat/toolbar/TabControls.ts` (new — the four optional members
  importing `ReasoningChoice` from `../Reasoning`),
  `src/domain/chat/toolbar/index.ts` (new — barrel re-exporting all of them).
- **Outcome:** done — the TEST-TC-010/013/017/019 + TEST-TC-006 type-shape legs now
  green (`tests/domain/chat/toolbar/` 4/4); plain `readonly` data, no
  `obsidian`/`node:*`/Vue/class; no secret / no path outside the catalog.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); `eslint`
  exit 0 on the three new files; `vitest run tests/domain/chat/toolbar/` 4/4 green.
- **Commit:** `2dc706e`.
- **Deviation:** none.

### T-TC-005 — RED `ToolbarCatalogPort` + `TOOLBAR_CATALOG_PORT` key + barrel (🧪 qa)

- **Spec/test:** TEST-TC-003/010 (port-shape legs); SPEC-TC-004; REQ-TC-003/010;
  NFR-TC-002.
- **Files:** `tests/domain/ports/ToolbarCatalogPort.test.ts` (new — asserts the
  `getCatalog(providerId): ToolbarCatalog` signature, the own
  `InjectionKey<ToolbarCatalogPort>` key, the barrel re-export equality).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on the
  missing port, the missing `TOOLBAR_CATALOG_PORT` key, and the barrel re-export).
- **Commit:** `a747ce9`.

### T-TC-006 — `ToolbarCatalogPort` + `TOOLBAR_CATALOG_PORT` key + barrel re-export (🔨 dev)

- **Spec/req:** SPEC-TC-004; REQ-TC-003/010; NFR-TC-002/010.
- **Files:** `src/domain/ports/ToolbarCatalogPort.ts` (new —
  `getCatalog(providerId: ProviderId): ToolbarCatalog`, documented synchronous +
  total, never throws, unknown-provider/load-miss → safe default, never branched on
  by the consumer); `src/domain/ports/index.ts` (barrel re-exports the port + the
  `ToolbarCatalog`/`TabControls`/descriptor DTOs for one-stop import);
  `src/infrastructure/bridge/ports.ts` (`TOOLBAR_CATALOG_PORT` `InjectionKey`
  appended — own key, no aggregate).
- **Outcome:** done — the TEST-TC-003/010 port-shape legs now green (2/2). One
  consumer, one port (ADR-008). No `obsidian`/`node:*`/Vue; no class.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); `eslint`
  exit 0 on the four changed files (the new key/port imports resolve clean — guard
  green, no relaxation); `vitest run tests/domain/ports/ToolbarCatalogPort.test.ts`
  2/2 green.
- **Commit:** `6310b17`.
- **Deviation:** none.

### T-TC-007 — RED `ToolbarCapabilities` shape + `getToolbarCapabilities()` additivity (🧪 qa)

- **Spec/test:** TEST-TC-003/019/021 (shape legs) + TEST-TC-027 (`ChatRuntimePort`
  additivity leg); SPEC-TC-005/027; REQ-TC-003/015/019/021; NFR-TC-001.
- **Files:** `tests/domain/ports/ChatRuntimePort.ts.test.ts` (extended — the
  `_exactFifteen` keyof equality widened to the sixteen-member contract incl.
  `getToolbarCapabilities`; the `getToolbarCapabilities(): ToolbarCapabilities`
  signature leg; the five-flag `ToolbarCapabilities` shape leg + the barrel-equality
  leg; the runtime sentinel updated to sixteen members + the five-flag assertion).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on the
  missing `ToolbarCapabilities` + the missing `getToolbarCapabilities` member).
- **Commit:** `17a3e95`.

### T-TC-008 — `ToolbarCapabilities` + `getToolbarCapabilities()` + the 3-runtime stub (🔨 dev)

- **Spec/req:** SPEC-TC-005/027; REQ-TC-003/015/019/021; NFR-TC-001/002.
- **Files:** `src/domain/ports/ChatRuntimePort.ts` (the `ToolbarCapabilities`
  interface — the five `readonly` flags — + `getToolbarCapabilities():
  ToolbarCapabilities` appended after `setApprovalCallback`; the P0–P5 members + the
  four `RuntimeCapabilities` flags byte-identical); `src/domain/ports/index.ts`
  (`ToolbarCapabilities` re-export appended alongside `RuntimeCapabilities`);
  `src/infrastructure/mock/MockChatRuntime.ts` (fixed Claude-shaped default stub —
  scriptable body in T-TC-010); `src/infrastructure/localstorage/FixtureChatRuntime.ts`
  (inert flags — `reasoningControl:'none'`, all seams off); `src/infrastructure/
  obsidian/ClaudeCliChatRuntime.ts` (minimal Claude-shaped stub — real
  `supportsMcpTools`/`permissionMode` fleshed in T-TC-012's manual leg);
  `src/ui/chat/composer/EnqueueRuntime.ts` (the decorator forwards
  `getToolbarCapabilities` verbatim to `inner`); `tests/application/chat/
  RunChatTurnUseCase.test.ts` + `RunChatTurnUseCase.rr.test.ts` (the two
  `ScriptedRuntime` doubles gain a Claude-shaped stub — runnability only, no
  assertion change).
- **Outcome:** done — the TEST-TC-003/019/021 shape legs + the TEST-TC-027
  `ChatRuntimePort` additivity leg now green; all six classes that `implements
  ChatRuntimePort` carry `getToolbarCapabilities()` so the build stays green
  (the P5 `readBinary` lesson, T-CA-006). Synchronous + total; no `providerId`
  branch.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project — the
  three bridge runtimes + the `EnqueueRuntime` decorator + the two test doubles all
  satisfy the widened interface); `npm run lint` 0 errors (12 pre-existing
  warnings); `vitest run` 48/48 green over `ChatRuntimePort.ts.test.ts` +
  `RunChatTurnUseCase{,.rr}.test.ts` + `MockChatRuntime.test.ts` +
  `FixtureChatRuntime.test.ts`.
- **Commit:** _this commit._
- **Deviations:**
  1. **Beyond the three bridge runtimes named in the task body, `EnqueueRuntime`
     (a production `ChatRuntimePort` decorator, `src/ui/chat/composer/`) and the two
     `ScriptedRuntime` test doubles also `implements ChatRuntimePort`** — appending
     the interface member breaks their compilation too (the same P5 `readBinary`
     fan-out, T-CA-006). `EnqueueRuntime` forwards the new member verbatim to `inner`
     (it is a transparent decorator); the two test doubles get a Claude-shaped stub
     (runnability only — no assertion changed). This keeps `npm run build` /
     `typecheck` green per the T-TC-008 DoD ("all three runtimes carry a
     `getToolbarCapabilities()` impl/stub so the build stays green").
  2. The spec text references "the five `RuntimeCapabilities` flags"; the actual
     `RuntimeCapabilities` interface carries **four** flags (`supportsFork`,
     `supportsRewind`, `supportsPlanMode`, `supportsInlineResponse`). The test +
     impl assert the real four-flag byte-identical contract (the five-flag count is
     the new `ToolbarCapabilities`). The load-bearing invariant — `RuntimeCapabilities`
     unchanged from P4 — holds.
