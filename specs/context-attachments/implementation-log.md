---
id: IMPL-LOG-CA-001
title: Context & Attachments (P5) — Implementation Log
stage: implementation
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
---

# Implementation Log — Context & Attachments (P5)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-CA-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-CA-007 (baseline leg), NFR-CA-001 (guard verification).
- **Files:** `specs/context-attachments/parity-screenshots.md` (new — baseline
  skeleton, four sub-surfaces × 320/520/720 × light/dark),
  `specs/context-attachments/test-plan.md` (new — guard-verification note + the
  M1/M2/M3 manual legs + TEST-CA status).
- **Outcome:** done.
- **Guard verification:** the three new keys (`AUX_MODEL_PORT` /
  `SELECTION_SOURCE_PORT` / `SELECTION_HIGHLIGHT_PORT`) and the new
  domain/app/ui paths match **no** `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` glob — no relaxation task needed (recorded in
  `test-plan.md`).
- **Commit:** `4177d19`.
- **Deviation:** none.

## DOMAIN batch (T-CA-002..006)

### T-CA-002 — RED attachment DTOs + `CapturedSelection` union + 5 `ChatTurnRequest` fields (🧪 qa)

- **Spec/test:** TEST-CA-001/002/003 + TEST-CA-013 (type-shape leg);
  SPEC-CA-001/002/003/028.
- **Files:** `tests/domain/chat/attachments/Attachments.test.ts`,
  `tests/domain/chat/attachments/Selection.test.ts`,
  `tests/domain/chat/ChatTurn.ts.test.ts` (new).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on
  the missing DTOs / union / five fields).
- **Commit:** `5436757`.

### T-CA-003 — Attachment DTOs + `CapturedSelection` union + barrel (🔨 dev)

- **Spec/req:** SPEC-CA-002/003; REQ-CA-001/007/010/013/017/018; NFR-CA-004.
- **Files:** `src/domain/chat/attachments/Attachments.ts` (new —
  `AttachedFileRef`, `ImageMimeType` four-member allow-list, `AttachedImage`),
  `src/domain/chat/attachments/Selection.ts` (new —
  `EditorSelectionContext`/`CanvasSelectionContext`/`BrowserSelectionContext` +
  the `CapturedSelection` union, `startLine` 0-based, `lineCount` ≥ 1),
  `src/domain/chat/attachments/index.ts` (new — barrel).
- **Outcome:** done — the TEST-CA-003 DTO legs + the TEST-CA-013 type-shape leg
  now green; plain `readonly` data, no `obsidian`/`node:*`/Vue/class.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 CA errors; `eslint` clean;
  `vitest run tests/domain/chat/attachments/` green.
- **Commit:** _this commit._
- **Deviation:** none.

### T-CA-004 — `ChatTurnRequest` five additive optional context fields (🔨 dev)

- **Spec/req:** SPEC-CA-001/028; REQ-CA-004/010/019; NFR-CA-001.
- **Files:** `src/domain/chat/ChatTurn.ts` (the five optional fields
  `attachedFiles?`/`images?`/`editorSelection?`/`canvasSelection?`/
  `browserSelection?` appended to `ChatTurnRequest`, DTOs imported from
  `./attachments/Attachments` + `./attachments/Selection`; the reserved
  comment replaced).
- **Outcome:** done — TEST-CA-001 (exact keys + per-field optional DTO types) +
  TEST-CA-002 now green; `text`/`currentNotePath` byte-identical; a
  `{ text }`-only request still serialises identically to P1;
  `PreparedChatTurn`/`ChatRuntimeQueryOptions`/`ChatRuntimeEnsureReadyOptions`
  unchanged.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 CA errors; `eslint` clean;
  `vitest run tests/domain/chat/attachments/ tests/domain/chat/ChatTurn.ts.test.ts`
  7/7 green.
- **Commit:** _this commit._
- **Deviation:** none.
