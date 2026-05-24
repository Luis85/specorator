---
id: IMPL-CC-001
title: Chat core (P1) — implementation log
stage: implementation
feature: chat-core
status: in-progress
owner: dev
epic: claudian-reboot
phase: P1
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — chat core (P1)

Chronological, append-only record of T-CC-* execution. Each entry names the task, files changed,
the gate state, and (for TDD pairs) the RED-watched-then-GREEN evidence. RED-test (qa) tasks record
the failing state they establish; implementation (dev) tasks record the GREEN convergence + commit
SHA.

> TDD discipline (mission): RED test authored + watched fail **for the right reason**, then minimal
> code to green, re-run to confirm GREEN. Type-level contracts (`StreamChunk` union exactness,
> `ChatRuntimePort` 9-member keys) use a compile-time `Equals<>` assertion that fails
> `npm run typecheck` (`tsconfig.lint.json`, covering `tests/**`) — mirrors the P0
> `tests/domain/ports/WorkspacePort.test.ts` pattern.

---

## Batch: domain foundation (T-CC-001..007, 027)

### T-CC-001 📐 — Baseline-capture: `claudian-main` P1-surface reference

- **Spec:** NFR-CC-011, NFR-CC-013, NFR-CC-014 (baseline leg).
- **Files:** `specs/chat-core/parity-screenshots.md` (new — 3×2×5 baseline matrix scaffolded,
  baseline column anchored to `D:\Projects\claudian-main`); `specs/chat-core/test-plan.md` (new —
  baseline reference + the qualitative streaming-feel note recorded in the canonical sink).
- **Outcome:** done. No file under `src/` changed (DoD line 3). The baseline screenshot grid is
  scaffolded; the Specorator column + the human visual capture happen at `/spec:review` (T-CC-032).
- **Deviation:** none.
