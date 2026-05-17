# WP-14 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp14-chat-threads-repo` inside `.worktrees/asv3-wp14/`. The brief was scaffolded from the main worktree on `claude/improve-sidepanel-chat-8pgcT` (PR #395 era).

## Iterations

### Iteration 1 — scaffold port + adapters + codec relocation; wire views

What landed:

- `src/domain/ports/ChatThreadsRepositoryPort.ts` — narrow port interface (`load` / `save` only), re-exported from `src/domain/ports/index.ts`.
- `src/infrastructure/chat/chatThreadsCodec.ts` — pure codec migrated from `src/plugin/chatThreadsPersistence.ts` (which is deleted). `parseChatThreadRecord`, `decodeChatThreadsBlob`, `encodeChatThreadsBlob`, `mostRecentlyUsedThreadId` preserved verbatim.
- `src/infrastructure/obsidian/ObsidianChatThreadsRepository.ts` — production adapter. Owns the 1 s debounce previously on `Plugin.scheduleChatThreadsPersistence`. Tail-chained flush queue (Codex P1, PR #350). `flushPending()` drains the in-flight snapshot from `Plugin.onunload()` (Codex P1, PR #346).
- `src/infrastructure/mock/MockChatThreadsRepository.ts` — in-memory adapter for tests + standalone UI. No debounce (test determinism).
- `src/infrastructure/bridge/ports.ts` — new `CHAT_THREADS_REPO` InjectionKey.
- `src/ui/composables/useChatThreadsRepo.ts` — new composable mirroring the existing per-port pattern (throws when missing — no defaulting; persistence must be explicit).
- `src/plugin/SpecoratorView.ts` and `src/plugin/AgentSidepanelView.ts` — `onOpen()` now `await repo.load()` (the views are async), and subscribe → `void repo.save(state.chatThreads)`. Repo provided under `CHAT_THREADS_REPO` for UI consumers.
- `src/plugin/main.ts` — `scheduleChatThreadsPersistence`, `_flushChatThreads`, `_chatThreadsFlushTimer`, `_pendingChatThreadsSnapshot`, `_chatThreadsFlushQueue`, `_CHAT_THREADS_FLUSH_DEBOUNCE_MS`, `_initialChatThreads`, and `getInitialChatThreads()` are deleted. `loadSettings()` constructs the `ObsidianChatThreadsRepository`, wired to `loadData` / `saveData` and `activeWindow.{set,clear}Timeout`. `onunload()` calls `repo.flushPending()` (replaces the inline timer/snapshot dance).
- `tests/__fakes__/fake-ports.ts` — `fakeModulePorts()` now exposes `chatThreadsRepo: MockChatThreadsRepository`.

### Iteration 2 — domain VO tests + adapter tests

- `tests/domain/chat/SessionId.test.ts` — covers `asSessionId` zero-cost brand semantics, JSON round-trip, and type-level invariants via `expectTypeOf` (the file had 0% explicit coverage before).
- `tests/domain/chat/ChatThreadRecord.test.ts` — type-level invariants for the seven SPEC §2.2 fields, transport literal pins `'api-key' | 'subscription'` (degraded not persisted), and `SessionId` brand check.
- `tests/infrastructure/chat/chatThreadsCodec.test.ts` — moved from `tests/plugin/chatThreadsPersistence.test.ts`; import path swung to `@/infrastructure/chat/chatThreadsCodec`.
- `tests/infrastructure/obsidian/ObsidianChatThreadsRepository.test.ts` — new. Covers `load`, debounced `save`, coalescing, sibling-key preservation, degraded filtering, custom `debounceMs`, `flushPending`, and the serialised flush-queue invariant (Codex P1, PR #350).
- `tests/infrastructure/mock/MockChatThreadsRepository.test.ts` — new. Covers load/save round-trip, initial Map/Array seed, defensive copies on `load()` / `snapshot()`.
- `tests/plugin/main.chat-threads-flush.test.ts` — deleted. The covered behaviours (debounce, coalescing, sibling preservation, onunload flush, queue serialisation) all moved into the adapter tests above. The `updateSettings` sibling-preservation case it carried at the tail was the only non-flush test there; `updateSettings` itself is unchanged and other tests (`tests/plugin/settings.test.ts`) still cover its surface.

### Iteration 3 — pre-PR gate

```
npm audit --audit-level=high --omit=dev   # 0 vulnerabilities
npm run typecheck                          # clean
npm run lint                               # 0 errors, 24 pre-existing warnings
npm run test                               # 1882 / 1882 pass (was 1851; +31 new tests)
npm run build                              # OK
npm run build:web                          # OK
npm run docs:api                           # 0 errors, 1 pre-existing typedoc link warning
```

Coverage on relocated codec: 98.33% statements / 96.15% branches / 100% functions / 98.14% lines (above the brief's 90% requirement). Overall thresholds (80/70/80/80) intact at 93.53 / 87.6 / 92.3 / 94.62.

`src/plugin/main.ts` shrank by ~85 raw LOC (662 → 577). Effective code is 359 (was 387 in the audit) — the max-lines lint warning at 350 remains a `warn`, not error, and the audit's "may now drop below 350" was conditional. WP-16 (Wave 2) will split `main.ts` further and can drive it below the limit.

### Iteration 4 — Codex P1 round-1 (PR #408 review feedback)

Codex flagged two real data-loss races introduced by the refactor:

- **P1.1 (`src/plugin/main.ts:424`)** — `_storedData` was never updated when `ObsidianChatThreadsRepository` flushed to disk. A subsequent `updateSettings` / `updateModuleSettings` would call `saveData(this._storedData)` and silently re-emit the pre-chat `specorator.chatThreads` snapshot, destroying recent threads.
- **P1.2 (`src/infrastructure/obsidian/ObsidianChatThreadsRepository.ts:74`)** — `load()` always read from disk. Reopening a chat view inside the 1 s debounce window rehydrated stale threads, and the next save from the store would persist that stale map on top of the in-flight new thread.

Fixes:

- Added `OnChatThreadsPersisted` constructor option to the adapter. `_flushChatThreads` invokes it AFTER `saveData()` resolves so a write failure cannot poison the host cache. `main.ts` passes a closure that mirrors the encoded blob into `this._storedData.specorator.chatThreads`.
- `load()` now returns a defensive `new Map(this._pendingSnapshot)` when a debounced write is in flight; falls through to disk decode otherwise. Documented precedence in the JSDoc.
- New tests in `tests/infrastructure/obsidian/ObsidianChatThreadsRepository.test.ts`:
  - `load — pending-snapshot precedence (Codex P1)` × 3 cases.
  - `onChatThreadsPersisted hook (Codex P1)` × 4 cases (including a regression reproducer, the success path, the rejection guard, and the end-to-end save-reopen-flush sequence).

Pre-PR gate:

```
npm audit --audit-level=high --omit=dev  # 0 vulnerabilities
npm run typecheck                          # clean
npm run lint                               # 0 errors, 24 pre-existing warnings
npm run test                               # 1889 / 1889 pass (was 1882; +7 new)
npm run build                              # OK
npm run build:web                          # OK
npm run docs:api                           # 0 errors, 1 pre-existing typedoc link warning
```

## Carry-out items

_None._
