---
feature: approvals-security
area: AS
current_stage: requirements
status: active
last_updated: 2026-05-26
last_agent: orchestrator (bootstrap)
epic: claudian-reboot
phase: P7
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9/§4 P7 + audits + claudian-main stand in, mirrors P1-P6)
  research.md: skipped
  requirements.md: pending
  design.md: pending
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
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
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
```
