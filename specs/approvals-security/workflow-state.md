---
feature: approvals-security
area: AS
current_stage: implementation
status: active
last_updated: 2026-05-26
last_agent: dev (implementation — UI batch T-AS-020..029)
epic: claudian-reboot
phase: P7
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9/§4 P7 + audits + claudian-main stand in, mirrors P1-P6)
  research.md: skipped
  requirements.md: accepted (PRD-AS-001; CLAR-AS-001..005 resolved-by-recommendation → P7 architect ADRs, notably ADR-AS-001 ApprovalRuleStorePort)
  design.md: complete (DESIGN-AS-001; ADR-AS-001/002/003 accepted; CLAR-AS-001..005 ratified)
  spec.md: complete (SPEC-AS-001; 28 items, 6 layer groups; 33 REQ-AS + 16 NFR-AS chained to TEST-AS; 6 design open items resolved)
  tasks.md: complete (TASKS-AS-001; 40 tasks T-AS-001..040; DDD batches DOMAIN→INFRA→APP→UI→STYLES→WIRE-IN→GATE; RED-before-green; 3 manual legs T-AS-036/037/038; NO guard-relax)
  implementation-log.md: in-progress (DOMAIN T-AS-001..011 + INFRA T-AS-012..015 + APPLICATION T-AS-016..019 + UI T-AS-020..029 executed + logged; STYLES T-AS-030 + WIRE-IN T-AS-031..033 + GATE T-AS-034..040 remain, incl. manual legs TEST-AS-M1/M2/M3)
  test-plan.md: in-progress (guard-verify note + manual legs TEST-AS-M1/M2/M3 + DOMAIN/INFRA automated status; APP/UI legs follow)
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — approvals-security (P7)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete (DESIGN-AS-001; ADR-AS-001/002/003 accepted) |
| 5. Specification | `spec.md` | complete (SPEC-AS-001; 28 items SPEC-AS-001..028) |
| 6. Tasks | `tasks.md` | complete (TASKS-AS-001; 40 tasks T-AS-001..040; DDD batches; RED-before-green; 3 manual legs; NO guard-relax) |
| 7. Implementation | `implementation-log.md` + code | in-progress (DOMAIN T-AS-001..011 + INFRA T-AS-012..015 + APPLICATION T-AS-016..019 + UI T-AS-020..029 done; STYLES T-AS-030 + WIRE-IN T-AS-031..033 + GATE T-AS-034..040 remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (test-plan scaffolded; manual legs TEST-AS-M1/M3 scheduled at T-AS-012; test-report pending) |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P7 (approvals & security)

P0-P6 merged to `next` (P6 toolbar-controls #447 / 4f645a40). P7 = the approval decision/rules
engine + permission management on the P1-P6 chat surface.

**Scope (charter §4 P7 row + §3.9 security):** `ApprovalManager` (the approval decision engine),
permission updates, **approval rules + persistence**, the approvals UI (`status-panel/permission-toggle`
css → `--sp-*`). Connects two existing surfaces:
- **P4 inline approval blocks** — `ask-user-question` / `exit-plan-mode` / `plan-approval`
  (`InlineAskUserQuestion`/`InlineExitPlanMode`/`InlinePlanApproval` already RENDER from P4 via
  `RespondToInlineBlockUseCase`). P7 adds the RULE engine: an incoming approval request is matched
  against persisted rules → auto-approve/deny or prompt; a user decision can persist a new rule.
- **P6 permission-toggle seam** — P6 shipped it visible-disabled ("permissions arrive later").
  **P7 backs it**: the permission mode (default/plan/accept-edits/etc — confirm the exact set from
  claudian) becomes live, threads into the runtime, and the toggle drives it.

**Key P7 ADR (architecturally load-bearing — charter §6a):**
- **`ApprovalRuleStorePort` + approval-rule persistence target/shape** — device-local vs vault.
  CHARTER-REQ-SET says user/device-scoped state persists **device-local** (never `data.json`,
  never a collaborative-git vault file). Decide the rule shape (tool/path/scope match) + the
  store contract + the 3-bridge backing. File ADR-AS-001 (mirror how ADR-PSR-002 recorded the
  device-local SettingsPort decision). NO backwards-compat / migration (CHARTER-REQ-FRESH).
- Permission-mode model: the additive `ChatRuntimeQueryOptions`/runtime seam for permission mode
  (additive only, P0-P6 byte-identical) + how `ApprovalManager` + the rule store + the P4 inline
  request path + the P6 toggle compose (narrow ports, no aggregate, no `providerId` branch).

**Out of P7 (later phases):** MCP client/server management (P8); Codex/Opencode providers + their
permission models (P9 — P7 builds Claude + the SEAMS); settings UX for rule management (P10 may
add richer rule-editor UI; P7 ships the engine + a minimal surface).

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user state→device-local; NO backwards compat; DDD inward imports + narrow ports +
3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm` (Obsidian `Modal`/
modal-seam for any blocking flow); `<script setup>`; `Result<T,E>`; tests mirror `src/` + `data-testid`
PageObjects; coverage 80/70/80/80; perceptual `--sp-*` parity; identity stays Specorator; WCAG 2.2 AA;
manifest untouched; CI SHA-pinned + actionlint. VERIFY GATE (`npm run verify` + `npm run test:all` zero).

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE the FULL remaining epic
(P7→P12) via dedicated subagents in loops — no per-phase human checkpoint; self-parity-review vs
claudian after the big implemented chunk; merge each phase to `next` autonomously after a green gate +
green CI; deploy to `D:/TestVault` after each merge. Manual-Obsidian + parity-screenshot legs accumulate
for the SINGLE FINAL human review gate. Goal complete when the whole plugin is implemented + deployed.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.9/§6a/§4 P7 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (the `ApprovalManager`, permission
updates, the inline approval/plan-mode controllers, `status-panel`/`permission-toggle` css).

## Hand-off notes

```
2026-05-26 (orchestrator): P7 bootstrapped on feature/approvals-security (off next; P0-P6 merged).
                          Scope = charter §3.9 approvals/security — ApprovalManager + permission
                          updates + approval rules + persistence; back the P6 permission-toggle
                          seam; consume the P4 inline approval blocks. Autonomous full-epic drive.
                          Next: /spec:requirements (pm) grounded in charter §3.9/§6a + audits +
                          the claudian ApprovalManager/permission sources. KEY: the
                          ApprovalRuleStorePort persistence ADR (device-local, CHARTER-REQ-SET) +
                          the permission-mode set (confirm from claudian) + the rule-match model.

2026-05-26 (pm): Stage 3 ACCEPTED. Wrote PRD-AS-001 (specs/approvals-security/requirements.md):
                 35 EARS REQ-AS (permission mode 001-006 · rules/matching 010-016 · decision flow
                 020-025 · persistence 030-034 · status/approvals UI 040-043 · a11y+additivity
                 050-054) + 16 NFR-AS + metrics + release criteria.
                 GROUNDED IN CLAUDIAN:
                 - Permission-mode set = EXACTLY THREE: `normal` / `plan` / `yolo`
                   (claudian-main src/core/types/settings.ts:76 `PermissionMode`; persisted as
                   ClaudianSettings.permissionMode + per-provider savedProviderPermissionMode).
                   All three are P7-backed for Claude. SDK-string mapping (yolo↔bypassPermissions,
                   plan↔plan, normal↔default) + setMode session-sync stay in provider infra (HOW).
                 - Rule model = {toolName, action-pattern?, decision allow|deny, lifetime
                   session|persisted}, with Claudian's exact matchesRulePattern semantics
                   (ApprovalManager.ts): bash exact/explicit-wildcard ("git *"/"npm:*") ONLY,
                   file path-prefix w/ segment boundaries, other-tool prefix, null-action guard.
                 - Decision flow: mode gate → rule match → auto-allow/deny OR surface the
                   UNCHANGED P4 inline prompt; allow-always/deny-always persists a rule.
                 PERSISTENCE RECOMMENDATION (CLAR-AS-001 → ADR-AS-001): dedicated
                 `ApprovalRuleStorePort` (NOT folded into SettingsPort), DEVICE-LOCAL backing
                 (Obsidian saveLocalStorage, per ADR-PSR-002), NO migration (CHARTER-REQ-FRESH).
                 Diverges from Claudian's projectSettings/.claude/settings.json (a shared
                 git-backed vault path — violates CHARTER-REQ-SET).
                 CLAR-AS-001..005 resolved-by-recommendation (autonomous; architect ADRs ratify):
                 001 port contract/shape/target · 002 live-mode plumbing + ToolbarCapabilities
                 expansion · 003 per-tab mode + device-global persisted rules · 004 explicit deny
                 rule + deny-wins precedence + mode-gate-first · 005 network/blocked-path context
                 via the existing P4 ApprovalRequest.context (defer the panel, NG3).
                 ADDITIVITY: with no rule + `normal` mode, P1-P6 byte-identical (REQ-AS-052) — the
                 P4 "always prompt" path is the no-rules default.
                 HAND-OFF → /spec:design (architect): file ADR-AS-001 (ApprovalRuleStorePort +
                 rule shape + device-local backing + 3-bridge backing) FIRST; ratify CLAR-AS-001..005;
                 design the ApprovalManager pure-domain matching core, the decision-flow use case
                 wiring the P4 setApprovalCallback seam, the live permission-mode plumbing
                 (additive ChatRuntimeQueryOptions/runtime setter + ToolbarCapabilities 3-mode
                 expansion), and the minimal status/approvals UI (status-panel/permission-toggle
                 --sp-* slice). Part A UX + Part B visual parity per charter §5.

2026-05-26 (architect): Stage 4 COMPLETE. Wrote DESIGN-AS-001 (specs/approvals-security/design.md,
                 Parts A UX / B UI / C Architecture) + filed ADR-AS-001/002/003 (accepted) + indexed
                 them in docs/adr/README.md. CLAR-AS-001..005 RATIFIED.
                 ADR-AS-001 (ApprovalRuleStorePort, charter §6a — the load-bearing one): store-only
                 narrow port loadRules/addRule/removeRule/clear all Promise<Result<…>>; rule DTO =
                 { id, toolName, actionPattern?, decision allow|deny, lifetime session|persisted,
                 createdAt }; PURE domain matcher (getActionPattern/getActionDescription/
                 matchesRulePattern + isPathPrefixMatch/matchesBashPrefix — claudian semantics EXACT:
                 bash explicit-wildcard-only, file path-segment boundaries, other-tool prefix,
                 null-action guard); DEVICE-LOCAL backing app.saveLocalStorage('specorator:approval-rules')
                 — NOT data.json, NOT a vault file (CHARTER-REQ-SET), NO migration (CHARTER-REQ-FRESH);
                 3 bridges (Obsidian device-local / Mock scriptable+in-memory+failure-injection / LS
                 browser-localStorage). Fail-safe-to-prompt on store error (NFR-AS-004).
                 ADR-AS-002 (permission-mode plumbing): additive ChatRuntimeQueryOptions.permissionMode?
                 ('normal'|'plan'|'yolo') + per-tab TabControls.permissionMode?, folded by the P6
                 foldControlOptions (guarded — non-'normal' only → byte-identical default, NFR-AS-001);
                 P6 ToolbarCapabilities.permissionMode WIDENED from 'default'|'plan' to the live
                 three-mode value ('default'→'normal'); SDK mapping (yolo↔bypassPermissions/plan↔plan/
                 normal↔default) + plan-exit setMode session sync stay in the Claude runtime — NO
                 providerId branch (NG6).
                 ADR-AS-003 (decision flow): application ApprovalManager use case over the narrow ports —
                 mode gate (yolo→auto-allow, plan→P4 exit-plan gate) FIRST → load (store + in-memory
                 session) → pure match → deny-wins/allow/auto OR the UNCHANGED P4 inline prompt → *-always
                 persists a rule, *-once = session rule, cancel = deny+interrupt; additive 'deny-always'
                 on the P4 ApprovalDecision (render otherwise unchanged, NG4); decisionReason/blockedPath
                 via the existing P4 ApprovalRequest.context (CLAR-AS-005, defer the panel NG3); no-rules
                 + normal mode = byte-identical P4 (REQ-AS-052).
                 COMPONENT INVENTORY: PermissionToggle.vue (P6 seam → live three-mode, changed),
                 ApprovalsPanel.vue + ApprovalRuleRow.vue (new status/approvals surface),
                 InlineApproval.vue (+deny-always option, additive). status-panel/permission-toggle
                 --sp-* slice; en+de i18n; no v-html; co-located data-testid POs.
                 NOTED under/over-specified (non-blocking, pinned to /spec:specify): (1) yolo lifetime —
                 design treats mode as per-tab draft (reload → normal), not a persisted rule; (2) session-
                 rule scope (per-surface recommended); (3) addRule dedupe by (tool,pattern,decision);
                 (4) JSON-fallback pattern stored as match-all (no actionPattern); (5) concurrency/ordering
                 + await-store-write-before-decide; (6) the P4 ApprovalDecision grows 'deny-always'
                 additively (PRD lists deny rules but the P4 union lacked the member).
                 HAND-OFF → /spec:specify: write SPEC-AS contracts — ApprovalRuleStorePort method
                 contracts (pre/post/errors/Result), the ApprovalRule field-validation rules, the pure
                 matcher's exact behaviour table + edge cases (bash-wildcard/path-segment/null-action/
                 JSON-fallback), the ApprovalManager decide() algorithm contract (mode-gate-first,
                 deny-wins, fail-safe), the additive ChatRuntimeQueryOptions/TabControls/ApprovalDecision
                 shapes, the device-local key + the no-data.json regression assertion, the three-bridge
                 backings, observability (no rule content in logs), and the TEST-AS scenarios. Resolve
                 the six pinned spec-level items above.

