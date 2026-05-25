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

---

## T-TC-009 — RED: scriptable Mock catalog/caps + inert LS + fake-ports `toolbarCatalog` (🧪, qa)

- **Spec/req:** SPEC-TC-008, SPEC-TC-009; TEST-TC-003/010/011/013/017/019/021/030
  (Mock/LS backing); REQ-TC-003/013/019/021; NFR-TC-001/010.
- **Files:** `tests/infrastructure/mock/MockToolbarCatalog.test.ts` (new, 1-130 —
  scriptable catalog + `MockBridge.toolbarCatalog`), `tests/infrastructure/mock/
  MockToolbarCapabilities.test.ts` (new, 1-67 — scriptable `getToolbarCapabilities`),
  `tests/infrastructure/localstorage/LocalStorageToolbar.test.ts` (new, 1-78 — inert
  catalog + bridge accessor + `FixtureChatRuntime` inert caps),
  `tests/__fakes__/fake-ports.test.ts` (1 case appended, ~106-114 — the
  `toolbarCatalog` member).
- **Commit:** `2acc196`.
- **Spec reference:** SPEC-TC-008 (Mock scriptable), SPEC-TC-009 (LS inert).
- **Outcome:** done (RED confirmed) — `MockToolbarCatalog` / `LocalStorageToolbar`
  fail at import (modules absent); `MockToolbarCapabilities` + `fake-ports` fail at
  runtime (`setToolbarCapabilities` / `toolbarCatalog` absent beyond the T-TC-008
  stub). `vitest run` over the four files: 4 files failed, 3 failed / 12 passed.
- **Deviations:** none.

## T-TC-010 — scriptable `MockBridge` `ToolbarCatalogPort` + scriptable caps + `fake-ports.toolbarCatalog` (🔨, dev)

- **Spec/req:** SPEC-TC-008; REQ-TC-003/013/019/021; NFR-TC-001/010.
- **Files:** `src/infrastructure/mock/MockToolbarCatalog.ts` (new, 1-63 — scriptable
  `ToolbarCatalogPort`: `setToolbarCatalog` backs `getCatalog`, default `DEFAULT_MOCK_CATALOG`
  = 2 models + mode + effort reasoning, no service-tier; total, no `providerId` branch),
  `src/infrastructure/mock/MockBridge.ts` (import + private `toolbarCatalogPort` + the
  `get toolbarCatalog` accessor mirroring `auxModel`), `src/infrastructure/mock/
  MockChatRuntime.ts` (private `toolbarCapabilities` default + `getToolbarCapabilities`
  reads it + `setToolbarCapabilities` setter — replaces the T-TC-008 fixed stub),
  `tests/__fakes__/fake-ports.ts` (import + `toolbarCatalog` member type + factory wiring).
- **Commit:** `2d0c248`.
- **Spec reference:** SPEC-TC-008 (`MockBridge` scriptable catalog + caps).
- **Outcome:** done — the Mock RED legs of T-TC-009 now green. `vitest run` over the
  Mock-side files (incl. `MockBridge`/`MockChatRuntime`): 47/47. `vue-tsc -p
  tsconfig.lint.json` 0 errors on the Mock surface (the 2 remaining errors were the
  still-RED T-TC-011 LS legs); `npm run lint` 0 errors (12 pre-existing warnings).
- **Deviations:** none. No `node:*`/`obsidian` in Mock; total — never throws.

## T-TC-011 — `LocalStorageBridge` inert `ToolbarCatalogPort` + inert caps (🔨, dev)

- **Spec/req:** SPEC-TC-009; REQ-TC-019/021; NFR-TC-002/010.
- **Files:** `src/infrastructure/localstorage/LocalStorageToolbarCatalog.ts` (new, 1-46
  — fixed inert `DEMO_CATALOG` = small model list + mode + effort, NO service-tier;
  total, same for every `providerId`), `src/infrastructure/localstorage/
  LocalStorageBridge.ts` (import + private `toolbarCatalogPort` + the `get toolbarCatalog`
  accessor). `FixtureChatRuntime.getToolbarCapabilities` already reported the inert flags
  from T-TC-008 — the T-TC-009 RED leg now confirms it (no change needed).
- **Commit:** `f5e5acf`.
- **Spec reference:** SPEC-TC-009 (`LocalStorageBridge` inert catalog + caps).
- **Outcome:** done — the LS RED legs of T-TC-009 now green. `vitest run` over the
  LS-side files: 35/35. `vue-tsc -p tsconfig.lint.json` 0 errors (whole project);
  `npm run lint` 0 errors (12 pre-existing warnings).
- **Deviations:** none. No `node:*` in LocalStorage; total — never throws.

## T-TC-012 — `ObsidianBridge` real Claude `ToolbarCatalogPort` + real caps (🔨, dev, coverage-excluded)

- **Spec/req:** SPEC-TC-007; REQ-TC-010/015/019/021; NFR-TC-001 (manual leg),
  NFR-TC-010; TEST-TC-M1 (manual gate).
