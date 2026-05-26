---
id: TESTPLAN-AS-001
title: Approvals & Security (P7) — test plan
stage: testing
feature: approvals-security
area: AS
epic: claudian-reboot
phase: P7
owner: qa / dev
created: 2026-05-26
updated: 2026-05-26
---

# Test plan — Approvals & Security (P7)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-AS-M1/M2/M3) that ride the single final epic-review human gate.

## Deleted-symbol guard verification (T-AS-001 / NFR-AS-001)

Confirmed against `eslint.config.js` (read 2026-05-26):

- `DELETED_INJECTION_KEYS.importNames` does **not** contain
  `APPROVAL_RULE_STORE_PORT` — the new InjectionKey resolves clean (only
  `METADATA_CACHE_PORT`, `CANVAS_PORT`, `CHAT_TRANSPORT_PORT`,
  `PROVIDER_REGISTRY_KEY`, `TRANSPORT_LIFECYCLE_PORT`, `CONFIRM_MODAL_PORT`,
  `SECRET_STORE_PORT`, `TRANSPORT_KIND_KEY`, `IS_MOBILE_KEY`,
  `SETTINGS_VERSION_KEY`, `OPEN_PLUGIN_SETTINGS_KEY`, `PLUGIN_MANIFEST_KEY` are
  banned).
- `DELETED_SUBSYSTEM_BAN.group` matches **none** of the new P7 domain/application/ui
  paths: `@/domain/chat/PermissionMode`, `@/domain/chat/approvals/**`,
  `@/domain/ports/ApprovalRuleStorePort`, `@/application/chat/approvals/**`,
  `@/ui/chat/approvals/**`. (`@/domain/chat` regrew in P1 and `@/domain/chat/inline`
  in P4; both are off the list. `ChatRuntimePort` is a live core port, never
  banned.)
- The new symbols `ApprovalRuleStorePort`, `APPROVAL_RULE_STORE_PORT`,
  `ApprovalRule`/`ApprovalRuleInput`/`ruleDedupeKey`, `PermissionMode`,
  `ApprovalManager`, `getActionPattern`/`getActionDescription`/`matchesRulePattern`,
  `ApprovalsPanel`/`ApprovalRuleRow`/`InlineApproval` appear nowhere in the guard.

> **Caveat for T-AS-012 (out of the DOMAIN batch):** the real device-local
> `ApprovalRuleStorePort` + Claude-runtime SDK mapping under
> `src/infrastructure/obsidian/**` must avoid the `@/infrastructure/obsidian/Claude*`
> ban glob (file naming), but no `src/` change in the DOMAIN batch
> (T-AS-001..011) touches that surface.

Therefore **no guard-relaxation task is required** in P7. A whole-project
`npm run lint` over the new domain/port/key surface confirms the imports resolve
without a `no-restricted-imports` violation (re-confirmed at the gate, T-AS-040).

## Coverage-excluded manual legs (human-run, final review gate)

| Leg | Surface | Scheduled by |
|---|---|---|
| TEST-AS-M1 | The **real** device-local `ApprovalRuleStorePort` (`app.saveLocalStorage`/`loadLocalStorage('specorator:approval-rules')`) round-trips in Obsidian; `data.json` + the vault stay untouched (NFR-AS-003) | T-AS-012 |
| TEST-AS-M2 | Per-surface parity screenshots vs claudian-main at 320 / 520 / 720 px, light + dark (the permission toggle in three modes incl. PLAN, the inline four-option row, the approvals panel, the auto-decided turn) | T-AS-040 (review gate) |
| TEST-AS-M3 | The **real** Claude runtime maps the live mode to the SDK (`yolo`↔`bypassPermissions` / `plan`↔`plan` / `normal`↔`default`) + emits the plan-exit `setMode destination:'session'` | T-AS-012 |

> The **real** device-local store + the **real** Claude SDK mapping/`setMode` live
> under `src/infrastructure/obsidian/**` (coverage-excluded). Their behavioural gate
> is TEST-AS-M1/M3 — never self-claimed by an agent. The **pure** matcher, the
> `ApprovalManager` algorithm (over the scriptable Mock store + a scripted mode), the
> fold, the DTOs/dedupe, the Mock scriptable store + `setFailMode`, and the
> LocalStorage browser-localStorage impl carry the unit/component weight + the
> 80/70/80/80 coverage gate (NFR-AS-011).

