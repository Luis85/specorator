# WP-5 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp05-session-log-append` inside `.worktrees/asv3-wp05/`. The brief was scaffolded from the main worktree on `claude/improve-sidepanel-chat-8pgcT` (PR #395 era).

## Iterations

### Iteration 1 (2026-05-17) — port extension + facade + caller migration

**Changes**
- `VaultPort` (domain): added `appendFile(path, content)`.
- `ObsidianBridge`: implemented via `vault.adapter.append` with fallback to `vault.create` when the file is missing.
- `MockBridge`: in-memory concat append; added narrow `calls` recorder (`writeFile` / `appendFile` / `readFile`) so I/O accounting assertions can land without spying.
- `LocalStorageBridge`: read+concat+write append (GH Pages demo only).
- `SessionLogWriter`: introduced `LogPathCache` (frontmatter+body in memory), seed-on-first-call from disk, `appendFile` for the new turn block, `writeFile` only to rebuild the frontmatter window with the new `updated:` timestamp. Eliminates the per-turn body re-read (O(N²) → O(turn) reads).
- `SessionLogMirror` (new): facade exposing `mirrorTurn` (fire-and-forget) and `mirrorProposalDecision` (await-required) plus a `createSessionLogMirror` factory so UI never imports the writer directly.
- Caller migration: `ChatTurnOrchestrator` (`getSessionLogMirror` dep), `commitFileWriteProposal` (`sessionLog: SessionLogMirror`), `useSessionLogMirror` composable (renamed from `useSessionLogWriter`), `useProposalDecisions` (consumes the mirror), `ChatSidebar.vue` (factory rewire).
- ESLint scope rule: added `SessionLogWriter` to the UI's `no-restricted-imports` pattern list so direct writer imports outside `src/application/chat/` fail lint.

**Tests**
- New: `tests/application/chat/SessionLogMirror.test.ts` (delegation tests).
- New: `tests/domain/ports/VaultPort.appendFile.test.ts` (cross-adapter contract).
- New: two DoD tests in `SessionLogWriter.test.ts` — "100 turns produce 100 appendFile calls and ≤ 1 readFile call" and the resumed-session seed-once path.
- Updated: latency + mutex tests in `SessionLogWriter.test.ts` to track the new `appendFile`-shaped hot path.
- Updated: `ChatSidebar.sessionPersistence.test.ts` to look for the appendFile delta plus the rewritten file content.
- Updated: `useSessionLogMirror.test.ts` (renamed from `useSessionLogWriter.test.ts`) — `getMirror()` shape.
- Updated: `commitFileWriteProposal.test.ts` + `ChatTurnOrchestrator.test.ts` + `no-claude-home.test.ts` to construct a writer-wrapped-in-mirror pair where the test still needs to spy on the writer.

**Gate status (final)** — all green:
- `npm audit --audit-level=high --omit=dev` ✅ 0 vulnerabilities
- `npm run typecheck` ✅
- `npm run lint` ✅ 0 errors (24 pre-existing warnings)
- `npm run test` ✅ 1878 / 1878 passing
- `npm run build` ✅
- `npm run build:web` ✅
- `npm run docs:api` ✅ (1 pre-existing TypeDoc warning unrelated to WP-5)

### Iteration 2 (2026-05-17) — Codex P1 + P2 round-1 (PR #406)

**Trigger** — Codex review on PR #406 flagged two findings:

- **P1** (thread `3254772925`, line 577): `appendBlock` still issued
  `writeFile(${frontmatter}${cache.body})` on every turn, with the body
  carrying every accumulated turn. Cumulative write volume stayed O(N²);
  the DoD's "O(turn) closed" claim was wrong (appendFile was O(1) per
  turn, but writeFile was also O(N) per turn for the full body).
- **P2** (thread `3254772928`, line 550): the cached body was the source
  of truth on every rewrite, so any out-of-band edits made on disk
  between turns were silently overwritten by the next `appendBlock`.

**Architectural fix** — body is append-only on disk; frontmatter
`updated:` is debounced.

- `LogPathCache.body` deleted; replaced with
  `bodyEndsWithNewline: boolean`.
- `appendBlock` no longer calls `writeFile` after the seed. It writes
  exactly one `appendFile(blockOnWire)` per turn and schedules a
  debounced frontmatter flush via `scheduleFrontmatterFlush`.
- New `flushFrontmatter(path)` reads the *live* on-disk body, splices
  the latest `FrontmatterFields`, and writes the result. P2 is resolved
  automatically — out-of-band body edits are preserved because the body
  is read fresh on every flush.
- New `flushAll()` cancels pending debounces and drains the flush.
  Single-flight per path. Production callers invoke it on plugin
  teardown; tests use it for deterministic assertions.
