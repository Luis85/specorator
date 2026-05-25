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
- **Commit:** _set below_.
- **Deviation:** none. No file under `src/` changed.
