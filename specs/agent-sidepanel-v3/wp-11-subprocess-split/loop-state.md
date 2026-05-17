# WP-11 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp11-subprocess-split` inside `.worktrees/asv3-wp11/`, not on this branch.

## Iterations

### Iteration 1 — Inventory + plan + RawClaudeEvent relocation decision

**Inventory of `ClaudeSubprocessAdapter.ts` (1,169 LOC, develop tip `7f9078f`).**

| Method / surface | Target module after split |
|---|---|
| `kind = 'subscription'` (class tag) | Adapter facade |
| `constructor(deps)` | Adapter facade |
| `startup() / isAvailable() / isAvailableSync()` | Adapter facade |
| `shutdown()` | Adapter facade (delegates to `SubprocessLifecycle.shutdownAll`) |
| `queryStream` / `_runStream` / `_preflightStream` | Adapter facade orchestration |
| `query()` (wraps `queryStream`) | Adapter facade |
| `runStructured` + `_collectStructuredStdout` + `_extractStructuredSessionId` + `_parseStructuredStdout` + `_buildStructuredArgv` | `runSubprocessStructured.ts` |
| `_buildArgv` | Adapter facade (one-line wrapper over `buildSubprocessArgs`) |
| `_spawnChild` (spawn + `_activeChildren.add`) | `SubprocessLifecycle.spawn` |
| `_wireChildListeners` + stdout NDJSON reassembly | `NdjsonChannel` |
| `_handleNdjsonLine` + `_parseNdjsonLine` + `_ndjsonToRawEvent` + `_systemInitRaw` / `_resultRaw` / `_streamEventRaw` / `_systemEnvelopeRaw` | Adapter facade (translation lives there since it bridges wire→reducer); keep static — these are the only WP-11 callers |
| `_emitFromReducer` / `_emitTerminalError` / `_fireOnSessionId` | Adapter facade (delta pump) |
| `_installStreamTimeout` / `_installStreamAbort` | Adapter facade |
| `_killChild` / `SIGKILL_GRACE_MS` | `SubprocessLifecycle.kill` |
| `_clampTimeout` + `MIN/MAX/DEFAULT_TIMEOUT_MS` | Adapter facade (used by both stream and structured paths) |
| `_emitCompletionTelemetry` | Adapter facade |
| `_randomTurnId` | Adapter facade |
| `PushChannel<T> + createPushChannel` | `NdjsonChannel.ts` exports a typed push channel + the line-reassembly buffer that owns the 4 MiB cap |
| `_handleClose` | Adapter facade (calls into reducer + telemetry) |

**RawClaudeEvent relocation decision** — keep `RawClaudeEvent` / `RawStreamEventInner` exported from `@/application/chat/StreamDeltaReducer` for now. The reducer is its single consumer; both adapters import it from there. Moving it during WP-11 widens the diff without removing a real cycle (no infrastructure→infrastructure or domain leakage exists today). Decision recorded in this loop-state per brief §"Approach" step 1.

**LOC budgets (target):**

- `SubprocessLifecycle.ts` ≤ 130 LOC.
- `NdjsonChannel.ts` ≤ 160 LOC (4 MiB cap + line reassembly + push-channel).
- `runSubprocessStructured.ts` ≤ 220 LOC.
- `ClaudeSubprocessAdapter.ts` (facade) target ≤ 600 LOC; goal ~480.

**Telemetry counter for F-8:** the canonical completion-telemetry shape is locked to exactly four keys by `ClaudeSubprocessAdapter.telemetry.test.ts` (transport / sessionId / durationMs / exitCode). Adding fields there would break that exact-shape invariant. Instead, on overflow `NdjsonChannel` emits a dedicated `logger.warn('subscription.stdout.overflow', { transport, event: 'stdout.overflow', bufferBytes, overflowCount })` event before re-emitting the terminal error delta. The counter is exposed via `channel.overflowCount` for in-test introspection.

### Iteration 2 — Stand up `SubprocessLifecycle` + tests + run gates.

Created `src/infrastructure/obsidian/SubprocessLifecycle.ts` (≈ 110 LOC) with:
- `spawn(binaryPath, argv) → Result<ChildProcessLike, ClaudeCliError>` — wraps `spawn` and adds to registry.
- `kill(child)` — SIGTERM, then SIGKILL after `SIGKILL_GRACE_MS = 200`. `unref()`s the ladder timer.
- `release(child)` — removes from active set without killing.
- `shutdownAll()` — SIGTERMs every active child, then clears; idempotent.
- Exports `SIGKILL_GRACE_MS` const for test introspection.