## DOMAIN batch (T-AS-002..011) — automated structural/type/behaviour legs

| Leg | Status | Where |
|---|---|---|
| TEST-AS-001 (type-shape) — `PermissionMode = 'normal'\|'plan'\|'yolo'` closed union + barrel surface | covered (RED→green, T-AS-002→003) | `tests/domain/chat/PermissionMode.test.ts` |
| TEST-AS-002 (serialisation + type-shape) — `ChatRuntimeQueryOptions.permissionMode?` appended after `serviceTier`, P6-shaped query byte-identical; `TabControls.permissionMode?` appended | covered (RED→green, T-AS-002→003) | `tests/domain/chat/ChatTurn.ts.test.ts`, `tests/domain/chat/toolbar/TabControls.test.ts` |
| TEST-AS-016 (union leg) — `ApprovalDecision` grown to the four-member union; P4 members + `ApprovalRequest`/`ApprovalOption` byte-identical | covered (RED→green, T-AS-002→003) | `tests/domain/chat/inline/Approval.test.ts` |
| TEST-AS-010/011/012/013/014/015 + EC-AS-7/8/9 — the PURE matcher truth table (`getActionPattern`/`getActionDescription`/`matchesRulePattern`); never throws | covered (RED→green, T-AS-004→005) | `tests/domain/chat/approvals/ApprovalMatcher.test.ts` |
| TEST-AS-016 (DTO leg) — `ApprovalRule` six-member DTO + `ApprovalRuleInput` omit + `ruleDedupeKey` triple | covered (RED→green, T-AS-006→007) | `tests/domain/chat/approvals/ApprovalRule.test.ts` |
| TEST-AS-053 (port-shape leg) — `ApprovalRuleStorePort` four `Result`-typed methods + own `APPROVAL_RULE_STORE_PORT` key + barrel re-exports | covered (RED→green, T-AS-008→009) | `tests/domain/ports/ApprovalRuleStorePort.test.ts` |
| TEST-AS-001 (capabilities-shape) + TEST-AS-021 (additivity) — `ToolbarCapabilities.permissionMode` widened to `PermissionMode` (`'default'`→`'normal'`), the four other flags + `ChatRuntimePort` members byte-identical | covered (RED→green, T-AS-010→011) | `tests/domain/ports/ChatRuntimePort.ts.test.ts` |

> **Build-green companion (T-AS-011, the P6 T-TC-008 lesson):** widening
> `ToolbarCapabilities.permissionMode` from `'default'|'plan'` to `PermissionMode`
> breaks the build for every `getToolbarCapabilities()` impl returning a now-invalid
> `'default'` literal. T-AS-011 lands the widen **and** the `'default'`→`'normal'`
> mapping on the three runtimes (`MockChatRuntime`, `FixtureChatRuntime`,
> `ClaudeCliChatRuntime`) **plus** the test `ScriptedRuntime` doubles
> (`RunChatTurnUseCase.test.ts` / `.rr.test.ts`) + the P6 capability fixtures
> (`buildToolbarViewModel.test.ts`, `MockToolbarCapabilities.test.ts`,
> `LocalStorageToolbar.test.ts`, `ChatRuntimePort.ts.test.ts`, `main.ts.test.ts`) in
> the SAME commit so `vue-tsc -p tsconfig.lint.json` + `npm run lint` + the suite stay
> green. The `EnqueueRuntime` decorator forwards `getToolbarCapabilities()` verbatim —
> no literal to change.

## INFRA / APPLICATION / UI / GATE batches

The scriptable Mock store + `setFailMode`, the LocalStorage browser-localStorage
impl, the `ApprovalManager` algorithm, the `foldControlOptions` clause, and the
Vue components carry the unit/component weight + the 80/70/80/80 coverage gate.
Tracked per RED test task (qa-owned) naming TEST-AS-001..062 (incl. the M1/M2/M3
manual legs). These ride the INFRA (T-AS-012..015), APPLICATION (T-AS-016..019),
UI (T-AS-020..035), STYLES (T-AS-036), WIRE-IN (T-AS-037..039), and GATE (T-AS-040)
batches — out of the DOMAIN batch scope.

## WIRE-IN batch (T-AS-031..033) — provide + mount + standalone smoke

