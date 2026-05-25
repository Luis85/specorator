---
feature: approvals-security
area: AS
current_stage: specification
status: active
last_updated: 2026-05-26
last_agent: architect (specification)
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
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
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
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
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
```
