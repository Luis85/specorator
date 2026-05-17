# WP-1 — StreamDelta codec seam + subprocess dedup

**Branch:** `claude/asv3-wp01-stream-codec-seam` (cut from `origin/develop`)
**Lane:** Spine (blocks WP-11 + WP-12)
**Estimated size:** medium (~400–600 LOC net; large refactor with adapter-side simplification)

## Goal (one sentence)

Extract one `StreamDeltaReducer` module that owns SDK/NDJSON → `StreamDelta` translation, and fix the subprocess transport's content-block-delta + assistant-message double-push.

## Why (reviewer sources)

- **Architecture review #2 — "Introduce a `StreamDeltaReducer` codec seam between adapters and store"** (P1 deepening).
  Both `ClaudeCliAdapter._dispatchMessage` (~250 LOC) and `ClaudeSubprocessAdapter._handleNdjsonLine` + `_handleStreamEvent` + `_handleContentBlock*` + `_handleStreamUsage` (~400 LOC) independently translate `content_block_start` / `content_block_delta` / `message_delta` / `compact_boundary` → `StreamDelta`. Codex P1 (#378) `messageSeq` blockId-collision and Codex P2 (#386) partial-usage-merge both had to ship twice — once per adapter. Extends ADR-0033's codec-seam pattern; ADR-0034 candidate.
- **Performance review F-2 (P1) — "Subprocess transport double-pushes text"** confirms Claudian PR #510 pattern in our codebase: `_handleNdjsonLine` dispatches to BOTH `_handleAssistantMessage` (whole-message text) AND `_handleStreamEvent` (per-token text_delta). Store's `appendStreamingDelta` concatenates with no dedup → assistant text rendered twice.

## Scope — files in

**New:**
- `src/application/chat/StreamDeltaReducer.ts` — pure module owning the translation.
- `tests/application/chat/StreamDeltaReducer.test.ts` — covers SDK and NDJSON event tables, dedup, ordering, `messageSeq`, `blockId` minting, partial-usage merge, `session-id` single-fire.
- `docs/adr/0034-stream-delta-reducer.md` — record the codec seam decision (template at `templates/adr-template.md`, follow ADR-0033 as precedent).

**Modified:**
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` — `_dispatchMessage` shrinks to "read SDK event, hand to reducer, yield delta(s)". Adapter no longer owns `messageSeq` / `_inFlightToolBlocks`.
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` — `_handleNdjsonLine` / `_handleStreamEvent` / `_handleAssistantMessage` likewise shrink. **Subprocess dedup lives in the reducer**: once it sees a `text_delta` for the current message, ignore subsequent whole-message `assistant.text` for that message.
- `tests/infrastructure/obsidian/ClaudeCliAdapter.test.ts` — update to assert delegation to the reducer; remove translation-detail assertions now owned by the reducer test.
- `tests/infrastructure/obsidian/ClaudeSubprocessAdapter.streaming.test.ts` — same; add the dedup test (`text_delta` then `assistant/message` with full body → store sees the text exactly once).

**Out of scope:**
- Touching `ChatSidebar.applyNonTerminalDelta` / `chatStore.append*` actions (they consume `StreamDelta` and stay unchanged — that's the whole point of the seam).
- Splitting the subprocess adapter into lifecycle/channel/runStructured modules — that's WP-11, blocked on this.
- Reducing `ClaudeCliPort`'s method surface — that's WP-12, blocked on this.

## Approach

1. Define `RawClaudeEvent` discriminator in `StreamDeltaReducer.ts` covering the union of SDK `StreamEvent`/`SdkMessage` shapes and the NDJSON event shapes the subprocess emits. Keep the type close to the wire format both adapters already read.
2. Reducer signature: a stateful class (not a pure function — it needs `messageSeq`, `inFlightToolBlocks`, `textDeltaSeen`, `lastUsage`, `sessionIdEmitted`) with `consume(event: RawClaudeEvent): readonly StreamDelta[]` and a `reset()` per stream.
3. Adapters become thin wire-readers:
   ```
   for await (const raw of sdkOrNdjsonStream) {
     for (const delta of reducer.consume(raw)) yield delta
   }
   ```
4. Subprocess dedup invariant lives in the reducer: track `textDeltaSeen` per `messageId`; when an `assistant/message` event arrives whose message has had `text_delta` events, drop the whole-message text payload (still emit any non-text content from the same envelope).
5. Update `Result<T,E>` usage at the seam — reducer emits `error` deltas; doesn't throw.
6. Write the reducer test as a wire-format table: feed arrays of `RawClaudeEvent`, assert exact `StreamDelta[]` outputs.
7. Add ADR-0034 capturing: motivation (two adapters, real seam), interface contract, what stays in adapters, ordering guarantees, ADR-0033 cross-reference.

## Definition of done

All true and verifiable:

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] `npm run test` passes; reducer test covers ≥ 95 % statements/branches on the new module.
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds (80/70/80/80) maintained or improved on `src/application/**` and `src/infrastructure/**` (excluding `src/infrastructure/obsidian/**`).
- [ ] **Dedup regression test exists and passes** in `ClaudeSubprocessAdapter.streaming.test.ts`: feeding both `text_delta` events and a terminal `assistant/message` carrying the full body for the same message yields exactly one concatenated text payload to the store.
- [ ] `ClaudeCliAdapter.ts` and `ClaudeSubprocessAdapter.ts` no longer own `messageSeq` / `_inFlightToolBlocks` state — that's now the reducer's.
- [ ] ADR-0034 written and references ADR-0008 (narrow ports), ADR-0033 (codec seam precedent).
- [ ] Per-PR commit message body cites Arch-#2 and Perf-F-2.
- [ ] PR opened against `develop` via the GitHub MCP, title `refactor(asv3): StreamDelta codec seam + subprocess dedup (WP-1)`, body cites both findings.

## RALPH loop (run inside this WP's worktree)

```
loop:
  1. Read this brief.md and loop-state.md from
     specs/agent-sidepanel-v3/wp-01-stream-codec-seam/
  2. Pick the next failing check (typecheck → lint → test → build → DoD criterion).
  3. Implement the smallest change that moves one check red→green.
  4. Run the full AGENTS.md §3 pre-PR gate:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck \
         && npm run lint \
         && npm run test \
         && npm run build \
         && npm run build:web \
         && npm run docs:api
  5. Update loop-state.md with what just changed and what's still red.
  6. If all gates green AND all DoD criteria met → commit, push, open PR via mcp__github__create_pull_request.
     Else → goto 1.
  Hard cap: 8 loop iterations. If stuck, write blocker note in loop-state.md and exit.
```

## Conventions

- **Worktree:** `git worktree add .worktrees/asv3-wp01 -b claude/asv3-wp01-stream-codec-seam origin/develop`; `cd` into it before any edits.
- **Commits:** conventional, single squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review (not draft).
- **Do not touch** the chat store actions, the `ClaudeCliPort` interface shape, or the subprocess adapter's lifecycle/spawn code. Those are other WPs.
- **If you find a bug outside scope** — note it in loop-state.md as a `[carry-out]` line; do not fix it here.
- **Never** push to `develop` directly. Never force-push the shared branch.
