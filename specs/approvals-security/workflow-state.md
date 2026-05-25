---
feature: approvals-security
area: AS
current_stage: design
status: active
last_updated: 2026-05-26
last_agent: architect (design)
epic: claudian-reboot
phase: P7
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9/§4 P7 + audits + claudian-main stand in, mirrors P1-P6)
  research.md: skipped
  requirements.md: accepted (PRD-AS-001; CLAR-AS-001..005 resolved-by-recommendation → P7 architect ADRs, notably ADR-AS-001 ApprovalRuleStorePort)
  design.md: complete (DESIGN-AS-001; ADR-AS-001/002/003 accepted; CLAR-AS-001..005 ratified)
  spec.md: pending
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
| 5. Specification | `spec.md` | pending |
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
```