- **Files:** `src/infrastructure/obsidian/ObsidianToolbarCatalog.ts` (new, 1-52 — the
  real static-for-now Claude catalog `CLAUDE_CATALOG` = 3 models + mode + effort, NO
  service-tier; total, imports only domain types — no `obsidian`/`node:*` symbol leaks),
  `src/infrastructure/obsidian/ObsidianBridge.ts` (import + lazy `toolbarCatalogPort`
  + the `get toolbarCatalog` accessor mirroring `selectionSource`),
  `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (`getToolbarCapabilities`
  fleshed from the T-TC-008 stub into the documented real flags + the comment block
  explaining each), `specs/toolbar-controls/test-plan.md` (the INFRA-batch table +
  the scheduled manual leg TEST-TC-M1).
- **Commit:** `a7f6409`.
- **Spec reference:** SPEC-TC-007 (`ObsidianBridge` real catalog + real caps,
  coverage-excluded → manual leg TEST-TC-M1).
- **Outcome:** done (static surface). The real flags: `supportsMcpTools:false`
  (honest CLI gating — MCP backing is P8/NG2, mirroring `supportsInlineResponse:false`),
  `reasoningControl:'effort'`, `hasServiceTier:false`, `hasModeToggle:true`,
  `permissionMode:'default'` (mirrors the P4 plan state; `--print` reports
  `supportsPlanMode:false`, display only, NG6). `vue-tsc` 0 errors (whole project);
  `npm run lint` 0 errors (12 pre-existing warnings); the four T-TC-009 batch files
  33/33 green. **Coverage-excluded** (`src/infrastructure/obsidian/**`) — behaviour is
  NOT agent-self-claimed green; the human-run **TEST-TC-M1** is the gate (scheduled in
  `test-plan.md`).
- **Deviations:**
  1. The spec note describes `permissionMode` as "mirroring the active P4 plan state".
     There is no live plan-state field plumbed into this runtime at P6 (P6 does not own
     plan mode, NG6) and the `--print` one-shot transport reports `supportsPlanMode:
     false`, so the honest displayed value is the constant `'default'`. The comment
     documents that an interactive transport (Agent-SDK/ACP) flips it later with no UI
     change — the same honest-gating posture as the P4 `getCapabilities()` flags.
  2. `ObsidianBridge.toolbarCatalog` is provided now (the T-TC-012 DoD: "ObsidianBridge
     provides the real Claude `ToolbarCatalogPort`"). Wiring the `TOOLBAR_CATALOG_PORT`
     InjectionKey into `AgentSidebarView` + `ui/main.ts` (SPEC-TC-025) stays in the
     later WIRE-IN batch, not this one — only the bridge-hosted accessor lands here.

## T-TC-013 — RED: `foldControlOptions` pure guarded fold (🧪, qa, `test(tc):`)

- **Spec/req:** SPEC-TC-010; REQ-TC-004; NFR-TC-001/005; TEST-TC-002 (fold leg),
  TEST-TC-004 (fold leg); EC-TC-1, EC-TC-6.
- **Files:** `tests/application/chat/toolbar/foldControlOptions.test.ts` (new, 1-95 —
  11 cases: the empty `{}` → `{}` fold (EC-TC-1), each present-field fold
  (model/mode/effort-reasoning/budget-reasoning/serviceTier), all-fields-together, the
  omit-absent assertion, the empty-string-never-folded leg (EC-TC-6), the
  additive-only `forceColdStart`/`appendSystemPrompt`-absent leg, and never-throws).
- **Commit:** `e2d498a`.
- **Spec reference:** SPEC-TC-010 (the pure guarded fold contract + the resolved
  default/non-default table).
- **Outcome:** done (RED). `npx vitest run` fails at import — `foldControlOptions.ts`
  does not yet exist (the RED signal). Greened by T-TC-014.
- **Deviations:** none.

## T-TC-014 — `foldControlOptions.ts` pure guarded fold (🔨, dev, `feat(tc):`)

- **Spec/req:** SPEC-TC-010; REQ-TC-004; NFR-TC-001/005/007.
- **Files:** `src/application/chat/toolbar/foldControlOptions.ts` (new, 1-42 —
  `foldControlOptions(controls: TabControls): Partial<Pick<ChatRuntimeQueryOptions,
  'model'|'mode'|'reasoning'|'serviceTier'>>`; writes `model`/`mode`/`serviceTier`
  only when present + non-empty, `reasoning` only when present; an untouched `{}`
  yields `{}`; imports only the `TabControls` + `ChatRuntimeQueryOptions` domain
  types — no `obsidian`/`node:*`/Vue, no `providerId` branch).
- **Commit:** `12c6a90`.
- **Spec reference:** SPEC-TC-010 (additive + guarded; a descriptor default is never
  folded so an untouched toolbar stays byte-identical to P5, NFR-TC-001/EC-TC-1/6).
- **Outcome:** done. The T-TC-013 RED tests now pass (11/11 green). `vue-tsc -p
  tsconfig.lint.json` 0 errors (whole project); `npm run lint` 0 errors (12
  pre-existing warnings, none in toolbar files).
- **Deviations:** none. The signature pins the return to the four toolbar-owned query
  fields via `Pick<...>` (the spec writes `Partial<ChatRuntimeQueryOptions>`; the
  `Pick` is a tighter, assignable subtype that makes the additive-only contract
  type-enforced — it can never write `forceColdStart`/`appendSystemPrompt`). Pure +
  total — never throws.

## T-TC-015 — RED: `buildToolbarViewModel` per-widget decision (🧪, qa, `test(tc):`)

- **Spec/req:** SPEC-TC-011/018/029; REQ-TC-003/010/013/015/016/017/019/021/023/027;
  NFR-TC-010; TEST-TC-003/010/013/017/019/021/027/030 (VM legs); EC-TC-2/3/4/5/7.
- **Files:** `tests/application/chat/toolbar/buildToolbarViewModel.test.ts` (new — 28
  cases across the full per-widget matrix: `USAGE_WARNING_THRESHOLD === 80`; model
  always visible/enabled with options + selectedId fallback + emptyNotice degrade
  (EC-TC-3); mode/thinking/serviceTier capability+descriptor gating (EC-TC-2/4); the
  thinking single-option hide; permission/external always visible-disabled with the
  PLAN flag (EC-TC-5); mcp hidden vs visible-empty; usage hidden when null (EC-TC-7) +
  the strictly-above-80 warning boundary at 80/81; the empty-catalog degrade
  never-throws; and a source-grep leg asserting zero `providerId` / quoted-`claude`
  literal (SPEC-TC-029)).
- **Commit:** `fadeeee`.
- **Spec reference:** SPEC-TC-011 (the per-widget decision table) + SPEC-TC-018 (the
  `> 80` warning) + SPEC-TC-029 (no-provider-branch).
- **Outcome:** done (RED). `npx vitest run` fails at import — `buildToolbarViewModel.ts`
  does not yet exist (the RED signal). Greened by T-TC-016.
- **Deviations:** none in assertions. The source-grep leg's path resolution was fixed
  in the T-TC-016 commit (`fileURLToPath(import.meta.url)` is not a `file:` URL under
  the project's vitest config → switched to `resolve(process.cwd(), 'src/...')`); the
  assertions (no `providerId`, no quoted `claude`) are unchanged.

## T-TC-016 — `buildToolbarViewModel.ts` per-widget decision + `USAGE_WARNING_THRESHOLD` (🔨, dev, `feat(tc):`)

- **Spec/req:** SPEC-TC-011/018/029; REQ-TC-003/010/013/015/016/017/019/021/023/027;
  NFR-TC-010/007.
- **Files:** `src/application/chat/toolbar/buildToolbarViewModel.ts` (new — the
  `WidgetVisibility` union, the eight per-widget VM interfaces, `ToolbarViewModel`, the
  `USAGE_WARNING_THRESHOLD = 80` module constant, and `buildToolbarViewModel(catalog,
  capabilities, controls, usage)` delegating to eight private per-widget builders;
  imports only domain types — no `obsidian`/`node:*`/Vue, no per-provider branch),
  `tests/application/chat/toolbar/buildToolbarViewModel.test.ts` (the path-resolution
  fix that makes the source-grep leg runnable — assertions unchanged).
- **Commit:** `e4940e2`.
- **Spec reference:** SPEC-TC-011 per-widget rules — model always visible/enabled
  (`selectedId = controls.model ?? catalog.defaultModelId`, `emptyNotice` on an empty
  list); mode visible iff `hasModeToggle && catalog.mode`; thinking hidden on
  `reasoningControl==='none'` / no descriptor / `< 2` options; serviceTier hidden on
  `!hasServiceTier` / no descriptor; permission + external always `visible-disabled`;
  mcp hidden vs visible-empty on `supportsMcpTools`; usage hidden when null else
  `warning = percentage > USAGE_WARNING_THRESHOLD`.
- **Outcome:** done. The T-TC-015 RED tests now pass (28/28 green; 39/39 across the
  two application transforms). **Seam-widget decision without a provider branch:** the
  three honest-defer seams are decided from `capabilities` + the `catalog` descriptors
  alone — `mcp` reads `capabilities.supportsMcpTools` (hidden vs visible-disabled);
  `permission` reads `capabilities.permissionMode` (always visible-disabled, `plan`
  flag set when `'plan'`); `external` is unconditionally visible-disabled (full-parity
  seam, no capability/descriptor needed). No `if (providerId === 'claude')` anywhere —
  the source-grep leg enforces this. `vue-tsc -p tsconfig.lint.json` 0 errors (whole
  project); `npm run lint` 0 errors (12 pre-existing warnings, none in toolbar files).
- **Deviations:** none. The `WidgetVisibility`/VM interfaces match the SPEC-TC-011
  shapes verbatim; the `enabled: true` value on `visible` widgets follows the spec
  table ("visible/enabled" / "visible with `enabled:false`"). `buildThinking` returns
  `control: capabilities.reasoningControl` + `options: []` on the hidden branch (the
  interface's `control`/`options` are non-optional — a safe, total default).
