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

### T-CC-002 🧪 — RED: `StreamChunk` union + `ChatRuntimePort` 9-member shape (qa)

- **Spec:** TEST-CC-002, TEST-CC-003, SPEC-CC-001, SPEC-CC-002, REQ-CC-001a, REQ-CC-002a.
- **Files:** `tests/domain/chat/StreamChunk.test.ts` (new — compile-time `Equals<>` asserts the
  five P1 member shapes + the absence of `text-delta`/`final`); `tests/domain/ports/ChatRuntimePort.test.ts`
  (new — `Equals<keyof ChatRuntimePort, <nine keys>>` exact-key assertion + deferred-member
  absence). Mirrors the P0 `WorkspacePort.test.ts` `Equals<>` idiom.
- **RED watched:** `npx vue-tsc --noEmit -p tsconfig.lint.json` →
  `StreamChunk.test.ts: TS2307 Cannot find module '@/domain/chat/StreamChunk'` + `'@/domain/chat/UsageInfo'`;
  `ChatRuntimePort.test.ts: TS2307 Cannot find module '@/domain/ports/ChatRuntimePort'` + `TS2322 Type 'true' is not assignable to type 'false'`.
  The RED signal for these type-level contracts is the **typecheck** failure (the runtime sentinels
  pass under vitest because `import type` is erased — same as the P0 pattern). Green target =
  T-CC-003 (types) + T-CC-004 (port).
- **Outcome:** done (RED established). Lint + prettier green on the two test files.
- **Deviation:** none.

### T-CC-003 🔨 — Domain chat types (dev)

- **Spec:** SPEC-CC-002..006, REQ-CC-001a, REQ-CC-005a, REQ-CC-006.
- **Files (new, `src/domain/chat/`):** `StreamChunk.ts` (full union mirroring `chat.ts:137`, P1
  subset documented; `toolUseResult?: unknown` per spec), `UsageInfo.ts` (`chat.ts:165` fields),
  `ChatMessage.ts` (P1 subset + per-field rules), `ChatTurn.ts` (`ChatTurnRequest`,
  `PreparedChatTurn`, `ChatRuntimeQueryOptions`, `ChatRuntimeEnsureReadyOptions`), `ProviderId.ts`
  (`'claude'`). Pure interfaces/unions — no `obsidian`, no `node:*`, no class.
- **GREEN:** `npx vitest run --project unit tests/domain/chat/StreamChunk.test.ts` → 2 passed; the
  TEST-CC-002 TS2307 errors for `@/domain/chat/StreamChunk` + `@/domain/chat/UsageInfo` are gone
  from `npm run typecheck`. (The `ChatRuntimePort.test.ts` typecheck errors remain — intended-RED,
  T-CC-004's target.)
- **Outcome:** done. eslint + prettier green on `src/domain/chat/**`; no `obsidian`/`node:*` import.
- **Deviation:** none.

### T-CC-004 🔨 — `ChatRuntimePort` + `MarkdownRenderPort` + barrel re-exports (dev)

- **Spec:** SPEC-CC-001, SPEC-CC-007, SPEC-CC-009, REQ-CC-001, REQ-CC-002a, REQ-CC-006.
- **Files:** `src/domain/ports/ChatRuntimePort.ts` (new — exact 9-member interface, verbatim from
  SPEC-CC-001 + ADR-CC-001 Decision block, with the error-as-chunk convention documented);
  `src/domain/ports/MarkdownRenderPort.ts` (new — `MarkdownInline`/`MarkdownNode`/`SafeRenderResult`
  + one-method `render`); `src/domain/ports/index.ts` (edited — added the chat-port + chat-domain
  re-exports, kept + extended the "do NOT compose into an aggregate" header per ADR-CC-001 §5).
- **GREEN:** the prior RED test TEST-CC-003 (`tests/domain/ports/ChatRuntimePort.test.ts`) now
  passes — `npm run typecheck` exit 0 (the `Equals<keyof ChatRuntimePort, <nine keys>>` assertion
  resolves `true`; the TS2307/TS2322 errors are gone). `npx vitest run --project unit
  tests/domain/ports/ChatRuntimePort.test.ts tests/domain/chat/StreamChunk.test.ts` → 3 passed.
- **Outcome:** done. eslint + prettier green.
- **Deviation:** `MarkdownNode` is declared as an `interface` (not the spec's `type {…}` literal) to
  satisfy the repo's `@typescript-eslint/consistent-type-definitions` rule. Structurally identical
  (same shape, same barrel re-export, same declarative consumption) — a lint-conformance form, not a
  contract change. `MarkdownInline` (a union) stays a `type`.
