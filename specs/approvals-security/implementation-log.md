---
id: IMPL-LOG-AS-001
title: Approvals & Security (P7) — Implementation Log
stage: implementation
feature: approvals-security
area: AS
epic: claudian-reboot
phase: P7
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Implementation Log — Approvals & Security (P7)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-AS-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-AS-012 (baseline leg), NFR-AS-001 (guard verification),
  SPEC-AS-004/012/013/015/020/026.
- **Files:** `specs/approvals-security/parity-screenshots.md` (new — baseline
  skeleton, six surfaces × 320/520/720 × light/dark, baseline column keyed to
  `claudian-main` `ApprovalManager.ts` semantics + `ClaudeApprovalHandler.ts` flow +
  `ClaudePermissionUpdates.ts` SDK mapping + `permission-toggle.css` /
  `status-panel.css`), `specs/approvals-security/test-plan.md` (new — guard-verification
  note + the TEST-AS-M1/M2/M3 manual legs + the DOMAIN-batch automated status),
  `specs/approvals-security/implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification:** the new `APPROVAL_RULE_STORE_PORT` key and the new
  domain/application/ui approvals paths (`@/domain/chat/PermissionMode`,
  `@/domain/chat/approvals/**`, `@/domain/ports/ApprovalRuleStorePort`,
  `@/application/chat/approvals/**`, `@/ui/chat/approvals/**`) match **no**
  `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` glob — no relaxation task
  needed (recorded in `test-plan.md`). A whole-project `npm run lint` over the
  pre-existing surface passes clean (no new key/port referenced yet).
- **Commit:** `ac070a66`.
- **Deviation:** none. No file under `src/` changed.

## DOMAIN batch (T-AS-002..011)

### T-AS-002 — RED `PermissionMode` + additive optionals + grown `ApprovalDecision` (🧪 qa)

- **Spec/test:** TEST-AS-001/002/016; SPEC-AS-001/002/003/021.
- **Files:** `tests/domain/chat/PermissionMode.test.ts` (new — the closed union +
  barrel surface + `'normal'` default + `@ts-expect-error` on `'default'`/`'bypass'`),
  `tests/domain/chat/inline/Approval.test.ts` (new — the grown four-member union +
  the unchanged `ApprovalRequest`/`ApprovalOption` shapes); `tests/domain/chat/
  ChatTurn.ts.test.ts` (extended — the `_queryKeys` exact-keys grown to seven incl.
  `permissionMode`, the `permissionMode?` type leg, the P6-shaped byte-identical
  serialisation leg), `tests/domain/chat/toolbar/TabControls.test.ts` (extended —
  the `_keys` exact-keys grown to five + the `permissionMode?` leg).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on the
  missing `@/domain/chat/PermissionMode`, the missing `permissionMode` members, and
  `'deny-always'` not assignable to the three-member `ApprovalDecision`).
- **Commit:** `e136d4d3`.

### T-AS-003 — `PermissionMode.ts` + `ChatRuntimeQueryOptions`/`TabControls` optionals + grown union (🔨 dev)

- **Spec/req:** SPEC-AS-001/002/003/021; REQ-AS-001/002/006/016/052; NFR-AS-001.
- **Files:** `src/domain/chat/PermissionMode.ts` (new — the closed lower-case
  union, parity `core/types/settings.ts:76`, `'normal'` default ≡ absence);
  `src/domain/chat/ChatTurn.ts` (the optional `permissionMode?: PermissionMode`
  appended AFTER `serviceTier`, importing from `./PermissionMode`; the P0–P6 members
  byte-identical; `PreparedChatTurn`/`ChatRuntimeEnsureReadyOptions`/`ChatTurnRequest`
  unchanged); `src/domain/chat/toolbar/TabControls.ts` (the optional `permissionMode?`
  appended after `serviceTier`, importing from `../PermissionMode`); `src/domain/chat/
  inline/Approval.ts` (the union grown by the fourth member `'deny-always'`; the three
  P4 members + `ApprovalRequest`/`ApprovalOption` byte-identical); `src/domain/ports/
  index.ts` (barrel re-export of `PermissionMode` appended); `tests/domain/chat/inline/
  inlineBlockDtos.test.ts` (the P4 union-exactness type + runtime assertion updated to
  the grown four-member union — the union-grow fan-out, mirroring the capability widen).
- **Outcome:** done — the TEST-AS-001 type-shape leg + TEST-AS-002 serialisation +
  the TEST-AS-016 union leg now green (19/19 across the five files); a P6-shaped query
  is byte-identical to P6. **No `implements ChatRuntimePort` break** (additive-only —
  the runtimes read the optional field; the union grows additively).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project — the union-grow
  fan-out kept it green); `npm run lint` 0 errors (12 pre-existing warnings); `vitest
  run` 19/19 green. No `obsidian`/`node:*`/Vue import in `src/domain/chat/**`.
- **Commit:** `6db66df1`.
- **Deviation:** none beyond the documented union-grow fan-out into
  `inlineBlockDtos.test.ts` (a stale P4 exactness assertion the additive grow required
  updating; the authoritative four-member assertion lives in the new `Approval.test.ts`).

### T-AS-004 — RED the pure matcher truth table (🧪 qa)

- **Spec/test:** TEST-AS-010/011/012/013/014/015 + EC-AS-7/8/9; SPEC-AS-004/026;
  NFR-AS-009.
- **Files:** `tests/domain/chat/approvals/ApprovalMatcher.test.ts` (new — the full
  SPEC-AS-026 table: per-tool `getActionPattern`/`getActionDescription`, no-rule/`'*'`/
  exact, the null-action guard, bash explicit-wildcard-only, file path-segment boundary,
  `\`→`/` normalise, other-tool simple prefix, + the never-throws assertion).
- **Outcome:** done — RED confirmed (module resolution failure; `ApprovalMatcher.ts`
  does not yet exist).
- **Commit:** `9b632f5a`.

### T-AS-005 — `ApprovalMatcher.ts` (🔨 dev)

- **Spec/req:** SPEC-AS-004/026; REQ-AS-010..015; NFR-AS-002/009.
- **Files:** `src/domain/chat/approvals/ApprovalMatcher.ts` (new — the seven tool-name
  constants + `getActionPattern`/`getActionDescription`/`matchesRulePattern` ported
  verbatim from claudian `ApprovalManager.ts`, with the private `isPathPrefixMatch`/
  `matchesBashPrefix` helpers; pure + total, never throws; string comparison only, no
  eval/exec), `src/domain/chat/approvals/index.ts` (new — barrel re-export).
- **Outcome:** done — TEST-AS-010/011/012/013/014/015 + EC-AS-7/8/9 now green (28/28);
  the functions never throw across the odd-input matrix.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0; `npm run lint` 0 errors (two targeted
  `complexity` disables on the irreducible per-tool/per-family dispatch, justified;
  `strict-boolean-expressions` satisfied by the explicit `=== undefined || === ''`
  empty-rule check — behaviour-identical to the verbatim `!rulePattern`); `vitest run`
  28/28. No `obsidian`/`node:*`/Vue import in `src/domain/chat/approvals/**`.
- **Commit:** `052a6c50`.
- **Deviation:** the two targeted `complexity` lint disables (the per-tool switch + the
  per-family match dispatch exceed the cap-10 by their intrinsic algorithm, ported
  verbatim for parity — the accepted project convention, mirroring `plugin-core.ts`).

### T-AS-006 — RED `ApprovalRule` DTO + `ApprovalRuleInput` + `ruleDedupeKey` (🧪 qa)

- **Spec/test:** TEST-AS-016; SPEC-AS-005/024; REQ-AS-016/030/031; NFR-AS-002/008.
- **Files:** `tests/domain/chat/approvals/ApprovalRule.test.ts` (new — the six-member
  DTO shape, the no-secret/no-token guard, the `ApprovalRuleInput` omit, the barrel
  re-export, and the `ruleDedupeKey` triple incl. absent-vs-empty collapse +
  opposite-decision distinctness).
- **Outcome:** done — RED confirmed (module resolution failure; `ApprovalRule.ts` does
  not yet exist).
- **Commit:** `91b168e3`.

### T-AS-007 — `ApprovalRule.ts` + barrel (🔨 dev)

- **Spec/req:** SPEC-AS-005/024; REQ-AS-016/030/031; NFR-AS-002/008.
- **Files:** `src/domain/chat/approvals/ApprovalRule.ts` (new — the `ApprovalRule`
  interface, `ApprovalRuleInput = Omit<…,'id'|'createdAt'>`, `ruleDedupeKey` triple;
  plain inert readonly DTO, no secret field, no class/obsidian/node/Vue),
  `src/domain/chat/approvals/index.ts` (barrel re-export appended).
- **Outcome:** done — TEST-AS-016 DTO leg now green (6/6).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0; `npm run lint` 0 errors; `vitest run`
  6/6. No `obsidian`/`node:*`/Vue import in `src/domain/chat/approvals/**`.
- **Commit:** `2ddf0eba`.
- **Deviation:** none.

### T-AS-008 — RED `ApprovalRuleStorePort` + `APPROVAL_RULE_STORE_PORT` key + barrel (🧪 qa)

- **Spec/test:** TEST-AS-053 (port-shape leg); SPEC-AS-006; REQ-AS-001/032/033/034/053;
  NFR-AS-005.
- **Files:** `tests/domain/ports/ApprovalRuleStorePort.test.ts` (new — the four
  `Result`-typed method signatures, the own `APPROVAL_RULE_STORE_PORT` key, the barrel
  re-exports of the port + `ApprovalRule`/`ApprovalRuleInput`/`PermissionMode`, + a
  runtime impl satisfying the contract).
- **Outcome:** done — RED confirmed (`vue-tsc` failed on the missing port module, the
  missing barrel members, and the missing key).
- **Commit:** `856982f8`.

### T-AS-009 — `ApprovalRuleStorePort` + key + barrel re-exports (🔨 dev)

- **Spec/req:** SPEC-AS-006; REQ-AS-001/032/033/034/053; NFR-AS-005/010.
- **Files:** `src/domain/ports/ApprovalRuleStorePort.ts` (new — `loadRules`/`addRule`/
  `removeRule`/`clear`, all `Promise<Result<…>>`, documented per-method contract:
  load-or-default, dedupe-by-`ruleDedupeKey`, idempotent remove, fail-safe-via-`err`;
  persisted lifetime only), `src/infrastructure/bridge/ports.ts` (the
  `APPROVAL_RULE_STORE_PORT` `InjectionKey` appended — own key, no aggregate),
  `src/domain/ports/index.ts` (barrel re-exports of the port +
  `ApprovalRule`/`ApprovalRuleInput`).
- **Outcome:** done — TEST-AS-053 port-shape leg now green (2/2). Deleted-symbol guard
  green (the new key/port imports resolve clean — no relaxation needed).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0; `npm run lint` 0 errors; `vitest run`
  2/2. No `obsidian`/`node:*` import in `src/domain/**`.
- **Commit:** `4eb395c7`.
- **Deviation:** none.

### T-AS-010 — RED `ToolbarCapabilities.permissionMode` WIDEN + additivity (🧪 qa)

- **Spec/test:** TEST-AS-001 (capabilities-shape leg), TEST-AS-021 (additivity leg);
  SPEC-AS-006/021; REQ-AS-003; NFR-AS-001.
- **Files:** `tests/domain/ports/ChatRuntimePort.ts.test.ts` (extended — the
  `_toolbarPermission` Equals widened from `'default'|'plan'` to `PermissionMode` + a
  `_toolbarPermissionWidened` leg; the runtime sentinel rebuilt with
  `permissionMode:'normal'` + a three-mode representability leg; the four other flags +
  the P0–P6 members asserted byte-identical).
- **Outcome:** done — RED confirmed (`vue-tsc` failed: the widened-type Equals are
  `false` and `'normal'`/`PermissionMode` are not assignable to the still-narrow
  `'default'|'plan'`).
- **Commit:** `214e025c`.

### T-AS-011 — `ToolbarCapabilities.permissionMode` widen + the `implements` fan-out (🔨 dev) 🪓

- **Spec/req:** SPEC-AS-006/021; REQ-AS-003; NFR-AS-001/005.
- **Files (domain widen):** `src/domain/ports/ChatRuntimePort.ts` (widen
  `ToolbarCapabilities.permissionMode` `'default'|'plan'` → `PermissionMode`, importing
  from `@/domain/chat/PermissionMode`; the four other flags + the five
  `RuntimeCapabilities` flags + the P0–P6 `ChatRuntimePort` members byte-identical).
- **Files (the `implements` fan-out, same commit — the P6 T-TC-008 lesson):** the three
  runtimes `src/infrastructure/mock/MockChatRuntime.ts`,
  `src/infrastructure/localstorage/FixtureChatRuntime.ts`,
  `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (`'default'`→`'normal'`); the two
  `ScriptedRuntime` test doubles `tests/application/chat/RunChatTurnUseCase.test.ts` +
  `…/RunChatTurnUseCase.rr.test.ts`; the P6 capability fixtures
  `tests/application/chat/toolbar/buildToolbarViewModel.test.ts`,
  `tests/infrastructure/mock/MockToolbarCapabilities.test.ts`,
  `tests/infrastructure/localstorage/LocalStorageToolbar.test.ts`,
  `tests/ui/main.ts.test.ts`. The `EnqueueRuntime` decorator forwards
  `getToolbarCapabilities()` verbatim — **no change** (verified pass-through).
- **Outcome:** done — TEST-AS-001 capabilities-shape + TEST-AS-021 additivity now green;
  the widen fan-out kept the whole-project build green (the classes touched:
  `MockChatRuntime`/`FixtureChatRuntime`/`ClaudeCliChatRuntime` runtimes + the two test
  `ScriptedRuntime` doubles + the four P6 capability fixtures; `EnqueueRuntime`
  untouched). No `providerId` branch; synchronous + total. `buildToolbarViewModel`
  needs no source change — it reads `permissionMode === 'plan'` only, so `'normal'`/
  `'yolo'` both yield `plan:false` (behaviour-additive).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project — the widen fan-out
  stayed green); `npm run lint` 0 errors; `vitest run` 68/68 across the affected files +
  116/116 across the whole `tests/domain/{chat,ports}` suite.
- **Commit:** `b8bb8688`.
- **Deviation:** none. The fan-out edits to the P6 capability fixtures/doubles are the
  forced consequence of the union widen (`'default'` is no longer a valid value), not an
  assertion change — the authoritative widen assertion lives in
  `ChatRuntimePort.ts.test.ts` (T-AS-010).

---

## INFRA batch (T-AS-012..015)

### T-AS-012 — Obsidian device-local `ApprovalRuleStorePort` + Claude SDK mapping + plan-exit `setMode` (🔨 dev, coverage-excluded) 🪓

- **Spec/req:** SPEC-AS-007; REQ-AS-002/004/005/030/034/053; NFR-AS-003 (manual leg).
- **Files:** `src/infrastructure/obsidian/ObsidianApprovalRuleStore.ts` (new — the real
  device-local store under `'specorator:approval-rules'` via
  `app.saveLocalStorage`/`loadLocalStorage` (ADR-PSR-002 pattern); `loadRules`
  load-or-default + field-level coercion drops malformed entries; `addRule`
  dedupe-by-`ruleDedupeKey` + mint `id`(`crypto.randomUUID()`)/`createdAt`;
  `removeRule` idempotent; `clear`; all `Result`-typed via `tryAsync`, total — never
  throws; NEVER `data.json`/vault, NFR-AS-003); `src/infrastructure/obsidian/
  ObsidianBridge.ts` (the `get approvalRuleStore` lazy getter + import);
  `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (the SDK-string mapping
  `_toSdkPermissionMode` — `yolo`→`bypassPermissions`/`plan`→`plan`/`normal`/absent→no
  flag, emitted as `--permission-mode` in `_optionArgs`; `liveMode` recorded per query +
  surfaced through `getToolbarCapabilities().permissionMode` replacing the T-AS-011
  `'normal'` stub; the plan-exit `_syncPlanExitMode` seam — parity
  `ClaudeApprovalHandler.ts:63–71` `setMode destination:'session'`; no `providerId`
  branch).
- **Outcome:** done. Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the
  behavioural gate is the **manual** legs **TEST-AS-M1** (the real device-local store
  round-trips in Obsidian; `data.json`/vault untouched) + **TEST-AS-M3** (the real
  Claude SDK mapping + plan-exit `setMode`), scheduled in `test-plan.md`; **not
  self-claimed**. No `obsidian` symbol leaks past the file — `ObsidianApprovalRuleStore`
  imports only the `App` type.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings). No automated unit run (the
  Obsidian leg is coverage-excluded → manual TEST-AS-M1/M3).
- **Commit:** `eb0b543a`.
- **Deviation:** none. The `_coerce` complexity was split into `_isValidEntry` to stay
  under the cap-10 (mirrors the established structural pattern), not a behaviour change.

### T-AS-013 — RED scriptable Mock `ApprovalRuleStorePort` + runtime mode + `fake-ports.approvalRuleStore` (🧪 qa)

- **Spec/test:** TEST-AS-002/003/006/020/021/030/032/033/053/054; SPEC-AS-008;
  REQ-AS-020/021/032/053/054; NFR-AS-010.
- **Files:** `tests/infrastructure/mock/MockApprovalRuleStore.test.ts` (new — the
  scriptable store: `seedRules`, `loadRules` default `ok([])`, `addRule` mint + dedupe +
  opposite-decision append, idempotent `removeRule`, `clear`, `setFailMode` forcing
  `Result.err`, never-throws + the `MockBridge.approvalRuleStore` accessor),
  `tests/infrastructure/mock/MockApprovalRuntimeMode.test.ts` (new — `getLastPermissionMode`
  records the folded query mode + the scriptable three-mode `getToolbarCapabilities`),
  `tests/__fakes__/fake-ports.test.ts` (extended — the `approvalRuleStore` member +
  `setFailMode` legs).
- **Outcome:** done — RED confirmed (5 failing legs across the three files: missing
  `MockApprovalRuleStore` module, missing `MockBridge.approvalRuleStore`, missing
  `getLastPermissionMode`, missing `fake-ports.approvalRuleStore` member).
- **Commit:** `cf7a9b67`.

### T-AS-014 — scriptable `MockBridge` `ApprovalRuleStorePort` + runtime mode + `fake-ports.approvalRuleStore` (🔨 dev)

- **Spec/req:** SPEC-AS-008; REQ-AS-020/021/032/053/054; NFR-AS-010.
- **Files:** `src/infrastructure/mock/MockApprovalRuleStore.ts` (new — the scriptable
  in-memory store: `seedRules`/`setFailMode('none'|'load'|'save')`/`loadRules`/`addRule`
  (dedupe-by-`ruleDedupeKey`, opposite-decision append)/`removeRule` idempotent/`clear`,
  all `Result`-typed, total — never throws; only the persisted lifetime),
  `src/infrastructure/mock/MockBridge.ts` (the `get approvalRuleStore` accessor + field +
  import), `src/infrastructure/mock/MockChatRuntime.ts` (the `lastPermissionMode` recording
  in `query` + the `getLastPermissionMode` accessor + the `PermissionMode` type import),
  `tests/__fakes__/fake-ports.ts` (the `approvalRuleStore` member on `FakePorts` +
  factory wiring, typed as `MockApprovalRuleStore` so `seedRules`/`setFailMode` surface).
  Runnability fix to the T-AS-013 RED fixture in
  `tests/infrastructure/mock/MockApprovalRuntimeMode.test.ts` (the `request` literal
  dropped the nonexistent `conversationId`; the drain loop no longer binds an unused
  chunk — **no assertion change**, qa-authored assertions unchanged).
- **Outcome:** done — the T-AS-013 RED tests now green (32/32 across the three files); the
  `fake-ports.approvalRuleStore` member works for multi-port tests; `setFailMode` drives
  the fail-safe path deterministically.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; whole-project `npm run lint` 0
  errors; `vitest run` (the three files) 32/32. No `node:*`/`obsidian` import in Mock.
- **Commit:** `07a58253`.
- **Deviation:** the documented runnability-only fix to the T-AS-013 fixture (type shape
  + unused-binding), no assertion content changed.

### T-AS-015 — LocalStorage browser-`localStorage` `ApprovalRuleStorePort` + inert runtime mode (🔨 dev)

- **Spec/req:** SPEC-AS-009; REQ-AS-053; NFR-AS-010.
- **Files:** `tests/infrastructure/localstorage/LocalStorageApprovalRuleStore.test.ts`
  (new — the RED leg authored first: port-shape, default `ok([])`, cross-instance
  round-trip (reload parity), dedupe, idempotent remove, clear, corrupt-blob
  load-or-default, + the `LocalStorageBridge.approvalRuleStore` accessor),
  `src/infrastructure/localstorage/LocalStorageApprovalRuleStore.ts` (new — browser
  `localStorage` under the same key `'specorator:approval-rules'`; load-or-default +
  field-level coercion; `addRule` dedupe + mint; idempotent `removeRule`; `clear`; all
  `Result`-typed, never throws — a write fault is an `err`),
  `src/infrastructure/localstorage/LocalStorageBridge.ts` (the `get approvalRuleStore`
  accessor + field + import). The inert runtime mode needs no change — `FixtureChatRuntime`
  already reports `permissionMode:'normal'` (T-AS-011) and fires no live `setMode` (no
  live SDK), which IS the inert behaviour (the toggle/panel reflect the per-tab draft via
  the fold).
- **Outcome:** done — the RED leg confirmed (module unresolved) then greened (8/8); the
  demo persists a rule across a reload (cross-instance read) with no Obsidian.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; whole-project `npm run lint` 0
  errors; `vitest run` 8/8 (store) + the full `tests/infrastructure` + `tests/__fakes__`
  surface 346/346 green. No `node:*`.
- **Commit:** `9d7874b5`.
- **Deviation:** the LS RED leg was authored within this dev task (no separate qa RED task
  was scheduled for the LS half in the INFRA batch — T-AS-013 covered the Mock half); RED
  was confirmed before the impl greened it.

---

## INFRA batch (T-AS-012..015) — close-out

All four INFRA-batch tasks executed in strict TDD order (Mock RED qa → Mock green dev →
LS RED→green dev; the Obsidian leg is coverage-excluded → manual TEST-AS-M1/M3), one
commit per task. The three bridges back `ApprovalRuleStorePort`: **Obsidian** device-local
(`app.saveLocalStorage`/`loadLocalStorage('specorator:approval-rules')`, coverage-excluded
→ manual TEST-AS-M1, never `data.json`/vault); **Mock** scriptable in-memory (seedable +
`setFailMode`, exposed on `MockBridge.approvalRuleStore` + `fake-ports.approvalRuleStore`);
**LocalStorage** browser-`localStorage` (same key, GitHub Pages demo). The Claude runtime
SDK-mode mapping (`yolo`↔`bypassPermissions`/`plan`↔`plan`/`normal`↔`default`) + the
plan-exit `setMode` live in `ClaudeCliChatRuntime` (coverage-excluded → manual TEST-AS-M3);
the LS runtime mode is inert. Final gate over the batch surface: `vue-tsc -p
tsconfig.lint.json` **0 errors** (whole project), whole-project `npm run lint` **0 errors**
(12 pre-existing warnings only), `vitest run tests/infrastructure tests/__fakes__`
**346/346 green**. No `node:*`/`obsidian` import under `src/infrastructure/mock/**` or
`localstorage/**`; the store ports never throw across the boundary (`Result`-mapped). The
APPLICATION batch (T-AS-016..019: the `foldControlOptions` clause + the `ApprovalManager`
use case) onward is out of this batch's scope.

## DOMAIN batch (T-AS-001..011) — close-out

All eleven DOMAIN-batch tasks executed in strict TDD order (RED qa → green dev), one
commit per task. Final gate over the batch surface: `vue-tsc -p tsconfig.lint.json` **0
errors** (whole project — the two interface changes, the additive `ApprovalDecision`
union grow + the `ToolbarCapabilities.permissionMode` widen, kept the build green via
their same-task fan-out), whole-project `npm run lint` **0 errors** (12 pre-existing
warnings only), `npx vitest run tests/domain/{chat,ports}` **116/116 green**. Additivity
proven: a P6-shaped `ChatRuntimeQueryOptions`/`TabControls` (no `permissionMode`)
serialises byte-identically to P6 (TEST-AS-002). No `obsidian`/`node:*`/Vue import under
`src/domain/**`; the matcher is pure + total. The INFRA batch (T-AS-012..015) onward is
out of this batch's scope.

## APPLICATION batch (T-AS-016..019)

### T-AS-016 — RED `foldControlOptions` guarded `permissionMode` clause (🧪 qa)

- **Spec/test:** TEST-AS-002 (fold leg); SPEC-AS-011/021; REQ-AS-002/052; NFR-AS-001;
  EC-AS-2/13.
- **Files:** `tests/application/chat/toolbar/foldControlOptions.test.ts` (extended,
  lines 96-172 — a new `describe` for the P7 clause: the `{}`→`{}` + explicit
  `'normal'`→`{}` non-`normal`-only guard (EC-AS-2/13), the `'plan'`/`'yolo'` fold, the
  combined-with-P6-fields case, the P6-byte-identity-when-normal case, and never-throws).
- **Outcome:** done (RED). The three "fold a non-normal mode" cases failed (the clause
  did not yet exist); the `normal`/absent/total cases already passed (folding nothing was
  the prior behaviour). 3 failed / 15 passed confirmed RED before the impl.
- **Commit:** `49f622f1`.
- **Deviation:** none.

### T-AS-017 — `foldControlOptions.ts` guarded `permissionMode` clause (🔨 dev)

- **Spec/req:** SPEC-AS-011 §3; SPEC-AS-021; REQ-AS-002/052; NFR-AS-001.
- **Files:** `src/application/chat/toolbar/foldControlOptions.ts` (lines 10-46 — widened
  the return type by the one optional `permissionMode` key and added the single guarded
  clause `if (controls.permissionMode !== undefined && controls.permissionMode !==
  'normal') folded.permissionMode = controls.permissionMode;` after the P6
  `serviceTier` clause; doc updated).
- **Outcome:** done. The prior RED tests now pass — the full file is green
  (`vitest run foldControlOptions.test.ts` 18/18, incl. the 9 P6 regression cases). The
  P6 `model`/`mode`/`reasoning`/`serviceTier` clauses + behaviour stay byte-identical;
  `normal`/absent folds nothing → byte-identical P6 (EC-AS-2/13). Pure + total; no
  `obsidian`/`node:*`/Vue import; no `providerId` branch. `vue-tsc -p tsconfig.lint.json`
  **0 errors** (whole project), whole-project `npm run lint` **0 errors** (12 pre-existing
  warnings only).
- **Commit:** `99f73648`.
- **Deviation:** none.

### T-AS-018 — RED `ApprovalManager` decision-flow matrix (🧪 qa)

- **Spec/test:** TEST-AS-003/004/020/021/023/025/030/031/032/033/052/054;
  SPEC-AS-010/023/027/028; REQ-AS-004/005/020..025/030/031/052/054; NFR-AS-004/009;
  EC-AS-1/3/5/6/10/11/12/16/20.
- **Files:** `tests/application/chat/approvals/ApprovalManager.test.ts` (new — the full
  use-case matrix over the scriptable `MockApprovalRuleStore` + a scripted
  `PermissionMode`: mode-gate-first (yolo auto-allow no-lookup via a `loadRules` spy /
  plan defer / normal continue), load-await + match deny-wins (incl. match-all,
  different-tool no-match, bash `"git *"`↛`"github"` EC-AS-7, path `/a/b`↛`/a/bc.md`
  EC-AS-8), fail-safe-to-prompt on a forced `setFailMode('load')` (notice, never
  auto-allow, no rule content in `logger.error`, never throws), `applyDecision` (session
  allow/deny round-trip through `decide`, persisted `*-always` via `addRule`, dedupe
  EC-AS-10, `{`-leading JSON-fallback stored WITHOUT `actionPattern` EC-AS-16, null
  cancel EC-AS-12, persist-err notice + decision-still-stands), `listRules`
  persisted∪session + load-err→err, the persisted-allow + session-deny deny-wins
  EC-AS-11, and the no-stale-snapshot per-call re-read EC-AS-20).
- **Outcome:** done (RED). The import of the missing `@/application/chat/approvals/
  ApprovalManager` fails to resolve — no tests run (compile/resolve failure is the RED
  signal) before the impl.
- **Commit:** `d9797c17`.
- **Deviation:** none.

### T-AS-019 — `ApprovalManager.ts` decision-flow use case (🔨 dev)

- **Spec/req:** SPEC-AS-010/023/027/028; REQ-AS-004/005/020..025/030/031/052/054;
  NFR-AS-004/009; ADR-AS-003.
- **Files:** `src/application/chat/approvals/ApprovalManager.ts` (new — the
  `ApprovalManager` class + the `ApprovalAction` / `ApprovalGateOutcome` types). One
  per-surface instance holds the in-memory session rules in a `Map` keyed by
  `ruleDedupeKey`; the constructor takes `(store, feedback, storeErrorMessage)` (the UI
  resolves the `agent.chat.approvals.storeError` i18n key when wiring, SPEC-AS-022).
- **Signatures:**
  - `decide(action: ApprovalAction, mode: PermissionMode): Promise<Result<ApprovalGateOutcome>>`
  - `applyDecision(action: ApprovalAction, decision: ApprovalDecision | null): Promise<Result<ApprovalDecision | null>>`
  - `listRules(): Promise<Result<readonly ApprovalRule[]>>`
- **How the invariants are realised:**
  - **Mode-gate-FIRST** — `decide` returns `ok('allow')` for `yolo` BEFORE any store
    call (a `loadRules` spy proves no lookup, EC-AS-3); `plan` returns `ok('prompt')`
    (defer to the P4 exit-plan gate, REQ-AS-005); `normal`/absent continues.
  - **Deny-wins** — the match loop returns `ok('deny')` on the first matching deny and
    otherwise tracks `hasAllow`, returning `ok('allow')` only when a matching allow with
    no matching deny exists, else `ok('prompt')` (REQ-AS-021/023).
  - **Fail-safe-to-prompt** — `store.loadRules()` is wrapped in `tryAsync` (re-throwing
    an `err` Result inside so a fault is captured uniformly); a non-`ok` load logs via
    `feedback.debug` (a constant message, NO rule content) + `feedback.info(storeError)`
    (a non-blocking notice) + returns `ok('prompt')` — never auto-allow (REQ-AS-054).
  - **Never throws** — every store touch goes through `tryAsync`; the matcher is total;
    `decide`/`applyDecision` resolve a `Result`, never reject.
  - **`applyDecision`** — `'allow'`/`'deny'` → an in-memory session rule (dedupe by
    `ruleDedupeKey`); `'allow-always'`/`'deny-always'` → `store.addRule({...,
    lifetime:'persisted'})` returning the concrete `allow`/`deny`; `null` → `ok(null)`
    (cancel). A `{`-leading or `null`/empty action pattern is persisted as `undefined`
    (match-all, no serialised input lands in a rule, EC-AS-16/NFR-AS-002). A persist
    `err` surfaces the notice but the concrete decision still stands.
  - **No `providerId` branch** (SPEC-AS-023) — the manager reads `mode` + the pure
    matcher only.
- **Outcome:** done. The prior RED tests now pass — `vitest run ApprovalManager.test.ts`
  **26/26**; the full `tests/application` surface **372/372** (incl. the P6
  `foldControlOptions` regression). `vue-tsc -p tsconfig.lint.json` **0 errors** (whole
  project), whole-project `npm run lint` **0 errors** (12 pre-existing warnings only). No
  `obsidian`/`node:*`/Vue import under `src/application/**`.
- **Commit:** `7e0dd4dd`.
- **Deviation:** the brief's `decide(action, mode, sessionRules, store)` shorthand differs
  from the spec's `decide(action, mode)` + manager-held `store`/session-rules (SPEC-AS-010
  pins the store + per-surface session map as instance state, resolved open item #1) — the
  spec signature is the contract and was implemented. The `feedback.notify(approvals.storeError)`
  shorthand in SPEC-AS-010 is realised as `feedback.info(storeErrorMessage)` (logger.info +
  `NotificationPort.showInfo`) with the resolved message injected via the constructor (i18n
  key resolution stays in the UI/composable layer, NFR-AS-006/SPEC-AS-022).

## APPLICATION batch (T-AS-016..019) — close-out

All four APPLICATION-batch tasks executed in strict TDD order (RED qa → green dev), one
commit per task. The `foldControlOptions` fold gained a single guarded `permissionMode`
clause (non-`normal` only, so a no-rule/normal tab stays byte-identical to P6,
EC-AS-2/13); the `ApprovalManager` decision-flow use case (`decide`/`applyDecision`/
`listRules`) lands mode-gate-first (yolo auto-allow no-lookup / plan defer / normal
continue) → load-await (`tryAsync`) → match deny-wins → auto OR `'prompt'`, with
fail-safe-to-prompt on a store load `err` (notice + `'prompt'`, never auto-allow, never
throws) and `applyDecision` routing session (`allow`/`deny`) vs persisted (`*-always` →
`store.addRule`) rules (the `{`-leading JSON-fallback stored without `actionPattern`). No
`providerId` branch. Final gate over the batch surface: `vue-tsc -p tsconfig.lint.json`
**0 errors** (whole project), whole-project `npm run lint` **0 errors** (12 pre-existing
warnings only), `vitest run tests/application` **372/372 green** (incl. the P6
`foldControlOptions` regression). No `obsidian`/`node:*`/Vue import under
`src/application/**`; the use case is `Result`-returning + never throws. The UI batch
(T-AS-018-onward UI tasks: the toggle/panel/inline + the `ChatSurface` wiring of this
`ApprovalManager` into the live approval callback) is out of this batch's scope.

---

## UI batch (T-AS-020..029)

### T-AS-021 — `useApprovalRuleStorePort.ts` composable (🔨 dev)

- **Spec/req:** SPEC-AS-018; REQ-AS-040/042/053; NFR-AS-005/006.
- **Files:** `src/ui/composables/useApprovalRuleStorePort.ts` (new — `inject(APPROVAL_RULE_STORE_PORT)`,
  throw-when-unprovided, return the injected `ApprovalRuleStorePort`); `tests/ui/composables/
  useApprovalRuleStorePort.test.ts` (new RED → green: inject-when-provided over
  `MockBridge.approvalRuleStore` + throw-when-unprovided).
- **Outcome:** done — the prior RED (module-not-found) now green; the composable mirrors
  `useToolbarCatalogPort` exactly (one-port-one-composable, ADR-008). `ChatSurface` will
  inject the key OPTIONALLY so a no-port mount degrades to always-prompt.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); `npm run lint`
  0 errors (12 pre-existing warnings); `vitest run useApprovalRuleStorePort.test.ts` 2/2.
  No `obsidian` import under `src/ui/**`.
- **Commit (RED / green):** `<RED>` / `<GREEN>`.
- **Deviation:** none.