Created mirror test `tests/infrastructure/obsidian/SubprocessLifecycle.test.ts` — covers happy spawn, ENOENT, kill ladder w/ fake timers, idempotent shutdown.

### Iteration 3 — Stand up `NdjsonChannel` + 4 MiB cap (perf-F-8) + tests.

Created `src/infrastructure/obsidian/NdjsonChannel.ts` (≈ 150 LOC):
- `createNdjsonChannel<T>(opts?)` returns `{ push(value), complete(), pushBytes(chunk), iterate(), onOverflow(cb), overflowCount }`.
- Push-channel semantics same as the old `createPushChannel`.
- `pushBytes(text)` is the line-reassembly entry point. When the unflushed-tail buffer grows past `maxBufferBytes` (default 4 MiB), it invokes the registered `onOverflow` callback (the adapter wires this to "kill child + push error delta") and resets the buffer; `overflowCount` increments.
- Each completed `\n`-terminated line is dispatched to a `onLine(line)` callback.

Created mirror test `tests/infrastructure/obsidian/NdjsonChannel.test.ts` — covers push, complete, single-chunk reassembly, 8-fragment 64 KiB reassembly, fragment-exactly-on-newline, oversize buffer triggers overflow.

### Iteration 4 — Stand up `runSubprocessStructured` + tests.

Created `src/infrastructure/obsidian/runSubprocessStructured.ts` (≈ 200 LOC) — extracted `runStructured` + `_collectStructuredStdout` + `_parseStructuredStdout` + `_extractStructuredSessionId` + `_buildStructuredArgv` from the adapter. Takes `SubprocessLifecycle` + a small dep bag (`spawn` fn comes via lifecycle; logger + emitTelemetry hook from adapter).

Created mirror test `tests/infrastructure/obsidian/runSubprocessStructured.test.ts` — covers happy parse, non-zero exit, blank stdout, invalid JSON, non-object JSON, timeout, session-id capture, callback throw isolation.

### Iteration 5 — Migrate adapter to use new modules.

`ClaudeSubprocessAdapter.ts` slimmed: removed the structured collection helpers (now in `runSubprocessStructured`), the inline spawn/kill/shutdown helpers (now in `SubprocessLifecycle`), and the inline NDJSON reassembly (now in `NdjsonChannel`). The adapter retains the wire-shape translation table (`_ndjsonToRawEvent` family), the reducer-driven delta pump, and the orchestration of `queryStream`.

The 4 MiB overflow wires through: `NdjsonChannel.onOverflow(...)` calls `lifecycle.kill(child)` and emits a terminal `error` delta through the reducer. Telemetry payload now carries `stdoutOverflows` when > 0.

LOC after migration: `ClaudeSubprocessAdapter.ts` = 538 LOC (was 1,169) — 54% reduction. New modules: `SubprocessLifecycle.ts` 111, `NdjsonChannel.ts` 158, `runSubprocessStructured.ts` 218.

### Iteration 6 — F7 test gaps in `ClaudeSubprocessAdapter.test.ts`.

Added five new tests at the end of the existing suite:

1. `SIGKILL fires SIGKILL_GRACE_MS after SIGTERM when child does not exit` — uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(SIGKILL_GRACE_MS + 1)` and asserts both `kill('SIGTERM')` and `kill('SIGKILL')` were called.
2. `spawns with cwd === undefined (no override)` — reads `spawn.calls[0].options.cwd` (or its absence).
3. `reassembles a 64 KiB stdout line streamed in 8 KiB fragments` — feeds eight 8 KiB `\n`-less fragments then the terminating chunk.
4. `fragment ending exactly on \n flushes immediately` — splits the buffer right after a `\n`.
5. `oversized stdout buffer triggers error delta + SIGTERM` — feeds 5 MiB of `\n`-less stdout; expects child.kill called and the query to resolve with `err({ QUERY_FAILED })` carrying an "overflow" message; logger entry asserts the redaction.

### Iteration 7 — Run full pre-PR gate.

(In progress — see commands run from `.worktrees/asv3-wp11`.)

## Carry-out items

- `RawClaudeEvent` / `RawStreamEventInner` still live in `@/application/chat/StreamDeltaReducer`. If WP-12 reshapes `ClaudeCliPort`, it may revisit whether these shape types belong in `src/domain/chat/` or `src/infrastructure/obsidian/wire.ts`. No action this WP.
- WP-12 (parallel): if WP-12 lands first, the adapter facade may need its `runStructured` signature retouched. The structured path is now a single delegate to `runSubprocessStructured` so any port reshape narrows to renaming a one-liner.
