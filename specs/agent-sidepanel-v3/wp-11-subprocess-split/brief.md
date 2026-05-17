# WP-11 — ClaudeSubprocessAdapter split (Lifecycle / NdjsonChannel / runStructured)

**Branch:** `claude/asv3-wp11-subprocess-split` (cut from `origin/develop` AFTER WP-1's PR #397 merged)
**Lane:** Spine (depends on WP-1 ✓; parallel with WP-12)
**Estimated size:** medium-large (~500–700 LOC moved across new files; behaviour-preserving refactor + new tests for SIGKILL timing / cwd / NDJSON reassembly)

## Goal (one sentence)

Split the 1,169-LOC `ClaudeSubprocessAdapter` into focused modules — `SubprocessLifecycle` (spawn / kill / shutdown), `NdjsonChannel` (push-channel + line reassembly), `runSubprocessStructured` (one-shot structured output) — leaving a thin adapter that wires them through the existing `StreamDeltaReducer` codec seam.

## Why (reviewer sources)

- **Architecture review #11 (P2 deepening)** — Beyond WP-1's reducer extraction, `ClaudeSubprocessAdapter` still mixes argv building (partly in `buildSubprocessArgs.ts`), the SIGTERM→SIGKILL ladder, push-channel construction, structured-output one-shot collection, and the streaming wiring. The graph community ("Claude Subprocess Adapter") sits at cohesion 0.06.
- **Testing review F7 (P2)** — Subprocess test gaps:
  - **NDJSON oversized line** — no test for a single stdout line larger than the readline default.
  - **SIGTERM → SIGKILL ladder timing** — `SIGKILL_GRACE_MS = 200` is fired by `setTimeout`; no test advances fake timers to assert the `SIGKILL` follow-up actually fires when the child fails to exit (so the 200 ms grace value is unenforced — change it to 200 days and tests pass).
  - **`cwd` selection** — only env override is asserted; `cwd` is never read out of the spawn options. A regression that flips to `process.cwd()` of the Obsidian binary would not be caught.
  - **Multiple split lines** — TEST-ASM-014 covers one chunk split; no test covers an 8-fragment reassembly or a fragment ending exactly on `\n`.
- **Performance review F-8 (P2)** — Subprocess stdout buffer is unbounded. A single >1 MB line without `\n` triggers O(N²) concatenation in `.on('data')` and grows without limit. Cap `proc.stdoutBuffer.length` at e.g. 4 MB; on overflow, push an error delta and SIGTERM. Add a counter in completion telemetry.
- **Carry-out from WP-1** — "`RawClaudeEvent` discriminator is exported from `StreamDeltaReducer.ts` (used by both adapters' translation helpers); WP-11/WP-12 may want to relocate it if the adapter split changes ownership." Decide and act.

## Scope — files in

**New:**
- `src/infrastructure/obsidian/SubprocessLifecycle.ts` — owns spawn (`_spawnChild`), the SIGTERM→SIGKILL ladder (`_killChild`, `SIGKILL_GRACE_MS`), `_activeChildren` registry, and shutdown coordination. Takes a `SpawnFn` injection so tests don't need real subprocess.
- `src/infrastructure/obsidian/NdjsonChannel.ts` — the push-channel + line-reassembly logic that's currently inline in the adapter. Exposes `push(line)` / `pushError(error)` / `complete()` and an `AsyncIterable<RawClaudeEvent | StreamDelta>` reader. Add the 4 MiB stdout-buffer cap from perf-F-8 here.
- `src/infrastructure/obsidian/runSubprocessStructured.ts` — the one-shot structured-output path currently doubled in the adapter (~200 LOC sharing lifecycle with `queryStream`). Takes `SubprocessLifecycle` + `NdjsonChannel` + Zod schema; returns `Result<envelope, ClaudeCliError>`.
- Mirror tests under `tests/infrastructure/obsidian/{SubprocessLifecycle,NdjsonChannel,runSubprocessStructured}.test.ts` — fakes for `SpawnFn` and `ChildProcessLike`; deterministic event tables.
- **`tests/infrastructure/obsidian/ClaudeSubprocessAdapter.test.ts` additions** for the test gaps F7:
  - `'SIGKILL fires SIGKILL_GRACE_MS after SIGTERM when child does not exit'` — uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(SIGKILL_GRACE_MS + 1)`. Asserts the kill follow-up fires.
  - `'spawns with cwd === vault path or undefined'` — reads `spawn.calls[0].opts.cwd`.
  - `'reassembles a 64 KB stdout line streamed in 8 KB fragments'` — feeds eight `\n`-less fragments then one terminating chunk.
  - `'fragment ending exactly on \\n flushes immediately'`.
  - `'oversized stdout buffer triggers error delta + SIGTERM'` — exercises the 4 MiB cap.

**Modified:**
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` — shrinks to a thin facade that wires `SubprocessLifecycle` + `NdjsonChannel` + `StreamDeltaReducer` (the WP-1 codec) + `runSubprocessStructured` together. **Target: <600 LOC** (currently 1,169). `queryStream` becomes a clean: spawn → wrap stdout in NdjsonChannel → translate via `_ndjsonToRawEvent` → feed reducer → yield deltas.
- `src/infrastructure/obsidian/ClaudeBinaryResolver.ts` — untouched if possible.
- `src/application/chat/StreamDeltaReducer.ts` — **may** relocate the exported `RawClaudeEvent` discriminator to a domain or shared location if WP-11 finds a cleaner home for it (the adapter split makes the original ownership less natural). Document the decision in loop-state.md design-decisions.
- Existing subprocess adapter tests (1,194 LOC) — repoint imports + adjust any tests that poked inline helpers; structural test surface stays.

**Out of scope:**
- The `StreamDeltaReducer` internals (WP-1 owned that; treat as stable).
- `ClaudeCliPort` interface reshape — that's WP-12 (concurrent). If WP-12 lands first, rebase onto its new shape; if you land first, WP-12 will rebase onto yours.
- SDK adapter (`ClaudeCliAdapter.ts`) — leave unchanged.
- A11y / UX / store changes.

## Approach

1. **Inventory + plan** in iteration 1's loop-state. Catalogue every method currently in `ClaudeSubprocessAdapter.ts` and assign it to one of: `SubprocessLifecycle`, `NdjsonChannel`, `runSubprocessStructured`, or "stays in the facade". Document the `RawClaudeEvent` relocation decision (keep in reducer, move to `src/domain/chat/`, or move to a shared adapter file).
2. **Stand up `SubprocessLifecycle`** with all spawn/kill code + tests. The `SpawnFn` injection makes this fully unit-testable. Use fake timers to pin the SIGKILL ladder.
3. **Stand up `NdjsonChannel`** with the stdout-buffer logic + the 4 MiB cap from perf-F-8 + a chunked-reassembly test (gap F7).
4. **Stand up `runSubprocessStructured`** by extracting the existing structured-collection method from the adapter. Add its own mirrored test.
5. **Migrate the adapter** to use the three new modules. `queryStream` becomes thin (target ~80 LOC for the method).
6. **Add the F7 test gaps** in `ClaudeSubprocessAdapter.test.ts` (SIGKILL timing, cwd, oversized buffer, fragment-on-newline).
7. **Run the full pre-PR gate every iteration.**

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors; the `max-lines > 350` warning on `ClaudeSubprocessAdapter.ts` is **gone** (target < 600 LOC) — or at minimum LOC drops ≥ 40% with each new module under the 350 ceiling.
- [ ] `npm run test` passes; new tests for `SubprocessLifecycle`, `NdjsonChannel`, `runSubprocessStructured` each ≥ 90% statements, 80% branches.
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds (80/70/80/80) maintained or improved.
- [ ] **Testing-F7 gaps closed** — five new tests in `ClaudeSubprocessAdapter.test.ts` (SIGKILL timing with fake timers, cwd, 64 KiB reassembly in 8 KiB fragments, fragment-on-newline, oversized stdout buffer).
- [ ] **Perf-F-8 closed** — 4 MiB stdout buffer cap with overflow → error delta + SIGTERM, telemetry counter added.
- [ ] PR opened against `develop`, title `refactor(asv3): ClaudeSubprocessAdapter → Lifecycle + NdjsonChannel + runStructured (WP-11)`, body cites Arch-#11 + Testing-F7 + Perf-F-8.

## RALPH loop

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no port reshapes, no SDK adapter, no UI.
  4. Run from inside .worktrees/asv3-wp11:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `git fetch origin develop && git worktree add .worktrees/asv3-wp11 -b claude/asv3-wp11-subprocess-split origin/develop`; `cd` into it before any edits.
- **Commits:** conventional, single squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch** `ClaudeCliPort.ts` (interface — WP-12), `ClaudeCliAdapter.ts` (SDK — out of scope), `StreamDeltaReducer.ts` internals (WP-1 — stable).
- **Coordinate with WP-12** which is running in parallel — both touch method signatures on `ClaudeSubprocessAdapter.ts`. If WP-12 lands first, rebase; if you land first, note in carry-out so WP-12 picks up the new file structure.
- **Never** push to `develop`. Never force-push.
