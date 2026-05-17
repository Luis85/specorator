# WP-1 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Brief updated** — `brief.md` (commit `90ec4be`, 2026-05-17) now requires `npm audit --audit-level=high --omit=dev` and `npm run docs:api` in the per-iteration verify chain and in the Definition of Done. Run those alongside typecheck/lint/test/build/build:web every iteration.

## Iterations

### 2026-05-17 — Iteration 1 (scoping)

- Read brief.md + loop-state.md.
- Inspected `ClaudeCliAdapter.ts` (690 LOC) and `ClaudeSubprocessAdapter.ts` (1445 LOC) to map current translation paths.
- Inspected `tests/infrastructure/obsidian/ClaudeCliAdapter.test.ts` and `tests/infrastructure/obsidian/ClaudeSubprocessAdapter.streaming.test.ts` to understand existing assertions.
- Confirmed existing dedup bug: `_handleAssistantMessage` pushes raw `text` from whole-message envelopes AND `_dispatchTextDelta` pushes `text_delta` events; no per-message dedup gate.
- Plan:
  - Create `src/application/chat/StreamDeltaReducer.ts` as a stateful class with `consume(raw)` → `readonly StreamDelta[]` and `reset()`.
  - Reducer owns: `turnId`, `messageSeq`, `blockKinds`/`toolBlockIds`, `lastUsage`, `sessionIdEmitted`, `textEmitted`, plus a new `textDeltaSeenForCurrentMessage` flag for the subprocess dedup invariant.
  - Adapters become thin wire-readers passing raw events through the reducer.
  - Add comprehensive `tests/application/chat/StreamDeltaReducer.test.ts`.
  - Write `docs/adr/0034-stream-delta-reducer.md`.
  - Add subprocess dedup regression test in `ClaudeSubprocessAdapter.streaming.test.ts`.

## Carry-out items

(notes on issues found that belong in other WPs)