- Timer indirection (`setTimeoutFn` / `clearTimeoutFn`) injected via
  `SessionLogWriterOptions` so the application layer stays free of
  Obsidian runtime globals (`activeWindow.*`). Default points at
  `globalThis.setTimeout`; the popout-window flavour is the plugin
  layer's responsibility.

**Tests**

- `tests/application/chat/SessionLogWriter.test.ts`:
  - Rewrote TEST-ASM-033 to assert the new contract (turn 2 issues 0
    `writeFile`, 1 `appendFile`; after `flushAll()` +1 `writeFile`, +1
    `readFile`; final on-disk `updated:` advances).
  - Rewrote the O(turn) DoD test: 100 turns produce 100 `appendFile`, 1
    `writeFile` (seed), 0 `readFile` (no flush). After `flushAll()`: +1
    `readFile` + 1 `writeFile`.
  - Added a P2-resolution test: out-of-band annotation inserted between
    turns survives the next debounced flush.
  - `makeWriter` defaults to `flushDebounceMs: 60_000` so timers don't
    fire spuriously during long test runs.
- `tests/ui/components/chat/ChatSidebar.proposalFlow.test.ts`: two
  Codex P2 audit-row tests switched from `writeFile`-spy to
  `appendFile`-spy (the audit row now lands via `appendFile`, not
  `writeFile`).

**Gate status (final)** — all green:

- `npm audit --audit-level=high --omit=dev` ✅ 0 vulnerabilities
- `npm run typecheck` ✅
- `npm run lint` ✅ 0 errors (25 pre-existing warnings)
- `npm run test` ✅ 1879 / 1879 passing
- `npm run build` ✅
- `npm run build:web` ✅
- `npm run docs:api` ✅

### Iteration 3 (2026-05-17) — Codex P1 round-2 (PR #406)

**Trigger** — Codex review on PR #406 round-1 patch flagged a new P1
finding (thread `3254810244`, line 799 of `SessionLogWriter.ts`):

> Running `doFlush` from the debounced timer allows a
> `readFile → writeFile` cycle to race with `appendBlock` because this
> path does not use `_runQueued`'s per-file mutex. If a new turn appends
> after `readFile` but before this `writeFile`, the stale body snapshot
> is written back and the just-appended block is lost. This can happen
> in normal usage when a message arrives around the debounce boundary,
> so the flush should be serialized through the same queue (or otherwise
> made race-safe).

Reproduction confirmed: with the round-1 design, an `appendFile` for
turn N+1 landing between the flush's `readFile` and `writeFile` is
overwritten by the stale body snapshot.

**Architectural fix** — route `doFlush` through the same per-file mutex
`appendBlock` uses.

- Extracted `_enqueue(queueKey, op)` from `_runQueued`. Both
  `appendUserAssistant` / `appendProposalDecision` (via `_runQueued`)
  and `flushFrontmatter` compose onto the same `mutex` chain via this
  primitive.
- `PendingFlush` gained a `queueKey: string` field set on first
  schedule. The flush registers under the pre-suffix `basePath` so it
  shares the same queue key as the appends.
- `appendBlock` now derives the basePath from the thread and passes it
  through `scheduleFrontmatterFlush(resolvedPath, queueKey, fields)`.
- `flushFrontmatter` wraps its `doFlush` call in
  `this._enqueue(pending.queueKey, () => this.doFlush(...))` so the
  `readFile → writeFile` window is fully serialised against concurrent
  appends. Single-flight (`inFlight`) coalescing kept on top so
  `flushAll()` remains idempotent.
- No new queue. No global mutex. Per-path serialisation only —
  different session paths still flush in parallel.

**Tests**

- New regression test in
  `tests/application/chat/SessionLogWriter.test.ts`:
  "debounced frontmatter flush does not race a concurrent appendBlock".
  Uses a manual barrier on `VaultPort.readFile` to park the flush
  mid-cycle, then fires a concurrent `appendUserAssistant`. Verified
  the test FAILS on the round-1 code (`bd2b49d`) — turn 2's `u2`/`a2`
  is lost — and PASSES on the round-2 fix.

**Gate status (final)** — all green:

- `npm audit --audit-level=high --omit=dev` ✅ 0 vulnerabilities
- `npm run typecheck` ✅
- `npm run lint` ✅ 0 errors (25 pre-existing warnings)
- `npm run test` ✅ 1880 / 1880 passing (+1 vs round-1)
- `npm run build` ✅
- `npm run build:web` ✅
- `npm run docs:api` ✅ (2 pre-existing TypeDoc warnings unrelated)

## Carry-out items

_None._
