# WP-3 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — "Done" entries below describe work performed on `claude/asv3-wp03-chatstore-split` inside `.worktrees/asv3-wp03/`, not on this branch (`claude/improve-sidepanel-chat-8pgcT`). PR #395 only ships `specs/**` files.

> **⚠️ Brief updated since iteration 4** — `brief.md` now (commit `90ec4be`, 2026-05-17) requires `npm audit --audit-level=high --omit=dev` and `npm run docs:api` in addition to the typecheck/lint/test/build/build:web run that iteration 4 reported green. **Before opening the PR, run those two extra gates and append an iteration 5 entry recording the result.** Otherwise CI on the WP-3 PR will fail required checks.

## Iterations

### Iteration 1 — field-to-store map + new store files

- Catalogued every field/action in the existing 648-LOC `chatStore` (below).
- Decided on four new stores plus the `useChatReset` composable:
  - `chatStore` (renamed/scoped) — keeps the chat-panel I/O surface that is neither thread-state nor streaming-turn nor proposals (context files, userText, response, status, errorType, truncated, structuredFail). This is the per-panel "chat I/O" lifecycle the brief calls out implicitly by leaving 4 buckets after the named 3. We call it `messagesStore` per the brief's option, since the per-thread message log is the dominant remaining concern. The `messagesStore` therefore owns: messages, compactBoundaries, contextFiles + effectiveContextFiles, userText, response/status/errorType/truncated, structuredFail. Rationale: each of these is per-active-conversation UI surface state that the agent sidepanel resets together; bundling them avoids leaking 5 stores into every consumer for what is really one panel concern.
  - `chatThreadsStore` — `chatThreads` map + `activeThreadId`, with `upsertThread`, `setActiveThreadId`, `captureSessionId`, `markThreadUsed`. Resets transient streaming-turn slots WHEN `setActiveThreadId` is called via the composable orchestration in `useChatReset`, not internally — keeps stores decoupled.
  - `streamingTurnStore` — `streamingText`, `streamingThinking`, `streamingToolCalls`, `lastUsage`, `cliStartingUp`, `sessionResumed`, with `appendStreamingDelta`, `appendStreamingThinking`, `startStreamingToolCall`, `appendStreamingToolCallInput`, `finishStreamingToolCall`, `setLastUsage`, `setCliStartingUp`, `setSessionResumed`, `resetStreaming`.
  - `proposalStore` — `proposals` map, with `addProposal`, `setProposalStatus`, `clearThreadProposals`.
