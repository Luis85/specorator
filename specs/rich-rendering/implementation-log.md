---
id: IMPL-RR-001
title: Rich rendering (P2) — implementation log
stage: implementation
feature: rich-rendering
status: in-progress
owner: dev
epic: claudian-reboot
phase: P2
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — rich rendering (P2)

Chronological, append-only record of T-RR-* execution. Each entry names the task, files changed,
the gate state, the commit SHA, the spec reference, and (for TDD pairs) the RED-watched-then-GREEN
evidence. RED-test (qa) tasks record the failing state they establish; implementation (dev) tasks
record the GREEN convergence + commit SHA.

> TDD discipline (mission): RED test authored + watched fail **for the right reason**, then minimal
> code to green, re-run to confirm GREEN. Type-level contracts (`StreamChunk` member shapes, the new
> domain unions, `ChatMessage` growth) use compile-time `Equals<>` assertions that fail
> `npx vue-tsc --noEmit -p tsconfig.lint.json` (covering `tests/**`) — mirrors the P1
> `tests/domain/chat/StreamChunk.test.ts` pattern.

---

## Batch: domain foundation (T-RR-001..007, 039)

### T-RR-001 📐 — Baseline-capture: `claudian-main` P2 rich-render reference

- **Spec:** NFR-RR-011, NFR-RR-012, NFR-RR-014 (baseline leg).
- **Files:** `specs/rich-rendering/parity-screenshots.md` (new — per-renderer × 320/520/720 ×
  light/dark baseline matrix scaffolded, baseline column anchored to `D:\Projects\claudian-main`);
  `specs/rich-rendering/test-plan.md` (new — baseline reference + the NFR-RR-014 incremental-render
  qualitative baseline note recorded in the canonical sink; manual TEST-RR-026 / T-RR-043 legs
  scheduled). Both linked to #434.
- **Commit:** `d42bdde`.
- **Outcome:** done. No file under `src/` changed (DoD line 3). The Specorator column + the human
  visual capture happen at `/spec:review`.
- **Deviation:** none.

### T-RR-003 🔨 — Relax the deleted-symbol guard for `IconPort` / `SpIcon` / `ICON_PORT`

- **Spec:** SPEC-RR-009, SPEC-RR-025, NFR-RR-001. Mirrors P1's CLAR-CC-007 relaxation.
- **Files:** `eslint.config.js` — dropped `'@/domain/ports/IconPort'` from `DELETED_SUBSYSTEM_BAN.group`
  (lines ~147) and `'ICON_PORT'` from `DELETED_INJECTION_KEYS.importNames` (lines ~161); documented
  the relaxation inline in the guard's evolves-per-phase comment. `SpIcon` lives at the new UI path
  `@/ui/chat/SpIcon`, which no ban glob matches — already permitted by construction. Every OTHER
  P0-deleted symbol (`IBridge`/`BridgeKey`/`useBridge` via `PORTS_BAN_PATTERN`; `@/domain/feature/**`,
  the transport/MCP/secret/metadata/canvas ports + adapters via `DELETED_SUBSYSTEM_BAN`;
  `METADATA_CACHE_PORT`/`CANVAS_PORT`/… via `DELETED_INJECTION_KEYS`) stays forbidden.
- **Commit:** _(this commit)_.
- **Gate:** `npm run lint` → 0 errors (3 pre-existing warnings, unrelated). Positive control:
  `npx vitest run tests/architecture/no-deleted-subsystem-refs.test.ts` → 2 passed — TEST-PSR-016
  (no `src/**` violation) **and** TEST-PSR-017 (the fixture importing the still-deleted
  `@/domain/feature/Feature` still trips the ban, proving the guard still fires on a still-deleted
  symbol).
- **Outcome:** done. Lands before T-RR-007 so the `IconPort`/`ICON_PORT` imports resolve.
- **Deviation:** none.