| Leg | Status | Where |
|---|---|---|
| TEST-AS-022/040/043 (standalone mount) — `src/ui/main.ts` provides `APPROVAL_RULE_STORE_PORT` (MockBridge scriptable store); the per-surface `ApprovalManager` is built + `ApprovalsPanel` mounts (mode reflects `normal`, empty state) | covered (RED→green, T-AS-031→032) | `tests/ui/main.ts.test.ts` ("standalone approvals smoke") |
| TEST-AS-020/021/022/025/040/043 (surface gate) — the live approval callback gates through `ApprovalManager` (auto-allow / prompt / cancel / panel rule list / no-port degrade) | covered (green, T-AS-028/029 + T-AS-032 provide) | `tests/ui/chat/ChatSurface.approvals.test.ts` |
| TEST-AS-053 (wiring leg) — both entry points provide the store: `AgentSidebarView` → `ObsidianBridge.approvalRuleStore` (device-local), `src/ui/main.ts` → `MockBridge.approvalRuleStore` | covered (green, T-AS-032) | `src/plugin/AgentSidebarView.ts`, `src/ui/main.ts`; mount-tested via `tests/ui/main.ts.test.ts` |

**TEST-AS-M1/M3 (manual, human-run final review)** remain scheduled by T-AS-012 (the
real device-local store round-trip + the real Claude SDK mapping/`setMode`). T-AS-032
adds nothing self-claimable here — the production provide of
`ObsidianBridge.approvalRuleStore` in `AgentSidebarView` is exercised by the human
Obsidian leg (TEST-AS-M1) at the review gate.

### T-AS-033 — `npm run dev` standalone approvals smoke

- **Deterministic leg (automated + PASS):** the `tests/ui/main.ts.test.ts` "standalone
  approvals smoke" mounts `@/ui/main` against `MockBridge` and asserts the approvals
  panel mounts + reflects the active mode + the empty state. The toggle / inline
  four-option / seeded-rule auto-allow / fail-safe legs are covered by the component +
  `ChatSurface.approvals` + `ApprovalManager` suites.
- **DEFERRED human-run leg:** the interactive live-`npm run dev` server flow (select each
  of the three toggle modes incl. PLAN; the panel reflects the seeded rules + remove; the
  inline four-option row incl. `deny-always`; an "always allow" persists a rule the next
  matching request auto-allows; a forced `setFailMode` falls back to the prompt) is a
  deferred human-run leg — **the agent does not start the long-running dev server**.
  Recorded here for the final epic-review gate (TEST-AS-022/040/043/054 dev leg,
  pass/fail + date to be filled by the human run).

### CLARIFICATION — T-AS-032 action-pattern follow-up (escalated, not implemented)

The brief asked T-AS-032 to also thread the structured action pattern onto the request
so the gate runs `getActionPattern(toolName, input)` rather than deriving the pattern
from `req.context`. **This conflicts with a frozen spec invariant + its QA structural
test:** SPEC-AS-003 states the `ApprovalRequest`/`ApprovalOption` interfaces are
**byte-identical** to P4, and `tests/domain/chat/inline/Approval.test.ts` locks this with
`Equals<keyof ApprovalRequest, 'requestId' | 'tool' | 'context' | 'options'>`. Any new
(even optional) key on `ApprovalRequest` — whether the raw `input` or a precomputed
`actionPattern` — fails that QA assertion. SPEC-AS-016 is itself internally inconsistent
here: it says "derive the `ApprovalAction` via `getActionPattern(req.tool, …)`" while also
stating "the P4 `ApprovalRequest` carries `tool` + `context`" (no `input`), so
`getActionPattern`'s second argument has no source on the request.

Per the constitution (Article I.3 — update the spec before the code) and the Dev role
boundary (do not change QA assertions; do not silently widen a spec-frozen interface),
this follow-up is **escalated to architect/pm** rather than forced. The gate's current
`req.context`-based derivation (committed in the UI batch, T-AS-029) is retained — it is
correct for runtimes that place the raw command/path/glob in `context` (e.g. Bash
`"git status"` matches a `"git *"` rule, the green TEST-AS-020). The fix needs either (a)
SPEC-AS-003 to permit an additive optional `input?`/`actionPattern?` on `ApprovalRequest`
(and the QA structural test updated by QA), or (b) a side-channel that does not widen the
request keyset. See `workflow-state.md` clarifications.