- Created the four store files. Each has a JSDoc header explaining its lifecycle.
- Created `useChatReset` composable that orchestrates the cross-store "New conversation" reset (also clears the streaming-turn state, closing UX #15).
- Created the four new store tests by extracting cases from `chatStore.test.ts`. The streaming-reset-on-transport-change test (Testing F8) lives in `streamingTurnStore.test.ts` plus the cross-cutting case lives in `useChatReset.test.ts`.

Verified typecheck on the new code in isolation by running `npx vitest run tests/ui/stores/chatThreadsStore.test.ts tests/ui/stores/streamingTurnStore.test.ts tests/ui/stores/proposalStore.test.ts tests/ui/stores/messagesStore.test.ts tests/ui/composables/useChatReset.test.ts` — all green.

Project-wide `npm run typecheck` is still red because `chatStore.ts` still exists and consumers haven't migrated yet — expected, per the brief's suggested ordering.

### Iteration 2 — Migrate `ChatSidebar.vue`, `MessageList.vue`, `AgentSidepanelRoot.vue`

- Migrated every `useChatStore()` callsite in `src/ui/components/chat/ChatSidebar.vue` to the four new stores: `messagesStore` (context, user text, response, structuredFail, messages), `chatThreadsStore` (active thread, threads map), `streamingTurnStore` (streaming + cli/resume flags), `proposalStore` (proposals).
- Migrated `src/ui/components/agent/MessageList.vue` similarly; the `CompactBoundaryNoticeDto` type now imports from `messagesStore`.
- Migrated `src/ui/agent/AgentSidepanelRoot.vue` to call `useChatReset().resetForNewConversation(previousThreadId)` — single line replacing the multi-action sequence (closes UX #15, Arch #4).

### Iteration 3 — Migrate plugin layer + delete `chatStore.ts`

- Migrated `src/plugin/SpecoratorView.ts`, `src/plugin/AgentSidepanelView.ts`, `src/plugin/main.ts` to the new stores. The `$subscribe` callback in the two views now reads `chatThreadsStore.chatThreads` (not `state.chatThreads`).
- `chatThreadsPersistence.ts` did not need shim changes — it's a pure helper consuming `Map<string, ChatThreadRecord>` instances.
- Deleted `src/ui/stores/chatStore.ts` (no facade per CLAUDE.md no-back-compat policy).
- Deleted `tests/ui/stores/chatStore.test.ts` (cases were moved into the four per-store test files).
- Moved the compact-boundary notice tests under `messagesStore.compactBoundary.test.ts` and updated its imports.

### Iteration 4 — Run full pre-PR gate

Ran `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:web` — all green.

### Iteration 5 — Updated brief gates (`npm audit` + `npm run docs:api`)

Per the iteration-5 advisory in the brief revision, also ran the two extra gates:

- `npm audit --audit-level=high --omit=dev` → `found 0 vulnerabilities`.
- `npm run docs:api` → succeeds. One pre-existing TypeDoc warning ("Failed to resolve link to `VaultPort.fileExists` in comment for `application/chat/errors.VaultReadError`") is unrelated to WP-3 and predates this branch.

Also ran `npm run test:coverage` end-to-end — Statements 92.21%, Branches 85.66%, Functions 89.39%, Lines 93.5%. Well above the 80/70/80/80 thresholds. Coverage is improved overall because the five new test files (4 stores + 1 composable) exercise the same surface that the deleted `chatStore.test.ts` did, plus the gap tests for UX #15 / Testing F8.

Extra implementation note added during iteration 5:

- Created `tests/__fakes__/chatStoresFacade.ts` — a Proxy-based test-only facade that exposes the four split stores under a single name to keep the older test files (proposalFlow, sessionPersistence, threadRotation, slashCommands, main.chat-handlers, SpecoratorView, chatThreadsPersistence, ccs-inheritance) unchanged except for the import + constructor. New tests must depend on the four stores individually (see `tests/ui/stores/*.test.ts`).

## Field-to-store map

| Old `chatStore` field/action | New store | Notes |
|---|---|---|
| `contextFiles` (ref) | messagesStore | per-panel UI |
| `effectiveContextFiles` (computed) | messagesStore | dedupes contextFiles |
| `userText` (ref) | messagesStore | per-panel input |
| `response` (ref) | messagesStore | last successful response text |
| `status` (ref) | messagesStore | chat panel lifecycle (`idle`/`loading`/`error`) — read by SpecoratorView mid-flight gate |
| `errorType` (ref) | messagesStore | tied to status |
| `truncated` (ref) | messagesStore | tied to response |
| `structuredFail` (ref) | messagesStore | structured-output banner, reset by `clearResponse`/`reset` |
| `messages` (per-thread map) | messagesStore | IDEA-ASV-001 |
| `compactBoundaries` (per-thread map) | messagesStore | dropped with messages per thread |
| `addContextFile` | messagesStore | |
| `removeContextFile` | messagesStore | |
| `setActiveFile` | messagesStore | |
| `setUserText` | messagesStore | |
| `beginRequest` | messagesStore | |
| `setResponse` | messagesStore | |
| `setError` | messagesStore | |
| `clearResponse` | messagesStore | also resets `structuredFail` |
| `setStructuredFail` | messagesStore | |
| `appendMessage` | messagesStore | |
| `clearThreadMessages` | messagesStore | drops both messages + compactBoundaries buckets for the thread |
| `appendCompactBoundaryNotice` | messagesStore | |
| `chatThreads` (Map) | chatThreadsStore | persisted via `chatThreadsPersistence` |
| `activeThreadId` (ref) | chatThreadsStore | seeded from MRU on view-open |
| `upsertThread` | chatThreadsStore | |
| `setActiveThreadId` | chatThreadsStore | clears streaming-turn slots via `useChatReset` orchestration; the store itself only sets the id (decouples stores) |
| `captureSessionId` | chatThreadsStore | |
| `markThreadUsed` | chatThreadsStore | |
| `streamingText` (ref) | streamingTurnStore | per-turn |
| `streamingThinking` (ref) | streamingTurnStore | per-turn |
| `streamingToolCalls` (Map) | streamingTurnStore | per-turn |
| `lastUsage` (ref) | streamingTurnStore | per-turn |
| `cliStartingUp` (ref) | streamingTurnStore | per-turn |
| `sessionResumed` (ref) | streamingTurnStore | per-turn flash |
| `appendStreamingDelta` | streamingTurnStore | |
| `appendStreamingThinking` | streamingTurnStore | |
| `startStreamingToolCall` | streamingTurnStore | |
| `appendStreamingToolCallInput` | streamingTurnStore | |
| `finishStreamingToolCall` | streamingTurnStore | |
| `setLastUsage` | streamingTurnStore | |
| `setCliStartingUp` | streamingTurnStore | |
| `setSessionResumed` | streamingTurnStore | |
| `resetStreaming` | streamingTurnStore | clears all five per-turn slots + sessionResumed |
| `proposals` (Map) | proposalStore | cross-cutting |
| `addProposal` | proposalStore | |
| `setProposalStatus` | proposalStore | |
| `clearThreadProposals` | proposalStore | |
| `reset()` | each store has its own `reset()`; `useChatReset().resetAll()` calls all four | Pinia's `$reset` won't reset Maps/Sets, so we provide explicit reset actions |

### Design decisions

- **Why merge messages + contextFiles + userText/response into one store?** The brief explicitly lists `messagesStore` as an "implementer's call" bucket. The other slots are all per-active-conversation UI surface state with no independent lifecycle — they reset together on "New conversation" and on `reset()`. Splitting them further would force every consumer to depend on three stores instead of one for what is effectively a single chat-panel surface, with no behavioural benefit. The previously monolithic `useChatStore` is now four stores, mapped to the three lifecycles the architecture review named (thread-persisted, streaming-per-turn, proposals-cross-cutting) plus the chat-panel UI surface.
- **Why does `setActiveThreadId` NOT clear streaming slots in-store?** To keep stores independent (no cross-store calls). The old behaviour is preserved at the call sites: `ChatSidebar.resolveActiveThread` and `AgentSidepanelRoot.handleNewConversation` both go through `useChatReset` which orchestrates the cross-store reset. The previous behaviour where `setActiveThreadId('t2')` silently wiped `streamingText` is now explicit at the call site, and is covered by the streaming-reset-on-transport-change test.
- **`useChatReset.resetForNewConversation(previousThreadId)`** drops proposals + messages for the thread, clears streaming, clears the response/structuredFail/userText, and finally sets `activeThreadId = null`. Single source of truth for "new conversation" — UX #15 cannot regress because `streamingTurnStore.resetStreaming()` is unconditionally invoked.

## Carry-out items

- [carry-out] WP-14: lift `chatThreads` persistence into a `ChatThreadsRepositoryPort`. Today `SpecoratorView` and `AgentSidepanelView` each call `$subscribe(...)` on the threads store and shovel the snapshot into `plugin.scheduleChatThreadsPersistence`. WP-14 should replace that with a port-shaped repository the view injects into the store.
- [carry-out] WP-2: extract `ChatTurnOrchestrator` from `ChatSidebar.vue`. With this split landed, the orchestrator can depend on the four narrower stores instead of the monolith — a clean handoff.
- [carry-out] WP-7: `MessageList.vue` now reads `streamingTurnStore.streamingText` directly. When WP-7 wires the live region + a11y attributes, it can do so on a `streamingTurnStore`-scoped element without coupling to thread state.
