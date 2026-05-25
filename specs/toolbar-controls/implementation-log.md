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
- **Commit:** _this commit._
- **Deviation:** none. No file under `src/` changed.