2026-05-26 (architect): Stage 5 COMPLETE. Wrote SPEC-AS-001 (specs/approvals-security/spec.md): 28
                 implementation-ready spec items across 6 layer groups (DOMAIN SPEC-AS-001..006 ·
                 INFRA 007..009 · APPLICATION 010..011 · UI 012..019 · STYLES 020 · CROSS-CUTTING
                 021..028). Mirrors the SPEC-TC/SPEC-CA format exactly (layer-grouped items, exact TS
                 interface blocks, manual-leg call-outs, EC table EC-AS-1..20, U/A/M test split
                 TEST-AS-001..062 + M1/M2/M3, the §9 coverage table, the §10 quality gate).
                 PINNED SHAPES: PermissionMode = 'normal'|'plan'|'yolo' (SPEC-AS-001); additive
                 ChatRuntimeQueryOptions.permissionMode? + TabControls.permissionMode? (SPEC-AS-002,
                 P0-P6 byte-identical + serialisation test TEST-AS-002); ApprovalDecision grown by
                 'deny-always' (SPEC-AS-003, 4 members, NG4 render unchanged); the PURE matcher
                 getActionPattern/getActionDescription/matchesRulePattern (SPEC-AS-004, claudian
                 ApprovalManager.ts verbatim — bash explicit-wildcard-only, file path-segment
                 boundaries, other-tool prefix, null-action guard, \→/ normalise, deny-wins; full
                 truth table SPEC-AS-026); ApprovalRule DTO {id,toolName,actionPattern?,decision,
                 lifetime,createdAt} + ruleDedupeKey (SPEC-AS-005); ApprovalRuleStorePort
                 loadRules/addRule/removeRule/clear all Promise<Result> + APPROVAL_RULE_STORE_PORT key
                 + ToolbarCapabilities.permissionMode WIDEN (SPEC-AS-006); ApprovalManager.decide/
                 applyDecision/listRules (SPEC-AS-010, mode-gate-first → load → match deny-wins →
                 prompt → persist; fail-safe-to-prompt on store err); foldControlOptions +permissionMode
                 guarded non-'normal' clause (SPEC-AS-011).
                 6 DESIGN OPEN ITEMS RESOLVED in §0: (1) session rules per-SURFACE (one ApprovalManager
                 per ChatSurface); (2) addRule DEDUPE by (toolName,actionPattern??'',decision) triple;
                 (3) JSON-fallback ({-leading) pattern stored with actionPattern ABSENT (match-all, no
                 secret); (4) decide AWAITS loadRules (+ addRule for *-always) before resolving the
                 callback, second pending request re-evaluates on a fresh load; (5) yolo/mode = per-tab
                 DRAFT state (reload → normal), not a persisted rule; (6) 'deny-always' label +
                 ordering (Allow once · Always allow · Deny once · Always deny).
                 MANUAL LEGS (final epic gate): TEST-AS-M1 real device-local store round-trip +
                 data.json/vault untouched; TEST-AS-M2 parity screenshots (toggle 3 modes / inline
                 4-option row / panel / auto-decided turn @ 320/520/720 light+dark); TEST-AS-M3 real
                 Claude SDK-string mapping + plan-exit setMode; TEST-AS-005 plan-mode edit gating.
                 COVERAGE: all 33 REQ-AS + 16 NFR-AS chain to ≥1 SPEC-AS and ≥1 TEST-AS (§9). No TBD.
                 No new ADR (ADR-AS-001..003 cover the architecture; spec only refines field-level
                 detail the ADRs delegated).
                 HAND-OFF → /spec:tasks (planner): decompose SPEC-AS-001..028 into T-AS-NNN. Sequence
                 the additive domain grow FIRST (PermissionMode SPEC-AS-001 + the two optionals
                 SPEC-AS-002 + the grown ApprovalDecision SPEC-AS-003 + the pure matcher SPEC-AS-004 +
                 the ApprovalRule DTO SPEC-AS-005) so the engine + the toggle build on frozen types;
                 then ApprovalRuleStorePort + APPROVAL_RULE_STORE_PORT + the three bridges
                 (SPEC-AS-006..009) incl. the fake-ports approvalRuleStore member + the scriptable
                 failure-injection (setFailMode) for TEST-AS-054; then foldControlOptions clause
                 (SPEC-AS-011) + ApprovalManager (SPEC-AS-010); the UI (PermissionToggle live three-mode
                 SPEC-AS-012, ApprovalsPanel + ApprovalRuleRow SPEC-AS-013/014, InlineApproval
                 +deny-always SPEC-AS-015, ChatSurface callback wiring SPEC-AS-016, tabsStore SPEC-AS-017,
                 composable SPEC-AS-018, wiring SPEC-AS-019) + the --sp-* slice SPEC-AS-020 last.
                 No open clarifications block the planner.

2026-05-26 (planner): Stage 6 COMPLETE. Wrote TASKS-AS-001 (specs/approvals-security/tasks.md): 40
                 tasks T-AS-001..040 decomposing SPEC-AS-001..028, mirroring the TASKS-TC-001 (P6) +
                 TASKS-CA-001 (P5) shape EXACTLY — a baseline/guard-verify task first; DDD batches
                 DOMAIN→INFRA→APPLICATION→UI→STYLES→WIRE-IN→GATE; strict RED test (qa) before impl
                 (dev); every dev task's first DoD = "the prior RED test(s) now pass" + typecheck/lint/
                 test green + impl-log entry.
                 BATCHES: DOMAIN T-AS-002..011 (PermissionMode + the 2 additive optionals + ApprovalDecision
                 +deny-always RED→green T-AS-002/003; the PURE matcher truth table RED→green T-AS-004/005;
                 ApprovalRule DTO + ruleDedupeKey RED→green T-AS-006/007; ApprovalRuleStorePort +
                 APPROVAL_RULE_STORE_PORT key + barrel RED→green T-AS-008/009; the ToolbarCapabilities.
                 permissionMode WIDEN RED→green+runtime fan-out T-AS-010/011). INFRA T-AS-012..015 (Obsidian
                 device-local store + Claude SDK map + plan-exit setMode coverage-excluded→manual T-AS-012;
                 Mock scriptable store + setFailMode + fake-ports.approvalRuleStore + scriptable runtime
                 mode RED→green T-AS-013/014; LocalStorage browser-localStorage + inert mode T-AS-015).
                 APPLICATION T-AS-016..019 (foldControlOptions permissionMode clause RED→green T-AS-016/017;
                 ApprovalManager decide/applyDecision/listRules — mode-gate-first→match deny-wins→prompt→
                 persist + fail-safe RED→green T-AS-018/019). UI T-AS-020..029 (useApprovalRuleStorePort
                 T-AS-020/021; PermissionToggle live three-mode T-AS-022/023; ApprovalsPanel+ApprovalRuleRow
                 T-AS-024/025; InlineApproval +deny-always T-AS-026/027; ChatSurface approval-callback→
                 ApprovalManager + tabsStore permissionMode control T-AS-028/029; each mounted .vue + a
                 co-located data-testid PO). STYLES T-AS-030 (status-panel/permission-toggle --sp-* slice +
                 tokens-contract). WIRE-IN T-AS-031..033 (provide APPROVAL_RULE_STORE_PORT in
                 AgentSidebarView + ui/main.ts + mount the panel + wire the live callback RED→green
                 T-AS-031/032; npm run dev standalone smoke T-AS-033). GATE T-AS-034..040 (cross-cutting
                 invariants RED→green T-AS-034/035; 3 manual human-run legs T-AS-036 device-local round-trip
                 + no-data.json M1 / T-AS-037 real SDK map+setMode+plan-gating M3+005 / T-AS-038 parity
                 screenshots M2; token guard + additivity gate T-AS-039; Feature DoD + draft PR into next
                 T-AS-040).
                 BUILD-GREEN DISCIPLINE (the P5 T-CA-006 / P6 T-TC-008 lesson): the ToolbarCapabilities.
                 permissionMode WIDEN (a non-additive type change that breaks every implements
                 ChatRuntimePort) lands its runtime fan-out (3 runtimes + EnqueueRuntime decorator +
                 ScriptedRuntime doubles, mapping 'default'→'normal') in the SAME task T-AS-011 to keep the
                 build green; the additive ChatRuntimeQueryOptions.permissionMode? + TabControls.
                 permissionMode? optionals carry NO implements-break (T-AS-003 notes this — no companion
                 stub) — called out in the tasks.md banner + the T-AS-003/011 DoD.
                 GUARD-RELAX: NONE needed (verified against eslint.config.js — no P7 symbol was P0-deleted;
                 APPROVAL_RULE_STORE_PORT + @/domain/chat/PermissionMode + @/domain/chat/approvals/** +
                 @/domain/ports/ApprovalRuleStorePort + @/application/chat/approvals/** + @/ui/chat/approvals/**
                 match no DELETED_SUBSYSTEM_BAN glob; DELETED_INJECTION_KEYS has no APPROVAL_RULE_STORE_PORT).
                 Stated explicitly like P5/P6; T-AS-001/009/040 carry the lint-confirmation DoD.
                 STABILITY-LOOP NFRs: NONE in scope (no "0 flakes across N runs" NFR in PRD-AS/SPEC-AS) —
                 no 1:1 stability-loop task generated; nothing to escalate.
                 COVERAGE: all 28 SPEC-AS + 33 REQ-AS + 16 NFR-AS + all TEST-AS-001..062 + M1/M2/M3 map to
                 ≥1 task (§coverage table). No TBD; no orphan task. Critical path = 14 tasks
                 (T-AS-002→003→010→011→013→014→018→019→028→029→031→032→037→040).
                 HAND-OFF → /spec:implement (dev/qa/sre): start with the Batch-0 RED tasks T-AS-002 (qa —
                 PermissionMode + the two additive optionals + the grown ApprovalDecision + the byte-identity
                 serialisation leg) ∥ T-AS-004 (qa — the PURE matcher truth table) ∥ T-AS-006 (qa — the
                 ApprovalRule DTO + ruleDedupeKey), plus T-AS-001 (dev — baseline-capture + guard
                 verification, no production code). FIRST READY TASK = T-AS-002 (qa, RED — no deps). Freeze
                 the additive domain types FIRST so the engine + the toggle build on frozen types; the
                 ToolbarCapabilities widen (T-AS-011) lands its runtime fan-out in one task.

2026-05-26 (dev): DOMAIN batch T-AS-001..011 COMPLETE on feature/approvals-security (off next).
                 Created implementation-log.md + test-plan.md + parity-screenshots.md (T-AS-001,
                 doc-only baseline + guard verification). Strict TDD, one commit per task (RED qa →
                 green dev):
                 - T-AS-001 ac070a66 (baseline + guard-verify; no src change)
                 - T-AS-002 e136d4d3 RED / T-AS-003 6db66df1 green — PermissionMode
                   ('normal'|'plan'|'yolo'); ChatRuntimeQueryOptions.permissionMode? + TabControls.
                   permissionMode? appended after serviceTier; ApprovalDecision grown by
                   'deny-always'; barrel re-export. Additive — NO implements break. A P6-shaped
                   query is byte-identical to P6 (TEST-AS-002).
                 - T-AS-004 9b632f5a RED / T-AS-005 052a6c50 green — the PURE matcher
                   (getActionPattern/getActionDescription/matchesRulePattern) ported verbatim from
                   claudian ApprovalManager.ts; pure + total, never throws; full SPEC-AS-026 truth
                   table (bash explicit-wildcard-only, file path-segment boundary, other-tool prefix,
                   null-action guard, backslash->/ normalise, deny-wins).
                 - T-AS-006 91b168e3 RED / T-AS-007 2ddf0eba green — ApprovalRule DTO (six readonly
                   members) + ApprovalRuleInput omit + ruleDedupeKey triple; inert, no secret field.
                 - T-AS-008 856982f8 RED / T-AS-009 4eb395c7 green — ApprovalRuleStorePort
                   (loadRules/addRule/removeRule/clear, all Promise<Result>) + APPROVAL_RULE_STORE_PORT
                   key (own, no aggregate) + barrel re-exports. Guard green (no relaxation).
                 - T-AS-010 214e025c RED / T-AS-011 b8bb8688 green — WIDEN ToolbarCapabilities.
                   permissionMode 'default'|'plan' -> PermissionMode; the implements fan-out
                   ('default'->'normal') landed in the SAME commit across the 3 runtimes
                   (Mock/Fixture/ClaudeCli) + the 2 ScriptedRuntime test doubles + the 4 P6 capability
                   fixtures; EnqueueRuntime forwards verbatim (untouched). The P6 T-TC-008 lesson
                   applied — whole-project build stayed green.
                 GATE over the batch: vue-tsc -p tsconfig.lint.json 0 (whole project), whole-project
                 npm run lint 0 errors (12 pre-existing warnings), vitest tests/domain/{chat,ports}
                 116/116. No obsidian/node/Vue in src/domain/**; matcher pure/total; additivity proven.
                 DEVIATION: two targeted `complexity` lint disables on the verbatim-ported matcher
                 (intrinsic per-tool/per-family dispatch, justified — project convention per
                 plugin-core.ts); the additive-union-grow + capability-widen fan-out edits to the P4
                 inlineBlockDtos test + the P6 capability fixtures/doubles are the forced consequence
                 of the type changes, not assertion changes (authoritative assertions live in the new
                 Approval.test.ts + ChatRuntimePort.ts.test.ts). NOT staged: pre-existing uncommitted
                 styles.css (P6 comment cleanup, unrelated — left untouched).
                 HAND-OFF -> INFRA batch /spec:implement (dev/qa): T-AS-012 (Obsidian device-local
                 store + Claude SDK map + plan-exit setMode, coverage-excluded -> manual M1/M3) ||
                 T-AS-013 RED (Mock scriptable store + setFailMode + fake-ports.approvalRuleStore +
                 scriptable runtime mode) -> T-AS-014 green || T-AS-015 (LocalStorage
                 browser-localStorage + inert mode). The frozen domain types (PermissionMode, the two
                 optionals, the matcher, the rule DTO, ApprovalRuleStorePort + key) are ready for the
                 bridges to implement.

2026-05-26 (dev): INFRA batch T-AS-012..015 COMPLETE on feature/approvals-security (off next).
                 Strict TDD, one commit per task; verification performed per task = vue-tsc -p
                 tsconfig.lint.json 0 errors (whole project) + whole-project npm run lint 0 errors
                 (12 pre-existing warnings) + vitest run on the changed surface:
                 - T-AS-012 eb0b543a (dev, coverage-excluded) — ObsidianApprovalRuleStore (device-local
                   app.saveLocalStorage/loadLocalStorage('specorator:approval-rules'), load-or-default +
                   coercion, dedupe + mint, idempotent remove, clear; never data.json/vault, NFR-AS-003) +
                   get approvalRuleStore on ObsidianBridge; ClaudeCliChatRuntime SDK-mode mapping
                   (yolo->bypassPermissions / plan->plan / normal|absent->no --permission-mode flag) +
                   liveMode through getToolbarCapabilities().permissionMode + plan-exit _syncPlanExitMode
                   (parity ClaudeApprovalHandler setMode destination:session); no providerId branch.
                   Behavioural gate = MANUAL TEST-AS-M1 (device-local round-trip + data.json/vault
                   untouched) + TEST-AS-M3 (real SDK map + plan-exit setMode), scheduled in test-plan.md —
                   NOT self-claimed.
                 - T-AS-013 cf7a9b67 RED / T-AS-014 07a58253 green — MockApprovalRuleStore (scriptable
                   in-memory: seedRules / setFailMode('none'|'load'|'save') forcing Result.err /
                   loadRules-default-ok([]) / addRule mint+dedupe+opposite-decision-append / idempotent
                   remove / clear; total never-throws) + get approvalRuleStore on MockBridge;
                   MockChatRuntime getLastPermissionMode + scriptable three-mode getToolbarCapabilities;
                   the fake-ports.approvalRuleStore member (typed MockApprovalRuleStore so seedRules +
                   setFailMode surface). vitest 32/32. Runnability-only fix to the T-AS-013 RED fixture
                   (ChatTurnRequest has no conversationId; drop the unused chunk binding) folded into the
                   green commit — no assertion change.
                 - T-AS-015 9d7874b5 (RED leg authored within the dev task then greened — no separate qa
                   RED task scheduled for the LS half) — LocalStorageApprovalRuleStore (browser
                   localStorage under the same key; load-or-default incl. corrupt-blob; dedupe + mint;
                   idempotent remove; clear; never throws) + get approvalRuleStore on LocalStorageBridge.
                   The inert runtime mode needs no change (FixtureChatRuntime reports 'normal' from
                   T-AS-011, fires no live setMode). vitest 8/8 store + full tests/infrastructure +
                   tests/__fakes__ 346/346.
                 THREE-BRIDGE STORY: Obsidian device-local (coverage-excluded -> manual M1) / Mock
                 scriptable in-memory (seedable + setFailMode, on fake-ports.approvalRuleStore) /
                 LocalStorage browser-localStorage. Claude SDK-mode mapping + plan-exit setMode in
                 ClaudeCliChatRuntime (coverage-excluded -> manual M3); LS runtime mode inert.
                 DEVIATION: T-AS-012/015 store _coerce split into _isValidEntry for the complexity cap
                 (structural, no behaviour change); the LS RED leg authored in the dev task (no qa RED
                 task scheduled for the LS half in the batch) — RED confirmed before green. NOT touched:
                 other batches (no application ApprovalManager, no UI). styles.css left untouched.
                 HAND-OFF -> APPLICATION batch /spec:implement (qa/dev): T-AS-016 RED (foldControlOptions
                 guarded permissionMode clause, EC-AS-2/13) -> T-AS-017 green; T-AS-018 RED (ApprovalManager
                 decide/applyDecision/listRules — mode-gate-first -> match deny-wins -> prompt -> persist;
                 fail-safe-to-prompt over the scriptable Mock store via fake-ports.approvalRuleStore +
                 setFailMode) -> T-AS-019 green. The three bridges + the fake-ports.approvalRuleStore seam
                 (seed + setFailMode) are ready for the ApprovalManager use-case tests.

2026-05-26 (dev): APPLICATION batch T-AS-016..019 COMPLETE on feature/approvals-security (off next).
                 Strict TDD, one commit per task (RED qa -> green dev). Verification performed per task
                 and at the batch close-out = vue-tsc -p tsconfig.lint.json 0 errors (whole project) +
                 whole-project npm run lint 0 errors (12 pre-existing warnings only) + vitest run:
                 - T-AS-016 49f622f1 RED / T-AS-017 99f73648 green — foldControlOptions gains ONE guarded
                   clause: folded.permissionMode = controls.permissionMode only when present AND
                   non-'normal'. {} -> {} and {permissionMode:'normal'} -> {} (EC-AS-2/13, byte-identical
                   P6); 'plan'/'yolo' folded; the P6 model/mode/reasoning/serviceTier clauses + behaviour
                   byte-identical; pure+total. The 9 P6 fold regression tests stay green (18/18 in-file).
                 - T-AS-018 d9797c17 RED / T-AS-019 99f73648-onward green — ApprovalManager
                   decide/applyDecision/listRules over the scriptable Mock store + a scripted mode.
                   decide(action, mode): mode-gate-FIRST (yolo->ok('allow') no lookup proven by a
                   loadRules spy / plan->ok('prompt') defer / normal->continue) -> await loadRules via
                   tryAsync (err -> debug-log NO rule content + feedback.info(storeError) + ok('prompt'),
                   never auto-allow) -> match persisted-union-session via the pure matcher (deny-wins ->
                   ok('deny'), else allow -> ok('allow'), else ok('prompt')). applyDecision: allow/deny ->
                   in-memory session rule (dedupe by ruleDedupeKey); allow-always/deny-always ->
                   store.addRule({...,lifetime:'persisted'}) returning the concrete allow/deny (the
                   {-leading JSON-fallback + null/empty pattern stored WITHOUT actionPattern, EC-AS-16);
                   null -> ok(null) cancel; a persist err surfaces the notice but the decision stands.
                   listRules -> persisted-union-session, Result-typed (load err -> err). No providerId
                   branch; never throws (every store touch via tryAsync; matcher total). vitest
                   ApprovalManager.test.ts 26/26; full tests/application 372/372 (incl. the P6
                   foldControlOptions regression).
                 DEVIATION (logged in implementation-log.md): SPEC-AS-010 shows decide(action, mode) +
                 constructor(store, feedback); the manager takes a THIRD constructor arg
                 storeErrorMessage:string so the spec's feedback.notify(approvals.storeError) is realised
                 as feedback.info(resolvedMessage) — i18n key resolution stays in the UI/composable layer
                 (NFR-AS-006/SPEC-AS-022); the UI passes t('agent.chat.approvals.storeError') when wiring
                 the per-surface ApprovalManager (T-AS-028). The brief's decide(action, mode, sessionRules,
                 store) shorthand was NOT followed — the spec pins store + session-rule map as instance
                 state (resolved open item #1). No spec change required. NOT touched: domain/infra/UI;
                 styles.css left untouched.
                 HAND-OFF -> UI batch /spec:implement (qa/dev): T-AS-020/021 useApprovalRuleStorePort;
                 T-AS-022/023 PermissionToggle live three-mode; T-AS-024/025 ApprovalsPanel +
                 ApprovalRuleRow; T-AS-026/027 InlineApproval +deny-always; T-AS-028/029 ChatSurface
                 approval-callback -> ApprovalManager wiring (construct ONE per surface with the resolved
                 storeError message) + tabsStore permissionMode control. The application use case
                 (ApprovalManager.decide/applyDecision/listRules) + the foldControlOptions clause are
                 ready for the surface to wire into the live P4 setApprovalCallback seam.

2026-05-26 (dev): UI batch T-AS-020..029 COMPLETE on feature/approvals-security (off next).
                 Strict TDD, one commit per task (RED qa -> green dev). Verification performed
                 per task + at close-out = vue-tsc -p tsconfig.lint.json 0 errors (whole project)
                 + whole-project npm run lint 0 errors (12 pre-existing warnings only) + vitest run
                 on the changed + regression surface (heavy mounts under --pool=threads
                 --no-file-parallelism --testTimeout=30000). styles.css untouched throughout.
                 - T-AS-020 46d03f0f RED / T-AS-021 6a9a0399 green — useApprovalRuleStorePort
                   (inject APPROVAL_RULE_STORE_PORT or throw; mirrors useToolbarCatalogPort). 2/2.
                 - T-AS-022 d915348f RED / T-AS-023 517557e1 green — PermissionToggle live
                   three-mode (normal/plan/yolo role=listbox, Arrow cycle, Enter/Space activate,
                   Escape blur; PLAN label; aria-selected; set(mode) emit) ADDITIVELY over the P6
                   honest-defer seam (optional `mode` prop — absent => the P6 disabled seam,
                   byte-identical). SPEC-AS-022 i18n en+de added. Live 6/6 + P6 regression 3/3 +
                   toolbar/buildToolbarViewModel/i18n 85/85.
                 - T-AS-024 3225fe1f RED / T-AS-025 5aa89193 green — ApprovalsPanel.vue +
                   ApprovalRuleRow.vue (status surface: active mode + live rule list + empty notice;
                   one row = tool/pattern/decision/lifetime text + a persisted-only remove button;
                   co-located POs). 9/9.
                 - T-AS-026 47f91f4e RED / T-AS-027 1277a44e green — InlinePlanApproval +deny-always:
                   the fourth option arrives via request.options; an additive :data-decision attribute
                   targets it; render byte-identical to P4 (NG4). deny-always 3/3 + P4 regression 5/5.
                 - T-AS-028 75a8684f RED / T-AS-029 15fe6643 green — ChatSurface approval gating +
                   permissionMode wiring. A NEW ApprovalGateRuntime decorator (src/ui/chat/composer/)
                   sits inner-most in the P4 approval chain (gate wraps runtime; EnqueueRuntime wraps
                   gate): on a pulled approval it derives the action (toolName=req.tool,
                   actionPattern=req.context) + reads the active mode, then ApprovalManager.decide ->
                   ok('allow')/ok('deny') resolve silently (NO inline block) / ok('prompt') (or a
                   defensive err) enqueue the unchanged P4 block, await the user, applyDecision, resolve
                   the concrete decision (*-always -> allow/deny, cancel -> null). Degrades to the
                   byte-identical P4 always-prompt path when APPROVAL_RULE_STORE_PORT is absent
                   (manager null -> no gate, no panel). PermissionToggle.set + ApprovalsPanel.remove +
                   the live mode thread through ToolbarStrip/ChatComposer to
                   tabs.setControl('permissionMode'). NO providerId branch. ChatSurface approvals 6/6 +
                   new tabsStore.permissionMode 5/5; regression: ChatSurface toolbar/inline/context/ts
                   14/14, composer+toolbar+tabsStore+ChatComposer 256/256, structural/composable/
                   approvals 17/17 — all green.
                 DEVIATIONS (all logged in implementation-log.md, none alter the spec contract):
                 (1) PermissionToggle keeps the P6 `vm` prop + adds an OPTIONAL `mode?` (vs SPEC-AS-012's
                 `mode`-only) so the P6 ToolbarStrip wiring stays byte-identical until ChatSurface wires
                 the live mode — the brief's "additive: no live mode => P6 disabled" directive.
                 (2) The P6 toolbar.permission.deferred i18n string is RETAINED (SPEC-AS-022 says remove)
                 because the no-live-mode P6 seam still renders it; dead only once the surface always
                 supplies a live mode — a follow-up at the gate. (3) The component the spec names
                 InlineApproval.vue is the real P4 InlinePlanApproval.vue (composer/, resolve emit via
                 RespondToInlineBlockUseCase) — the deny-always option was added to the real component;
                 the spec's inline-approval-deny-always testid is the additive [data-decision="deny-always"]
                 selector. (4) SPEC-AS-016 describes a direct setApprovalCallback in ChatSurface; the real
                 P4 routes approvals through the composer arbiter, so ApprovalManager is wired via the new
                 ApprovalGateRuntime decorator (inner-most) rather than a direct callback. (5) The action
                 pattern is derived from req.context (the P4 ApprovalRequest carries no structured input,
                 byte-identical NG4) — carrying the structured input so getActionPattern runs over it is
                 the runtime's job when building the request, a follow-up at the wire-in/runtime layer.
                 (6) The tabsStore half of T-AS-029 needed NO code change (the P6 generic setControl +
                 the T-AS-017 fold already cover permissionMode) — the new store test locks this.
                 NOT touched: STYLES (the --sp-approvals-* + --sp-permission-mode-active tokens the panel/
                 row reference are minted in T-AS-030), WIRE-IN (the production provide(APPROVAL_RULE_STORE_PORT)
                 is T-AS-031..033), GATE. styles.css left untouched.
                 HAND-OFF -> STYLES /spec:implement (dev): T-AS-030 (status-panel/permission-toggle --sp-*
                 token slice — mint --sp-approvals-row-gap / --sp-approvals-decision-allow|deny /
                 --sp-permission-mode-active; remove the P6 deferred styling with the seam; tokens-contract
                 + lint-style-tokens guard TEST-AS-062), then WIRE-IN T-AS-031..033 (provide
                 APPROVAL_RULE_STORE_PORT in AgentSidebarView + ui/main.ts; the panel/gate are already
                 mounted/wired in ChatSurface when the port is present). The toggle/panel/inline/gate
                 components + the composable + the approval engine are ready for the production provide.
```
