# WP-12 — ClaudeCliPort: `queryStream`-only + lifecycle split

**Branch:** `claude/asv3-wp12-claudecli-port-cleanup` (cut from `origin/develop` AFTER WP-1's PR #397 merged)
**Lane:** Spine (depends on WP-1 ✓; parallel with WP-11)
**Estimated size:** medium (~300–500 LOC across port, adapters, mocks, consumers, tests)

## Goal (one sentence)

Collapse `ClaudeCliPort` (323 LOC, 4 methods + sidecar `SubscriptionCapable` extension + `streamFromQuery` shim) to a single canonical method — `queryStream` — and split lifecycle (`startup` / `shutdown`) into its own `TransportLifecyclePort`, with a `collectStream` helper for non-streaming consumers.

## Why (reviewer source)

**Architecture review #3 (P2 deepening, ADR-008 conflict — worth reopening)** — "Collapse `ClaudeCliPort` to one method behind a `ChatTransport` facade":

- The port has `query`, `queryStream`, `isAvailable`, `startup`, `shutdown` — and `runStructured` lives off to the side as a structural extension `SubscriptionCapable` in `queryStructured.ts` to dodge the "four-method narrow port" rule.
- Both adapters implement `query` by draining `queryStream` (PR-ASV-2 SDK and subprocess both did this layering).
- `query` is no longer load-bearing — it's a sink for non-streaming call sites whose only role is to converge a stream to a string.
- Three concrete callers of `port.query` remain (`MockClaudeCliPort` tests, `streamFromQuery` shim, `ClaudeCliAdapter.query`'s own self-recursion guard via `queryStream`).
- The "subscription extension" stops being a quiet contract violation hidden in `queryStructured.ts`.

Deletion test: `query` and `streamFromQuery` both pass — deleting them concentrates complexity into a one-line helper, not the consumers. Lifecycle (`startup`/`shutdown`) only has one caller (`AgentSidepanelView`) — belongs on a separate port.

## Scope — files in

**Modified:**
- `src/domain/ports/ClaudeCliPort.ts` — surface reshape:
  - Keep `queryStream(prompt, opts): AsyncIterable<StreamDelta>` as the sole streaming method.
  - **Remove** `query` (callers migrate to the helper below).
  - **Remove** `startup` and `shutdown` (move to `TransportLifecyclePort`).
  - Keep `isAvailable` if it's still meaningful, or fold into the lifecycle port — implementer's call; document in loop-state.
  - Pull `runStructured` **onto the port itself** for subscription-capable adapters (drop the `SubscriptionCapable` sidecar interface in `queryStructured.ts`). If keeping a sidecar feels right for type-narrowing reasons, document why in loop-state.md.
- `src/domain/ports/TransportLifecyclePort.ts` — **new** port with `startup()` and `shutdown()`. One concrete caller (`AgentSidepanelView`). One injection key.
- `src/infrastructure/bridge/ports.ts` — add `TRANSPORT_LIFECYCLE_PORT` injection key.
- `src/ui/composables/useTransportLifecyclePort.ts` — new composable mirroring the rest of the per-port composable pattern.
- `src/application/chat/collectStream.ts` (**new**) — pure helper `collectStream(stream: AsyncIterable<StreamDelta>): Promise<Result<string, ClaudeCliError>>`. Replaces every `port.query()` call site.
- `src/application/chat/queryStructured.ts` — drop the `SubscriptionCapable` interface (its concerns absorbed into the port itself).
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` — drop the `query` method; implement `runStructured` on the port directly; move `startup`/`shutdown` into `TransportLifecyclePort` implementation (either a separate adapter class or composition).
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` — same. **Coordinate with WP-11** which is running in parallel and splitting this file's structure. If WP-11 lands first, the methods you remove live in new locations (`SubprocessLifecycle`, `runSubprocessStructured`); rebase and adjust.
- `src/infrastructure/mock/MockClaudeCliPort.ts` + `MockClaudeSubprocessAdapter.ts` — match the new surface.
- `src/infrastructure/bridge/degradedClaudeCliPort.ts` — match (WP-15 will fully rework this; here, just keep type compatibility).
- Delete `src/application/chat/streamFromQuery.ts` (the shim) — its only role was to converge a stream to a string, which `collectStream` does cleanly.
- Tests: rename / repoint everything that called `port.query()` to use `collectStream(port.queryStream(...))`. Add a unit test for `collectStream` covering happy-path, error mid-stream, abort, and empty stream.

**Out of scope:**
- Splitting `ClaudeSubprocessAdapter.ts` into lifecycle/channel/runStructured modules — WP-11 (concurrent).
- `degradedClaudeCliPort` first-class adapter — WP-15.
- Touching the `StreamDeltaReducer` — WP-1 territory.
- UI / store changes.

## Approach

1. **Inventory + plan** in iteration 1's loop-state. Identify every caller of `port.query`, `port.startup`, `port.shutdown` across `src/` and `tests/`. Document the new port shapes.
2. **Stand up `collectStream`** with its test. Pure function; trivial.
3. **Add `TransportLifecyclePort`** + injection key + composable + the two adapter implementations.
4. **Reshape `ClaudeCliPort`** — remove `query`, `startup`, `shutdown`; pull `runStructured` onto the port. Update both adapters and both mocks.
5. **Migrate every consumer**: replace `port.query(...)` with `collectStream(port.queryStream(...))`. Replace `port.startup()` / `port.shutdown()` with lifecycle-port calls (only `AgentSidepanelView` and the plugin init/teardown wiring).
6. **Delete `streamFromQuery.ts`** + its tests. Delete the `SubscriptionCapable` interface.
7. **Run the full pre-PR gate** every iteration.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors. The `ClaudeCliPort.ts` LOC drops materially (target < 200 from 323).
- [ ] `npm run test` passes; new `collectStream` test + new `TransportLifecyclePort` adapter tests both ≥ 90% statements.
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] No callers of `port.query` remain (`grep '\.query(' src/ tests/` returns only `queryStream`).
- [ ] `streamFromQuery.ts` and the `SubscriptionCapable` interface are deleted (no facade — per CLAUDE.md no-back-compat).
- [ ] ADR-008 conflict acknowledged in the PR body: the new shape is narrower per *responsibility* even though `ClaudeCliPort` no longer has the smallest method count; lifecycle splits into its own port. Optionally add an ADR amendment or note in the PR body.
- [ ] PR opened against `develop`, title `refactor(asv3): ClaudeCliPort queryStream-only + TransportLifecyclePort (WP-12)`, body cites Arch-#3.

## RALPH loop

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no subprocess split (WP-11), no degraded-port rework (WP-15).
  4. Run from inside .worktrees/asv3-wp12:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `git fetch origin develop && git worktree add .worktrees/asv3-wp12 -b claude/asv3-wp12-claudecli-port-cleanup origin/develop`; `cd` into it before any edits.
- **Commits:** conventional, single squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Coordinate with WP-11** running in parallel — both touch `ClaudeSubprocessAdapter.ts`. The first to merge wins; the second rebases. Note in your carry-out if the file's structure has changed under you.
- **Do not touch** the `StreamDeltaReducer` internals (WP-1 — stable), UI / stores, a11y, slash palette, markdown rendering.
- **Never** push to `develop`. Never force-push.
