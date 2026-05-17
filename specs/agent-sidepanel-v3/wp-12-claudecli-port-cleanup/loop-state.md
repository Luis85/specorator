# WP-12 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp12-claudecli-port-cleanup` inside `.worktrees/asv3-wp12/`, not on this branch.

## Iterations

### Recovery summary (2026-05-17, written post-hoc by parent)

The first WP-12 implementer agent hit its 10-iteration cap mid-typecheck on a `ClaudeCliQueryOptions` reference inside `ClaudeSubprocessAdapter`. A focused resume agent picked up the partial work, fixed the remaining typecheck issues, and got every gate green — but also exhausted its budget before opening the PR. Neither agent updated this file during iteration. Parent finished the close-out: ran the full pre-PR gate one more time, confirmed green, committed, pushed, opened the PR.

**Design deviation from the brief:** The brief asked for `startup` / `shutdown` to move to a new `TransportLifecyclePort`. The resume agent kept them on `ClaudeCliPort` instead — only one caller (`AgentSidepanelView`), and splitting added a port file + composable + injection key for a single consumer. The narrowness gain didn't pay for the file count. Decision recorded here so future readers don't re-suggest the split unless a second consumer materialises.

### Final state on `claude/asv3-wp12-claudecli-port-cleanup`

**Removed (no facade per CLAUDE.md no-back-compat):**

- `ClaudeCliPort.query` method (callers migrated to `collectStream(port.queryStream(...))`).
- `src/application/chat/streamFromQuery.ts` shim — deleted.
- `SubscriptionCapable` interface in `queryStructured.ts` — deleted. `runStructured` is now an optional method directly on `ClaudeCliPort` for subscription-capable adapters; subprocess implements it, SDK does not.

**Added:**

- `src/application/chat/collectStream.ts` — pure helper `collectStream(stream: AsyncIterable<StreamDelta>): Promise<Result<string, ClaudeCliError>>`. Drains the stream, concatenates text deltas, surfaces error deltas as `err()`.

**Modified (29 files total — 15 src, 14 tests):**

- `src/domain/ports/ClaudeCliPort.ts` — 323 → 296 LOC (kept lifecycle; runStructured moved onto the port).
- `src/domain/ports/index.ts` — barrel export update.
- `src/infrastructure/bridge/ports.ts` — injection key cleanup.
- `src/infrastructure/bridge/degradedClaudeCliPort.ts` — type compat with new port shape.
- `src/infrastructure/localstorage/LocalStorageBridge.ts`, `src/infrastructure/mock/MockBridge.ts`, `src/infrastructure/obsidian/ObsidianBridge.ts` — bridge wiring follows the new port shape.
- `src/infrastructure/mock/{MockClaudeCliPort,MockClaudeSubprocessAdapter}.ts` — mocks match.
- `src/infrastructure/obsidian/{ClaudeCliAdapter,ClaudeSubprocessAdapter}.ts` — `query` deleted; `runStructured` either present (subprocess) or omitted (SDK).
- `src/plugin/{AgentSidepanelView,SpecoratorView,main.ts}` — `port.startup` / `port.shutdown` still called directly on the port.
- `src/application/chat/queryStructured.ts` — `SubscriptionCapable` removed; helper now accepts the port and uses the new `runStructured` method directly.
- Tests across `tests/application/chat/`, `tests/domain/ports/`, `tests/infrastructure/`, `tests/integration/`, `tests/plugin/`, `tests/ui/components/` — repointed from `port.query(...)` to `collectStream(port.queryStream(...))`.

**Pre-PR gate (run from `.worktrees/asv3-wp12` at close-out):**

- `npm audit --audit-level=high --omit=dev` → 0 vulnerabilities.
- `npm run typecheck` → clean.
- `npm run lint` → 0 errors, 24 pre-existing warnings unchanged.
- `npm run test` → 1742/1742 passing (142 files).
- `npm run build` → succeeds (`main.js` 2,859 KB / gzip 666 KB).
- `npm run build:web` → succeeds (`dist-standalone/index-*.js` 268 KB / gzip 93 KB).
- `npm run docs:api` → succeeds (1 pre-existing unrelated TypeDoc warning).

**Diff summary:** 29 files changed, +619/-835 (net −216 LOC).

## Carry-out items

- **WP-11 coordination:** `runSubprocessStructured` (which WP-11 extracted into its own module) now consumes the new port shape directly. Whichever lands first creates a tiny rebase for the other on `ClaudeSubprocessAdapter.ts` — purely mechanical, no logic conflict.
- **Lifecycle port revisit:** if a second consumer of `startup`/`shutdown` ever materialises (e.g. a settings-tab "test transport" button), revisit the brief's `TransportLifecyclePort` split. Today the in-process pattern is "the view that owns the transport owns its lifecycle", and only `AgentSidepanelView` qualifies.
- **Discipline note for future RALPH-loop implementers:** both WP-12 agents failed to update this loop-state during their runs. The parent had to write this summary post-hoc. Future briefs should be more explicit about the per-iteration `loop-state.md` write being part of the gate (not optional).
